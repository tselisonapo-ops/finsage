/*
 * static/js/receipt-journal.js  —  FinSage Receipt & Bill Scan Panel
 *
 * Load AFTER dashboard.js (it uses window.apiFetch / window.getToken).
 *
 * Dual Mode Flow:
 * 1. General Journal Flow (#screen-journal):
 *    - Scans supplier receipt / invoice into a balanced draft journal.
 *    - Defaults credit side to Cash & Bank (BS_CA_1000).
 *    - Supports Petty Cash flow & Accounts Payable (AP) flow via credit source radio.
 *    - Posts directly to GL via /api/companies/<cid>/receipt-scan/documents/<id>/post.
 *
 * 2. Supplier Bill / AP Flow (#screen-ap):
 *    - Scans supplier tax invoice / bill (Image or PDF).
 *    - AI extracts vendor, invoice #, date, VAT and line items.
 *    - Side-by-side document preview + editable bill fields.
 *    - "Apply to Bill Form" maps directly to window.writeBillForm & window.addBillLine.
 *    - "Save as Draft Bill" saves draft directly into the AP Bill ledger.
 */
(function () {
  "use strict";

  if (window.__FS_RECEIPT_JOURNAL__) return;
  window.__FS_RECEIPT_JOURNAL__ = true;

  // ─────────────────────────────────────────────
  // helpers
  // ─────────────────────────────────────────────
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  const api = (url, opts) => window.apiFetch(url, opts);
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) =>
    (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = () => new Date().toISOString().slice(0, 10);
  const _round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

  function companyId() {
    return (
      (typeof window.getActiveCompanyId === "function" && window.getActiveCompanyId()) ||
      window.CURRENT_COMPANY_ID ||
      localStorage.getItem("CURRENT_COMPANY_ID") ||
      ""
    );
  }

  // COA source for account pickers — defensive across your global names
  function coaList() {
    const c =
      window.CURRENT_COA ||
      window.COA ||
      (window.FS && window.FS.coa) ||
      [];
    return Array.isArray(c) ? c : [];
  }

  function confChip(v) {
    const n = Number(v);
    if (isNaN(n)) return `<span class="rj-chip rj-chip--na">no confidence</span>`;
    if (n >= 0.75) return `<span class="rj-chip rj-chip--high">${Math.round(n * 100)}%</span>`;
    if (n >= 0.5) return `<span class="rj-chip rj-chip--mid">${Math.round(n * 100)}%</span>`;
    return `<span class="rj-chip rj-chip--low">${Math.round(n * 100)}%</span>`;
  }

  const STATUS_CHIP = {
    uploaded: ["rj-st--upl", "Uploaded"],
    draft_ready: ["rj-st--dr", "Draft ready"],
    posted: ["rj-st--po", "Posted"],
    applied: ["rj-st--po", "Applied to Bill"],
    discarded: ["rj-st--di", "Discarded"],
  };

  // ─────────────────────────────────────────────
  // styles (scoped, no clashes)
  // ─────────────────────────────────────────────
  const CSS = `
  #rjPanel, #rjApPanel{margin:0 0 18px;border:1px solid #dbe4ef;border-radius:14px;background:#fff;overflow:hidden;
           box-shadow:0 8px 22px -16px rgba(0,40,79,.35);font-family:inherit}
  #rjPanel .rj-head, #rjApPanel .rj-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#f4f8fc;border-bottom:1px solid #e6edf5}
  #rjApPanel .rj-head{background:#f0fdf4;border-bottom-color:#bbf7d0}
  #rjPanel .rj-head h3, #rjApPanel .rj-head h3{margin:0;font-size:14.5px;font-weight:700;color:#0b3a63}
  #rjApPanel .rj-head h3{color:#14532d}
  #rjPanel .rj-head p, #rjApPanel .rj-head p{margin:0;font-size:11.5px;color:#64748b}
  #rjApPanel .rj-head p{color:#166534}
  #rjPanel .rj-body, #rjApPanel .rj-body{padding:16px}
  .rj-drop{border:2px dashed #b9c8da;border-radius:12px;padding:22px;text-align:center;color:#64748b;
           background:#fbfdff;cursor:pointer;transition:border-color .15s,background .15s}
  .rj-drop:hover,.rj-drop.is-over{border-color:#00a8a8;background:#f2fbfb;color:#0b3a63}
  #rjApPanel .rj-drop:hover,#rjApPanel .rj-drop.is-over{border-color:#16a34a;background:#f0fdf4;color:#14532d}
  .rj-drop b{color:#0b3a63}
  #rjApPanel .rj-drop b{color:#14532d}
  .rj-drop .rj-dhint{font-size:11px;margin-top:4px;color:#94a3b8}
  #rjPanel input[type=file], #rjApPanel input[type=file]{display:none}
  .rj-list{margin-top:14px;display:flex;flex-direction:column;gap:8px}
  .rj-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #e6edf5;border-radius:10px;
          background:#fff;cursor:pointer;transition:border-color .12s,background .12s;font-size:12.5px}
  .rj-row:hover{border-color:#00a8a8;background:#f7fdfd}
  .rj-row .rj-name{font-weight:600;color:#0f172a;max-width:34ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .rj-row .rj-meta{color:#64748b;font-size:11px}
  .rj-row .rj-amt{margin-left:auto;font-weight:700;color:#0b3a63;font-variant-numeric:tabular-nums}
  .rj-chip{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:10.5px;font-weight:700}
  .rj-chip--high{background:#dcfce7;color:#166534}.rj-chip--mid{background:#fef9c3;color:#854d0e}
  .rj-chip--low{background:#fee2e2;color:#991b1b}.rj-chip--na{background:#f1f5f9;color:#64748b}
  .rj-st{border-radius:999px;padding:2px 9px;font-size:10.5px;font-weight:700}
  .rj-st--upl{background:#e0f2fe;color:#075985}.rj-st--dr{background:#fef9c3;color:#854d0e}
  .rj-st--po{background:#dcfce7;color:#166534}.rj-st--di{background:#f1f5f9;color:#64748b}
  .rj-btn{border:0;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer}
  .rj-btn:disabled{opacity:.55;cursor:not-allowed}
  .rj-btn--solid{background:#0b3a63;color:#fff}.rj-btn--teal{background:#00a8a8;color:#fff}
  .rj-btn--green{background:#15803d;color:#fff}.rj-btn--ghost{background:#eef2f7;color:#334155}.rj-btn--danger{background:#fee2e2;color:#991b1b}
  .rj-modal{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;
            background:rgba(15,23,42,.55);padding:18px}
  .rj-modal.is-open{display:flex}
  .rj-sheet{background:#fff;border-radius:16px;width:min(1080px,100%);max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
  .rj-sheet-head{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #e6edf5;background:#f8fafc}
  .rj-sheet-head h3{margin:0;font-size:15px;font-weight:800;color:#0b3a63}
  .rj-x{margin-left:auto;border:0;background:#eef2f7;border-radius:8px;width:30px;height:30px;font-weight:800;cursor:pointer;color:#334155}
  .rj-cols{display:grid;grid-template-columns:minmax(280px,1fr) 1.35fr;gap:0;overflow:hidden;flex:1;min-height:0}
  @media (max-width:860px){.rj-cols{grid-template-columns:1fr;overflow:auto}}
  .rj-preview{background:#0f172a;display:flex;align-items:center;justify-content:center;overflow:auto;padding:10px;max-height:78vh}
  .rj-preview img,.rj-preview embed,.rj-preview iframe{max-width:100%;max-height:74vh;border-radius:8px;background:#fff}
  .rj-edit{padding:16px 18px;overflow:auto}
  .rj-banner{border-radius:10px;padding:9px 12px;font-size:12px;margin-bottom:12px}
  .rj-banner--warn{background:#fef9c3;color:#854d0e}.rj-banner--err{background:#fee2e2;color:#991b1b}
  .rj-banner--ok{background:#dcfce7;color:#166534}
  .rj-fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:10px}
  .rj-field{display:flex;flex-direction:column;gap:3px}
  .rj-field span{font-size:10.5px;font-weight:700;color:#64748b;letter-spacing:.02em}
  .rj-field input,.rj-field select{border:1px solid #cbd5e1;border-radius:8px;padding:7px 9px;font-size:12.5px;background:#fff}
  .rj-field input:focus,.rj-field select:focus{outline:2px solid rgba(0,168,168,.35);border-color:#00a8a8}
  .rj-lines{margin-top:6px;border:1px solid #e6edf5;border-radius:10px;overflow:hidden}
  .rj-lines table{width:100%;border-collapse:collapse;font-size:12px}
  .rj-lines th{background:#f4f8fc;text-align:left;padding:7px 9px;font-size:10.5px;color:#475569;text-transform:uppercase;letter-spacing:.04em}
  .rj-lines td{padding:6px 9px;border-top:1px solid #eef2f7;vertical-align:middle}
  .rj-lines input{width:100%;border:1px solid #dbe4ef;border-radius:7px;padding:6px 8px;font-size:12px}
  .rj-lines input.rj-num{text-align:right;font-variant-numeric:tabular-nums}
  .rj-lines tfoot td{font-weight:800;background:#f8fafc}
  .rj-balanced{color:#166534}.rj-unbalanced{color:#b91c1c}
  .rj-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center}
  .rj-actions .rj-msg{font-size:12px;color:#475569}
  .rj-conf-row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px}
  .rj-dup{margin-top:10px}
  `;

  // ─────────────────────────────────────────────
  // markup
  // ─────────────────────────────────────────────
  function panelMarkup(type = "journal") {
    if (type === "ap") {
      return `
      <div id="rjApPanel">
        <div class="rj-head">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
          <div>
            <h3>Attach / Scan Bill or Invoice (PDF or Image)</h3>
            <p>Upload or scan a supplier tax invoice or receipt — AI extracts vendor, date, bill #, VAT and line items to populate your bill automatically.</p>
          </div>
        </div>
        <div class="rj-body">
          <div class="rj-drop" id="rjApDrop">
            <b>Drop a supplier bill / receipt / tax invoice here</b> — or click to choose a file<br>
            <span class="rj-dhint">PDF · PNG · JPG · WEBP (max 15 MB) · or take photo with camera</span>
          </div>
          <input type="file" id="rjApFile" accept="image/*,application/pdf">
          <input type="file" id="rjApCamera" accept="image/*" capture="environment">
          <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
            <button type="button" class="rj-btn rj-btn--ghost" id="rjApCamBtn">📷 Use camera</button>
            <span class="rj-msg" id="rjApUpdMsg"></span>
          </div>
          <div class="rj-list" id="rjApList"></div>
        </div>
      </div>`;
    }

    return `
    <div id="rjPanel">
      <div class="rj-head">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0b3a63" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.2"/><path d="m5 19 3.5-3.5"/><path d="m19 5-3.5 3.5"/></svg>
        <div>
          <h3>Receipt / bill scan → draft journal</h3>
          <p>Upload or scan a supplier receipt or tax invoice — AI extracts the facts and builds a draft entry. You review, edit and post.</p>
        </div>
      </div>
      <div class="rj-body">
        <div class="rj-drop" id="rjDrop">
          <b>Drop a receipt / invoice here</b> — or click to choose a file<br>
          <span class="rj-dhint">PNG · JPG · WEBP · PDF (max 15 MB) · on mobile you can use the camera</span>
        </div>
        <input type="file" id="rjFile" accept="image/*,application/pdf">
        <input type="file" id="rjCamera" accept="image/*" capture="environment">
        <div style="display:flex;gap:8px;margin-top:8px">
          <button type="button" class="rj-btn rj-btn--ghost" id="rjCamBtn">📷 Use camera</button>
          <span class="rj-msg" id="rjUpdMsg"></span>
        </div>
        <div class="rj-list" id="rjList"></div>
      </div>
    </div>`;
  }

  // ─────────────────────────────────────────────
  // state + api
  // ─────────────────────────────────────────────
  const S = { docs: [], current: null, blobUrl: null, context: "journal" };

  const BASE = (cid) => `/api/companies/${encodeURIComponent(cid)}/receipt-scan`;

  async function listDocs(mode = "all") {
    const cid = companyId();
    if (!cid) return;
    try {
      const d = await api(`${BASE(cid)}/documents?limit=12`);
      S.docs = (d && d.documents) || [];
      if (mode === "all" || mode === "journal") renderList("journal");
      if (mode === "all" || mode === "ap") renderList("ap");
    } catch (e) {
      console.warn("[receipt-journal] listDocs error:", e);
    }
  }

  async function fetchBlob(doc) {
    const cid = companyId();
    const token = window.getToken();
    const res = await fetch(window.toApiUrl(`${BASE(cid)}/documents/${doc.id}/file`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`File load failed (HTTP ${res.status})`);
    return res.blob();
  }

  // ─────────────────────────────────────────────
  // upload + list
  // ─────────────────────────────────────────────
  function bindUpload(type = "journal") {
    const isAp = type === "ap";
    const drop = document.getElementById(isAp ? "rjApDrop" : "rjDrop");
    const file = document.getElementById(isAp ? "rjApFile" : "rjFile");
    const cam = document.getElementById(isAp ? "rjApCamera" : "rjCamera");
    const camBtn = document.getElementById(isAp ? "rjApCamBtn" : "rjCamBtn");
    const msg = document.getElementById(isAp ? "rjApUpdMsg" : "rjUpdMsg");

    if (!drop || !file) return;

    const handle = async (f) => {
      if (!f) return;
      msg.textContent = `Uploading ${f.name}…`;
      const fd = new FormData();
      fd.append("file", f, f.name);
      fd.append("credit_hint", isAp ? "ap" : "bank");

      try {
        const res = await api(`${BASE(companyId())}/upload`, { method: "POST", body: fd });
        msg.textContent = "";
        await listDocs(type);
        openReview(res.doc_id, type);
        if (res.is_duplicate) {
          setTimeout(() => {
            const b = document.getElementById("rjDupBanner");
            if (b) b.style.display = "";
          }, 400);
        }
      } catch (e) {
        msg.textContent = e.message || "Upload failed";
      }
    };

    drop.addEventListener("click", () => file.click());
    file.addEventListener("change", () => { handle(file.files[0]); file.value = ""; });
    if (camBtn && cam) {
      camBtn.addEventListener("click", () => cam.click());
      cam.addEventListener("change", () => { handle(cam.files[0]); cam.value = ""; });
    }

    ["dragover", "dragenter"].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
    drop.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handle(f);
    });
  }

  function renderList(type = "journal") {
    const isAp = type === "ap";
    const host = document.getElementById(isAp ? "rjApList" : "rjList");
    if (!host) return;

    if (!S.docs.length) {
      host.innerHTML = `<div class="rj-row" style="cursor:default;color:#94a3b8">No scanned documents yet.</div>`;
      return;
    }

    host.innerHTML = S.docs.map((d) => {
      const [cls, label] = STATUS_CHIP[d.status] || STATUS_CHIP.uploaded;
      const meta = [
        d.vendor && esc(d.vendor),
        d.doc_no && `#${esc(d.doc_no)}`,
        d.doc_date && esc(d.doc_date),
        d.engine && `via ${esc(d.engine)}`,
      ].filter(Boolean).join(" · ");

      return `
      <div class="rj-row" data-doc="${d.id}" data-type="${type}">
        <span class="rj-st ${cls}">${label}</span>
        <span class="rj-name">${esc(d.original_name || `Document ${d.id}`)}</span>
        <span class="rj-meta">${meta}</span>
        ${d.status === "posted" && d.journal_id ? `<span class="rj-meta">Jrnl ${d.journal_id}</span>` : ""}
        ${d.status === "applied" && d.bill_id ? `<span class="rj-meta">Bill #${d.bill_id}</span>` : ""}
        <span class="rj-amt">${d.total_amount ? fmt(d.total_amount) : ""}</span>
      </div>`;
    }).join("");

    host.querySelectorAll("[data-doc]").forEach((row) =>
      row.addEventListener("click", () => openReview(Number(row.dataset.doc), type)));
  }

  // ─────────────────────────────────────────────
  // review modal
  // ─────────────────────────────────────────────
  function ensureModal() {
    let m = document.getElementById("rjModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "rjModal";
    m.className = "rj-modal";
    m.innerHTML = `
      <div class="rj-sheet">
        <div class="rj-sheet-head">
          <h3 id="rjTitle">Review document</h3>
          <span id="rjConfSlot"></span>
          <button type="button" class="rj-x" id="rjClose">✕</button>
        </div>
        <div class="rj-cols">
          <div class="rj-preview" id="rjPreview">Loading preview…</div>
          <div class="rj-edit" id="rjEdit">Loading draft…</div>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector("#rjClose").addEventListener("click", closeReview);
    m.addEventListener("click", (e) => { if (e.target === m) closeReview(); });
    return m;
  }

  function closeReview() {
    const m = document.getElementById("rjModal");
    if (m) m.classList.remove("is-open");
    if (S.blobUrl) { URL.revokeObjectURL(S.blobUrl); S.blobUrl = null; }
    S.current = null;
  }

  async function openReview(docId, context = "journal") {
    S.context = context;
    const cid = companyId();
    let doc;
    try {
      doc = await api(`${BASE(cid)}/documents/${docId}`);
    } catch (e) {
      alert(e.message || "Could not load document");
      return;
    }
    S.current = doc;

    const m = ensureModal();
    m.classList.add("is-open");
    document.getElementById("rjTitle").textContent =
      `${context === "ap" ? "Supplier Bill" : (doc.doc_type === "supplier_invoice" ? "Tax invoice" : "Receipt")} · ${doc.original_name || doc.id}`;

    // preview (auth'd blob — works for images and PDFs)
    const pv = document.getElementById("rjPreview");
    pv.textContent = "Loading preview…";
    try {
      const blob = await fetchBlob(doc);
      if (S.blobUrl) URL.revokeObjectURL(S.blobUrl);
      S.blobUrl = URL.createObjectURL(blob);
      pv.innerHTML = "";
      if ((doc.mime_type || "").includes("pdf")) {
        const el = document.createElement("embed");
        el.src = S.blobUrl; el.type = "application/pdf";
        el.style.width = "100%"; el.style.height = "74vh";
        pv.appendChild(el);
      } else {
        const img = document.createElement("img");
        img.src = S.blobUrl; img.alt = "Document preview";
        pv.appendChild(img);
      }
    } catch (e) {
      pv.innerHTML = `<div style="color:#fca5a5;font-size:12px">${esc(e.message)}</div>`;
    }

    if (context === "ap") {
      renderApBillEditor(doc);
    } else {
      renderEditor(doc);
    }
  }

  function confRow(doc) {
    const fc = (doc.extracted && doc.extracted.field_confidence) || {};
    const chips = Object.entries(fc)
      .map(([k, v]) => `<span class="rj-chip ${Number(v) >= 0.75 ? "rj-chip--high" : Number(v) >= 0.5 ? "rj-chip--mid" : "rj-chip--low"}">${esc(k)} ${Math.round(Number(v) * 100)}%</span>`)
      .join("");
    return chips
      ? `<div class="rj-conf-row">Extraction confidence: ${chips}</div>`
      : `<div class="rj-conf-row"><span class="rj-chip rj-chip--na">No extraction yet — run "Re-extract" or key the entry below.</span></div>`;
  }

  // ─────────────────────────────────────────────
  // COA Credit account resolver
  // Default: Cash & Bank (BS_CA_1000)
  // Also supports: Petty Cash, Accounts Payable
  // ─────────────────────────────────────────────
  function resolveCreditAccountForHint(hint) {
    const coa = coaList();
    if (hint === "bank") {
      const hard = coa.find((a) => String(a.code).trim().toUpperCase() === "BS_CA_1000");
      if (hard) return hard;
      const match = coa.find((a) => {
        const name = (a.name || "").toLowerCase();
        return name.includes("bank") || name.includes("cash & bank") || name.includes("cash and cash") || name.includes("current account") || name.includes("cheque");
      });
      if (match) return match;
      return coa.find((a) => String(a.code).trim().toUpperCase() === "BS_CA_1010") || { code: "BS_CA_1000", name: "Cash and Cash Equivalents" };
    } else if (hint === "petty_cash") {
      const match = coa.find((a) => {
        const name = (a.name || "").toLowerCase();
        return name.includes("petty cash") || name.includes("petty") || name.includes("cash float");
      });
      if (match) return match;
      for (const code of ["BS_CA_1020", "BS_CA_1015", "1020", "1015"]) {
        const byCode = coa.find((a) => String(a.code).trim().toUpperCase() === code);
        if (byCode) return byCode;
      }
      return coa.find((a) => String(a.code).trim().toUpperCase() === "BS_CA_1000") || { code: "BS_CA_1020", name: "Petty Cash" };
    } else {
      const match = coa.find((a) => {
        const name = (a.name || "").toLowerCase();
        return name.includes("accounts payable") || name.includes("trade payable") || name.includes("creditor");
      });
      if (match) return match;
      return coa.find((a) => String(a.code).trim().toUpperCase() === "BS_CL_2000") || { code: "BS_CL_2000", name: "Accounts Payable" };
    }
  }

  function lineRowHtml(ln, i, coa) {
    const opts = coa.map((a) =>
      `<option value="${esc(a.code)}" ${String(a.code) === String(ln.account_code) ? "selected" : ""}>${esc(a.code)} — ${esc(a.name)}</option>`).join("");
    const dr = Number(ln.debit) || 0;
    const cr = Number(ln.credit) || 0;
    return `
    <tr data-i="${i}">
      <td style="min-width:210px">
        <input list="rjCoaList" class="rj-acc" value="${esc(ln.account_code || "")}" placeholder="code" ${ln.needs_account && !ln.account_code ? 'style="border-color:#f59e0b"' : ""}>
        <datalist id="rjCoaList">${opts}</datalist>
      </td>
      <td>${esc(ln.account_name || "")}</td>
      <td><input class="rj-num rj-dr" value="${dr ? fmt(dr) : ""}" inputmode="decimal"></td>
      <td><input class="rj-num rj-cr" value="${cr ? fmt(cr) : ""}" inputmode="decimal"></td>
      <td style="min-width:140px"><input class="rj-memo" value="${esc(ln.memo || "")}"></td>
    </tr>`;
  }

  // ─────────────────────────────────────────────
  // 1) General Journal Editor (defaults to Cash & Bank BS_CA_1000 + Petty Cash)
  // ─────────────────────────────────────────────
  function renderEditor(doc) {
    const host = document.getElementById("rjEdit");
    const dj = doc.draft_journal || {};
    const facts = (doc.extracted && doc.extracted.facts) || {};
    const coa = coaList();
    const curHint = (dj.credit_hint || "bank").toLowerCase();

    // Guarantee default credit line is Cash & Bank if not already specified
    let lines = (dj.lines && dj.lines.length ? dj.lines : [{ account_code: "", account_name: "", debit: 0, credit: 0, memo: "" }]);

    const dupBanner = doc.is_duplicate || doc.duplicate_of
      ? `<div class="rj-banner rj-banner--warn" id="rjDupBanner">⚠ Possible duplicate — similar document already captured (doc ${esc(doc.duplicate_of)}). Verify before posting.</div>`
      : `<div class="rj-banner rj-banner--warn" id="rjDupBanner" style="display:none">⚠ Possible duplicate of an earlier document. Verify before posting.</div>`;

    host.innerHTML = `
      ${dupBanner}
      ${confRow(doc)}
      <div class="rj-fgrid">
        <label class="rj-field"><span>Date *</span><input type="date" id="rjDjDate" value="${esc(dj.date || today())}"></label>
        <label class="rj-field"><span>Reference *</span><input id="rjDjRef" value="${esc(dj.ref || `RSCPT-${doc.id}`)}"></label>
        <label class="rj-field"><span>Description</span><input id="rjDjDesc" value="${esc(dj.description || "")}"></label>
        <label class="rj-field"><span>Vendor (from doc)</span><input value="${esc(facts.vendor || "")}" disabled></label>
        <label class="rj-field"><span>Doc total (from doc)</span><input value="${facts.total_amount ? fmt(facts.total_amount) : ""}" disabled></label>
        <label class="rj-field"><span>VAT (from doc)</span><input value="${facts.tax_amount ? fmt(facts.tax_amount) : ""}" disabled></label>
      </div>

      <div class="rj-lines">
        <table>
          <thead><tr><th>Account</th><th>Name</th><th>Debit</th><th>Credit</th><th>Memo</th></tr></thead>
          <tbody id="rjLinesBody">${lines.map((ln, i) => lineRowHtml(ln, i, coa)).join("")}</tbody>
          <tfoot><tr><td colspan="2">Totals</td>
            <td class="rj-num" id="rjTD">0.00</td><td class="rj-num" id="rjTC">0.00</td>
            <td id="rjBal" class="rj-balanced">balanced</td></tr></tfoot>
        </table>
      </div>

      <div class="rj-dup" style="display:flex;gap:12px;align-items:center;margin-top:12px;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:700;color:#1e293b">Payment / Credit Source:</span>
        <label style="font-size:12px;color:#334155;display:flex;gap:6px;align-items:center;cursor:pointer;font-weight:600">
          <input type="radio" name="rjCreditSource" value="bank" ${curHint === "bank" || (!curHint && curHint !== "ap" && curHint !== "petty_cash") ? "checked" : ""}> Cash & Bank (BS_CA_1000)
        </label>
        <label style="font-size:12px;color:#334155;display:flex;gap:6px;align-items:center;cursor:pointer;font-weight:600">
          <input type="radio" name="rjCreditSource" value="petty_cash" ${curHint === "petty_cash" ? "checked" : ""}> Petty Cash
        </label>
        <label style="font-size:12px;color:#334155;display:flex;gap:6px;align-items:center;cursor:pointer">
          <input type="radio" name="rjCreditSource" value="ap" ${curHint === "ap" ? "checked" : ""}> Accounts Payable (AP)
        </label>
      </div>

      <div class="rj-actions">
        <button type="button" class="rj-btn rj-btn--ghost" id="rjAddLine">+ Add line</button>
        <button type="button" class="rj-btn rj-btn--ghost" id="rjReextract">↻ Re-extract</button>
        <button type="button" class="rj-btn rj-btn--teal" id="rjSaveDraft">Save draft</button>
        <button type="button" class="rj-btn rj-btn--solid" id="rjPost">Post to GL</button>
        <button type="button" class="rj-btn rj-btn--danger" id="rjDiscard">Discard</button>
        <span class="rj-msg" id="rjMsg"></span>
      </div>`;

    const recalc = () => {
      let td = 0, tc = 0;
      host.querySelectorAll("#rjLinesBody tr").forEach((tr) => {
        td += parseFloat((tr.querySelector(".rj-dr").value || "0").replace(/[,\s]/g, "")) || 0;
        tc += parseFloat((tr.querySelector(".rj-cr").value || "0").replace(/[,\s]/g, "")) || 0;
      });
      td = Math.round(td * 100) / 100; tc = Math.round(tc * 100) / 100;
      document.getElementById("rjTD").textContent = fmt(td);
      document.getElementById("rjTC").textContent = fmt(tc);
      const ok = Math.abs(td - tc) < 0.01 && td > 0;
      const bal = document.getElementById("rjBal");
      bal.textContent = ok ? "balanced" : (td === 0 && tc === 0 ? "—" : `off by ${fmt(Math.abs(td - tc))}`);
      bal.className = ok ? "rj-balanced" : "rj-unbalanced";
      document.getElementById("rjPost").disabled = !ok;
    };

    // Switching radio immediately swaps the credit account
    host.querySelectorAll('input[name="rjCreditSource"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const hint = radio.value;
        const targetAccount = resolveCreditAccountForHint(hint);
        const rows = host.querySelectorAll("#rjLinesBody tr");
        let creditTr = null;
        rows.forEach((tr) => {
          const crVal = parseFloat((tr.querySelector(".rj-cr").value || "0").replace(/[,\s]/g, "")) || 0;
          if (crVal > 0) creditTr = tr;
        });
        if (!creditTr && rows.length > 0) creditTr = rows[rows.length - 1];
        if (creditTr && targetAccount) {
          const accInp = creditTr.querySelector(".rj-acc");
          const nameTd = creditTr.querySelector("td:nth-child(2)");
          if (accInp) accInp.value = targetAccount.code;
          if (nameTd) nameTd.textContent = targetAccount.name || "";
          recalc();
        }
      });
    });

    host.addEventListener("input", recalc);
    host.querySelector("#rjAddLine").addEventListener("click", () => {
      const tb = host.querySelector("#rjLinesBody");
      tb.insertAdjacentHTML("beforeend", lineRowHtml({ account_code: "", account_name: "", debit: 0, credit: 0, memo: "" }, tb.children.length, coa));
      recalc();
    });

    host.querySelector("#rjReextract").addEventListener("click", async () => {
      const msg = host.querySelector("#rjMsg");
      msg.textContent = "Extracting…";
      try {
        const cid = companyId();
        const creditHint = host.querySelector('input[name="rjCreditSource"]:checked')?.value || "bank";
        const d = await api(`${BASE(cid)}/documents/${doc.id}/extract`, {
          method: "POST",
          body: JSON.stringify({ credit_hint: creditHint }),
        });
        S.current = d; renderEditor(d); await listDocs("journal");
        msg.textContent = "Extraction complete.";
      } catch (e) { msg.textContent = e.message || "Extraction failed"; }
    });

    host.querySelector("#rjSaveDraft").addEventListener("click", async () => {
      const msg = host.querySelector("#rjMsg");
      msg.textContent = "Saving…";
      try {
        const cid = companyId();
        const draft = collectDraft(doc);
        const res = await api(`${BASE(cid)}/documents/${doc.id}/draft`, {
          method: "PUT", body: JSON.stringify({ draft }),
        });
        S.current = Object.assign({}, S.current, { draft_journal: res.draft_journal });
        await listDocs("journal");
        msg.textContent = "Draft saved.";
      } catch (e) { msg.textContent = e.message || "Save failed"; }
    });

    host.querySelector("#rjPost").addEventListener("click", async () => {
      const msg = host.querySelector("#rjMsg");
      const btn = host.querySelector("#rjPost");
      msg.textContent = "Posting…";
      btn.disabled = true;
      try {
        const cid = companyId();
        const draft = collectDraft(doc);
        await api(`${BASE(cid)}/documents/${doc.id}/draft`, {
          method: "PUT", body: JSON.stringify({ draft }),
        });

        const res = await api(`${BASE(cid)}/documents/${doc.id}/post`, { method: "POST" });

        msg.textContent = `Posted — journal ${res.journal_id} (ref ${res.ref})`;

        if (typeof window.renderRecentJournals === "function") {
          try { await window.renderRecentJournals(); } catch (e) { /* non-fatal */ }
        }
        await listDocs("journal");
        setTimeout(closeReview, 1200);
      } catch (e) {
        msg.textContent = e.message || "Post failed";
        btn.disabled = false;
      }
    });

    host.querySelector("#rjDiscard").addEventListener("click", async () => {
      if (!confirm("Discard this document? The file stays stored for audit.")) return;
      try {
        await api(`${BASE(companyId())}/documents/${doc.id}/discard`, { method: "POST" });
        await listDocs("journal");
        closeReview();
      } catch (e) { alert(e.message || "Discard failed"); }
    });

    recalc();
  }

  function collectDraft(doc) {
    const host = document.getElementById("rjEdit");
    const dj = (S.current && S.current.draft_journal) || doc.draft_journal || {};

    const lines = [];
    host.querySelectorAll("#rjLinesBody tr").forEach((tr) => {
      const code = tr.querySelector(".rj-acc").value.trim();
      const dr = parseFloat((tr.querySelector(".rj-dr").value || "0").replace(/[,\s]/g, "")) || 0;
      const cr = parseFloat((tr.querySelector(".rj-cr").value || "0").replace(/[,\s]/g, "")) || 0;
      const memo = tr.querySelector(".rj-memo").value.trim();
      if (!code && dr === 0 && cr === 0) return;
      const acc = coaList().find((a) => String(a.code) === code);
      lines.push({
        account_code: code,
        account_name: acc ? acc.name : (tr.querySelector("td:nth-child(2)").textContent || ""),
        debit: Math.round(dr * 100) / 100,
        credit: Math.round(cr * 100) / 100,
        memo,
      });
    });

    const vatLine = lines.find((l) => /vat/i.test(l.memo || "")) || null;
    const vat = vatLine ? vatLine.debit : Number(dj.vat_amount || 0);
    const creditHint = host.querySelector('input[name="rjCreditSource"]:checked')?.value || "bank";

    return {
      date: host.querySelector("#rjDjDate").value || today(),
      ref: host.querySelector("#rjDjRef").value.trim() || `RSCPT-${doc.id}`,
      description: host.querySelector("#rjDjDesc").value.trim(),
      currency: (window.CURRENT_CURRENCY || dj.currency || "ZAR").toUpperCase(),
      vat_amount: Math.round(vat * 100) / 100,
      credit_hint: creditHint,
      lines,
    };
  }

  // ─────────────────────────────────────────────
  // 2) Supplier Bill / AP Editor (matches Bill/AP flow)
  // ─────────────────────────────────────────────
  function renderApBillEditor(doc) {
    const host = document.getElementById("rjEdit");
    const facts = (doc.extracted && doc.extracted.facts) || {};
    const coa = coaList();
    const vendors = Array.isArray(window.VENDORS_CACHE) ? window.VENDORS_CACHE : [];

    const docVendor = (facts.vendor || "").trim();
    let matchedVendor = null;
    if (docVendor) {
      const clean = docVendor.toLowerCase().replace(/[^a-z0-9]/g, "");
      matchedVendor = vendors.find((v) => {
        const vn = (v.name || v.vendor_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return vn && (vn.includes(clean) || clean.includes(vn));
      });
    }

    const docDate = facts.doc_date || today();
    const docNo = facts.doc_no || "";
    const currency = facts.currency || window.CURRENT_COMPANY?.currency || "USD";
    const total = Number(facts.total_amount || 0);
    const tax = Number(facts.tax_amount || 0);
    const vatRate = Number(facts.vat_rate_percent || (tax > 0 && total > tax ? Math.round((tax / (total - tax)) * 100) : (tax > 0 ? 15 : 0)));

    const rawLines = facts.line_items && facts.line_items.length ? facts.line_items : [
      {
        item_name: docVendor ? `${docVendor} supplies` : "Supplier Bill",
        description: facts.doc_no ? `Invoice #${facts.doc_no}` : "Supplier expense",
        quantity: 1,
        unit_price: total > tax && tax > 0 ? _round2(total - tax) : total,
        total: total > tax && tax > 0 ? _round2(total - tax) : total,
        account_code: "PL_OPEX_6002",
      },
    ];

    const dupBanner = doc.is_duplicate || doc.duplicate_of
      ? `<div class="rj-banner rj-banner--warn">⚠ Possible duplicate — similar document already captured. Verify before applying.</div>`
      : "";

    const vendorOptions = vendors.map((v) => `<option value="${esc(v.name || v.vendor_name)}" data-id="${v.id}"></option>`).join("");
    const coaOptions = coa.map((a) => `<option value="${esc(a.code)}">${esc(a.code)} — ${esc(a.name)}</option>`).join("");

    host.innerHTML = `
      ${dupBanner}
      ${confRow(doc)}
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <span style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.04em">Bill / AP Extraction</span>
          <div style="font-size:13px;font-weight:600;color:#14532d">Review extracted supplier details and apply directly to the AP bill form.</div>
        </div>
        <span class="rj-chip rj-chip--high" style="background:#dcfce7;color:#15803d">AP Flow</span>
      </div>

      <div class="rj-fgrid">
        <label class="rj-field">
          <span>Vendor Name *</span>
          <input list="rjVendorsList" id="rjApVendor" value="${esc(matchedVendor ? (matchedVendor.name || matchedVendor.vendor_name) : docVendor)}" placeholder="Search / enter vendor">
          <datalist id="rjVendorsList">${vendorOptions}</datalist>
          ${matchedVendor ? `<small style="color:#166534;font-size:10.5px">✓ Matched vendor #${matchedVendor.id}</small>` : `<small style="color:#64748b;font-size:10.5px">Type to match existing vendor</small>`}
        </label>
        <label class="rj-field">
          <span>Bill / Invoice # *</span>
          <input id="rjApBillNo" value="${esc(docNo)}" placeholder="e.g. INV-10023">
        </label>
        <label class="rj-field">
          <span>Bill Date *</span>
          <input type="date" id="rjApDate" value="${esc(docDate)}">
        </label>
        <label class="rj-field">
          <span>Due Terms</span>
          <select id="rjApDueTerms">
            <option value="7">7 days</option>
            <option value="15">15 days</option>
            <option value="30" selected>30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </select>
        </label>
        <label class="rj-field">
          <span>Currency</span>
          <input id="rjApCurrency" value="${esc(currency)}">
        </label>
        <label class="rj-field">
          <span>Total (from doc)</span>
          <input id="rjApTotal" value="${total ? fmt(total) : '0.00'}" style="font-weight:700;color:#0b3a63" disabled>
        </label>
      </div>

      <div style="display:flex;gap:16px;margin:8px 0 10px;align-items:center;flex-wrap:wrap">
        <label style="font-size:12px;color:#334155;display:flex;gap:6px;align-items:center;cursor:pointer">
          <input type="checkbox" id="rjApVatEnabled" ${tax > 0 || vatRate > 0 ? "checked" : ""}> Transaction is VATable
        </label>
        <label style="font-size:12px;color:#334155;display:flex;gap:6px;align-items:center">
          VAT Mode:
          <select id="rjApVatMode" style="border:1px solid #cbd5e1;border-radius:6px;padding:3px 8px;font-size:11.5px">
            <option value="inclusive" selected>VAT Inclusive</option>
            <option value="exclusive">VAT Exclusive</option>
          </select>
        </label>
      </div>

      <div class="rj-lines">
        <table>
          <thead>
            <tr>
              <th style="min-width:140px">Item / Desc</th>
              <th style="width:60px">Qty</th>
              <th style="width:95px">Unit Price</th>
              <th style="min-width:170px">Expense Account</th>
              <th style="width:85px;text-align:right">Total</th>
            </tr>
          </thead>
          <tbody id="rjApLinesBody">
            ${rawLines.map((ln, i) => `
              <tr data-i="${i}">
                <td><input class="rj-item-desc" value="${esc(ln.description || ln.item_name || '')}" placeholder="Item description"></td>
                <td><input class="rj-num rj-item-qty" value="${ln.quantity || 1}" type="number" min="0" step="any"></td>
                <td><input class="rj-num rj-item-price" value="${fmt(ln.unit_price || ln.total || 0)}" inputmode="decimal"></td>
                <td>
                  <input list="rjCoaApList" class="rj-item-acc" value="${esc(ln.account_code || 'PL_OPEX_6002')}" placeholder="Account code">
                  <datalist id="rjCoaApList">${coaOptions}</datalist>
                </td>
                <td class="rj-num rj-item-total" style="font-weight:700;color:#0b3a63">${fmt((Number(ln.quantity || 1)) * (Number(ln.unit_price || ln.total || 0)))}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4">Total Bill Amount</td>
              <td class="rj-num" id="rjApComputedTotal" style="font-size:13px;font-weight:800;color:#0b3a63">${fmt(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="rj-actions" style="margin-top:16px">
        <button type="button" class="rj-btn rj-btn--green" id="rjApplyToBill" style="padding:9px 18px">
          ✔ Apply to Bill Form
        </button>
        <button type="button" class="rj-btn rj-btn--teal" id="rjSaveDraftBill">
          💾 Save as Draft Bill
        </button>
        <button type="button" class="rj-btn rj-btn--ghost" id="rjApReextract">
          ↻ Re-extract
        </button>
        <button type="button" class="rj-btn rj-btn--danger" id="rjApDiscard">
          Discard
        </button>
        <span class="rj-msg" id="rjApMsg"></span>
      </div>
    `;

    const recalcAp = () => {
      let sum = 0;
      host.querySelectorAll("#rjApLinesBody tr").forEach((tr) => {
        const q = parseFloat((tr.querySelector(".rj-item-qty").value || "1").replace(/[,\s]/g, "")) || 0;
        const p = parseFloat((tr.querySelector(".rj-item-price").value || "0").replace(/[,\s]/g, "")) || 0;
        const lineTot = Math.round(q * p * 100) / 100;
        tr.querySelector(".rj-item-total").textContent = fmt(lineTot);
        sum += lineTot;
      });
      sum = Math.round(sum * 100) / 100;
      document.getElementById("rjApComputedTotal").textContent = fmt(sum);
    };

    host.addEventListener("input", (e) => {
      if (e.target.classList.contains("rj-item-qty") || e.target.classList.contains("rj-item-price")) {
        recalcAp();
      }
    });

    host.querySelector("#rjApplyToBill").addEventListener("click", async () => {
      const msg = host.querySelector("#rjApMsg");
      msg.textContent = "Applying to bill form…";
      try {
        const edited = collectApFormData(host);
        await applyDocToApBillForm(doc, edited);
        msg.textContent = "Applied to Bill form!";
        await listDocs("ap");
        setTimeout(closeReview, 600);
      } catch (err) {
        msg.textContent = err.message || "Failed to apply";
      }
    });

    host.querySelector("#rjSaveDraftBill").addEventListener("click", async () => {
      const msg = host.querySelector("#rjApMsg");
      msg.textContent = "Saving draft bill…";
      try {
        const edited = collectApFormData(host);
        await applyDocToApBillForm(doc, edited);
        if (typeof window.saveBillDraft === "function") {
          await window.saveBillDraft("draft");
        }
        msg.textContent = "Draft bill saved!";
        await listDocs("ap");
        setTimeout(closeReview, 1000);
      } catch (err) {
        msg.textContent = err.message || "Failed to save draft bill";
      }
    });

    host.querySelector("#rjApReextract").addEventListener("click", async () => {
      const msg = host.querySelector("#rjApMsg");
      msg.textContent = "Extracting…";
      try {
        const cid = companyId();
        const d = await api(`${BASE(cid)}/documents/${doc.id}/extract`, {
          method: "POST",
          body: JSON.stringify({ credit_hint: "ap" }),
        });
        S.current = d;
        renderApBillEditor(d);
        await listDocs("ap");
        msg.textContent = "Extraction complete.";
      } catch (e) {
        msg.textContent = e.message || "Extraction failed";
      }
    });

    host.querySelector("#rjApDiscard").addEventListener("click", async () => {
      if (!confirm("Discard this document? The file stays stored for audit.")) return;
      try {
        await api(`${BASE(companyId())}/documents/${doc.id}/discard`, { method: "POST" });
        await listDocs("ap");
        closeReview();
      } catch (e) {
        alert(e.message || "Discard failed");
      }
    });
  }

  function collectApFormData(host) {
    const vendorName = (host.querySelector("#rjApVendor").value || "").trim();
    const vendors = Array.isArray(window.VENDORS_CACHE) ? window.VENDORS_CACHE : [];
    const clean = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const matched = vendors.find((v) => {
      const vn = (v.name || v.vendor_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return vn && (vn.includes(clean) || clean.includes(vn));
    });

    const lines = [];
    host.querySelectorAll("#rjApLinesBody tr").forEach((tr) => {
      const desc = (tr.querySelector(".rj-item-desc").value || "").trim();
      const qty = parseFloat((tr.querySelector(".rj-item-qty").value || "1").replace(/[,\s]/g, "")) || 1;
      const price = parseFloat((tr.querySelector(".rj-item-price").value || "0").replace(/[,\s]/g, "")) || 0;
      const acc = (tr.querySelector(".rj-item-acc").value || "PL_OPEX_6002").trim();
      if (desc || price > 0) {
        lines.push({
          item_name: desc || "Supplies",
          description: desc,
          quantity: qty,
          unit_price: price,
          account_code: acc,
          vat_rate: host.querySelector("#rjApVatEnabled").checked ? 15 : 0,
        });
      }
    });

    return {
      vendorId: matched ? matched.id : null,
      vendorName: matched ? (matched.name || matched.vendor_name) : vendorName,
      billNumber: (host.querySelector("#rjApBillNo").value || "").trim(),
      billDate: host.querySelector("#rjApDate").value || today(),
      dueTerms: host.querySelector("#rjApDueTerms").value || "30",
      currency: (host.querySelector("#rjApCurrency").value || "USD").trim().toUpperCase(),
      vatEnabled: host.querySelector("#rjApVatEnabled").checked,
      vatMode: host.querySelector("#rjApVatMode").value || "inclusive",
      vatRate: host.querySelector("#rjApVatEnabled").checked ? 15 : 0,
      lines,
    };
  }

  async function applyDocToApBillForm(doc, editedData) {
    const root = typeof getBillRoot === "function" ? getBillRoot() : document;

    let vendorId = editedData.vendorId || null;
    const vendorName = editedData.vendorName || (doc.extracted?.facts?.vendor || "").trim();

    if (!vendorId && vendorName) {
      const list = Array.isArray(window.VENDORS_CACHE) ? window.VENDORS_CACHE : [];
      const clean = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = list.find((v) => {
        const vName = (v.name || v.vendor_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return vName && (vName.includes(clean) || clean.includes(vName));
      });
      if (match) {
        vendorId = match.id;
      }
    }

    if (typeof window.clearBillForm === "function") {
      window.clearBillForm({ keepCurrency: true });
    }

    if (typeof window.writeBillForm === "function") {
      window.writeBillForm({
        vendor_id: vendorId || null,
        vendorName: vendorName,
        bill_date: editedData.billDate || doc.extracted?.facts?.doc_date || today(),
        number: editedData.billNumber || doc.extracted?.facts?.doc_no || "",
        currency: editedData.currency || doc.extracted?.facts?.currency || window.CURRENT_COMPANY?.currency || "USD",
        notes: `Scanned document #${doc.id}: ${doc.original_name || ""}`.trim(),
      });
    }

    const vendorEl = root.querySelector("#billVendor");
    const vendorIdEl = root.querySelector("#billVendorId");
    if (vendorIdEl && vendorId) vendorIdEl.value = String(vendorId);
    if (vendorEl && vendorName) vendorEl.value = vendorName;

    const vatEnabledEl = root.querySelector("#apBillVatEnabled");
    const vatModeEl = root.querySelector("#apBillVatMode");
    if (vatEnabledEl) vatEnabledEl.checked = editedData.vatEnabled;
    if (vatModeEl && editedData.vatMode) vatModeEl.value = editedData.vatMode;

    if (!Array.isArray(window.BILL_ACCOUNTS_CACHE) || !window.BILL_ACCOUNTS_CACHE.length) {
      await window.loadBillAccountsForLines?.();
    }
    window.refreshBillAccountDropdowns?.();

    const linesBody = root.querySelector("#billLines");
    if (linesBody) linesBody.innerHTML = "";

    const linesToAdd = editedData.lines && editedData.lines.length ? editedData.lines : [{
      item_name: vendorName || "Supplies",
      description: `Invoice ${editedData.billNumber || doc.id}`,
      quantity: 1,
      unit_price: Number(doc.extracted?.facts?.total_amount || 0),
      account_code: "PL_OPEX_6002",
      vat_code: editedData.vatRate > 0 ? "STANDARD" : "ZERO",
      vat_rate: editedData.vatRate,
    }];

    for (const line of linesToAdd) {
      if (typeof window.addBillLine === "function") {
        window.addBillLine({
          item_name: line.item_name || vendorName || "Supplies",
          description: line.description || "",
          quantity: Number(line.quantity || 1),
          unit_price: Number(line.unit_price || 0),
          account_code: line.account_code || "PL_OPEX_6002",
          vat_code: (Number(line.vat_rate || editedData.vatRate) > 0) ? "STANDARD" : "ZERO",
          vat_rate: Number(line.vat_rate || editedData.vatRate || 0),
        });
      }
    }

    const cid = companyId();
    try {
      await api(`${BASE(cid)}/documents/${doc.id}/apply-bill`, {
        method: "POST",
        body: JSON.stringify({ bill_id: null }),
      });
    } catch (e) {
      console.warn("[receipt-journal] could not mark doc applied", e);
    }

    const billPane = root.querySelector("#apBillPane");
    if (billPane) {
      billPane.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // ─────────────────────────────────────────────
  // boot
  // ─────────────────────────────────────────────
  ready(function () {
    const journalScreen = document.getElementById("screen-journal");
    const apScreen = document.getElementById("screen-ap");

    if (!journalScreen && !apScreen) return;
    if (!window.apiFetch || !window.getToken) {
      console.warn("[receipt-journal] apiFetch/token not ready — retrying in 1.5s");
      setTimeout(ready.bind(null, arguments.callee), 1500);
      return;
    }

    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    // 1. Mount Journal Scan Panel if on journal screen
    if (journalScreen) {
      const mount = document.getElementById("receiptScanMount");
      if (mount) {
        mount.innerHTML = panelMarkup("journal");
      } else {
        const host = journalScreen.querySelector(".cc-card") || journalScreen.firstElementChild;
        const wrap = document.createElement("div");
        wrap.innerHTML = panelMarkup("journal");
        (host && host.parentElement ? host.parentElement : journalScreen).insertBefore(wrap, host || journalScreen.firstChild);
      }

      const toggle = document.getElementById("receiptScanToggle");
      const rj = document.getElementById("rjPanel");
      if (toggle && rj) {
        if (!toggle.checked) {
          if (mount) mount.style.display = "none";
          rj.style.display = "none";
        }
        toggle.addEventListener("change", () => {
          if (toggle.checked) listDocs("journal").catch(() => {});
        });
      }

      bindUpload("journal");

      const obsJournal = new MutationObserver(() => {
        if (!journalScreen.classList.contains("hidden")) listDocs("journal").catch(() => {});
      });
      obsJournal.observe(journalScreen, { attributes: true, attributeFilter: ["class"] });
    }

    // 2. Mount Bill / AP Scan Panel if on AP screen
    if (apScreen) {
      const apMount = document.getElementById("apBillScanMount");
      if (apMount) {
        apMount.innerHTML = panelMarkup("ap");
      } else {
        const billPane = apScreen.querySelector("#apBillPane");
        const wrap = document.createElement("div");
        wrap.innerHTML = panelMarkup("ap");
        if (billPane && billPane.parentElement) {
          billPane.parentElement.insertBefore(wrap, billPane);
        } else {
          apScreen.appendChild(wrap);
        }
      }

      // Add shortcut button in apTopRow
      const topRow = apScreen.querySelector("#apTopRow .flex.gap-2");
      if (topRow && !document.getElementById("btnToggleBillScan")) {
        const btn = document.createElement("button");
        btn.id = "btnToggleBillScan";
        btn.type = "button";
        btn.className = "btn";
        btn.style.cssText = "background:#f0fdf4;color:#15803d;border:1px solid #86efac;font-weight:600";
        btn.innerHTML = `📎 Scan / Attach Bill (PDF/Image)`;
        btn.addEventListener("click", () => {
          const panel = document.getElementById("rjApPanel");
          if (panel) {
            panel.scrollIntoView({ behavior: "smooth", block: "center" });
            document.getElementById("rjApFile")?.click();
          }
        });
        topRow.appendChild(btn);
      }

      bindUpload("ap");

      const obsAp = new MutationObserver(() => {
        if (!apScreen.classList.contains("hidden") && (apScreen.classList.contains("active") || apScreen.style.display !== "none")) {
          listDocs("ap").catch(() => {});
        }
      });
      obsAp.observe(apScreen, { attributes: true, attributeFilter: ["class"] });
    }

    listDocs("all").catch((e) => console.warn("[receipt-journal] list failed", e));
    console.log("[receipt-journal] Dual Journal & Bill AP scan modules ready");
  });
})();
