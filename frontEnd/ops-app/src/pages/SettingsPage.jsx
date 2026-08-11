import {useEffect,useState} from "react";
import {
  Bell,
  ChevronRight,
  FileText,
  Mail,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

export default function SettingsPage(){
  const companyId=getCompanyId();

  const [session,setSession]=useState(null);
  const [settings,setSettings]=useState(null);
  const [procurement,setProcurement]=useState(null);
  const [activeTab,setActiveTab]=useState("general");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState("");

  async function load(){
    setError("");

    try{
      const [ctx,ops,proc]=await Promise.all([
        opsApi.session(companyId),
        opsApi.getSettings
          ?opsApi.getSettings(companyId)
          :opsApi.settings(companyId),
        opsApi.procurementSettings(companyId)
      ]);

      setSession(ctx);
      setSettings(ops||{});
      setProcurement(proc||{});
    }catch(err){
      setError(err.message||"Could not load settings.");
    }
  }

  useEffect(()=>{load();},[]);

  if(!session||!settings||!procurement){
    return <div className="loading-screen">Loading settings…</div>;
  }

  const settingsJson=settings.settings_json||{};

  const tabs=[
    ["general",SettingsIcon,"General","Core FinSage Nexus preferences"],
    ["workflow",SlidersHorizontal,"Workflow","Default workflow behaviour"],
    ["notifications",Bell,"Notifications","Events and alerts"],
    ["email",Mail,"Email","Sender and SMTP configuration"],
    ["numbering",FileText,"Numbering","Document and transaction references"],
    ["security",ShieldCheck,"Security","Global security controls"],
  ];

  return(
    <Shell session={session} active="settings">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">FINSAGE NEXUS</span>
          <h1>Settings</h1>
          <p>Configure platform-wide defaults, communication and security.</p>
        </div>
      </div>

      {error&&<div className="alert error">{error}</div>}
      {saved&&<div className="alert success">{saved}</div>}

      <div className="settings-layout">
        <aside className="settings-nav">
          {tabs.map(([key,Icon,title,desc])=>(
            <button type="button" key={key} className={`settings-nav-item ${activeTab===key?"active":""}`} onClick={()=>setActiveTab(key)}>
              <Icon size={18}/>
              <span>
                <strong>{title}</strong>
                <small>{desc}</small>
              </span>
              <ChevronRight size={16}/>
            </button>
          ))}
        </aside>

        <section className="settings-content">

          {activeTab==="general"&&(
            <div className="settings-panel">
              <div className="settings-panel-head">
                <div>
                  <h2>General</h2>
                  <p>Default behaviour across FinSage Nexus.</p>
                </div>
              </div>

              {/* General settings here */}
            </div>
          )}

          {activeTab==="workflow"&&(
            <div className="settings-panel">
              <div className="settings-panel-head">
                <div>
                  <h2>Workflow defaults</h2>
                  <p>Defaults used when new operational workflows are created.</p>
                </div>
              </div>

              {/* Workflow defaults here */}
            </div>
          )}

          {activeTab==="notifications"&&(
            <div className="settings-panel">
              <div className="settings-panel-head">
                <div>
                  <h2>Notifications</h2>
                  <p>Choose which operational events generate notifications.</p>
                </div>
              </div>

              {/* Notification switches here */}
            </div>
          )}

          {activeTab==="email"&&(
            <div className="settings-panel">
              <div className="settings-panel-head">
                <div>
                  <h2>Email configuration</h2>
                  <p>Configure the account FinSage Nexus uses to send operational email.</p>
                </div>
              </div>

              {/* Existing procurement SMTP form moves here */}
            </div>
          )}

          {activeTab==="numbering"&&(
            <div className="settings-panel">
              <div className="settings-panel-head">
                <div>
                  <h2>Numbering & references</h2>
                  <p>Control prefixes and numbering conventions.</p>
                </div>
              </div>

              {/* Numbering settings here */}
            </div>
          )}

          {activeTab==="security"&&(
            <div className="settings-panel">
              <div className="settings-panel-head">
                <div>
                  <h2>Security</h2>
                  <p>Global access and audit behaviour.</p>
                </div>
              </div>

              {/* Security settings here */}
            </div>
          )}

        </section>
      </div>
    </Shell>
  );
}