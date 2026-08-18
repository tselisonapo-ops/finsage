import {useEffect,useState} from "react";
import {
  ArrowRight,Building2,CheckCircle2,
  FileText,ShieldCheck
} from "lucide-react";
import {useNavigate,useSearchParams} from "react-router-dom";
import {
  portalApi,
  savePortalSession
} from "../api/api";

export default function InvitePage(){
  const [params]=useSearchParams();
  const nav=useNavigate();

  const companyId=params.get("company");
  const token=params.get("token");

  const [invite,setInvite]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const [form,setForm]=useState({
    first_name:"",
    last_name:"",
    phone:"",
    password:"",
    confirm_password:""
  });

  const set=(key,value)=>
    setForm(x=>({...x,[key]:value}));

  useEffect(()=>{
    if(!companyId||!token){
      setError(
        "This vendor invitation link is incomplete."
      );
      return;
    }

    portalApi.invite(
      companyId,
      token
    )
      .then(setInvite)
      .catch(err=>setError(err.message));
  },[companyId,token]);

  async function accept(e){
    e.preventDefault();

    if(form.password!==form.confirm_password){
      setError(
        "Passwords do not match."
      );
      return;
    }

    setBusy(true);
    setError("");

    try{
      const result=
        await portalApi.acceptInvite(
          companyId,
          token,
          {
            first_name:form.first_name,
            last_name:form.last_name,
            phone:form.phone,
            password:form.password
          }
        );

      savePortalSession(
        companyId,
        result.token
      );

      nav("/",{replace:true});

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!invite&&!error)
    return (
      <div className="portal-loading">
        Loading invitation…
      </div>
    );

  return (
    <div className="vendor-invite-page">
      <section className="vendor-invite-brand">
        {invite?.logo_url?(
          <img
            src={invite.logo_url}
            alt=""
          />
        ):(
          <div className="vendor-invite-logo">
            {invite?.company_name?.[0]?.toUpperCase()||"F"}
          </div>
        )}

        <span className="portal-eyebrow">
          VENDOR PORTAL
        </span>

        <h1>
          {invite?.company_name||
           "FinFlow Procurement"}
        </h1>

        <p>
          You have been invited to participate in a procurement opportunity.
        </p>

        {invite&&(
          <div className="vendor-invite-rfq">
            <FileText size={20}/>

            <div>
              <span>
                {invite.rfq_no||
                 invite.sourcing_no}
              </span>

              <strong>
                {invite.rfq_title}
              </strong>

              <small>
                Closing {invite.closing_date||"—"}
              </small>
            </div>
          </div>
        )}

        <div className="vendor-invite-security">
          <ShieldCheck size={16}/>
          Secure invitation issued directly by the customer organisation.
        </div>
      </section>

      <section className="vendor-invite-form-wrap">
        <form
          className="vendor-invite-form"
          onSubmit={accept}
        >
          <span className="portal-eyebrow">
            GET STARTED
          </span>

          <h2>Create your vendor portal profile</h2>

          <p>
            This account will let you submit quotations and later manage purchase orders, invoices and payments.
          </p>

          {error&&(
            <div className="portal-alert error">
              {error}
            </div>
          )}

          <div className="portal-two-col">
            <div>
              <label>First name</label>
              <input
                value={form.first_name}
                onChange={e=>
                  set(
                    "first_name",
                    e.target.value
                  )
                }
                required
              />
            </div>

            <div>
              <label>Last name</label>
              <input
                value={form.last_name}
                onChange={e=>
                  set(
                    "last_name",
                    e.target.value
                  )
                }
              />
            </div>
          </div>

          <label>Email</label>
          <input
            value={invite?.email||""}
            disabled
          />

          <label>Phone</label>
          <input
            value={form.phone}
            onChange={e=>
              set(
                "phone",
                e.target.value
              )
            }
          />

          <div className="portal-two-col">
            <div>
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e=>
                  set(
                    "password",
                    e.target.value
                  )
                }
                required
              />
            </div>

            <div>
              <label>Confirm password</label>
              <input
                type="password"
                value={form.confirm_password}
                onChange={e=>
                  set(
                    "confirm_password",
                    e.target.value
                  )
                }
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="portal-primary"
            disabled={busy}
          >
            {busy
              ?"Creating account..."
              :"Continue to RFQ"}

            {!busy&&
              <ArrowRight size={17}/>}
          </button>
        </form>
      </section>
    </div>
  );
}