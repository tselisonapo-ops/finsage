import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Copy, ExternalLink, CheckCircle2, XCircle,
  Clock, MessageSquare, FileText, Send, AlertCircle,
  ChevronDown, ChevronUp, Download, Plus, Trash2,
} from "lucide-react";
import Shell from "../components/Shell";
import { opsApi as api, getCompanyId } from "../api/api";

const STATUS_META = {
  draft:           { label: "Draft",           color: "#6b7280", bg: "#f3f4f6" },
  sent:            { label: "Sent",            color: "#3b82f6", bg: "#eff6ff" },
  responded:       { label: "Responded",       color: "#8b5cf6", bg: "#f5f3ff" },
  quote_requested: { label: "Quote Requested", color: "#f59e0b", bg: "#fffbeb" },
  quote_submitted: { label: "Quote Submitted", color: "#06b6d4", bg: "#ecfeff" },
  accepted:        { label: "Accepted",        color: "#10b981", bg: "#ecfdf5" },
  rejected:        { label: "Rejected",        color: "#ef4444", bg: "#fef2f2" },
  closed:          { label: "Closed",          color: "#6b7280", bg: "#f9fafb" },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: "#6b7280", bg: "#f3f4f6" };
  return (
    <span style={{
      background: m.bg, color: m.color, border: `1px solid ${m.color}44`,
      borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700,
    }}>{m.label}</span>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display:"flex", gap:8, fontSize:14, marginBottom:6 }}>
      <span style={{ color:"#6b7280", width:170, flexShrink:0 }}>{label}</span>
      <span style={{ color:"#111827", fontWeight:500 }}>{value}</span>
    </div>
  );
}

// ── Request Quote Modal ──────────────────────────────────────────
function RequestQuoteModal({ inquiry, onClose, onDone }) {
  const cid = getCompanyId();
  const [form, setForm] = useState({
    quote_request_notes: "",
    quote_required_by_date: "",
    quote_template_items: inquiry.quote_template_items || [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newLine, setNewLine] = useState({ description:"", qty:1, unit:"" });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function addLine() {
    if (!newLine.description) return;
    set("quote_template_items", [...form.quote_template_items, { ...newLine }]);
    setNewLine({ description:"", qty:1, unit:"" });
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await api.requestInquiryQuote(cid, inquiry.id, form);
      onDone();
    } catch(err) {
      setError(err.message || "Failed");
    } finally { setLoading(false); }
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }}>
      <div style={{ background:"#fff",borderRadius:12,padding:28,width:580,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
        <h2 style={{ margin:"0 0 18px",fontSize:18,fontWeight:700 }}>Request a Quote</h2>
        {error && <div style={{ background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"10px 14px",marginBottom:12,color:"#b91c1c",fontSize:13 }}><AlertCircle size={14} style={{marginRight:6}}/>{error}</div>}
        <form onSubmit={submit} style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <label style={lbl}>Request Notes / Instructions
            <textarea value={form.quote_request_notes} onChange={e => set("quote_request_notes",e.target.value)} style={{ ...inp,height:80,resize:"vertical" }} placeholder="Specify what you need priced, delivery terms, etc."/>
          </label>
          <label style={lbl}>Quote Required By
            <input type="date" value={form.quote_required_by_date} onChange={e => set("quote_required_by_date",e.target.value)} style={inp}/>
          </label>

          <div>
            <div style={{ fontSize:13,fontWeight:600,color:"#374151",marginBottom:8 }}>Quote Line Items (optional template)</div>
            {form.quote_template_items.map((line,i) => (
              <div key={i} style={{ display:"flex",gap:8,alignItems:"center",marginBottom:6,background:"#f9fafb",borderRadius:6,padding:"6px 10px" }}>
                <span style={{ flex:1,fontSize:13 }}>{line.description}</span>
                <span style={{ fontSize:12,color:"#6b7280" }}>Qty: {line.qty}{line.unit?` ${line.unit}`:""}</span>
                <button type="button" onClick={() => set("quote_template_items",form.quote_template_items.filter((_,idx)=>idx!==i))} style={{ background:"none",border:"none",color:"#ef4444",cursor:"pointer" }}>✕</button>
              </div>
            ))}
            <div style={{ display:"flex",gap:8 }}>
              <input value={newLine.description} onChange={e=>setNewLine(n=>({...n,description:e.target.value}))} style={{ ...inp,flex:1 }} placeholder="Item description"/>
              <input type="number" min={0} value={newLine.qty} onChange={e=>setNewLine(n=>({...n,qty:e.target.value}))} style={{ ...inp,width:70 }}/>
              <input value={newLine.unit} onChange={e=>setNewLine(n=>({...n,unit:e.target.value}))} style={{ ...inp,width:70 }} placeholder="Unit"/>
              <button type="button" onClick={addLine} style={btnSmall}>+ Add</button>
            </div>
          </div>

          <div style={{ display:"flex",justifyContent:"flex-end",gap:10,marginTop:8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Sending…" : "Send Quote Request"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Close Inquiry Modal ──────────────────────────────────────────
function CloseModal({ inquiryId, onClose, onDone }) {
  const cid = getCompanyId();
  const [decision, setDecision] = useState("accepted");
  const [loading, setLoading] = useState(false);
  async function submit() {
    setLoading(true);
    try { await api.closeInquiry(cid, inquiryId, { decision }); onDone(); }
    finally { setLoading(false); }
  }
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }}>
      <div style={{ background:"#fff",borderRadius:12,padding:28,width:420,boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
        <h2 style={{ margin:"0 0 18px",fontSize:18,fontWeight:700 }}>Close Inquiry</h2>
        <div style={{ marginBottom:16 }}>
          {["accepted","rejected"].map(d => (
            <label key={d} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:8,border:`2px solid ${decision===d?"#4f46e5":"#e5e7eb"}`,marginBottom:8,cursor:"pointer" }}>
              <input type="radio" name="decision" value={d} checked={decision===d} onChange={()=>setDecision(d)} style={{ accentColor:"#4f46e5" }}/>
              <span style={{ fontWeight:600,color: d==="accepted"?"#10b981":"#ef4444" }}>{d==="accepted"?"✅ Accept":"❌ Reject"}</span>
            </label>
          ))}
        </div>
        <div style={{ display:"flex",justifyContent:"flex-end",gap:10 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ ...btnPrimary, background: decision==="accepted"?"#10b981":"#ef4444" }}>
            {loading?"Closing…":`Close as ${decision==="accepted"?"Accepted":"Rejected"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function InquiryDetailPage() {
  const { inquiryId } = useParams();
  const cid = getCompanyId();
  const nav = useNavigate();
  const [inquiry, setInquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // "request_quote" | "close"
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getInquiry(cid, inquiryId)
      .then(r => setInquiry(r))
      .catch(() => setInquiry(null))
      .finally(() => setLoading(false));
  }, [cid, inquiryId]);

  useEffect(() => { load(); }, [load]);

  function copyPortalLink() {
    const link = `${window.location.origin}/vendor-portal/inquiry/${inquiryId}`;
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); });
  }

  if (loading) return <Shell><div style={{ padding:40, textAlign:"center", color:"#9ca3af" }}>Loading inquiry…</div></Shell>;
  if (!inquiry) return <Shell><div style={{ padding:40, textAlign:"center", color:"#ef4444" }}>Inquiry not found.</div></Shell>;

  const isClosed = ["accepted","rejected","closed"].includes(inquiry.status);
  const documents = inquiry.documents || [];

  return (
    <Shell>
      <div style={{ padding:"24px 28px", maxWidth:960, margin:"0 auto" }}>

        {/* Header */}
        <button onClick={() => nav("/inquiries")} style={{ background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:6,color:"#6b7280",fontSize:13,marginBottom:16,padding:0 }}>
          <ArrowLeft size={16}/> Back to Inquiries
        </button>

        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20,gap:16 }}>
          <div>
            <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:6 }}>
              <span style={{ fontSize:14,fontWeight:700,color:"#4f46e5" }}>{inquiry.inquiry_no}</span>
              <StatusBadge status={inquiry.status}/>
              <span style={{ fontSize:12,color:"#9ca3af",background:"#f3f4f6",borderRadius:5,padding:"2px 8px" }}>
                {inquiry.inquiry_type === "vendor" ? "🏢 Vendor" : "👤 Customer"}
              </span>
            </div>
            <h1 style={{ margin:0,fontSize:20,fontWeight:700 }}>{inquiry.title}</h1>
          </div>
          <div style={{ display:"flex",gap:8,flexShrink:0 }}>
            <button onClick={copyPortalLink} style={{ ...btnSecondary,fontSize:13 }}>
              <Copy size={14}/> {copied ? "Copied!" : "Copy Portal Link"}
            </button>
            {inquiry.status === "responded" && (
              <button onClick={() => setModal("request_quote")} style={btnPrimary}>
                <Send size={14}/> Request Quote
              </button>
            )}
            {!isClosed && ["quote_submitted","responded","sent"].includes(inquiry.status) && (
              <button onClick={() => setModal("close")} style={{ ...btnSecondary,borderColor:"#fca5a5",color:"#b91c1c" }}>
                Close Inquiry
              </button>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 340px",gap:20 }}>

          {/* LEFT: main content */}
          <div style={{ display:"flex",flexDirection:"column",gap:16 }}>

            {/* Inquiry details */}
            <Card title="Inquiry Details">
              <InfoRow label="Description" value={inquiry.description}/>
              <InfoRow label="Scope of Work" value={inquiry.scope_of_work}/>
              <InfoRow label="Vendor" value={inquiry.vendor_name}/>
              <InfoRow label="Customer" value={inquiry.customer_name}/>
              <InfoRow label="Created" value={inquiry.created_at ? new Date(inquiry.created_at).toLocaleString() : null}/>
            </Card>

            {/* Response from counterparty */}
            {inquiry.responded_at && (
              <Card title="Counterparty Response" accent="#8b5cf6">
                <InfoRow label="Responded by" value={inquiry.responded_by_name || inquiry.responded_by_email}/>
                <InfoRow label="Responded at" value={new Date(inquiry.responded_at).toLocaleString()}/>
                {inquiry.response_lead_time && <InfoRow label="Lead time" value={inquiry.response_lead_time}/>}
                {inquiry.response_availability && <InfoRow label="Availability" value={inquiry.response_availability}/>}
                {inquiry.response_text && (
                  <div style={{ marginTop:10,background:"#f5f3ff",borderRadius:8,padding:12,fontSize:14,color:"#374151",lineHeight:1.6 }}>
                    {inquiry.response_text}
                  </div>
                )}
              </Card>
            )}

            {/* Quote requested */}
            {inquiry.quote_requested_at && (
              <Card title="Quote Request Details" accent="#f59e0b">
                <InfoRow label="Requested at" value={new Date(inquiry.quote_requested_at).toLocaleString()}/>
                {inquiry.quote_required_by_date && <InfoRow label="Required by" value={inquiry.quote_required_by_date}/>}
                {inquiry.quote_request_notes && (
                  <div style={{ marginTop:10,background:"#fffbeb",borderRadius:8,padding:12,fontSize:14,color:"#374151",lineHeight:1.6 }}>
                    {inquiry.quote_request_notes}
                  </div>
                )}
                {/* Template lines */}
                {(inquiry.quote_template_items||[]).length > 0 && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:6 }}>TEMPLATE ITEMS</div>
                    <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                      <thead>
                        <tr style={{ background:"#f9fafb" }}>
                          {["Description","Qty","Unit"].map(h=><th key={h} style={{ padding:"6px 10px",textAlign:"left",fontSize:12,fontWeight:600,color:"#6b7280" }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {inquiry.quote_template_items.map((line,i)=>(
                          <tr key={i} style={{ borderTop:"1px solid #f3f4f6" }}>
                            <td style={{ padding:"6px 10px" }}>{line.description}</td>
                            <td style={{ padding:"6px 10px" }}>{line.qty}</td>
                            <td style={{ padding:"6px 10px" }}>{line.unit||"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Submitted quote */}
            {inquiry.quote_submitted_at && (
              <Card title="Submitted Quote" accent="#06b6d4">
                <InfoRow label="Reference" value={inquiry.quote_reference}/>
                <InfoRow label="Amount" value={inquiry.quote_amount ? `${inquiry.quote_currency||"ZAR"} ${Number(inquiry.quote_amount).toLocaleString(undefined,{minimumFractionDigits:2})}` : null}/>
                <InfoRow label="Valid until" value={inquiry.quote_valid_until}/>
                <InfoRow label="Payment terms" value={inquiry.quote_payment_terms}/>
                <InfoRow label="Delivery terms" value={inquiry.quote_delivery_terms}/>
                <InfoRow label="Submitted at" value={new Date(inquiry.quote_submitted_at).toLocaleString()}/>
                {inquiry.quote_file_url && (
                  <a href={inquiry.quote_file_url} target="_blank" rel="noreferrer"
                    style={{ display:"flex",alignItems:"center",gap:6,color:"#4f46e5",fontSize:13,marginTop:8,textDecoration:"none" }}>
                    <Download size={14}/> {inquiry.quote_file_name || "Download Quote File"}
                  </a>
                )}
                {/* Quote line details */}
                {inquiry.quote_details && Object.keys(inquiry.quote_details).length > 0 && Array.isArray(inquiry.quote_details.lines) && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:6 }}>QUOTE LINES</div>
                    <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                      <thead>
                        <tr style={{ background:"#f9fafb" }}>
                          {["Description","Qty","Unit Price","Total"].map(h=><th key={h} style={{ padding:"6px 10px",textAlign:"left",fontSize:12,fontWeight:600,color:"#6b7280" }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {inquiry.quote_details.lines.map((line,i)=>{
                          const total = (Number(line.qty||0) * Number(line.unit_price||0));
                          return (
                            <tr key={i} style={{ borderTop:"1px solid #f3f4f6" }}>
                              <td style={{ padding:"6px 10px" }}>{line.description}</td>
                              <td style={{ padding:"6px 10px" }}>{line.qty}</td>
                              <td style={{ padding:"6px 10px" }}>{Number(line.unit_price||0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                              <td style={{ padding:"6px 10px",fontWeight:600 }}>{total.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Documents */}
            {documents.length > 0 && (
              <Card title="Documents">
                {documents.map(doc => (
                  <div key={doc.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f3f4f6" }}>
                    <FileText size={16} style={{ color:"#6b7280",flexShrink:0 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13,fontWeight:500 }}>{doc.file_name}</div>
                      <div style={{ fontSize:11,color:"#9ca3af" }}>{doc.uploaded_by_party} · {doc.document_type}</div>
                    </div>
                    <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ color:"#4f46e5",fontSize:12 }}>Download</a>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* RIGHT: sidebar */}
          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>

            {/* Recipient */}
            <Card title="Counterparty">
              <InfoRow label="Name" value={inquiry.recipient_name}/>
              <InfoRow label="Email" value={inquiry.recipient_email}/>
              <InfoRow label="Phone" value={inquiry.recipient_phone}/>
            </Card>

            {/* Portal link */}
            <Card title="Portal Link">
              <div style={{ fontSize:12,color:"#6b7280",marginBottom:8 }}>Share this link with the counterparty to respond to the inquiry:</div>
              <div style={{ background:"#f3f4f6",borderRadius:6,padding:"8px 10px",fontSize:11,wordBreak:"break-all",marginBottom:8 }}>
                {window.location.origin}/vendor-portal/inquiry/{inquiryId}
              </div>
              <button onClick={copyPortalLink} style={{ ...btnSecondary,width:"100%",justifyContent:"center",fontSize:12 }}>
                <Copy size={12}/> {copied ? "Copied!" : "Copy Link"}
              </button>
            </Card>

            {/* Status flow */}
            <Card title="Status Flow">
              {Object.entries(STATUS_META).filter(([s])=>s!=="draft"&&s!=="closed").map(([s,m]) => {
                const isCurrent = inquiry.status === s;
                const statuses = ["sent","responded","quote_requested","quote_submitted","accepted","rejected"];
                const currentIdx = statuses.indexOf(inquiry.status);
                const stepIdx = statuses.indexOf(s);
                const isPast = stepIdx < currentIdx;
                return (
                  <div key={s} style={{ display:"flex",alignItems:"center",gap:8,padding:"4px 0" }}>
                    <div style={{ width:8,height:8,borderRadius:"50%",background: isCurrent ? m.color : isPast ? "#10b981" : "#e5e7eb",flexShrink:0 }}/>
                    <span style={{ fontSize:12,color: isCurrent ? m.color : isPast ? "#6b7280" : "#9ca3af",fontWeight: isCurrent ? 700 : 400 }}>{m.label}</span>
                    {isCurrent && <span style={{ fontSize:10,color:m.color }}>← current</span>}
                  </div>
                );
              })}
            </Card>
          </div>
        </div>
      </div>

      {modal === "request_quote" && (
        <RequestQuoteModal
          inquiry={inquiry}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      )}
      {modal === "close" && (
        <CloseModal
          inquiryId={inquiry.id}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      )}
    </Shell>
  );
}

function Card({ title, children, accent="#4f46e5" }) {
  return (
    <div style={{ background:"#fff",borderRadius:12,border:"1px solid #e5e7eb",overflow:"hidden" }}>
      <div style={{ padding:"12px 16px",borderBottom:"1px solid #f3f4f6",fontWeight:700,fontSize:14,color:"#111827",borderLeft:`3px solid ${accent}` }}>
        {title}
      </div>
      <div style={{ padding:"14px 16px" }}>{children}</div>
    </div>
  );
}

const lbl = { display:"flex",flexDirection:"column",gap:4,fontSize:13,fontWeight:500,color:"#374151" };
const inp = { padding:"8px 10px",borderRadius:7,border:"1px solid #d1d5db",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"inherit" };
const btnPrimary = { display:"flex",alignItems:"center",gap:6,background:"#4f46e5",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:14,fontWeight:600 };
const btnSecondary = { display:"flex",alignItems:"center",gap:6,background:"#fff",color:"#374151",border:"1px solid #d1d5db",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:14,fontWeight:600 };
const btnSmall = { background:"#4f46e5",color:"#fff",border:"none",borderRadius:6,padding:"0 14px",cursor:"pointer",fontSize:13 };
