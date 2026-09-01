import {useEffect,useState} from "react";
import {getCompanyId,getToken} from "../api/api";
import "../components/settings/CompanyEmailSettings.css";

const emptyForm={
  sender_name:"",
  sender_email:"",
  reply_to_email:"",
  smtp_host:"",
  smtp_port:465,
  smtp_username:"",
  smtp_password:"",
  use_ssl:true,
  use_tls:false,
  is_enabled:false,
};

export default function CompanyEmailSettingsPage(){
  const companyId=getCompanyId();
  const token=getToken();

  const [form,setForm]=useState(emptyForm);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [testing,setTesting]=useState(false);
  const [status,setStatus]=useState(null);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  const apiBase=import.meta.env.VITE_API_BASE_URL || "";

  const headers={
    "Content-Type":"application/json",
    Authorization:`Bearer ${token}`,
  };

  useEffect(()=>{
    loadSettings();
  },[]);

  async function loadSettings(){
    setLoading(true);
    setError("");

    try{
      const res=await fetch(
        `${apiBase}/api/companies/${companyId}/email-settings`,
        {headers}
      );

      const data=await res.json();

      if(!res.ok) throw new Error(data.error || "Unable to load email settings.");

      setForm({
        sender_name:data.sender_name || "",
        sender_email:data.sender_email || "",
        reply_to_email:data.reply_to_email || "",
        smtp_host:data.smtp_host || "",
        smtp_port:data.smtp_port || 465,
        smtp_username:data.smtp_username || "",
        smtp_password:"",
        use_ssl:data.use_ssl !== false,
        use_tls:!!data.use_tls,
        is_enabled:!!data.is_enabled,
      });

      setStatus(data);
    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
    }
  }

  function change(e){
    const {name,value,type,checked}=e.target;

    setForm(prev=>({
      ...prev,
      [name]:type==="checkbox"?checked:value,
    }));
  }

  function selectSecurity(mode){
    setForm(prev=>({
      ...prev,
      use_ssl:mode==="ssl",
      use_tls:mode==="tls",
    }));
  }

  async function save(){
    setSaving(true);
    setError("");
    setMessage("");

    try{
      const payload={...form};

      if(!payload.smtp_password){
        delete payload.smtp_password;
      }

      payload.smtp_port=Number(payload.smtp_port || 465);

      const res=await fetch(
        `${apiBase}/api/companies/${companyId}/email-settings`,
        {
          method:"PATCH",
          headers,
          body:JSON.stringify(payload),
        }
      );

      const data=await res.json();

      if(!res.ok) throw new Error(data.error || "Unable to save settings.");

      setStatus(data);
      setForm(prev=>({...prev,smtp_password:""}));
      setMessage("Company email settings saved.");
    }catch(e){
      setError(e.message);
    }finally{
      setSaving(false);
    }
  }

  async function testEmail(){
    setTesting(true);
    setError("");
    setMessage("");

    try{
      const recipient=window.prompt(
        "Send test email to:",
        form.sender_email || ""
      );

      if(!recipient) return;

      const res=await fetch(
        `${apiBase}/api/companies/${companyId}/email-settings/test`,
        {
          method:"POST",
          headers,
          body:JSON.stringify({
            recipient_email:recipient.trim(),
          }),
        }
      );

      const data=await res.json();

      if(!res.ok) throw new Error(data.error || "Email test failed.");

      setStatus(prev=>({
        ...prev,
        ...data,
        is_verified:true,
      }));

      setMessage(
        `Test email sent successfully to ${recipient}.`
      );
    }catch(e){
      setError(e.message);
    }finally{
      setTesting(false);
    }
  }

  if(loading){
    return (
      <div className="email-settings-page">
        <div className="email-loading">
          Loading company email configuration…
        </div>
      </div>
    );
  }

  const verified=!!status?.is_verified;
  const passwordConfigured=!!status?.smtp_password_configured;

  return (
    <div className="email-settings-page">

      <div className="email-header">
        <div>
          <div className="email-eyebrow">
            COMPANY COMMUNICATIONS
          </div>

          <h1>Company Email</h1>

          <p>
            Configure the email account FinSage should use when
            communicating on behalf of your company.
          </p>
        </div>

        <div className={`email-status ${verified?"verified":"unverified"}`}>
          <span className="status-dot"/>
          {verified?"Verified":"Not verified"}
        </div>
      </div>

      {error&&(
        <div className="email-alert error">
          <strong>Configuration error</strong>
          <span>{error}</span>
        </div>
      )}

      {message&&(
        <div className="email-alert success">
          <strong>Success</strong>
          <span>{message}</span>
        </div>
      )}

      <div className="email-layout">

        <div className="email-main">

          <section className="email-card">
            <div className="card-heading">
              <div>
                <h2>Sender identity</h2>
                <p>
                  This is how recipients will see your company
                  in their inbox.
                </p>
              </div>
            </div>

            <div className="form-grid">

              <label className="field">
                <span>Sender name</span>
                <input
                  name="sender_name"
                  value={form.sender_name}
                  onChange={change}
                  placeholder="ABC Consulting"
                />
              </label>

              <label className="field">
                <span>Sender email</span>
                <input
                  type="email"
                  name="sender_email"
                  value={form.sender_email}
                  onChange={change}
                  placeholder="accounts@company.com"
                />
              </label>

              <label className="field full">
                <span>Reply-to email</span>
                <input
                  type="email"
                  name="reply_to_email"
                  value={form.reply_to_email}
                  onChange={change}
                  placeholder="accounts@company.com"
                />
                <small>
                  Optional. Replies will be sent here instead
                  of the sender address.
                </small>
              </label>

            </div>
          </section>


          <section className="email-card">
            <div className="card-heading">
              <div>
                <h2>Mail server</h2>
                <p>
                  SMTP credentials are encrypted before they
                  are stored by FinSage.
                </p>
              </div>

              {passwordConfigured&&(
                <span className="credential-badge">
                  Password saved
                </span>
              )}
            </div>

            <div className="form-grid">

              <label className="field">
                <span>SMTP server</span>
                <input
                  name="smtp_host"
                  value={form.smtp_host}
                  onChange={change}
                  placeholder="mail.company.com"
                />
              </label>

              <label className="field">
                <span>SMTP port</span>
                <input
                  type="number"
                  name="smtp_port"
                  min="1"
                  max="65535"
                  value={form.smtp_port}
                  onChange={change}
                />
              </label>

              <label className="field">
                <span>SMTP username</span>
                <input
                  name="smtp_username"
                  value={form.smtp_username}
                  onChange={change}
                  placeholder="accounts@company.com"
                  autoComplete="username"
                />
              </label>

              <label className="field">
                <span>
                  SMTP password
                  {passwordConfigured&&(
                    <em> • leave blank to keep existing</em>
                  )}
                </span>

                <input
                  type="password"
                  name="smtp_password"
                  value={form.smtp_password}
                  onChange={change}
                  placeholder={
                    passwordConfigured
                      ?"••••••••••••"
                      :"Enter mailbox password"
                  }
                  autoComplete="new-password"
                />
              </label>

            </div>

            <div className="security-block">
              <span className="security-title">
                Connection security
              </span>

              <div className="security-options">

                <button
                  type="button"
                  className={form.use_ssl?"selected":""}
                  onClick={()=>selectSecurity("ssl")}
                >
                  <strong>SSL/TLS</strong>
                  <span>Usually port 465</span>
                </button>

                <button
                  type="button"
                  className={form.use_tls?"selected":""}
                  onClick={()=>selectSecurity("tls")}
                >
                  <strong>STARTTLS</strong>
                  <span>Usually port 587</span>
                </button>

                <button
                  type="button"
                  className={!form.use_ssl&&!form.use_tls?"selected":""}
                  onClick={()=>selectSecurity("none")}
                >
                  <strong>None</strong>
                  <span>Not recommended</span>
                </button>

              </div>
            </div>
          </section>


          <section className="email-card delivery-card">
            <div>
              <h2>Company email delivery</h2>
              <p>
                When enabled and verified, FinSage will use
                this mailbox instead of the platform
                noreply address.
              </p>
            </div>

            <label className="switch">
              <input
                type="checkbox"
                name="is_enabled"
                checked={form.is_enabled}
                onChange={change}
              />
              <span className="slider"/>
            </label>
          </section>


          <div className="email-actions">

            <button
              type="button"
              className="btn-secondary"
              onClick={testEmail}
              disabled={testing||saving}
            >
              {testing?"Testing connection…":"Send test email"}
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={save}
              disabled={saving||testing}
            >
              {saving?"Saving…":"Save email settings"}
            </button>

          </div>

        </div>


        <aside className="email-sidebar">

          <div className="email-card status-card">
            <span className="sidebar-label">
              EMAIL STATUS
            </span>

            <div className="status-row">
              <span>Configuration</span>
              <strong>
                {form.smtp_host?"Configured":"Incomplete"}
              </strong>
            </div>

            <div className="status-row">
              <span>Password</span>
              <strong>
                {passwordConfigured?"Stored securely":"Not configured"}
              </strong>
            </div>

            <div className="status-row">
              <span>Verification</span>
              <strong className={verified?"good":"warning"}>
                {verified?"Verified":"Pending"}
              </strong>
            </div>

            <div className="status-row">
              <span>Delivery</span>
              <strong>
                {form.is_enabled?"Enabled":"Disabled"}
              </strong>
            </div>
          </div>


          <div className="email-card fallback-card">
            <span className="sidebar-label">
              FINSAGE FALLBACK
            </span>

            <h3>Platform delivery remains available</h3>

            <p>
              If company email is not enabled or verified,
              FinSage will send system communication through:
            </p>

            <code>
              noreply@finspheresolutions.com
            </code>
          </div>


          {status?.last_tested_at&&(
            <div className="email-card test-card">
              <span className="sidebar-label">
                LAST CONNECTION TEST
              </span>

              <strong>
                {status.last_test_status==="success"
                  ?"Successful"
                  :"Failed"}
              </strong>

              <p>
                {new Date(
                  status.last_tested_at
                ).toLocaleString()}
              </p>

              {status.last_test_error&&(
                <small>
                  {status.last_test_error}
                </small>
              )}
            </div>
          )}

        </aside>

      </div>
    </div>
  );
}