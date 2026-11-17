import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2, AlertCircle, FileText, Upload, Download,
  Send, Loader2, Clock, MessageSquare,
} from "lucide-react";

// ─── API helpers (no JWT, token-gated) ─────────────────────────
const BASE = import.meta.env.PROD ? "" : "";

function apiBase(companyId) {
  return `/api/companies/${companyId}/ops`;
}

async function portalRequest(url, options = {}) {
  const { method = "GET", token, body, formData } = options;
  const headers = {};
  if (token) headers["X-Inquiry-Token"] = token;

  let reqBody;
  if (formData) {
    reqBody = formData;
  } else if (body) {
    headers["Content-Type"] = "application/json";
    reqBody = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: reqBody });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`);
  return json;
}

// ─── Status config ──────────────────────────────────────────────
const STATUS_META = {
  sent:            { label: "Inquiry Sent",     color: "#3b82f6", step: 1 },
  responded:       { label: "Response Received",color: "#8b5cf6", step: 2 },
  quote_requested: { label: "Quote Requested",  color: "#f59e0b", step: 3 },
  quote_submitted: { label: "Quote Submitted",  color: "#06b6d4", step: 4 },
  accepted:        { label: "Accepted",         color: "#10b981", step: 5 },
  rejected:        { label: "Rejected",         color: "#ef4444", step: 5 },
  closed:          { label: "Closed",           color: "#6b7280", step: 5 },
};

const STEPS = [
  { step: 1, label: "View Inquiry" },
  { step: 2, label: "Respond" },
  { step: 3, label: "Quote Requested" },
  { step: 4, label: "Submit Quote" },
  { step: 5, label: "Done" },
];

// ─── Components ─────────────────────────────────────────────────
function ProgressBar({ currentStep }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:28 }}>
      {STEPS.map((s, i) => {
        const done = s.step < currentStep;
        const active = s.step === currentStep;
        return (
          <div key={s.step} style={{ display:"flex", alignItems:"center", flex:1 }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{
                width:28, height:28, borderRadius:"50%",
                background: done ? "#10b981" : active ? "#4f46e5" : "#e5e7eb",
                color: done||active ? "#fff" : "#9ca3af",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12, fontWeight:700, flexShrink:0,
              }}>
                {done ? "✓" : s.step}
              </div>
              <span style={{ fontSize:11, color: active?"#4f46e5":done?"#10b981":"#9ca3af", fontWeight:active?700:400, whiteSpace:"nowrap" }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length-1 && (
              <div style={{ flex:1, height:2, background: done?"#10b981":"#e5e7eb", margin:"0 4px", marginBottom:18 }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InfoBlock({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:12, color:"#6b7280", fontWeight:600, marginBottom:3, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</div>
      <div style={{ fontSize:14, color:"#111827", lineHeight:1.5 }}>{value}</div>
    </div>
  );
}

// ─── Step 1: View & Respond ──────────────────────────────────────
function StepRespond({ inquiry, companyId, token, onDone }) {
  const [form, setForm] = useState({
    response_text: "",
    response_lead_time: "",
    response_availability: "",
    responded_by_name: "",
    responded_by_email: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.response_text) { setError("Please provide your response."); return; }
    setLoading(true); setError("");
    try {
      await portalRequest(
        `${apiBase(companyId)}/portal/inquiries/${token}/respond`,
        { method: "POST", token, body: form }
      );
      onDone();
    } catch(err) {
      setError(err.message || "Failed to submit response");
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ background:"#f9fafb", borderRadius:10, padding:16, marginBottom:4 }}>
        <InfoBlock label="Inquiry Title" value={inquiry.title}/>
        <InfoBlock label="Description" value={inquiry.description}/>
        {inquiry.scope_of_work && <InfoBlock label="Scope of Work" value={inquiry.scope_of_work}/>}
        <InfoBlock label="Issued" value={inquiry.created_at ? new Date(inquiry.created_at).toLocaleDateString() : null}/>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <label style={lbl}>
        Your Response *
        <textarea
          value={form.response_text}
          onChange={e => set("response_text", e.target.value)}
          style={{ ...inp, height:100, resize:"vertical" }}
          placeholder="Describe your capability, interest, and anything relevant to this inquiry…"
          required
        />
      </label>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <label style={lbl}>
          Estimated Lead Time
          <input value={form.response_lead_time} onChange={e=>set("response_lead_time",e.target.value)} style={inp} placeholder="e.g. 2 weeks"/>
        </label>
        <label style={lbl}>
          Availability
          <input value={form.response_availability} onChange={e=>set("response_availability",e.target.value)} style={inp} placeholder="e.g. Available from January 2027"/>
        </label>
        <label style={lbl}>
          Your Name
          <input value={form.responded_by_name} onChange={e=>set("responded_by_name",e.target.value)} style={inp} placeholder="Full name"/>
        </label>
        <label style={lbl}>
          Your Email
          <input type="email" value={form.responded_by_email} onChange={e=>set("responded_by_email",e.target.value)} style={inp} placeholder="you@company.com"/>
        </label>
      </div>

      <button type="submit" disabled={loading} style={{ ...btnPrimary, alignSelf:"flex-end", marginTop:4 }}>
        {loading ? <><Loader2 size={15} style={{animation:"spin 1s linear infinite"}}/> Submitting…</> : <><Send size={15}/> Submit Response</>}
      </button>
    </form>
  );
}

// ─── Step 2: Quote Requested (counterparty sees request) ────────
function StepQuoteRequested({ inquiry, companyId, token, onDone }) {
  const [tab, setTab] = useState("template"); // "template" | "upload"
  const [lines, setLines] = useState(
    (inquiry.quote_template_items || []).map(l => ({ ...l, unit_price: "", notes: "" }))
  );
  const [quoteRef, setQuoteRef] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [currency, setCurrency] = useState("ZAR");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalAmount = lines.reduce((sum, l) => sum + (Number(l.qty||0) * Number(l.unit_price||0)), 0);

  async function submitTemplate(e) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const details = { lines };
      await portalRequest(
        `${apiBase(companyId)}/portal/inquiries/${token}/submit-quote`,
        { method:"POST", token, body:{
          quote_reference: quoteRef,
          quote_amount: totalAmount,
          quote_currency: currency,
          quote_valid_until: validUntil,
          quote_payment_terms: paymentTerms,
          quote_delivery_terms: deliveryTerms,
          quote_details: details,
        }}
      );
      onDone();
    } catch(err) { setError(err.message||"Failed"); }
    finally { setLoading(false); }
  }

  async function submitUpload(e) {
    e.preventDefault();
    if (!file) { setError("Please select a file."); return; }
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("quote_reference", quoteRef);
      await portalRequest(
        `${apiBase(companyId)}/portal/inquiries/${token}/upload`,
        { method:"POST", token, formData: fd }
      );
      onDone();
    } catch(err) { setError(err.message||"Failed"); }
    finally { setLoading(false); }
  }

  return (
    <div>
      {/* Quote request details from Company A */}
      <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:16, marginBottom:20 }}>
        <div style={{ fontWeight:700, color:"#92400e", marginBottom:8, fontSize:14 }}>📋 Quote Request Details</div>
        {inquiry.quote_request_notes && <InfoBlock label="Notes / Instructions" value={inquiry.quote_request_notes}/>}
        {inquiry.quote_required_by_date && (
          <div style={{ display:"flex",alignItems:"center",gap:6,color:"#b45309",fontSize:13,marginTop:4 }}>
            <Clock size={14}/> Quote required by: <strong>{inquiry.quote_required_by_date}</strong>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:0, marginBottom:20, border:"1px solid #e5e7eb", borderRadius:8, overflow:"hidden" }}>
        {[["template","Fill Quote Template"],["upload","Upload Quote Document"]].map(([t,label])=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            flex:1, padding:"10px 16px", border:"none", cursor:"pointer", fontSize:13, fontWeight:600,
            background: tab===t?"#4f46e5":"#f9fafb", color: tab===t?"#fff":"#374151",
          }}>{label}</button>
        ))}
      </div>

      {error && <ErrorBanner style={{ marginBottom:16 }}>{error}</ErrorBanner>}

      {/* Template tab */}
      {tab === "template" && (
        <form onSubmit={submitTemplate} style={{ display:"flex",flexDirection:"column",gap:14 }}>
          {/* Line items */}
          {lines.length > 0 ? (
            <div>
              <div style={{ fontSize:13,fontWeight:600,color:"#374151",marginBottom:8 }}>Quote Lines</div>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#f9fafb" }}>
                    {["Description","Qty","Unit","Unit Price","Total","Notes"].map(h=>(
                      <th key={h} style={{ padding:"8px 10px",textAlign:"left",fontSize:12,fontWeight:600,color:"#6b7280" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const lineTotal = Number(line.qty||0) * Number(line.unit_price||0);
                    return (
                      <tr key={i} style={{ borderTop:"1px solid #f3f4f6" }}>
                        <td style={{ padding:"8px 10px",color:"#374151" }}>{line.description}</td>
                        <td style={{ padding:"8px 10px" }}>{line.qty}</td>
                        <td style={{ padding:"8px 10px",color:"#6b7280" }}>{line.unit||"—"}</td>
                        <td style={{ padding:"6px 8px" }}>
                          <input
                            type="number" min={0} step="0.01"
                            value={line.unit_price}
                            onChange={e => setLines(ls => ls.map((l,idx) => idx===i ? {...l,unit_price:e.target.value} : l))}
                            style={{ ...inp, width:100 }} placeholder="0.00"
                          />
                        </td>
                        <td style={{ padding:"8px 10px",fontWeight:600 }}>
                          {lineTotal.toLocaleString(undefined,{minimumFractionDigits:2})}
                        </td>
                        <td style={{ padding:"6px 8px" }}>
                          <input
                            value={line.notes||""}
                            onChange={e => setLines(ls => ls.map((l,idx) => idx===i ? {...l,notes:e.target.value} : l))}
                            style={{ ...inp, width:140 }} placeholder="Optional note"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop:"2px solid #e5e7eb", background:"#f9fafb" }}>
                    <td colSpan={4} style={{ padding:"10px",fontWeight:700,textAlign:"right",fontSize:14 }}>Total:</td>
                    <td style={{ padding:"10px",fontWeight:700,fontSize:15,color:"#4f46e5" }}>
                      {currency} {totalAmount.toLocaleString(undefined,{minimumFractionDigits:2})}
                    </td>
                    <td/>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ background:"#f9fafb",borderRadius:8,padding:16,color:"#6b7280",fontSize:14,textAlign:"center" }}>
              No template lines provided. Enter your total amount and details below.
            </div>
          )}

          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12 }}>
            <label style={lbl}>
              Currency
              <select value={currency} onChange={e=>setCurrency(e.target.value)} style={inp}>
                {["ZAR","USD","EUR","GBP","AUD"].map(c=><option key={c}>{c}</option>)}
              </select>
            </label>
            {lines.length === 0 && (
              <label style={lbl}>
                Total Amount
                <input type="number" min={0} step="0.01" style={inp} placeholder="0.00"/>
              </label>
            )}
            <label style={lbl}>
              Valid Until
              <input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)} style={inp}/>
            </label>
            <label style={lbl}>
              Quote Reference
              <input value={quoteRef} onChange={e=>setQuoteRef(e.target.value)} style={inp} placeholder="e.g. QT-2026-001"/>
            </label>
          </div>

          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <label style={lbl}>
              Payment Terms
              <input value={paymentTerms} onChange={e=>setPaymentTerms(e.target.value)} style={inp} placeholder="e.g. Net 30"/>
            </label>
            <label style={lbl}>
              Delivery Terms
              <input value={deliveryTerms} onChange={e=>setDeliveryTerms(e.target.value)} style={inp} placeholder="e.g. FOB Johannesburg"/>
            </label>
          </div>

          <button type="submit" disabled={loading} style={{ ...btnPrimary, alignSelf:"flex-end" }}>
            {loading ? <><Loader2 size={15}/> Submitting…</> : <><CheckCircle2 size={15}/> Submit Quotation</>}
          </button>
        </form>
      )}

      {/* Upload tab */}
      {tab === "upload" && (
        <form onSubmit={submitUpload} style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <label style={lbl}>
            Quote Reference Code (optional)
            <input value={quoteRef} onChange={e=>setQuoteRef(e.target.value)} style={inp} placeholder="Your internal quote number"/>
          </label>

          <div>
            <div style={{ fontSize:13,fontWeight:500,color:"#374151",marginBottom:6 }}>Quote Document (PDF, Excel, Word) *</div>
            <label style={{
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              border:"2px dashed #d1d5db",borderRadius:10,padding:"32px 20px",cursor:"pointer",
              background: file ? "#f0fdf4" : "#f9fafb", transition:"all .2s",
              borderColor: file ? "#6ee7b7" : "#d1d5db",
            }}>
              <input type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" style={{ display:"none" }}
                onChange={e => setFile(e.target.files[0])}/>
              <Upload size={28} style={{ color: file?"#10b981":"#9ca3af", marginBottom:8 }}/>
              {file ? (
                <>
                  <div style={{ fontSize:13,fontWeight:600,color:"#065f46" }}>{file.name}</div>
                  <div style={{ fontSize:12,color:"#6b7280",marginTop:2 }}>{(file.size/1024).toFixed(1)} KB — click to change</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize:13,color:"#374151",fontWeight:500 }}>Click to upload quote document</div>
                  <div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>PDF, Excel or Word · Max 20MB</div>
                </>
              )}
            </label>
          </div>

          <button type="submit" disabled={loading||!file} style={{ ...btnPrimary, alignSelf:"flex-end" }}>
            {loading ? <><Loader2 size={15}/> Uploading…</> : <><Upload size={15}/> Upload & Submit</>}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Step 3: Quote submitted (read-only confirmation) ────────────
function StepConfirmation({ inquiry }) {
  return (
    <div style={{ textAlign:"center", padding:"32px 0" }}>
      <CheckCircle2 size={56} style={{ color:"#10b981", marginBottom:12 }}/>
      <div style={{ fontSize:20,fontWeight:700,color:"#065f46",marginBottom:8 }}>Quote Submitted!</div>
      <div style={{ fontSize:14,color:"#6b7280",maxWidth:400,margin:"0 auto",lineHeight:1.6 }}>
        Your quotation for <strong>{inquiry.title}</strong> has been submitted successfully.
        The company will review it and get back to you.
      </div>
      {inquiry.quote_reference && (
        <div style={{ marginTop:16,background:"#f0fdf4",border:"1px solid #6ee7b7",borderRadius:8,padding:"12px 20px",display:"inline-block" }}>
          <span style={{ fontSize:13,color:"#065f46" }}>Quote Reference: <strong>{inquiry.quote_reference}</strong></span>
        </div>
      )}
    </div>
  );
}

// ─── Closed state ────────────────────────────────────────────────
function StepClosed({ inquiry }) {
  const accepted = inquiry.status === "accepted";
  return (
    <div style={{ textAlign:"center", padding:"32px 0" }}>
      {accepted
        ? <CheckCircle2 size={56} style={{ color:"#10b981", marginBottom:12 }}/>
        : <AlertCircle size={56} style={{ color:"#ef4444", marginBottom:12 }}/>}
      <div style={{ fontSize:20,fontWeight:700,color: accepted?"#065f46":"#b91c1c",marginBottom:8 }}>
        Inquiry {accepted?"Accepted":"Closed"}
      </div>
      <div style={{ fontSize:14,color:"#6b7280",maxWidth:400,margin:"0 auto" }}>
        This inquiry has been {accepted ? "accepted — expect to hear from the company soon." : "closed. Thank you for your participation."}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function InquiryResponsePage() {
  // URL: /vendor-portal/inquiry/:inquiryId
  // The token comes from query string: ?token=xxx
  // OR from a path like /inquiry/:token (we support both)
  const { inquiryId } = useParams();
  const searchParams = new URLSearchParams(window.location.search);
  const tokenFromQuery = searchParams.get("token");

  // We also support /inquiry/:token directly (token IS the inquiryId param in that case)
  // The backend will distinguish since token format is 43 chars vs numeric id
  const isTokenRoute = inquiryId && !/^\d+$/.test(inquiryId);
  const token = isTokenRoute ? inquiryId : tokenFromQuery;

  // Get companyId from path: /vendor-portal/inquiry/xxx?cid=N or from subdomain
  const cidFromQuery = searchParams.get("cid") || searchParams.get("company_id");
  // Fallback: try to get from local storage (if vendor is logged in)
  const companyId = cidFromQuery || localStorage.getItem("vp_company_id");

  const [inquiry, setInquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!token || !companyId) {
      setError("Invalid link — missing token or company.");
      setLoading(false);
      return;
    }
    setLoading(true); setError("");
    try {
      const data = await portalRequest(
        `${apiBase(companyId)}/portal/inquiries/${token}`,
        { token }
      );
      setInquiry(data);
    } catch(err) {
      setError(err.message || "Could not load inquiry.");
    } finally { setLoading(false); }
  }, [token, companyId, refreshKey]);

  useEffect(() => { load(); }, [load]);

  function handleStepDone() {
    setRefreshKey(k => k + 1);
  }

  const status = inquiry?.status || "sent";
  const meta = STATUS_META[status] || { label: status, color:"#6b7280", step:1 };
  const currentStep = meta.step;

  return (
    <div style={{ minHeight:"100vh", background:"#f8fafc", fontFamily:"system-ui,-apple-system,sans-serif" }}>
      {/* Top bar */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"12px 24px", display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:32,height:32,background:"#4f46e5",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <MessageSquare size={18} style={{ color:"#fff" }}/>
        </div>
        <div>
          <div style={{ fontWeight:700,fontSize:15 }}>FinSage Nexus</div>
          <div style={{ fontSize:11,color:"#9ca3af" }}>Inquiry Portal</div>
        </div>
        <div style={{ flex:1 }}/>
        {inquiry && (
          <span style={{
            background: meta.color+"1a", color: meta.color,
            border:`1px solid ${meta.color}44`, borderRadius:6,
            padding:"3px 10px", fontSize:12, fontWeight:700,
          }}>{meta.label}</span>
        )}
      </div>

      {/* Content */}
      <div style={{ maxWidth:780, margin:"0 auto", padding:"32px 20px" }}>
        {loading && (
          <div style={{ textAlign:"center", padding:80, color:"#9ca3af" }}>
            <Loader2 size={32} style={{ animation:"spin 1s linear infinite", marginBottom:12 }}/>
            <div>Loading inquiry…</div>
          </div>
        )}

        {!loading && error && (
          <div style={{ background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:12,padding:32,textAlign:"center" }}>
            <AlertCircle size={40} style={{ color:"#ef4444",marginBottom:12 }}/>
            <div style={{ fontSize:16,fontWeight:700,color:"#b91c1c",marginBottom:8 }}>Unable to load inquiry</div>
            <div style={{ fontSize:14,color:"#6b7280" }}>{error}</div>
          </div>
        )}

        {!loading && !error && inquiry && (
          <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", padding:28, boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>

            {/* Inquiry header */}
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:12,color:"#9ca3af",marginBottom:4 }}>{inquiry.inquiry_no}</div>
              <h1 style={{ margin:"0 0 6px",fontSize:22,fontWeight:800 }}>{inquiry.title}</h1>
              <div style={{ fontSize:13,color:"#6b7280" }}>
                {inquiry.inquiry_type === "vendor" ? "Vendor Inquiry" : "Customer Inquiry"} ·{" "}
                Issued {inquiry.created_at ? new Date(inquiry.created_at).toLocaleDateString() : ""}
              </div>
            </div>

            {/* Progress */}
            <ProgressBar currentStep={currentStep}/>

            {/* Step content */}
            {status === "sent" && (
              <StepRespond
                inquiry={inquiry}
                companyId={companyId}
                token={token}
                onDone={handleStepDone}
              />
            )}

            {status === "responded" && (
              <div style={{ textAlign:"center",padding:"24px 0",color:"#6b7280" }}>
                <CheckCircle2 size={40} style={{ color:"#8b5cf6",marginBottom:10 }}/>
                <div style={{ fontSize:16,fontWeight:700,color:"#374151",marginBottom:6 }}>Response Submitted</div>
                <div style={{ fontSize:14 }}>Waiting for the company to review your response and request a quote.</div>
              </div>
            )}

            {status === "quote_requested" && (
              <StepQuoteRequested
                inquiry={inquiry}
                companyId={companyId}
                token={token}
                onDone={handleStepDone}
              />
            )}

            {status === "quote_submitted" && <StepConfirmation inquiry={inquiry}/>}

            {["accepted","rejected","closed"].includes(status) && <StepClosed inquiry={inquiry}/>}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ErrorBanner({ children, style={} }) {
  return (
    <div style={{ background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"10px 14px",color:"#b91c1c",fontSize:13,display:"flex",gap:8,...style }}>
      <AlertCircle size={15} style={{ flexShrink:0,marginTop:1 }}/>{children}
    </div>
  );
}

const lbl = { display:"flex",flexDirection:"column",gap:4,fontSize:13,fontWeight:500,color:"#374151" };
const inp = { padding:"8px 10px",borderRadius:7,border:"1px solid #d1d5db",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"inherit" };
const btnPrimary = { display:"flex",alignItems:"center",gap:6,background:"#4f46e5",color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontSize:14,fontWeight:600 };
