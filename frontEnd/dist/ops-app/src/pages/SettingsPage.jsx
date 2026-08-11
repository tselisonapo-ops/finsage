import {useState} from "react";
import CompanyEmailSettings from "../components/settings/CompanyEmailSettings";
import "./SettingsPage.css";

const sections=[
  {
    group:"Company",
    items:[
      {key:"profile",label:"Company Profile",icon:"🏢"},
      {key:"branding",label:"Branding",icon:"🎨"},
      {key:"email",label:"Email & Communications",icon:"✉️"},
    ],
  },
  {
    group:"Organisation",
    items:[
      {key:"branches",label:"Branches",icon:"📍"},
      {key:"departments",label:"Departments",icon:"🗂️"},
      {key:"positions",label:"Positions",icon:"💼"},
    ],
  },
  {
    group:"Users & Access",
    items:[
      {key:"users",label:"Users",icon:"👥"},
      {key:"roles",label:"Roles & Permissions",icon:"🔐"},
    ],
  },
  {
    group:"Operations",
    items:[
      {key:"operations",label:"General Operations",icon:"⚙️"},
      {key:"workflows",label:"Workflows & Approvals",icon:"🔀"},
      {key:"budget",label:"Budget Controls",icon:"📊"},
      {key:"procurement",label:"Procurement",icon:"🛒"},
    ],
  },
];

const sectionMeta={
  profile:{
    title:"Company Profile",
    description:"Manage the company information used throughout FinSage.",
  },
  branding:{
    title:"Branding",
    description:"Manage logos, colours and company presentation.",
  },
  email:{
    title:"Email & Communications",
    description:"Configure how FinSage sends email on behalf of your company.",
  },
  branches:{
    title:"Branches",
    description:"Manage company branches and operating locations.",
  },
  departments:{
    title:"Departments",
    description:"Manage organisational departments.",
  },
  positions:{
    title:"Positions",
    description:"Manage company positions and reporting structures.",
  },
  users:{
    title:"Users",
    description:"Manage company users and access.",
  },
  roles:{
    title:"Roles & Permissions",
    description:"Manage roles and permission assignments.",
  },
  operations:{
    title:"General Operations",
    description:"Configure company-wide operational behaviour.",
  },
  workflows:{
    title:"Workflows & Approvals",
    description:"Configure approval flows and workflow rules.",
  },
  budget:{
    title:"Budget Controls",
    description:"Configure budget checking and spending controls.",
  },
  procurement:{
    title:"Procurement",
    description:"Configure procurement behaviour and controls.",
  },
};

export default function SettingsPage(){
  const [section,setSection]=useState("email");
  const meta=sectionMeta[section];

  return (
    <div className="settings-page">

      <header className="settings-topbar">
        <div>
          <div className="settings-eyebrow">FINSPHERE NEXUS</div>
          <h1>Settings</h1>
          <p>
            Manage your company, organisation, communications,
            users and operational preferences.
          </p>
        </div>
      </header>

      <div className="settings-shell">

        <aside className="settings-sidebar">
          {sections.map(group=>(
            <div className="settings-nav-group" key={group.group}>

              <div className="settings-nav-title">
                {group.group}
              </div>

              {group.items.map(item=>(
                <button
                  key={item.key}
                  type="button"
                  className={`settings-nav-item ${
                    section===item.key?"active":""
                  }`}
                  onClick={()=>setSection(item.key)}
                >
                  <span className="settings-nav-icon">
                    {item.icon}
                  </span>

                  <span>{item.label}</span>
                </button>
              ))}

            </div>
          ))}
        </aside>


        <main className="settings-content">

          <div className="settings-content-header">
            <div>
              <h2>{meta.title}</h2>
              <p>{meta.description}</p>
            </div>
          </div>

          {section==="email" ? (
            <CompanyEmailSettings/>
          ) : (
            <ComingSoonSection
              title={meta.title}
              description={meta.description}
            />
          )}

        </main>

      </div>
    </div>
  );
}


function ComingSoonSection({title,description}){
  return (
    <div className="settings-placeholder">
      <div className="settings-placeholder-icon">⚙️</div>

      <h3>{title}</h3>

      <p>{description}</p>

      <span>
        This settings section will be connected next.
      </span>
    </div>
  );
}