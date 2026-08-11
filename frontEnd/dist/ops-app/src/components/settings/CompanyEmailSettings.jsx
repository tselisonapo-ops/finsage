import {useEffect,useState} from "react";
import {getCompanyId,getToken} from "../../api/api";

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

export default function CompanyEmailSettings(){
  const companyId=getCompanyId();
  const token=getToken();

  const [form,setForm]=useState(emptyForm);
  const [status,setStatus]=useState({});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [testing,setTesting]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  const apiBase=import.meta.env.VITE_API_BASE_URL || "";

  function authHeaders(){
    return {
      "Content-Type":"application/json",
      Authorization:`Bearer ${token}`,
    };
  }

  useEffect(()=>{
    loadSettings();
  },[]);

  async function loadSettings(){
    setLoading(true);
    setError("");

    try{
      const res=await fetch(
        `${apiBase}/api/companies/${companyId}/email-settings`,
        {
          headers:authHeaders(),
        }
      );

      const data=await res.json();

      if(!res.ok){
        throw new Error(
          data.error || "Unable to load company email settings."
        );
      }

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

  function security(mode){
    setForm(prev=>({
      ...prev,
      use_ssl:mode==="ssl",
      use_tls:mode==="tls",
      smtp_port:
        mode==="ssl"
          ?465
          :mode==="tls"
            ?587
            :prev.smtp_port,
    }));
  }

  async function save(){
    setSaving(true);
    setMessage("");
    setError("");

    try{
      const payload={
        ...form,
        smtp_port:Number(form.smtp_port || 465),
      };

      if(!payload.smtp_password){
        delete payload.smtp_password;
      }

      const res=await fetch(
        `${apiBase}/api/companies/${companyId}/email-settings`,
        {
          method:"PATCH",
          headers:authHeaders(),
          body:JSON.stringify(payload),
        }
      );

      const data=await res.json();

      if(!res.ok){
        throw new Error(
          data.error || "Unable to save email settings."
        );
      }

      setStatus(data);

      setForm(prev=>({
        ...prev,
        smtp_password:"",
      }));

      setMessage("Company email settings saved successfully.");

    }catch(e){
      setError(e.message);
    }finally{
      setSaving(false);
    }
  }

  async function testEmail(){
    const recipient=window.prompt(
      "Send the test email to:",
      form.sender_email || ""
    );

    if(!recipient) return;

    setTesting(true);
    setMessage("");
    setError("");

    try{
      const res=await fetch(
        `${apiBase}/api/companies/${companyId}/email-settings/test`,
        {
          method:"POST",
          headers:authHeaders(),
          body:JSON.stringify({
            recipient_email:recipient.trim(),
          }),
        }
      );

      const data=await res.json();

      if(!res.ok){
        throw new Error(
          data.error || "SMTP connection test failed."
        );
      }

      setStatus(prev=>({
        ...prev,
        ...data,
        is_verified:true,
      }));

      setMessage(
        `Test email sent successfully to ${recipient.trim()}.`
      );

    }catch(e){
      setError(e.message);
    }finally{
      setTesting(false);
    }
  }

  if(loading){
    return (
      <div className="settings-card settings-loading">
        Loading email configuration…
      </div>
    );
  }

  const verified=!!status.is_verified;
  const passwordConfigured=!!status.smtp_password_configured;

  return (
    <div className="email-settings">

      {error&&(
        <div className="settings-alert settings-alert-error">
          <strong>Email configuration error</strong>
          <span>{error}</span>
        </div>
      )}

      {message&&(
        <div className="settings-alert settings-alert-success">
          <strong>Success</strong>
          <span>{message}</span>
        </div>
      )}

      <div className="email-status-strip">

        <div className="email-status-item">
          <span>Configuration</span>
          <strong>
            {form.smtp_host&&form.smtp_username
              ?"Configured"
              :"Incomplete"}
          </strong>
        </div>

        <div className="email-status-item">
          <span>Password</span>
          <strong>
            {passwordConfigured
              ?"Stored securely"
              :"Not configured"}
          </strong>
        </div>

        <div className="email-status-item">
          <span>Verification</span>
          <strong className={verified?"status-good":"status-warning"}>
            {verified?"Verified":"Pending"}
          </strong>
        </div>

        <div className="email-status-item">
          <span>Delivery</span>
          <strong>
            {form.is_enabled?"Enabled":"Disabled"}
          </strong>
        </div>

      </div>


      <section className="settings-card">

        <div className="settings-card-header">
          <div>
            <h3>Sender identity</h3>
            <p>
              Controls how your company appears in the
              recipient's inbox.
            </p>
          </div>

          <span className={`verification-badge ${
            verified?"verified":"pending"
          }`}>
            {verified?"✓ Verified":"Not verified"}
          </span>
        </div>

        <div className="settings-form-grid">

          <label className="settings-field">
            <span>Sender name</span>

            <input
              name="sender_name"
              value={form.sender_name}
              onChange={change}
              placeholder="ABC Consulting"
            />
          </label>

          <label className="settings-field">
            <span>Sender email</span>

            <input
              type="email"
              name="sender_email"
              value={form.sender_email}
              onChange={change}
              placeholder="accounts@company.com"
            />
          </label>

          <label className="settings-field settings-field-full">
            <span>Reply-to email</span>

            <input
              type="email"
              name="reply_to_email"
              value={form.reply_to_email}
              onChange={change}
              placeholder="accounts@company.com"
            />

            <small>
              Replies will be directed here. Leave blank to
              use the sender email.
            </small>
          </label>

        </div>
      </section>


      <section className="settings-card">

        <div className="settings-card-header">
          <div>
            <h3>SMTP server</h3>
            <p>
              FinSage uses these credentials to send email
              through your company's mail server.
            </p>
          </div>

          {passwordConfigured&&(
            <span className="password-badge">
              🔒 Password saved
            </span>
          )}
        </div>

        <div className="settings-form-grid">

          <label className="settings-field">
            <span>SMTP server</span>

            <input
              name="smtp_host"
              value={form.smtp_host}
              onChange={change}
              placeholder="mail.company.com"
            />
          </label>

          <label className="settings-field">
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

          <label className="settings-field">
            <span>SMTP username</span>

            <input
              name="smtp_username"
              value={form.smtp_username}
              onChange={change}
              placeholder="accounts@company.com"
              autoComplete="username"
            />
          </label>

          <label className="settings-field">
            <span>
              SMTP password
              {passwordConfigured&&(
                <small className="inline-help">
                  Leave blank to keep current
                </small>
              )}
            </span>

            <input
              type="password"
              name="smtp_password"
              value={form.smtp_password}
              onChange={change}
              placeholder={
                passwordConfigured
                  ?"••••••••••••••"
                  :"Enter mailbox password"
              }
              autoComplete="new-password"
            />
          </label>

        </div>


        <div className="smtp-security">

          <div className="smtp-security-title">
            Connection security
          </div>

          <div className="smtp-security-options">

            <button
              type="button"
              className={form.use_ssl?"active":""}
              onClick={()=>security("ssl")}
            >
              <strong>SSL/TLS</strong>
              <span>Recommended · usually port 465</span>
            </button>

            <button
              type="button"
              className={form.use_tls?"active":""}
              onClick={()=>security("tls")}
            >
              <strong>STARTTLS</strong>
              <span>Usually port 587</span>
            </button>

            <button
              type="button"
              className={
                !form.use_ssl&&!form.use_tls
                  ?"active"
                  :""
              }
              onClick={()=>security("none")}
            >
              <strong>None</strong>
              <span>Not recommended</span>
            </button>

          </div>
        </div>

      </section>


      <section className="settings-card email-delivery-card">

        <div>
          <h3>Use company email for delivery</h3>

          <p>
            When enabled and verified, FinSage will use this
            account when sending company communication.
          </p>

          <small>
            If unavailable, FinSage can fall back to
            noreply@finspheresolutions.com.
          </small>
        </div>

        <label className="settings-switch">
          <input
            type="checkbox"
            name="is_enabled"
            checked={form.is_enabled}
            onChange={change}
          />
          <span/>
        </label>

      </section>


      {status.last_tested_at&&(
        <section className="settings-card email-test-result">

          <div>
            <span className="settings-section-label">
              LAST CONNECTION TEST
            </span>

            <h4>
              {status.last_test_status==="success"
                ?"Connection successful"
                :"Connection failed"}
            </h4>

            <p>
              {new Date(
                status.last_tested_at
              ).toLocaleString()}
            </p>

            {status.last_test_error&&(
              <div className="email-test-error">
                {status.last_test_error}
              </div>
            )}
          </div>

        </section>
      )}


      <div className="settings-actions">

        <button
          type="button"
          className="settings-btn settings-btn-secondary"
          onClick={testEmail}
          disabled={testing||saving}
        >
          {testing
            ?"Testing connection…"
            :"Send test email"}
        </button>

        <button
          type="button"
          className="settings-btn settings-btn-primary"
          onClick={save}
          disabled={saving||testing}
        >
          {saving
            ?"Saving…"
            :"Save changes"}
        </button>

      </div>

    </div>
  );
}