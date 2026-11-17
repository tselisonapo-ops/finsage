import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Copy, ChevronRight, AlertCircle,
  MessageSquare, FileText, CheckCircle2, XCircle,
  Clock, Send, FileQuestion,
} from "lucide-react";
import Shell from "../components/Shell";
import { opsApi as api, getCompanyId } from "../api/api";

// ─── Status badge helpers ────────────────────────────────────────
const STATUS_META = {
  draft:           { label: "Draft",           color: "#6b7280" },
  sent:            { label: "Sent",            color: "#3b82f6" },
  responded:       { label: "Responded",       color: "#8b5cf6" },
  quote_requested: { label: "Quote Requested", color: "#f59e0b" },
  quote_submitted: { label: "Quote Submitted", color: "#06b6d4" },
  accepted:        { label: "Accepted",        color: "#10b981" },
  rejected:        { label: "Rejected",        color: "#ef4444" },
  closed:          { label: "Closed",          color: "#6b7280" },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: "#6b7280" };
  return (
    <span style={{
      background: m.color + "1a", color: m.color,
      border: `1px solid ${m.color}44`,
      borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600,
    }}>
      {m.label}
    </span>
  );
}

// ─── New Inquiry Modal ───────────────────────────────────────────
function NewInquiryModal({ onClose, onCreated }) {
  const cid = getCompanyId();
  const [form, setForm] = useState({
    inquiry_type: "vendor",
    vendor_id: "",
    customer_id: "",
    title: "",
    description: "",
    scope_of_work: "",
    recipient_name: "",
    recipient_email: "",
    recipient_phone: "",
    quote_template_items: [],
  });
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templateLine, setTemplateLine] = useState({ description: "", qty: 1, unit: "" });

  useEffect(() => {
    // Load vendors list
    api.procurementVendors?.(cid).then(r => setVendors(r?.vendors || r || [])).catch(() => {});
    // customers — use optional chaining in case method doesn't exist yet
    api.customers?.(cid).then(r => setCustomers(r?.customers || r || [])).catch(() => {});
  }, [cid]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function addTemplateLine() {
    if (!templateLine.description) return;
    set("quote_template_items", [...form.quote_template_items, { ...templateLine, unit_price: null }]);
    setTemplateLine({ description: "", qty: 1, unit: "" });
  }

  function removeTemplateLine(i) {
    set("quote_template_items", form.quote_template_items.filter((_, idx) => idx !== i));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.title || !form.description) { setError("Title and description are required."); return; }
    setLoading(true);
    try {
      const payload = { ...form };
      if (form.inquiry_type === "vendor") delete payload.customer_id;
      else delete payload.vendor_id;
      const result = await api.createInquiry(cid, payload);
      onCreated(result);
    } catch (err) {
      setError(err.message || "Failed to create inquiry");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.5)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000,
    }}>
      <div style={{
        background:"#fff", borderRadius:12, padding:28, width:620,
        maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <h2 style={{ margin:"0 0 20px", fontSize:18, fontWeight:700 }}>New Inquiry</h2>

        {error && (
          <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8,
            padding:"10px 14px", marginBottom:16, color:"#b91c1c", fontSize:13, display:"flex", gap:8 }}>
            <AlertCircle size={16} style={{ flexShrink:0, marginTop:1 }}/> {error}
          </div>
        )}

        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {/* Type */}
          <label style={lbl}>
            Inquiry Type
            <select value={form.inquiry_type} onChange={e => set("inquiry_type", e.target.value)} style={inp}>
              <option value="vendor">Vendor</option>
              <option value="customer">Customer</option>
            </select>
          </label>

          {/* Counterparty */}
          {form.inquiry_type === "vendor" ? (
            <label style={lbl}>
              Vendor (optional — select or type recipient details below)
              <select value={form.vendor_id} onChange={e => set("vendor_id", e.target.value)} style={inp}>
                <option value="">— Select vendor —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          ) : (
            <label style={lbl}>
              Customer (optional)
              <select value={form.customer_id} onChange={e => set("customer_id", e.target.value)} style={inp}>
                <option value="">— Select customer —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}

          {/* Recipient */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <label style={lbl}>Recipient Name<input value={form.recipient_name} onChange={e => set("recipient_name", e.target.value)} style={inp} placeholder="John Doe"/></label>
            <label style={lbl}>Recipient Email<input type="email" value={form.recipient_email} onChange={e => set("recipient_email", e.target.value)} style={inp} placeholder="john@company.com"/></label>
            <label style={lbl}>Recipient Phone<input value={form.recipient_phone} onChange={e => set("recipient_phone", e.target.value)} style={inp} placeholder="+27..."/></label>
          </div>

          <label style={lbl}>
            Title *
            <input value={form.title} onChange={e => set("title", e.target.value)} style={inp} placeholder="e.g. Office Furniture Supply Inquiry" required/>
          </label>

          <label style={lbl}>
            Description *
            <textarea value={form.description} onChange={e => set("description", e.target.value)} style={{ ...inp, height:80, resize:"vertical" }} placeholder="Describe what you need..." required/>
          </label>

          <label style={lbl}>
            Scope of Work
            <textarea value={form.scope_of_work} onChange={e => set("scope_of_work", e.target.value)} style={{ ...inp, height:60, resize:"vertical" }} placeholder="Detailed scope, specs, delivery requirements..."/>
          </label>

          {/* Quote template lines */}
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:"#374151", marginBottom:8 }}>
              Quote Template Lines (optional) — counterparty fills in pricing
            </div>
            {form.quote_template_items.map((line, i) => (
              <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6, background:"#f9fafb", borderRadius:6, padding:"6px 10px" }}>
                <span style={{ flex:1, fontSize:13 }}>{line.description}</span>
                <span style={{ fontSize:12, color:"#6b7280" }}>Qty: {line.qty}{line.unit ? ` ${line.unit}` : ""}</span>
                <button type="button" onClick={() => removeTemplateLine(i)} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", padding:2 }}>✕</button>
              </div>
            ))}
            <div style={{ display:"flex", gap:8 }}>
              <input value={templateLine.description} onChange={e => setTemplateLine(t => ({ ...t, description: e.target.value }))} style={{ ...inp, flex:1 }} placeholder="Item description"/>
              <input type="number" min={0} value={templateLine.qty} onChange={e => setTemplateLine(t => ({ ...t, qty: e.target.value }))} style={{ ...inp, width:70 }} placeholder="Qty"/>
              <input value={templateLine.unit} onChange={e => setTemplateLine(t => ({ ...t, unit: e.target.value }))} style={{ ...inp, width:70 }} placeholder="Unit"/>
              <button type="button" onClick={addTemplateLine} style={{ background:"#4f46e5", color:"#fff", border:"none", borderRadius:6, padding:"0 14px", cursor:"pointer", fontSize:13 }}>+ Add</button>
            </div>
          </div>

          <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={loading} style={btnPrimary}>
              {loading ? "Creating…" : "Create & Send Link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function InquiriesPage() {
  const cid = getCompanyId();
  const nav = useNavigate();
  const [tab, setTab] = useState("vendor");
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [justCreated, setJustCreated] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.listInquiries(cid, { type: tab })
      .then(r => setInquiries(r?.inquiries || []))
      .catch(() => setInquiries([]))
      .finally(() => setLoading(false));
  }, [cid, tab]);

  useEffect(() => { load(); }, [load]);

  function copyLink(inq) {
    const origin = window.location.origin;
    const link = `${origin}/vendor-portal/inquiry/${inq.id}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(inq.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function handleCreated(result) {
    setShowModal(false);
    setJustCreated(result);
    load();
  }

  const filtered = inquiries.filter(inq =>
    !search ||
    inq.inquiry_no?.toLowerCase().includes(search.toLowerCase()) ||
    inq.title?.toLowerCase().includes(search.toLowerCase()) ||
    inq.recipient_name?.toLowerCase().includes(search.toLowerCase()) ||
    inq.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
    inq.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Shell>
      <div style={{ padding:"24px 28px", maxWidth:1100, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:700 }}>Inquiries</h1>
            <p style={{ margin:"4px 0 0", color:"#6b7280", fontSize:14 }}>
              Send and track vendor & customer inquiries and quote requests
            </p>
          </div>
          <button onClick={() => setShowModal(true)} style={btnPrimary}>
            <Plus size={16}/> New Inquiry
          </button>
        </div>

        {/* Just-created token banner */}
        {justCreated?.token && (
          <div style={{
            background:"#ecfdf5", border:"1px solid #6ee7b7", borderRadius:10,
            padding:"14px 18px", marginBottom:20,
          }}>
            <div style={{ fontWeight:700, color:"#065f46", marginBottom:6 }}>
              ✅ Inquiry {justCreated.inquiry_no} created — Portal link (share with counterparty):
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <code style={{ flex:1, background:"#d1fae5", padding:"6px 10px", borderRadius:6, fontSize:12, wordBreak:"break-all" }}>
                {window.location.origin}/vendor-portal/inquiry/{justCreated.id}
              </code>
              <button onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/vendor-portal/inquiry/${justCreated.id}`);
              }} style={{ ...btnSecondary, fontSize:12 }}><Copy size={13}/> Copy</button>
              <button onClick={() => setJustCreated(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#6b7280" }}>✕</button>
            </div>
            <div style={{ marginTop:6, fontSize:12, color:"#6b7280" }}>
              ⚠️ The secure token is embedded in this link. It is not shown again separately.
            </div>
          </div>
        )}

        {/* Tabs + Search */}
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
          {["vendor","customer"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? "#4f46e5" : "transparent",
              color: tab === t ? "#fff" : "#374151",
              border: tab === t ? "none" : "1px solid #e5e7eb",
              borderRadius:8, padding:"6px 18px", cursor:"pointer", fontSize:14, fontWeight:600,
            }}>
              {t === "vendor" ? "Vendor" : "Customer"} Inquiries
            </button>
          ))}
          <div style={{ flex:1 }}/>
          <div style={{ position:"relative" }}>
            <Search size={15} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#9ca3af" }}/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search inquiries…"
              style={{ ...inp, paddingLeft:32, width:220 }}/>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign:"center", padding:60, color:"#6b7280" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:60, color:"#9ca3af" }}>
            <FileQuestion size={40} style={{ marginBottom:12, opacity:0.4 }}/>
            <div style={{ fontSize:15 }}>No inquiries found</div>
            <button onClick={() => setShowModal(true)} style={{ ...btnPrimary, marginTop:14, fontSize:13 }}>
              <Plus size={14}/> Create First Inquiry
            </button>
          </div>
        ) : (
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#f9fafb", borderBottom:"1px solid #e5e7eb" }}>
                  {["No.", tab === "vendor" ? "Vendor" : "Customer", "Title", "Recipient", "Status", "Created", ""].map(h => (
                    <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:12, fontWeight:600, color:"#6b7280", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inq, i) => (
                  <tr key={inq.id} style={{
                    borderBottom: i < filtered.length-1 ? "1px solid #f3f4f6" : "none",
                    cursor:"pointer",
                    transition:"background .15s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background="#f9fafb"}
                    onMouseLeave={e => e.currentTarget.style.background=""}
                    onClick={() => nav(`/inquiries/${inq.id}`)}>
                    <td style={{ padding:"10px 14px", fontSize:13, fontWeight:600, color:"#4f46e5", whiteSpace:"nowrap" }}>{inq.inquiry_no}</td>
                    <td style={{ padding:"10px 14px", fontSize:13 }}>{inq.vendor_name || inq.customer_name || "—"}</td>
                    <td style={{ padding:"10px 14px", fontSize:13, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{inq.title}</td>
                    <td style={{ padding:"10px 14px", fontSize:13, color:"#4b5563" }}>{inq.recipient_name || inq.recipient_email || "—"}</td>
                    <td style={{ padding:"10px 14px" }}><StatusBadge status={inq.status}/></td>
                    <td style={{ padding:"10px 14px", fontSize:12, color:"#9ca3af", whiteSpace:"nowrap" }}>
                      {inq.created_at ? new Date(inq.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <button onClick={e => { e.stopPropagation(); copyLink(inq); }} title="Copy portal link"
                          style={{ background:"none", border:"1px solid #e5e7eb", borderRadius:6, padding:"4px 8px", cursor:"pointer", color: copiedId===inq.id ? "#10b981" : "#6b7280", fontSize:12, display:"flex", alignItems:"center", gap:4 }}>
                          <Copy size={12}/> {copiedId===inq.id ? "Copied!" : "Link"}
                        </button>
                        <ChevronRight size={16} style={{ color:"#d1d5db" }}/>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && <NewInquiryModal onClose={() => setShowModal(false)} onCreated={handleCreated}/>}
    </Shell>
  );
}

// ─── Shared styles ───────────────────────────────────────────────
const lbl = { display:"flex", flexDirection:"column", gap:4, fontSize:13, fontWeight:500, color:"#374151" };
const inp = {
  padding:"8px 10px", borderRadius:7, border:"1px solid #d1d5db",
  fontSize:13, outline:"none", width:"100%", boxSizing:"border-box",
  fontFamily:"inherit",
};
const btnPrimary = {
  display:"flex", alignItems:"center", gap:6,
  background:"#4f46e5", color:"#fff", border:"none",
  borderRadius:8, padding:"9px 18px", cursor:"pointer", fontSize:14, fontWeight:600,
};
const btnSecondary = {
  display:"flex", alignItems:"center", gap:6,
  background:"#fff", color:"#374151", border:"1px solid #d1d5db",
  borderRadius:8, padding:"9px 18px", cursor:"pointer", fontSize:14, fontWeight:600,
};
