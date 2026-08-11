import {useEffect,useMemo,useState} from "react";
import {
  ArrowLeft,Check,ChevronRight,CircleDollarSign,
  Plus,Save,ShieldCheck
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

const emptyPolicy=()=>({
  code:"",
  name:"",
  description:"",
  department_id:"",
  branch_id:"",
  request_type_id:"",
  governance_mode:"",
  currency_code:"",
  is_default:false,
  priority:100
});

const emptyRule=()=>({
  name:"",
  min_amount:0,
  max_amount:"",
  sourcing_method:"quotation",
  minimum_quotes:1,
  require_formal_rfq:false,
  require_quote_comparison:false,
  require_procurement_review:true,
  require_vendor_selection_approval:false,
  allow_emergency_override:true,
  allow_sole_source:true,
  priority:100
});

export default function ProcurementPoliciesPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [setup,setSetup]=useState(null);
  const [policies,setPolicies]=useState([]);
  const [selectedId,setSelectedId]=useState(null);

  const [policy,setPolicy]=useState(emptyPolicy());
  const [rule,setRule]=useState(emptyRule());

  const [policyBusy,setPolicyBusy]=useState(false);
  const [ruleBusy,setRuleBusy]=useState(false);
  const [error,setError]=useState("");

  const selected=useMemo(
    ()=>policies.find(x=>x.id===selectedId)||null,
    [policies,selectedId]
  );

  async function load(selectId=selectedId){
    const [ctx,setupData,policyData]=await Promise.all([
      opsApi.session(companyId),
      opsApi.setup(companyId),
      opsApi.procurementPolicies(companyId)
    ]);

    const rows=policyData.rows||[];

    setSession(ctx);
    setSetup(setupData);
    setPolicies(rows);

    const next=rows.find(x=>x.id===selectId)||rows[0]||null;

    if(next){
      setSelectedId(next.id);
      setPolicy({
        code:next.code||"",
        name:next.name||"",
        description:next.description||"",
        department_id:next.department_id||"",
        branch_id:next.branch_id||"",
        request_type_id:next.request_type_id||"",
        governance_mode:next.governance_mode||"",
        currency_code:next.currency_code||"",
        is_default:Boolean(next.is_default),
        priority:Number(next.priority||100)
      });
    }
  }

  useEffect(()=>{
    load().catch(err=>setError(err.message));
  },[]);

  function choose(item){
    setSelectedId(item.id);

    setPolicy({
      code:item.code||"",
      name:item.name||"",
      description:item.description||"",
      department_id:item.department_id||"",
      branch_id:item.branch_id||"",
      request_type_id:item.request_type_id||"",
      governance_mode:item.governance_mode||"",
      currency_code:item.currency_code||"",
      is_default:Boolean(item.is_default),
      priority:Number(item.priority||100)
    });

    setRule(emptyRule());
    setError("");
  }

  function newPolicy(){
    setSelectedId(null);
    setPolicy(emptyPolicy());
    setRule(emptyRule());
    setError("");
  }

  const setPolicyField=(key,value)=>
    setPolicy(x=>({...x,[key]:value}));

  const setRuleField=(key,value)=>
    setRule(x=>({...x,[key]:value}));

  async function savePolicy(e){
    e.preventDefault();

    if(!policy.name.trim()){
      setError("Policy name is required.");
      return;
    }

    if(!selectedId&&!policy.code.trim()){
      setError("Policy code is required.");
      return;
    }

    setPolicyBusy(true);
    setError("");

    try{
      const payload={
        ...policy,
        department_id:policy.department_id
          ?Number(policy.department_id)
          :null,

        branch_id:policy.branch_id
          ?Number(policy.branch_id)
          :null,

        request_type_id:policy.request_type_id
          ?Number(policy.request_type_id)
          :null,

        priority:Number(policy.priority||100)
      };

      const saved=selectedId
        ?await opsApi.updateProcurementPolicy(
          companyId,
          selectedId,
          payload
        )
        :await opsApi.createProcurementPolicy(
          companyId,
          payload
        );

      await load(saved.id);

    }catch(err){
      setError(err.message);
    }finally{
      setPolicyBusy(false);
    }
  }

  async function addRule(e){
    e.preventDefault();

    if(!selectedId){
      setError("Save the procurement policy before adding thresholds.");
      return;
    }

    if(!rule.name.trim()){
      setError("Threshold name is required.");
      return;
    }

    setRuleBusy(true);
    setError("");

    try{
      await opsApi.createProcurementPolicyRule(
        companyId,
        selectedId,
        {
          ...rule,
          min_amount:Number(rule.min_amount||0),
          max_amount:rule.max_amount===""
            ?null
            :Number(rule.max_amount),
          minimum_quotes:Number(rule.minimum_quotes||0),
          priority:Number(rule.priority||100)
        }
      );

      setRule(emptyRule());
      await load(selectedId);

    }catch(err){
      setError(err.message);
    }finally{
      setRuleBusy(false);
    }
  }

  if(!session||!setup)
    return <div className="loading-screen">
      Loading procurement policies…
    </div>;

  const currency=
    policy.currency_code||
    session.currency||
    "";

  return (
    <Shell session={session} active="procurement">
      <div className="page-header procurement-page-header">
        <div>
          <button
            type="button"
            className="page-back-link"
            onClick={()=>nav("/procurement")}
          >
            <ArrowLeft size={15}/>
            Procurement
          </button>

          <span className="eyebrow dark">
            PROCUREMENT CONTROL
          </span>

          <h1>Procurement policies</h1>

          <p>
            Configure sourcing methods and quotation requirements by spending threshold.
          </p>
        </div>

        <button
          type="button"
          className="primary-btn"
          onClick={newPolicy}
        >
          <Plus size={16}/>
          New policy
        </button>
      </div>

      {error&&
        <div className="alert error">{error}</div>}

      <div className="procurement-policy-workspace">
        <aside className="procurement-policy-list">
          <div className="procurement-panel-heading">
            <div>
              <span>POLICIES</span>
              <strong>{policies.length}</strong>
            </div>
          </div>

          {!policies.length?(
            <div className="beautiful-empty compact">
              <ShieldCheck/>
              <h3>No policies</h3>
              <p>Create your first procurement policy.</p>
            </div>
          ):(
            policies.map(item=>(
              <button
                type="button"
                key={item.id}
                className={`procurement-policy-item ${
                  selectedId===item.id?"selected":""
                }`}
                onClick={()=>choose(item)}
              >
                <span className="procurement-policy-icon">
                  <ShieldCheck size={16}/>
                </span>

                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {[
                      item.department_name,
                      item.branch_name,
                      item.request_type_name
                    ].filter(Boolean).join(" · ")
                    ||"Organisation-wide"}
                  </small>
                </div>

                {item.is_default&&(
                  <span className="policy-default">
                    Default
                  </span>
                )}

                <ChevronRight size={15}/>
              </button>
            ))
          )}
        </aside>

        <main className="procurement-policy-main">
          <form
            className="procurement-policy-form"
            onSubmit={savePolicy}
          >
            <div className="procurement-section-heading">
              <div>
                <span className="eyebrow dark">
                  POLICY PROFILE
                </span>

                <h2>
                  {selectedId
                    ?policy.name||"Procurement policy"
                    :"New procurement policy"}
                </h2>

                <p>
                  Scope the policy to the whole organisation or a specific operating area.
                </p>
              </div>

              <button
                type="submit"
                className="primary-btn"
                disabled={policyBusy}
              >
                <Save size={16}/>
                {policyBusy?"Saving...":"Save policy"}
              </button>
            </div>

            <div className="procurement-policy-fields">
              <div>
                <label>Policy code</label>
                <input
                  value={policy.code}
                  disabled={Boolean(selectedId)}
                  onChange={e=>
                    setPolicyField(
                      "code",
                      e.target.value.toUpperCase()
                    )
                  }
                  placeholder="STANDARD"
                />
              </div>

              <div>
                <label>Policy name</label>
                <input
                  value={policy.name}
                  onChange={e=>
                    setPolicyField(
                      "name",
                      e.target.value
                    )
                  }
                  placeholder="Standard procurement policy"
                />
              </div>

              <div className="span-2">
                <label>Description</label>
                <textarea
                  rows="3"
                  value={policy.description}
                  onChange={e=>
                    setPolicyField(
                      "description",
                      e.target.value
                    )
                  }
                  placeholder="Describe when this policy applies..."
                />
              </div>

              <div>
                <label>Department</label>
                <select
                  value={policy.department_id}
                  onChange={e=>
                    setPolicyField(
                      "department_id",
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    All departments
                  </option>

                  {(setup.departments||[]).map(item=>(
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Branch</label>
                <select
                  value={policy.branch_id}
                  onChange={e=>
                    setPolicyField(
                      "branch_id",
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    All branches
                  </option>

                  {(setup.branches||[]).map(item=>(
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Request type</label>
                <select
                  value={policy.request_type_id}
                  onChange={e=>
                    setPolicyField(
                      "request_type_id",
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    All request types
                  </option>

                  {(setup.request_types||[]).map(item=>(
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Governance mode</label>
                <select
                  value={policy.governance_mode}
                  onChange={e=>
                    setPolicyField(
                      "governance_mode",
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Any governance mode
                  </option>
                  <option value="flexible">Flexible</option>
                  <option value="structured">Structured</option>
                  <option value="controlled">Controlled</option>
                </select>
              </div>

              <label className="procurement-policy-check span-2">
                <input
                  type="checkbox"
                  checked={policy.is_default}
                  onChange={e=>
                    setPolicyField(
                      "is_default",
                      e.target.checked
                    )
                  }
                />

                <div>
                  <strong>Default procurement policy</strong>
                  <span>
                    Use this policy when no more specific policy applies.
                  </span>
                </div>
              </label>
            </div>
          </form>

          <section className="procurement-threshold-section">
            <div className="procurement-section-heading">
              <div>
                <span className="eyebrow dark">
                  SOURCING THRESHOLDS
                </span>

                <h2>Quotation & sourcing rules</h2>

                <p>
                  FinFlow evaluates these ranges against the approved requisition value.
                </p>
              </div>
            </div>

            {!selectedId?(
              <div className="beautiful-empty">
                <CircleDollarSign/>
                <h3>Save the policy first</h3>
                <p>
                  Threshold rules belong to a saved procurement policy.
                </p>
              </div>
            ):(
              <>
                <div className="procurement-threshold-list">
                  {!selected?.rules?.length&&(
                    <div className="procurement-threshold-empty">
                      No sourcing thresholds configured yet.
                    </div>
                  )}

                  {(selected?.rules||[]).map((item,index)=>(
                    <article
                      className="procurement-threshold-card"
                      key={item.id}
                    >
                      <div className="procurement-threshold-order">
                        {index+1}
                      </div>

                      <div className="procurement-threshold-range">
                        <small>SPEND RANGE</small>

                        <strong>
                          {money(item.min_amount,currency)}
                          {" → "}
                          {item.max_amount===null
                            ?"No limit"
                            :money(item.max_amount,currency)}
                        </strong>
                      </div>

                      <div>
                        <small>SOURCING METHOD</small>
                        <strong className="capitalize">
                          {item.sourcing_method.replaceAll("_"," ")}
                        </strong>
                      </div>

                      <div>
                        <small>QUOTATIONS</small>
                        <strong>
                          {item.minimum_quotes}
                        </strong>
                      </div>

                      <div className="procurement-threshold-controls">
                        {item.require_formal_rfq&&
                          <span>Formal RFQ</span>}

                        {item.require_quote_comparison&&
                          <span>Comparison</span>}

                        {item.require_vendor_selection_approval&&
                          <span>Selection approval</span>}
                      </div>

                      <span className="status-pill active">
                        Active
                      </span>
                    </article>
                  ))}
                </div>

                <form
                  className="procurement-add-threshold"
                  onSubmit={addRule}
                >
                  <div className="procurement-add-threshold-head">
                    <div>
                      <Plus size={17}/>
                      <div>
                        <strong>Add sourcing threshold</strong>
                        <span>
                          Amount ranges may not overlap.
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="procurement-threshold-fields">
                    <div className="span-2">
                      <label>Rule name</label>
                      <input
                        value={rule.name}
                        onChange={e=>
                          setRuleField(
                            "name",
                            e.target.value
                          )
                        }
                        placeholder="Three quotation procurement"
                      />
                    </div>

                    <div>
                      <label>From amount</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rule.min_amount}
                        onChange={e=>
                          setRuleField(
                            "min_amount",
                            e.target.value
                          )
                        }
                      />
                    </div>

                    <div>
                      <label>To amount</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rule.max_amount}
                        onChange={e=>
                          setRuleField(
                            "max_amount",
                            e.target.value
                          )
                        }
                        placeholder="No limit"
                      />
                    </div>

                    <div>
                      <label>Sourcing method</label>
                      <select
                        value={rule.sourcing_method}
                        onChange={e=>
                          setRuleField(
                            "sourcing_method",
                            e.target.value
                          )
                        }
                      >
                        <option value="direct">Direct purchase</option>
                        <option value="quotation">Quotation</option>
                        <option value="rfq">Formal RFQ</option>
                        <option value="tender">Tender</option>
                        <option value="framework">Framework contract</option>
                      </select>
                    </div>

                    <div>
                      <label>Minimum quotations</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={rule.minimum_quotes}
                        onChange={e=>
                          setRuleField(
                            "minimum_quotes",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="procurement-threshold-options">
                    <label>
                      <input
                        type="checkbox"
                        checked={rule.require_formal_rfq}
                        onChange={e=>
                          setRuleField(
                            "require_formal_rfq",
                            e.target.checked
                          )
                        }
                      />
                      Formal RFQ required
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        checked={rule.require_quote_comparison}
                        onChange={e=>
                          setRuleField(
                            "require_quote_comparison",
                            e.target.checked
                          )
                        }
                      />
                      Quote comparison required
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        checked={rule.require_vendor_selection_approval}
                        onChange={e=>
                          setRuleField(
                            "require_vendor_selection_approval",
                            e.target.checked
                          )
                        }
                      />
                      Vendor selection approval
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        checked={rule.allow_emergency_override}
                        onChange={e=>
                          setRuleField(
                            "allow_emergency_override",
                            e.target.checked
                          )
                        }
                      />
                      Emergency override allowed
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        checked={rule.allow_sole_source}
                        onChange={e=>
                          setRuleField(
                            "allow_sole_source",
                            e.target.checked
                          )
                        }
                      />
                      Sole-source exception allowed
                    </label>
                  </div>

                  <div className="procurement-add-threshold-actions">
                    <button
                      type="submit"
                      className="primary-btn"
                      disabled={ruleBusy}
                    >
                      <Plus size={16}/>
                      {ruleBusy
                        ?"Adding..."
                        :"Add threshold"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </main>
      </div>
    </Shell>
  );
}