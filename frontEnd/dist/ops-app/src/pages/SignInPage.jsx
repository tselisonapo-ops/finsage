
import {useState} from "react";
import {ArrowLeft,Eye,EyeOff,LockKeyhole,Sparkles} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {authApi,opsApi,setSession} from "../api/api";

export default function SignInPage(){
  const nav=useNavigate();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [show,setShow]=useState(false);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function submit(e){
    e.preventDefault();
    setError("");
    setBusy(true);

    try{
      const data=await authApi.signin(email,password);
      const token=data.token;
      const companyId=
        data.user?.primary_company_id ||
        data.user?.company_id;

      if(!token)
        throw new Error("No authentication token returned.");

      if(!companyId)
        throw new Error("No primary company is linked to this account.");

      setSession(token,companyId);

      const ctx=await opsApi.session(companyId);

      nav(
        ctx.settings?.setup_completed?"/":"/setup",
        {replace:true}
      );

    }catch(err){
      if(err.status===403)
        setError("Your account does not currently have access to FinSage Nexus.");
      else
        setError(err.message||"Unable to sign in.");
    }finally{
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="brand-mark"><Sparkles size={26}/></div>
        <div>
          <span className="eyebrow">FINSPHERE</span>
          <h1>Work flows better<br/>when everyone is aligned.</h1>
          <p>
            Requests, approvals, procurement and internal operations —
            connected to your financial system.
          </p>
        </div>

        <div className="auth-feature-card">
          <span className="status-dot"/>
          <div>
            <strong>FinSage Nexus</strong>
            <small>Internal Operations Workspace</small>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <a className="back-link" href="https://finspheresolutions.com">
          <ArrowLeft size={16}/> Home
        </a>

        <form className="auth-form" onSubmit={submit}>
          <div className="form-heading">
            <div className="mini-icon"><LockKeyhole size={20}/></div>
            <h2>Welcome back</h2>
            <p>Sign in to your FinSphere workspace.</p>
          </div>

          <label>Email address</label>
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@company.com"
            required
          />

          <label>Password</label>
          <div className="password-field">
            <input
              type={show?"text":"password"}
              value={password}
              onChange={e=>setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
            <button type="button" onClick={()=>setShow(v=>!v)}>
              {show?<EyeOff size={18}/>:<Eye size={18}/>}
            </button>
          </div>

          {error&&<div className="alert error">{error}</div>}

          <button className="primary-btn wide" disabled={busy}>
            {busy?"Signing in...":"Sign in"}
          </button>

          <a className="center-link" href="/reset-request.html">
            Forgot password?
          </a>
        </form>
      </section>
    </main>
  );
}