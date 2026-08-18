import {useEffect,useState} from "react";
import {getCompanyId,getToken} from "../../api/api";

const emptyForm={
  name:"",
  registration_number:"",
  tax_number:"",
  company_email:"",
  phone:"",
  website:"",
  address_line1:"",
  address_line2:"",
  city:"",
  province:"",
  postal_code:"",
  country:"",
  currency:"",
  financial_year_end_month:"",
  financial_year_end_day:"",
};

export default function CompanyProfileSettings(){
  const companyId=getCompanyId();
  const token=getToken();

  const [form,setForm]=useState(emptyForm);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  const apiBase=import.meta.env.VITE_API_BASE_URL || "";

  function headers(){
    return {
      "Content-Type":"application/json",
      Authorization:`Bearer ${token}`,
    };
  }

  useEffect(()=>{
    loadProfile();
  },[]);

  async function loadProfile(){
    setLoading(true);
    setError("");

    try{
      const res=await fetch(
        `${apiBase}/api/companies/${companyId}/profile`,
        {
          headers:headers(),
        }
      );

      const data=await res.json();

      if(!res.ok){
        throw new Error(
          data.error || "Unable to load company profile."
        );
      }

      const row=data.company || data.profile || data || {};

      setForm({
        name:row.name || "",
        registration_number:row.registration_number || "",
        tax_number:row.tax_number || row.tax_id || "",
        company_email:row.company_email || row.email || "",
        phone:row.phone || "",
        website:row.website || "",
        address_line1:row.address_line1 || "",
        address_line2:row.address_line2 || "",
        city:row.city || "",
        province:row.province || row.state || "",
        postal_code:row.postal_code || "",
        country:row.country || "",
        currency:row.currency || "",
        financial_year_end_month:
          row.financial_year_end_month || "",
        financial_year_end_day:
          row.financial_year_end_day || "",
      });

    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
    }
  }

  function change(e){
    const {name,value}=e.target;

    setForm(prev=>({
      ...prev,
      [name]:value,
    }));
  }

  async function save(){
    setSaving(true);
    setMessage("");
    setError("");

    try{
      const payload={
        ...form,
        financial_year_end_month:
          form.financial_year_end_month
            ?Number(form.financial_year_end_month)
            :null,
        financial_year_end_day:
          form.financial_year_end_day
            ?Number(form.financial_year_end_day)
            :null,
      };

      const res=await fetch(
        `${apiBase}/api/companies/${companyId}/profile`,
        {
          method:"PATCH",
          headers:headers(),
          body:JSON.stringify(payload),
        }
      );

      const data=await res.json();

      if(!res.ok){
        throw new Error(
          data.error || "Unable to update company profile."
        );
      }

      setMessage("Company profile updated successfully.");

      if(data.company || data.profile){
        const row=data.company || data.profile;

        setForm(prev=>({
          ...prev,
          ...row,
        }));
      }

    }catch(e){
      setError(e.message);
    }finally{
      setSaving(false);
    }
  }

  if(loading){
    return (
      <div className="settings-card settings-loading">
        Loading company profile…
      </div>
    );
  }

  return (
    <div className="company-profile-settings">

      {error&&(
        <div className="settings-alert settings-alert-error">
          <strong>Company profile error</strong>
          <span>{error}</span>
        </div>
      )}

      {message&&(
        <div className="settings-alert settings-alert-success">
          <strong>Success</strong>
          <span>{message}</span>
        </div>
      )}


      <section className="settings-card">

        <div className="settings-card-header">
          <div>
            <h3>Company information</h3>

            <p>
              Core legal and contact information used
              throughout FinSage.
            </p>
          </div>
        </div>

        <div className="settings-form-grid">

          <label className="settings-field settings-field-full">
            <span>Company name</span>

            <input
              name="name"
              value={form.name}
              onChange={change}
              placeholder="ABC Consulting (Pty) Ltd"
            />
          </label>

          <label className="settings-field">
            <span>Registration number</span>

            <input
              name="registration_number"
              value={form.registration_number}
              onChange={change}
              placeholder="Company registration number"
            />
          </label>

          <label className="settings-field">
            <span>Tax number</span>

            <input
              name="tax_number"
              value={form.tax_number}
              onChange={change}
              placeholder="Tax / VAT registration number"
            />
          </label>

          <label className="settings-field">
            <span>Company email</span>

            <input
              type="email"
              name="company_email"
              value={form.company_email}
              onChange={change}
              placeholder="info@company.com"
            />
          </label>

          <label className="settings-field">
            <span>Telephone</span>

            <input
              name="phone"
              value={form.phone}
              onChange={change}
              placeholder="+266 ..."
            />
          </label>

          <label className="settings-field settings-field-full">
            <span>Website</span>

            <input
              name="website"
              value={form.website}
              onChange={change}
              placeholder="https://www.company.com"
            />
          </label>

        </div>
      </section>


      <section className="settings-card">

        <div className="settings-card-header">
          <div>
            <h3>Registered address</h3>

            <p>
              Company address used on documents and
              company communications.
            </p>
          </div>
        </div>

        <div className="settings-form-grid">

          <label className="settings-field settings-field-full">
            <span>Address line 1</span>

            <input
              name="address_line1"
              value={form.address_line1}
              onChange={change}
              placeholder="Street / building"
            />
          </label>

          <label className="settings-field settings-field-full">
            <span>Address line 2</span>

            <input
              name="address_line2"
              value={form.address_line2}
              onChange={change}
              placeholder="Area / suburb"
            />
          </label>

          <label className="settings-field">
            <span>City / Town</span>

            <input
              name="city"
              value={form.city}
              onChange={change}
            />
          </label>

          <label className="settings-field">
            <span>Province / District</span>

            <input
              name="province"
              value={form.province}
              onChange={change}
            />
          </label>

          <label className="settings-field">
            <span>Postal code</span>

            <input
              name="postal_code"
              value={form.postal_code}
              onChange={change}
            />
          </label>

          <label className="settings-field">
            <span>Country</span>

            <input
              name="country"
              value={form.country}
              onChange={change}
              placeholder="Lesotho"
            />
          </label>

        </div>
      </section>


      <section className="settings-card">

        <div className="settings-card-header">
          <div>
            <h3>Financial defaults</h3>

            <p>
              Core company defaults used by accounting
              and reporting modules.
            </p>
          </div>
        </div>

        <div className="settings-form-grid">

          <label className="settings-field">
            <span>Reporting currency</span>

            <input
              name="currency"
              value={form.currency}
              onChange={change}
              placeholder="LSL"
              maxLength={3}
            />
          </label>

          <div/>

          <label className="settings-field">
            <span>Financial year-end month</span>

            <select
              name="financial_year_end_month"
              value={form.financial_year_end_month}
              onChange={change}
            >
              <option value="">Select month</option>
              <option value="1">January</option>
              <option value="2">February</option>
              <option value="3">March</option>
              <option value="4">April</option>
              <option value="5">May</option>
              <option value="6">June</option>
              <option value="7">July</option>
              <option value="8">August</option>
              <option value="9">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
          </label>

          <label className="settings-field">
            <span>Financial year-end day</span>

            <input
              type="number"
              name="financial_year_end_day"
              min="1"
              max="31"
              value={form.financial_year_end_day}
              onChange={change}
              placeholder="31"
            />
          </label>

        </div>
      </section>


      <div className="settings-actions">

        <button
          type="button"
          className="settings-btn settings-btn-secondary"
          onClick={loadProfile}
          disabled={saving}
        >
          Reset changes
        </button>

        <button
          type="button"
          className="settings-btn settings-btn-primary"
          onClick={save}
          disabled={saving}
        >
          {saving?"Saving…":"Save company profile"}
        </button>

      </div>

    </div>
  );
}