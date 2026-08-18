import {useState} from "react";
import "../styles.css";
import {
  ArrowRight,
  Building2,
  LockKeyhole,
  Mail,
  ShieldCheck
} from "lucide-react";
import {useNavigate,useSearchParams} from "react-router-dom";
import {
  portalApi,
  savePortalSession
} from "../api/api";

export default function SignInPage(){
  const nav=useNavigate();
  const [params]=useSearchParams();

  const initialCompanyId=
    params.get("company")||"";

  const [companyId,setCompanyId]=useState(
    initialCompanyId
  );

  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function submit(e){
    e.preventDefault();

    if(!companyId){
      setError(
        "Company reference is required."
      );
      return;
    }

    if(!email.trim()){
      setError(
        "Email address is required."
      );
      return;
    }

    if(!password){
      setError(
        "Password is required."
      );
      return;
    }

    setBusy(true);
    setError("");

    try{
      const result=await portalApi.signin(
        companyId,
        {
          email:email.trim(),
          password
        }
      );

      savePortalSession(
        companyId,
        result.token
      );

      nav("/",{
        replace:true
      });

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  return (
    <div className="vendor-signin-page">
      <section className="vendor-signin-brand">
        <div className="vendor-signin-brand-mark">
          F
        </div>

        <span className="portal-eyebrow light">
          FINFLOW VENDOR PORTAL
        </span>

        <h1>
          Procurement without the email chaos.
        </h1>

        <p>
          Review RFQs, submit quotations and manage your relationship with customer organisations through one secure workspace.
        </p>

        <div className="vendor-signin-feature">
          <ShieldCheck size={18}/>

          <div>
            <strong>
              Secure supplier access
            </strong>

            <span>
              You only see procurement records shared with your vendor account.
            </span>
          </div>
        </div>

        <div className="vendor-signin-feature">
          <Building2 size={18}/>

          <div>
            <strong>
              One customer at a time
            </strong>

            <span>
              Your account remains isolated to the organisation that invited you.
            </span>
          </div>
        </div>
      </section>

      <section className="vendor-signin-form-wrap">
        <form
          className="vendor-signin-form"
          onSubmit={submit}
        >
          <span className="portal-eyebrow">
            WELCOME BACK
          </span>

          <h2>Sign in to Vendor Portal</h2>

          <p>
            Use the company reference from your invitation together with your vendor portal credentials.
          </p>

          {error&&(
            <div className="portal-alert error">
              {error}
            </div>
          )}

          <label>
            Customer company reference
          </label>

          <div className="portal-input-icon">
            <Building2 size={16}/>

            <input
              value={companyId}
              onChange={e=>
                setCompanyId(
                  e.target.value.replace(
                    /\D/g,
                    ""
                  )
                )
              }
              placeholder="Company ID"
              inputMode="numeric"
              required
            />
          </div>

          <label>Email address</label>

          <div className="portal-input-icon">
            <Mail size={16}/>

            <input
              type="email"
              value={email}
              onChange={e=>
                setEmail(e.target.value)
              }
              placeholder="you@vendor.com"
              autoComplete="email"
              required
            />
          </div>

          <label>Password</label>

          <div className="portal-input-icon">
            <LockKeyhole size={16}/>

            <input
              type="password"
              value={password}
              onChange={e=>
                setPassword(
                  e.target.value
                )
              }
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="portal-primary vendor-signin-submit"
            disabled={busy}
          >
            {busy
              ?"Signing in..."
              :"Sign in"}

            {!busy&&
              <ArrowRight size={17}/>}
          </button>

          <div className="vendor-signin-help">
            <span>
              First time here?
            </span>

            <strong>
              Open the invitation link sent by your customer.
            </strong>
          </div>
        </form>
      </section>
    </div>
  );
}