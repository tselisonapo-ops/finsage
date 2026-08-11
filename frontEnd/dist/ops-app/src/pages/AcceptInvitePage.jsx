

import {useState} from "react";
import {CheckCircle2,Sparkles} from "lucide-react";
import {useNavigate,useSearchParams} from "react-router-dom";
import {authApi,setSession} from "../api/api";

export default function AcceptInvitePage(){
  const [params]=useSearchParams();
  const nav=useNavigate();
  const token=params.get("token")||"";

  const [form,setForm]=useState({
    firstName:"",
    lastName:"",
    password:"",
    confirmPassword:""
  });

  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  const set=(k,v)=>setForm(x=>({...x,[k]:v}));

  async function submit(e){
    e.preventDefault();
    setBusy(true);
    setError("");

    try{
      const data=await authApi.acceptInvite({...form,token});

      if(data.token&&data.companyId)
        setSession(data.token,data.companyId);

      nav("/signin",{replace:true});
    }catch(err){
      setError(err.message||"Could not accept invitation.");
    }finally{
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="brand-mark"><Sparkles/></div>
        <div>
          <span className="eyebrow">FinSage Nexus</span>
          <h1>Your workspace<br/>is ready for you.</h1>
          <p>Accept your invitation and join your organisation.</p>
        </div>

        <div className="auth-feature-card">
          <CheckCircle2/>
          <div>
            <strong>Secure invitation</strong>
            <small>Your access was assigned by your organisation.</small>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <div className="form-heading">
            <h2>Accept invitation</h2>
            <p>Create your account details to continue.</p>
          </div>

          <div className="two-col">
            <div>
              <label>First name</label>
              <input value={form.firstName}
                onChange={e=>set("firstName",e.target.value)}/>
            </div>

            <div>
              <label>Last name</label>
              <input value={form.lastName}
                onChange={e=>set("lastName",e.target.value)}/>
            </div>
          </div>

          <label>Password</label>
          <input type="password"
            value={form.password}
            onChange={e=>set("password",e.target.value)}
            placeholder="At least 8 characters"/>

          <label>Confirm password</label>
          <input type="password"
            value={form.confirmPassword}
            onChange={e=>set("confirmPassword",e.target.value)}/>

          {error&&<div className="alert error">{error}</div>}

          <button className="primary-btn wide" disabled={busy||!token}>
            {busy?"Joining workspace...":"Accept invitation"}
          </button>
        </form>
      </section>
    </main>
  );
}