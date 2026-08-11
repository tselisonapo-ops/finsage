import {useEffect,useMemo,useState} from "react";
import {
  ArrowLeft,BadgeCheck,Building2,Check,Mail,
  Phone,Plus,Save,Search,ShieldAlert,Star,
  Store,UserRound,Users
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const emptyContact=()=>({
  name:"",
  job_title:"",
  email:"",
  phone:"",
  contact_type:"procurement",
  is_primary:false
});

const tags=value=>{
  if(Array.isArray(value)) return value;
  if(!value) return [];

  try{
    const parsed=JSON.parse(value);
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
};

export default function ProcurementVendorsPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [rows,setRows]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [detail,setDetail]=useState(null);

  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("");
  const [qualification,setQualification]=useState("");

  const [profile,setProfile]=useState(null);
  const [tagInput,setTagInput]=useState("");
  const [contact,setContact]=useState(emptyContact());

  const [busy,setBusy]=useState(false);
  const [contactBusy,setContactBusy]=useState(false);
  const [error,setError]=useState("");

  async function load(){
    const [ctx,data]=await Promise.all([
      opsApi.session(companyId),
      opsApi.procurementVendors(companyId,{
        search,
        procurement_status:status,
        qualification_status:qualification
      })
    ]);

    setSession(ctx);
    setRows(data.rows||[]);

    if(selectedId){
      const exists=(data.rows||[]).some(
        x=>x.vendor_id===selectedId
      );

      if(!exists){
        setSelectedId(null);
        setDetail(null);
        setProfile(null);
      }
    }
  }

  useEffect(()=>{
    load().catch(err=>setError(err.message));
  },[status,qualification]);

  useEffect(()=>{
    const timer=setTimeout(()=>{
      load().catch(err=>setError(err.message));
    },250);

    return ()=>clearTimeout(timer);
  },[search]);

  async function choose(vendorId){
    setSelectedId(vendorId);
    setBusy(true);
    setError("");

    try{
      const data=await opsApi.procurementVendor(
        companyId,
        vendorId
      );

      setDetail(data);

      const vendor=data.vendor||{};

      setProfile({
        procurement_status:
          vendor.procurement_status||"available",

        qualification_status:
          vendor.qualification_status||"not_reviewed",

        portal_status:
          vendor.portal_status||"not_invited",

        preferred:Boolean(vendor.preferred),
        portal_enabled:
          vendor.portal_enabled!==false,

        category_tags:
          tags(vendor.category_tags),

        risk_rating:
          vendor.risk_rating||"",

        performance_score:
          vendor.performance_score||"",

        default_lead_time_days:
          vendor.default_lead_time_days||"",

        sourcing_notes:
          vendor.sourcing_notes||"",

        compliance_notes:
          vendor.compliance_notes||""
      });

      setContact(emptyContact());

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  const set=(key,value)=>
    setProfile(x=>({...x,[key]:value}));

  function addTag(){
    const value=tagInput.trim();

    if(!value) return;

    setProfile(x=>({
      ...x,
      category_tags:[
        ...new Set([
          ...(x.category_tags||[]),
          value
        ])
      ]
    }));

    setTagInput("");
  }

  function removeTag(value){
    setProfile(x=>({
      ...x,
      category_tags:
        (x.category_tags||[])
          .filter(tag=>tag!==value)
    }));
  }

  async function saveProfile(){
    if(!selectedId||!profile) return;

    setBusy(true);
    setError("");

    try{
      const data=await opsApi.updateProcurementVendor(
        companyId,
        selectedId,
        {
          ...profile,

          performance_score:
            profile.performance_score===""
              ?null
              :Number(profile.performance_score),

          default_lead_time_days:
            profile.default_lead_time_days===""
              ?null
              :Number(profile.default_lead_time_days)
        }
      );

      setDetail(data);

      const vendor=data.vendor||{};

      setProfile(x=>({
        ...x,
        procurement_status:
          vendor.procurement_status||"available",

        qualification_status:
          vendor.qualification_status||"not_reviewed",

        portal_status:
          vendor.portal_status||"not_invited"
      }));

      await load();

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function saveContact(e){
    e.preventDefault();

    if(!selectedId) return;

    if(!contact.name.trim()){
      setError("Contact name is required.");
      return;
    }

    setContactBusy(true);
    setError("");

    try{
      await opsApi.createProcurementVendorContact(
        companyId,
        selectedId,
        contact
      );

      setContact(emptyContact());
      await choose(selectedId);

    }catch(err){
      setError(err.message);
    }finally{
      setContactBusy(false);
    }
  }

  if(!session)
    return <div className="loading-screen">
      Loading vendor directory…
    </div>;

  const vendor=detail?.vendor||null;
  const contacts=detail?.contacts||[];

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
            SOURCING DIRECTORY
          </span>

          <h1>Vendors</h1>

          <p>
            Review supplier readiness, procurement contacts, sourcing categories and portal access.
          </p>
        </div>

        <div className="department-chip">
          {rows.length} vendors
        </div>
      </div>

      {error&&
        <div className="alert error">{error}</div>}

      <div className="vendor-directory-workspace">
        <aside className="vendor-directory-list">
          <div className="vendor-directory-filters">
            <div className="search-box">
              <Search size={15}/>

              <input
                value={search}
                onChange={e=>setSearch(e.target.value)}
                placeholder="Search vendors"
              />
            </div>

            <div className="vendor-filter-row">
              <select
                value={status}
                onChange={e=>setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="available">Available</option>
                <option value="preferred">Preferred</option>
                <option value="restricted">Restricted</option>
                <option value="blocked">Blocked</option>
              </select>

              <select
                value={qualification}
                onChange={e=>setQualification(e.target.value)}
              >
                <option value="">All qualifications</option>
                <option value="not_reviewed">Not reviewed</option>
                <option value="qualified">Qualified</option>
                <option value="conditional">Conditional</option>
                <option value="disqualified">Disqualified</option>
              </select>
            </div>
          </div>

          <div className="vendor-directory-scroll">
            {!rows.length?(
              <div className="beautiful-empty compact">
                <Store/>
                <h3>No vendors found</h3>
                <p>
                  Vendors from FinSage will appear here.
                </p>
              </div>
            ):(
              rows.map(row=>(
                <button
                  type="button"
                  key={row.vendor_id}
                  className={`vendor-directory-item ${
                    selectedId===row.vendor_id
                      ?"selected"
                      :""
                  }`}
                  onClick={()=>
                    choose(row.vendor_id)
                  }
                >
                  <div className="vendor-directory-avatar">
                    {row.name?.[0]?.toUpperCase()||"V"}
                  </div>

                  <div className="vendor-directory-copy">
                    <div>
                      <strong>{row.name}</strong>

                      {row.preferred&&
                        <Star
                          size={13}
                          className="vendor-preferred-star"
                        />}
                    </div>

                    <small>
                      {row.external_code||
                       row.primary_contact_email||
                       "Vendor"}
                    </small>

                    <div className="vendor-directory-tags">
                      <span className={`vendor-mini-status ${row.procurement_status}`}>
                        {row.procurement_status}
                      </span>

                      <span className={`vendor-mini-status ${row.qualification_status}`}>
                        {row.qualification_status.replaceAll("_"," ")}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="vendor-directory-main">
          {!vendor||!profile?(
            <div className="beautiful-empty vendor-main-empty">
              <Users/>
              <h3>Select a vendor</h3>
              <p>
                Review sourcing readiness and procurement information.
              </p>
            </div>
          ):(
            <>
              <header className="vendor-profile-header">
                <div className="vendor-profile-identity">
                  <div className="vendor-profile-logo">
                    {vendor.name?.[0]?.toUpperCase()||"V"}
                  </div>

                  <div>
                    <div className="vendor-profile-name">
                      <h2>{vendor.name}</h2>

                      {profile.preferred&&(
                        <span className="vendor-preferred-badge">
                          <Star size={12}/>
                          Preferred
                        </span>
                      )}
                    </div>

                    <p>
                      {[
                        vendor.external_code,
                        vendor.country,
                        vendor.payment_terms
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="primary-btn"
                  disabled={busy}
                  onClick={saveProfile}
                >
                  <Save size={16}/>
                  {busy?"Saving...":"Save procurement profile"}
                </button>
              </header>

              <div className="vendor-profile-layout">
                <section className="vendor-profile-content">
                  <div className="vendor-profile-section">
                    <div className="vendor-section-heading">
                      <div>
                        <span className="eyebrow dark">
                          PROCUREMENT
                        </span>
                        <h3>Sourcing profile</h3>
                      </div>

                      <Store size={19}/>
                    </div>

                    <div className="vendor-form-grid">
                      <div>
                        <label>Procurement status</label>
                        <select
                          value={profile.procurement_status}
                          onChange={e=>
                            set(
                              "procurement_status",
                              e.target.value
                            )
                          }
                        >
                          <option value="available">Available</option>
                          <option value="preferred">Preferred</option>
                          <option value="restricted">Restricted</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      </div>

                      <div>
                        <label>Qualification</label>
                        <select
                          value={profile.qualification_status}
                          onChange={e=>
                            set(
                              "qualification_status",
                              e.target.value
                            )
                          }
                        >
                          <option value="not_reviewed">Not reviewed</option>
                          <option value="qualified">Qualified</option>
                          <option value="conditional">Conditional</option>
                          <option value="disqualified">Disqualified</option>
                        </select>
                      </div>

                      <div>
                        <label>Risk rating</label>
                        <select
                          value={profile.risk_rating}
                          onChange={e=>
                            set(
                              "risk_rating",
                              e.target.value
                            )
                          }
                        >
                          <option value="">Not rated</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>

                      <div>
                        <label>Lead time</label>
                        <div className="input-suffix">
                          <input
                            type="number"
                            min="0"
                            value={profile.default_lead_time_days}
                            onChange={e=>
                              set(
                                "default_lead_time_days",
                                e.target.value
                              )
                            }
                          />
                          <span>days</span>
                        </div>
                      </div>

                      <div>
                        <label>Performance score</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={profile.performance_score}
                          onChange={e=>
                            set(
                              "performance_score",
                              e.target.value
                            )
                          }
                          placeholder="0 – 100"
                        />
                      </div>

                      <div>
                        <label>Portal status</label>
                        <select
                          value={profile.portal_status}
                          onChange={e=>
                            set(
                              "portal_status",
                              e.target.value
                            )
                          }
                        >
                          <option value="not_invited">Not invited</option>
                          <option value="invited">Invited</option>
                          <option value="active">Active</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </div>
                    </div>

                    <div className="vendor-switch-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={profile.preferred}
                          onChange={e=>
                            set(
                              "preferred",
                              e.target.checked
                            )
                          }
                        />

                        <div>
                          <strong>Preferred vendor</strong>
                          <span>
                            Prioritise this vendor during sourcing.
                          </span>
                        </div>
                      </label>

                      <label>
                        <input
                          type="checkbox"
                          checked={profile.portal_enabled}
                          onChange={e=>
                            set(
                              "portal_enabled",
                              e.target.checked
                            )
                          }
                        />

                        <div>
                          <strong>Vendor portal</strong>
                          <span>
                            Vendor may participate through the external portal.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="vendor-profile-section">
                    <div className="vendor-section-heading">
                      <div>
                        <span className="eyebrow dark">
                          SOURCING
                        </span>
                        <h3>Categories</h3>
                      </div>

                      <Building2 size={19}/>
                    </div>

                    <div className="vendor-tag-editor">
                      <div className="vendor-tag-input">
                        <input
                          value={tagInput}
                          onChange={e=>
                            setTagInput(e.target.value)
                          }
                          onKeyDown={e=>{
                            if(e.key==="Enter"){
                              e.preventDefault();
                              addTag();
                            }
                          }}
                          placeholder="IT equipment, stationery, audit services..."
                        />

                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={addTag}
                        >
                          <Plus size={15}/>
                          Add
                        </button>
                      </div>

                      <div className="vendor-tag-list">
                        {!profile.category_tags.length&&(
                          <span className="vendor-no-tags">
                            No sourcing categories assigned.
                          </span>
                        )}

                        {profile.category_tags.map(tag=>(
                          <button
                            type="button"
                            className="vendor-category-tag"
                            key={tag}
                            onClick={()=>removeTag(tag)}
                          >
                            {tag}
                            <span>×</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="vendor-profile-section">
                    <div className="vendor-section-heading">
                      <div>
                        <span className="eyebrow dark">
                          CONTACTS
                        </span>
                        <h3>Procurement contacts</h3>
                      </div>

                      <UserRound size={19}/>
                    </div>

                    <div className="vendor-contact-list">
                      {!contacts.length&&(
                        <div className="vendor-contact-empty">
                          No procurement contacts configured.
                        </div>
                      )}

                      {contacts.map(item=>(
                        <article
                          className="vendor-contact-card"
                          key={item.id}
                        >
                          <div className="vendor-contact-avatar">
                            {item.name?.[0]?.toUpperCase()||"C"}
                          </div>

                          <div>
                            <div className="vendor-contact-name">
                              <strong>{item.name}</strong>

                              {item.is_primary&&(
                                <span>Primary</span>
                              )}
                            </div>

                            <small>
                              {[
                                item.job_title,
                                item.contact_type
                              ].filter(Boolean).join(" · ")}
                            </small>

                            <div className="vendor-contact-meta">
                              {item.email&&(
                                <span>
                                  <Mail size={12}/>
                                  {item.email}
                                </span>
                              )}

                              {item.phone&&(
                                <span>
                                  <Phone size={12}/>
                                  {item.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>

                    <form
                      className="vendor-contact-form"
                      onSubmit={saveContact}
                    >
                      <div className="vendor-contact-form-head">
                        <Plus size={16}/>
                        <strong>Add procurement contact</strong>
                      </div>

                      <div className="vendor-form-grid">
                        <div>
                          <label>Name</label>
                          <input
                            value={contact.name}
                            onChange={e=>
                              setContact(x=>({
                                ...x,
                                name:e.target.value
                              }))
                            }
                            placeholder="Contact name"
                          />
                        </div>

                        <div>
                          <label>Job title</label>
                          <input
                            value={contact.job_title}
                            onChange={e=>
                              setContact(x=>({
                                ...x,
                                job_title:e.target.value
                              }))
                            }
                            placeholder="Sales Manager"
                          />
                        </div>

                        <div>
                          <label>Email</label>
                          <input
                            type="email"
                            value={contact.email}
                            onChange={e=>
                              setContact(x=>({
                                ...x,
                                email:e.target.value
                              }))
                            }
                            placeholder="sales@vendor.com"
                          />
                        </div>

                        <div>
                          <label>Phone</label>
                          <input
                            value={contact.phone}
                            onChange={e=>
                              setContact(x=>({
                                ...x,
                                phone:e.target.value
                              }))
                            }
                            placeholder="+266..."
                          />
                        </div>

                        <div>
                          <label>Contact type</label>
                          <select
                            value={contact.contact_type}
                            onChange={e=>
                              setContact(x=>({
                                ...x,
                                contact_type:e.target.value
                              }))
                            }
                          >
                            <option value="procurement">Procurement</option>
                            <option value="sales">Sales</option>
                            <option value="accounts">Accounts</option>
                            <option value="delivery">Delivery</option>
                            <option value="general">General</option>
                          </select>
                        </div>

                        <label className="vendor-primary-contact">
                          <input
                            type="checkbox"
                            checked={contact.is_primary}
                            onChange={e=>
                              setContact(x=>({
                                ...x,
                                is_primary:e.target.checked
                              }))
                            }
                          />

                          Primary contact
                        </label>
                      </div>

                      <div className="vendor-contact-actions">
                        <button
                          type="submit"
                          className="primary-btn"
                          disabled={contactBusy}
                        >
                          <Plus size={15}/>
                          {contactBusy
                            ?"Adding..."
                            :"Add contact"}
                        </button>
                      </div>
                    </form>
                  </div>
                </section>

                <aside className="vendor-profile-side">
                  <section className="vendor-side-card">
                    <div className="vendor-side-heading">
                      <BadgeCheck size={18}/>
                      <div>
                        <strong>Vendor master</strong>
                        <span>FinSage accounting record</span>
                      </div>
                    </div>

                    <div className="vendor-info-list">
                      <div>
                        <span>Registration</span>
                        <strong>
                          {vendor.registration_no||"—"}
                        </strong>
                      </div>

                      <div>
                        <span>Tax number</span>
                        <strong>
                          {vendor.tax_number||"—"}
                        </strong>
                      </div>

                      <div>
                        <span>VAT number</span>
                        <strong>
                          {vendor.vat_number||"—"}
                        </strong>
                      </div>

                      <div>
                        <span>Payment terms</span>
                        <strong>
                          {vendor.payment_terms||"—"}
                        </strong>
                      </div>

                      <div>
                        <span>Email</span>
                        <strong>
                          {vendor.email||"—"}
                        </strong>
                      </div>

                      <div>
                        <span>Phone</span>
                        <strong>
                          {vendor.phone||"—"}
                        </strong>
                      </div>
                    </div>
                  </section>

                  <section className="vendor-side-card">
                    <div className="vendor-side-heading">
                      {vendor.on_hold||
                       profile.procurement_status==="blocked"
                        ?<ShieldAlert size={18}/>
                        :<Check size={18}/>}

                      <div>
                        <strong>Compliance</strong>
                        <span>
                          Sourcing eligibility
                        </span>
                      </div>
                    </div>

                    <div className="vendor-compliance-state">
                      <div>
                        <span>Vendor status</span>
                        <strong>
                          {vendor.vendor_status||"—"}
                        </strong>
                      </div>

                      <div>
                        <span>Compliance</span>
                        <strong>
                          {vendor.compliance_status||"Not reviewed"}
                        </strong>
                      </div>

                      <div>
                        <span>On hold</span>
                        <strong>
                          {vendor.on_hold?"Yes":"No"}
                        </strong>
                      </div>
                    </div>

                    <label>Procurement compliance notes</label>

                    <textarea
                      rows="5"
                      value={profile.compliance_notes}
                      onChange={e=>
                        set(
                          "compliance_notes",
                          e.target.value
                        )
                      }
                      placeholder="Document expiry, qualification conditions, sourcing restrictions..."
                    />
                  </section>

                  <section className="vendor-side-card">
                    <div className="vendor-side-heading">
                      <Store size={18}/>
                      <div>
                        <strong>Sourcing notes</strong>
                        <span>
                          Internal procurement notes
                        </span>
                      </div>
                    </div>

                    <textarea
                      rows="6"
                      value={profile.sourcing_notes}
                      onChange={e=>
                        set(
                          "sourcing_notes",
                          e.target.value
                        )
                      }
                      placeholder="Preferred product lines, delivery history, negotiation notes..."
                    />
                  </section>
                </aside>
              </div>
            </>
          )}
        </main>
      </div>
    </Shell>
  );
}
