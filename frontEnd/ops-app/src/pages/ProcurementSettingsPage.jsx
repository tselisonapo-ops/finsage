import {useEffect,useState} from "react";
import {
  ArrowLeft,CheckCircle2,FileText,KeyRound,
  Mail,Save,Send,Settings2,ShieldCheck,
  ShoppingCart,TriangleAlert
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

export default function ProcurementSettingsPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [form,setForm]=useState(null);
  const [password,setPassword]=useState("");
  const [testEmail,setTestEmail]=useState("");

  const [busy,setBusy]=useState(false);
  const [testing,setTesting]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const set=(key,value)=>
    setForm(x=>({...x,[key]:value}));

  async function load(){
    const [ctx,data]=await Promise.all([
      opsApi.session(companyId),
      opsApi.procurementSettings(companyId)
    ]);

    setSession(ctx);
    setForm(data);

    setTestEmail(
      data.sender_email||
      ctx.email||
      ""
    );
  }

  useEffect(()=>{
    load().catch(err=>setError(err.message));
  },[]);

  async function save(){
    setBusy(true);
    setError("");
    setSuccess("");

    try{
      const payload={
        ...form,
        smtp_password:password||undefined,
        default_quote_requirement:Number(
          form.default_quote_requirement||0
        ),
        smtp_port:Number(
          form.smtp_port||587
        ),
        smtp_timeout_seconds:Number(
          form.smtp_timeout_seconds||30
        )
      };

      const data=
        await opsApi.updateProcurementSettings(
          companyId,
          payload
        );

      setForm(data);
      setPassword("");
      setSuccess(
        "Procurement settings saved."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function testConnection(){
    if(!testEmail.trim()){
      setError(
        "Enter an email address for the test."
      );
      return;
    }

    setTesting(true);
    setError("");
    setSuccess("");

    try{
      const result=
        await opsApi.testProcurementEmail(
          companyId,
          testEmail.trim()
        );

      setSuccess(result.message);

    }catch(err){
      setError(err.message);
    }finally{
      setTesting(false);
    }
  }

  if(!session||!form)
    return <div className="loading-screen">
      Loading procurement settings…
    </div>;

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

          <h1>Procurement settings</h1>

          <p>
            Configure sourcing controls, vendor rules, purchase-order policy and procurement communications.
          </p>
        </div>

        <button
          type="button"
          className="primary-btn"
          onClick={save}
          disabled={busy}
        >
          <Save size={16}/>
          {busy?"Saving...":"Save settings"}
        </button>
      </div>

      {error&&
        <div className="alert error">
          {error}
        </div>}

      {success&&
        <div className="alert success">
          {success}
        </div>}

      <div className="proc-settings-layout">
        <main className="proc-settings-main">
          <section className="proc-settings-section">
            <div className="proc-settings-heading">
              <div className="proc-settings-icon">
                <ShoppingCart/>
              </div>

              <div>
                <span className="eyebrow dark">
                  SOURCING
                </span>

                <h2>Quotation policy</h2>

                <p>
                  Decide how much sourcing evidence is required before a vendor can be selected.
                </p>
              </div>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Minimum quotation policy</strong>
                <span>
                  Require competitive quotations for normal procurement.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.minimum_quotes_enabled}
                  onChange={e=>
                    set(
                      "minimum_quotes_enabled",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Default quotation count</strong>
                <span>
                  This is the default, not a universal hardcoded rule.
                </span>
              </div>

              <input
                className="small-number-input"
                type="number"
                min="0"
                value={form.default_quote_requirement}
                onChange={e=>
                  set(
                    "default_quote_requirement",
                    e.target.value
                  )
                }
              />
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Quote comparison</strong>
                <span>
                  Require comparison before awarding normal sourcing events.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.require_quote_comparison}
                  onChange={e=>
                    set(
                      "require_quote_comparison",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Vendor selection reason</strong>
                <span>
                  Record why the successful vendor was selected.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.require_selection_reason}
                  onChange={e=>
                    set(
                      "require_selection_reason",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>
          </section>

          <section className="proc-settings-section">
            <div className="proc-settings-heading">
              <div className="proc-settings-icon">
                <TriangleAlert/>
              </div>

              <div>
                <span className="eyebrow dark">
                  EXCEPTIONS
                </span>

                <h2>Emergency & single-source procurement</h2>

                <p>
                  Exceptions remain possible, but FinFlow preserves the reason and audit trail.
                </p>
              </div>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Allow single-source procurement</strong>
                <span>
                  Permit sourcing from one vendor where justified.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.allow_single_source}
                  onChange={e=>
                    set(
                      "allow_single_source",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Require single-source justification</strong>
                <span>
                  A reason must be recorded when competition is bypassed.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.require_single_source_reason}
                  onChange={e=>
                    set(
                      "require_single_source_reason",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Allow emergency procurement</strong>
                <span>
                  Permit accelerated sourcing for urgent operational needs.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.allow_emergency_procurement}
                  onChange={e=>
                    set(
                      "allow_emergency_procurement",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Require emergency reason</strong>
                <span>
                  Emergency procurement must retain its justification.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.require_emergency_reason}
                  onChange={e=>
                    set(
                      "require_emergency_reason",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>
          </section>

          <section className="proc-settings-section">
            <div className="proc-settings-heading">
              <div className="proc-settings-icon">
                <ShieldCheck/>
              </div>

              <div>
                <span className="eyebrow dark">
                  VENDOR CONTROL
                </span>

                <h2>Vendor eligibility</h2>

                <p>
                  Control which suppliers may participate in procurement.
                </p>
              </div>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Require qualification</strong>
                <span>
                  Only qualified or conditionally qualified vendors may participate.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.require_vendor_qualification}
                  onChange={e=>
                    set(
                      "require_vendor_qualification",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Require vendor compliance</strong>
                <span>
                  Apply the vendor-master compliance status during sourcing.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.require_vendor_compliance}
                  onChange={e=>
                    set(
                      "require_vendor_compliance",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Allow restricted vendors</strong>
                <span>
                  Permit restricted vendors to participate where procurement approves it.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.allow_restricted_vendor}
                  onChange={e=>
                    set(
                      "allow_restricted_vendor",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>
          </section>

          <section className="proc-settings-section">
            <div className="proc-settings-heading">
              <div className="proc-settings-icon">
                <FileText/>
              </div>

              <div>
                <span className="eyebrow dark">
                  PURCHASE ORDER
                </span>

                <h2>PO policy</h2>

                <p>
                  Control whether approved sourcing must become a formal purchase order.
                </p>
              </div>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Purchase order required</strong>
                <span>
                  Require a PO before normal procurement proceeds.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.po_required}
                  onChange={e=>
                    set(
                      "po_required",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Allow PO bypass</strong>
                <span>
                  Permit approved exceptions where a PO is not appropriate.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.allow_po_bypass}
                  onChange={e=>
                    set(
                      "allow_po_bypass",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>

            <div className="proc-setting-row">
              <div>
                <strong>Require PO bypass reason</strong>
                <span>
                  Preserve justification when the normal PO route is skipped.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.require_po_bypass_reason}
                  onChange={e=>
                    set(
                      "require_po_bypass_reason",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>
          </section>

          <section className="proc-settings-section">
            <div className="proc-settings-heading">
              <div className="proc-settings-icon">
                <Mail/>
              </div>

              <div>
                <span className="eyebrow dark">
                  COMMUNICATION
                </span>

                <h2>Procurement email</h2>

                <p>
                  Configure the mailbox FinFlow will use for RFQs, purchase orders and vendor communication.
                </p>
              </div>
            </div>

            <div className="proc-email-enabled">
              <div>
                <strong>Enable procurement email</strong>
                <span>
                  FinFlow may send procurement documents from this mailbox.
                </span>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.procurement_email_enabled}
                  onChange={e=>
                    set(
                      "procurement_email_enabled",
                      e.target.checked
                    )
                  }
                />
                <span/>
              </label>
            </div>

            <div className="proc-email-grid">
              <div>
                <label>Sender name</label>

                <input
                  value={form.sender_name||""}
                  onChange={e=>
                    set(
                      "sender_name",
                      e.target.value
                    )
                  }
                  placeholder={`${session.company_name} Procurement`}
                />
              </div>

              <div>
                <label>Sender email</label>

                <input
                  type="email"
                  value={form.sender_email||""}
                  onChange={e=>
                    set(
                      "sender_email",
                      e.target.value
                    )
                  }
                  placeholder="procurement@company.com"
                />
              </div>

              <div>
                <label>Reply-to email</label>

                <input
                  type="email"
                  value={form.reply_to_email||""}
                  onChange={e=>
                    set(
                      "reply_to_email",
                      e.target.value
                    )
                  }
                  placeholder="procurement@company.com"
                />
              </div>
            </div>

            <div className="proc-smtp-box">
              <div className="proc-smtp-title">
                <KeyRound size={17}/>

                <div>
                  <strong>Mail server</strong>
                  <span>
                    SMTP credentials are stored encrypted.
                  </span>
                </div>
              </div>

              <div className="proc-email-grid smtp">
                <div className="smtp-host">
                  <label>SMTP host</label>

                  <input
                    value={form.smtp_host||""}
                    onChange={e=>
                      set(
                        "smtp_host",
                        e.target.value
                      )
                    }
                    placeholder="mail.company.com"
                  />
                </div>

                <div>
                  <label>Port</label>

                  <input
                    type="number"
                    value={form.smtp_port||587}
                    onChange={e=>
                      set(
                        "smtp_port",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div>
                  <label>Security</label>

                  <select
                    value={form.smtp_security||"starttls"}
                    onChange={e=>
                      set(
                        "smtp_security",
                        e.target.value
                      )
                    }
                  >
                    <option value="starttls">STARTTLS</option>
                    <option value="ssl">SSL/TLS</option>
                    <option value="none">None</option>
                  </select>
                </div>

                <div>
                  <label>Username</label>

                  <input
                    value={form.smtp_username||""}
                    onChange={e=>
                      set(
                        "smtp_username",
                        e.target.value
                      )
                    }
                    placeholder="procurement@company.com"
                  />
                </div>

                <div>
                  <label>Password</label>

                  <input
                    type="password"
                    value={password}
                    onChange={e=>
                      setPassword(e.target.value)
                    }
                    placeholder={
                      form.smtp_password_configured
                        ?"••••••••  Saved"
                        :"SMTP password"
                    }
                  />
                </div>

                <div>
                  <label>Timeout</label>

                  <div className="input-suffix">
                    <input
                      type="number"
                      min="5"
                      value={form.smtp_timeout_seconds||30}
                      onChange={e=>
                        set(
                          "smtp_timeout_seconds",
                          e.target.value
                        )
                      }
                    />
                    <span>sec</span>
                  </div>
                </div>
              </div>

              {form.smtp_password_configured&&(
                <div className="smtp-saved-state">
                  <CheckCircle2 size={14}/>
                  SMTP credential saved
                </div>
              )}

              <div className="proc-email-test">
                <div>
                  <label>Send test to</label>

                  <input
                    type="email"
                    value={testEmail}
                    onChange={e=>
                      setTestEmail(e.target.value)
                    }
                    placeholder="you@company.com"
                  />
                </div>

                <button
                  type="button"
                  className="ghost-btn"
                  disabled={testing}
                  onClick={testConnection}
                >
                  <Send size={15}/>
                  {testing
                    ?"Sending..."
                    :"Send test email"}
                </button>
              </div>
            </div>
          </section>

          <section className="proc-settings-section">
            <div className="proc-settings-heading">
              <div className="proc-settings-icon">
                <Settings2/>
              </div>

              <div>
                <span className="eyebrow dark">
                  RFQ TEMPLATE
                </span>

                <h2>Default vendor invitation</h2>

                <p>
                  Phase 3B will merge the sourcing event into this template.
                </p>
              </div>
            </div>

            <label>Subject</label>

            <input
              value={form.rfq_subject_template||""}
              onChange={e=>
                set(
                  "rfq_subject_template",
                  e.target.value
                )
              }
            />

            <label className="template-body-label">
              Email body
            </label>

            <textarea
              className="rfq-email-template"
              rows="13"
              value={form.rfq_body_template||""}
              onChange={e=>
                set(
                  "rfq_body_template",
                  e.target.value
                )
              }
            />

            <div className="template-token-row">
              {[
                "{{company_name}}",
                "{{vendor_name}}",
                "{{rfq_no}}",
                "{{request_title}}",
                "{{closing_date}}",
                "{{portal_link}}",
                "{{sender_name}}"
              ].map(token=>(
                <span key={token}>
                  {token}
                </span>
              ))}
            </div>
          </section>
        </main>

        <aside className="proc-settings-side">
          <section className="proc-policy-preview">
            <span className="eyebrow dark">
              ACTIVE POLICY
            </span>

            <h3>How FinFlow will source</h3>

            <div className="proc-policy-flow">
              <div className="proc-policy-step active">
                <span>1</span>
                <div>
                  <strong>Approved request</strong>
                  <small>
                    Procurement case created
                  </small>
                </div>
              </div>

              <div className="proc-policy-line"/>

              <div className="proc-policy-step">
                <span>2</span>
                <div>
                  <strong>
                    {form.minimum_quotes_enabled
                      ?`${form.default_quote_requirement} quotations`
                      :"Flexible sourcing"}
                  </strong>

                  <small>
                    {form.allow_single_source
                      ?"Single-source exception available"
                      :"Competitive sourcing required"}
                  </small>
                </div>
              </div>

              <div className="proc-policy-line"/>

              <div className="proc-policy-step">
                <span>3</span>
                <div>
                  <strong>
                    {form.require_quote_comparison
                      ?"Compare quotations"
                      :"Direct selection permitted"}
                  </strong>

                  <small>
                    Evaluate vendor responses
                  </small>
                </div>
              </div>

              <div className="proc-policy-line"/>

              <div className="proc-policy-step">
                <span>4</span>
                <div>
                  <strong>
                    {form.po_required
                      ?"Purchase order"
                      :"Proceed without mandatory PO"}
                  </strong>

                  <small>
                    Formalise the award
                  </small>
                </div>
              </div>
            </div>
          </section>

          <section className="proc-policy-preview">
            <span className="eyebrow dark">
              GOVERNANCE
            </span>

            <h3>Controls currently enabled</h3>

            <div className="proc-control-summary">
              <div>
                <span>Quote comparison</span>
                <strong>
                  {form.require_quote_comparison
                    ?"Required"
                    :"Optional"}
                </strong>
              </div>

              <div>
                <span>Vendor qualification</span>
                <strong>
                  {form.require_vendor_qualification
                    ?"Required"
                    :"Optional"}
                </strong>
              </div>

              <div>
                <span>Vendor compliance</span>
                <strong>
                  {form.require_vendor_compliance
                    ?"Required"
                    :"Optional"}
                </strong>
              </div>

              <div>
                <span>Emergency procurement</span>
                <strong>
                  {form.allow_emergency_procurement
                    ?"Allowed"
                    :"Disabled"}
                </strong>
              </div>

              <div>
                <span>PO</span>
                <strong>
                  {form.po_required
                    ?"Required"
                    :"Optional"}
                </strong>
              </div>

              <div>
                <span>Vendor email</span>
                <strong>
                  {form.procurement_email_enabled
                    ?"Enabled"
                    :"Disabled"}
                </strong>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}