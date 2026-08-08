import {useEffect,useState} from "react";
import {AlertTriangle,CheckCircle2,Plus,ShieldCheck,WalletCards} from "lucide-react";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

export default function BudgetPage(){
  const companyId=getCompanyId();

  const [session,setSession]=useState(null);
  const [rules,setRules]=useState([]);
  const [setup,setSetup]=useState(null);
  const [accounts,setAccounts]=useState([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const emptyForm=()=>({
    name:"",
    request_type_id:"",
    account_code:"",
    department_id:"",
    branch_id:"",
    control_mode:"warn",
    budget_basis:"ytd",
    require_budget_check:true,
    require_finance_review:false,
    tolerance_amount:0,
    tolerance_percent:0
  });

  const [form,setForm]=useState(emptyForm());
  const set=(k,v)=>setForm(x=>({...x,[k]:v}));

  async function load(){
    const [ctx,ruleData,setupData,accountData]=await Promise.all([
      opsApi.session(companyId),
      opsApi.budgetRules(companyId),
      opsApi.setup(companyId),
      opsApi.financeAccounts(companyId)
    ]);

    setSession(ctx);
    setRules(ruleData.rows||[]);
    setSetup(setupData);
    setAccounts(accountData.rows||[]);
  }

  useEffect(()=>{
    load().catch(err=>setError(err.message));
  },[]);

  async function save(e){
    e.preventDefault();

    if(!form.name.trim()){
      setError("Rule name is required.");
      return;
    }

    setBusy(true);
    setError("");

    try{
      await opsApi.createBudgetRule(companyId,{
        ...form,
        request_type_id:form.request_type_id?Number(form.request_type_id):null,
        department_id:form.department_id?Number(form.department_id):null,
        branch_id:form.branch_id?Number(form.branch_id):null,
        account_code:form.account_code||null,
        tolerance_amount:Number(form.tolerance_amount||0),
        tolerance_percent:Number(form.tolerance_percent||0)
      });

      setForm(emptyForm());
      await load();
    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session||!setup)
    return <div className="loading-screen">Loading budget control…</div>;

  return (
    <Shell session={session} active="budget">

      <div className="page-header">
        <div>
          <span className="eyebrow dark">FINANCIAL CONTROL</span>
          <h1>Budget control</h1>
          <p>Control spending against approved FinSage budgets and actual expenditure.</p>
        </div>

        <div className="department-chip">{rules.length} rules</div>
      </div>

      {error&&<div className="alert error">{error}</div>}

      <div className="setup-grid">

        <section className="setup-main">
          <div className="section-heading">
            <div>
              <h2>Control rules</h2>
              <p>Rules are evaluated from the most specific match to organisation-wide defaults.</p>
            </div>
            <ShieldCheck/>
          </div>

          <div className="budget-rule-list">
            {!rules.length&&(
              <div className="beautiful-empty">
                <WalletCards/>
                <h3>No budget rules yet</h3>
                <p>Add your first spending control rule.</p>
              </div>
            )}

            {rules.map(rule=>(
              <article className="budget-rule-card" key={rule.id}>
                <div className={`rule-mode ${rule.control_mode}`}>
                  {rule.control_mode==="block"
                    ?<AlertTriangle size={17}/>
                    :<CheckCircle2 size={17}/>}
                </div>

                <div className="budget-rule-copy">
                  <strong>{rule.name}</strong>
                  <small>
                    {[
                      rule.request_type_name,
                      rule.account_code,
                      rule.department_name,
                      rule.branch_name,
                      rule.budget_basis
                    ].filter(Boolean).join(" · ")||"Organisation-wide"}
                  </small>
                </div>

                <span className={`status-pill ${rule.control_mode}`}>
                  {rule.control_mode}
                </span>
              </article>
            ))}
          </div>
        </section>

        <form className="setup-side-card" onSubmit={save}>
          <div className="card-icon"><Plus/></div>

          <h3>Add budget rule</h3>
          <p>Define when FinFlow warns, escalates or blocks spending.</p>

          <label>Rule name</label>
          <input
            value={form.name}
            onChange={e=>set("name",e.target.value)}
            placeholder="Finance department operating expenditure"
          />

          <label>Request type</label>
          <select value={form.request_type_id} onChange={e=>set("request_type_id",e.target.value)}>
            <option value="">All request types</option>
            {(setup.request_types||[]).map(type=>(
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>

          <label>GL account</label>
          <select value={form.account_code} onChange={e=>set("account_code",e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map(account=>(
              <option key={account.id} value={account.code}>{account.name}</option>
            ))}
          </select>

          <label>Department</label>
          <select value={form.department_id} onChange={e=>set("department_id",e.target.value)}>
            <option value="">All departments</option>
            {(setup.departments||[]).map(department=>(
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>

          <label>Branch</label>
          <select value={form.branch_id} onChange={e=>set("branch_id",e.target.value)}>
            <option value="">All branches</option>
            {(setup.branches||[]).map(branch=>(
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>

          <label>Budget basis</label>
          <select value={form.budget_basis} onChange={e=>set("budget_basis",e.target.value)}>
            <option value="month">Current month</option>
            <option value="ytd">Year to date</option>
            <option value="full_period">Full approved budget</option>
          </select>

          <label>Control behaviour</label>
          <select value={form.control_mode} onChange={e=>set("control_mode",e.target.value)}>
            <option value="warn">Warn</option>
            <option value="block">Block</option>
            <option value="escalate">Escalate</option>
            <option value="none">No control</option>
          </select>

          <div className="two-col">
            <div>
              <label>Tolerance amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.tolerance_amount}
                onChange={e=>set("tolerance_amount",e.target.value)}
              />
            </div>

            <div>
              <label>Tolerance %</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.tolerance_percent}
                onChange={e=>set("tolerance_percent",e.target.value)}
              />
            </div>
          </div>

          <label className="check-row">
            <input
              type="checkbox"
              checked={form.require_budget_check}
              onChange={e=>set("require_budget_check",e.target.checked)}
            />
            Require budget check
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={form.require_finance_review}
              onChange={e=>set("require_finance_review",e.target.checked)}
            />
            Require Finance review
          </label>

          <button type="submit" className="primary-btn" disabled={busy}>
            {busy?"Saving...":"Add rule"}
          </button>
        </form>

      </div>
    </Shell>
  );
}