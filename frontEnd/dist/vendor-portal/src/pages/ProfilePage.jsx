import {useEffect,useState} from "react";
import {
  BadgeCheck,
  Building2,
  FileText,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  UserRound
} from "lucide-react";
import {
  getCompanyId,
  portalApi
} from "../api/api";
import PortalShell from "../components/PortalShell";

export default function ProfilePage(){
  const companyId=getCompanyId();

  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load(){
    const ctx=await portalApi.session(
      companyId
    );

    setSession(ctx);

    setProfile({
      first_name:
        ctx.user?.first_name||"",

      last_name:
        ctx.user?.last_name||"",

      email:
        ctx.user?.email||"",

      vendor_name:
        ctx.vendor?.name||"",

      vendor_email:
        ctx.vendor?.email||"",

      vendor_phone:
        ctx.vendor?.phone||"",

      registration_no:
        ctx.vendor?.registration_no||"",

      tax_number:
        ctx.vendor?.tax_number||"",

      vat_number:
        ctx.vendor?.vat_number||""
    });
  }

  useEffect(()=>{
    load().catch(err=>
      setError(err.message)
    );
  },[]);

  const set=(key,value)=>
    setProfile(x=>({
      ...x,
      [key]:value
    }));

  async function save(){
    setBusy(true);
    setError("");
    setSuccess("");

    try{
      const result=
        await portalApi.updateProfile(
          companyId,
          {
            first_name:
              profile.first_name,

            last_name:
              profile.last_name,

            phone:
              profile.vendor_phone
          }
        );

      setSuccess(
        result.message||
        "Profile updated."
      );

      await load();

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session||!profile)
    return (
      <div className="portal-loading">
        Loading profile…
      </div>
    );

  return (
    <PortalShell
      session={session}
      active="profile"
    >
      <div className="vendor-portal-page-header">
        <div>
          <span className="portal-eyebrow">
            VENDOR PROFILE
          </span>

          <h1>Company profile</h1>

          <p>
            Review the supplier information associated with your account.
          </p>
        </div>

        <button
          type="button"
          className="portal-primary"
          disabled={busy}
          onClick={save}
        >
          <Save size={16}/>

          {busy
            ?"Saving..."
            :"Save profile"}
        </button>
      </div>

      {error&&(
        <div className="portal-alert error">
          {error}
        </div>
      )}

      {success&&(
        <div className="portal-alert success">
          {success}
        </div>
      )}

      <div className="vendor-profile-workspace">
        <main className="vendor-profile-main">
          <section className="vendor-profile-card">
            <div className="vendor-profile-card-heading">
              <UserRound size={18}/>

              <div>
                <strong>
                  Portal contact
                </strong>

                <span>
                  Your personal access details.
                </span>
              </div>
            </div>

            <div className="portal-form-grid">
              <div>
                <label>First name</label>

                <input
                  value={profile.first_name}
                  onChange={e=>
                    set(
                      "first_name",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Last name</label>

                <input
                  value={profile.last_name}
                  onChange={e=>
                    set(
                      "last_name",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Login email</label>

                <input
                  value={profile.email}
                  disabled
                />
              </div>
            </div>
          </section>

          <section className="vendor-profile-card">
            <div className="vendor-profile-card-heading">
              <Building2 size={18}/>

              <div>
                <strong>
                  Supplier organisation
                </strong>

                <span>
                  Information maintained by the customer organisation's vendor master.
                </span>
              </div>
            </div>

            <div className="vendor-profile-company-name">
              <div className="vendor-profile-company-icon">
                {profile.vendor_name?.[0]?.toUpperCase()||"V"}
              </div>

              <div>
                <strong>
                  {profile.vendor_name}
                </strong>

                <span>
                  Supplier account
                </span>
              </div>
            </div>

            <div className="vendor-profile-info-grid">
              <div>
                <Mail size={14}/>

                <span>Email</span>

                <strong>
                  {profile.vendor_email||
                   "Not recorded"}
                </strong>
              </div>

              <div>
                <Phone size={14}/>

                <span>Phone</span>

                <strong>
                  {profile.vendor_phone||
                   "Not recorded"}
                </strong>
              </div>

              <div>
                <FileText size={14}/>

                <span>Registration</span>

                <strong>
                  {profile.registration_no||
                   "Not recorded"}
                </strong>
              </div>

              <div>
                <FileText size={14}/>

                <span>Tax number</span>

                <strong>
                  {profile.tax_number||
                   "Not recorded"}
                </strong>
              </div>

              <div>
                <FileText size={14}/>

                <span>VAT number</span>

                <strong>
                  {profile.vat_number||
                   "Not recorded"}
                </strong>
              </div>
            </div>
          </section>

          <section className="vendor-profile-card">
            <div className="vendor-profile-card-heading">
              <ShieldCheck size={18}/>

              <div>
                <strong>
                  Portal relationship
                </strong>

                <span>
                  Your account exists within this customer's procurement environment.
                </span>
              </div>
            </div>

            <div className="vendor-profile-note">
              <BadgeCheck size={18}/>

              <div>
                <strong>
                  Customer-controlled supplier record
                </strong>

                <p>
                  Registration, tax, banking and compliance information used for procurement and payment remains under the customer organisation's vendor-management controls.
                </p>
              </div>
            </div>
          </section>
        </main>

        <aside className="vendor-profile-customer">
          <span className="portal-eyebrow">
            CUSTOMER
          </span>

          <div className="vendor-profile-customer-brand">
            {session.company?.logo_url?(
              <img
                src={session.company.logo_url}
                alt=""
              />
            ):(
              <div>
                {session.company?.name?.[0]?.toUpperCase()||"C"}
              </div>
            )}

            <strong>
              {session.company?.name}
            </strong>
          </div>

          <div className="vendor-profile-customer-info">
            <div>
              <span>Email</span>

              <strong>
                {session.company?.company_email||
                 "—"}
              </strong>
            </div>

            <div>
              <span>Phone</span>

              <strong>
                {session.company?.company_phone||
                 "—"}
              </strong>
            </div>

            <div>
              <span>Currency</span>

              <strong>
                {session.company?.currency||
                 "—"}
              </strong>
            </div>
          </div>
        </aside>
      </div>
    </PortalShell>
  );
}