/*
 * static/js/receipt-journal.js  —  FinSage Receipt-scan → Draft journal panel
 *
 * Load AFTER dashboard.js (it uses window.apiFetch / window.getToken).
 * Self-injects a "Receipt / bill scan" card at the top of #screen-journal —
 * no markup edits to dashboard.html and ZERO changes to dashboard.js.
 *
 * Flow:
 *   capture (camera on mobile) or pick file → upload → extract (AI/OCR)
 *   → side-by-side document preview + editable draft lines (confidence chips)
 *   → Save draft / Post to GL (via the REAL /api/companies/<cid>/journal engine
 *     called server-side by receipt_scan_routes with source="receipt_scan")
 *   → refreshes Posted Journals.
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
    discarded: ["rj-st--di", "Discarded"],
  };

  // ─────────────────────────────────────────────
  // styles (scoped, no clashes)
  // ─────────────────────────────────────────────
  const CSS = `
  #rjPanel{margin:0 0 18px;border:1px solid #dbe4ef;border-radius:14px;background:#fff;overflow:hidden;
           box-shadow:0 8px 22px -16px rgba(0,40,79,.35);font-family:inherit}
  #rjPanel .rj-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#f4f8fc;border-bottom:1px solid #e6edf5}
  #rjPanel .rj-head h3{margin:0;font-size:14.5px;font-weight:700;color:#0b3a63}
  #rjPanel .rj-head p{margin:0;font-size:11.5px;color:#64748b}
  #rjPanel .rj-body{padding:16px}
  .rj-drop{border:2px dashed #b9c8da;border-radius:12px;padding:22px;text-align:center;color:#64748b;
           background:#fbfdff;cursor:pointer;transition:border-color .15s,background .15s}
  .rj-drop:hover,.rj-drop.is-over{border-color:#00a8a8;background:#f2fbfb;color:#0b3a63}
  .rj-drop b{color:#0b3a63}
  .rj-drop .rj-dhint{font-size:11px;margin-top:4px;color:#94a3b8}
  #rjPanel input[type=file]{display:none}
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
  .rj-btn--ghost{background:#eef2f7;color:#334155}.rj-btn--danger{background:#fee2e2;color:#991b1b}
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
  function panelMarkup() {
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
  const S = { docs: [], current: null, blobUrl: null };

  const BASE = (cid) => `/api/companies/${encodeURIComponent(cid)}/receipt-scan`;

  async function listDocs() {
    const cid = companyId();
    if (!cid) return;
    const d = await api(`${BASE(cid)}/documents?limit=12`);
    S.docs = (d && d.documents) || [];
    renderList();
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
  function bindUpload() {
    const drop = document.getElementById("rjDrop");
    const file = document.getElementById("rjFile");
    const cam = document.getElementById("rjCamera");
    const camBtn = document.getElementById("rjCamBtn");
    const msg = document.getElementById("rjUpdMsg");

    const handle = async (f) => {
      if (!f) return;
      msg.textContent = `Uploading ${f.name}…`;
      const fd = new FormData();
      fd.append("file", f, f.name);
      try {
        const res = await api(`${BASE(companyId())}/upload`, { method: "POST", body: fd });
        msg.textContent = "";
        await listDocs();
        openReview(res.doc_id);
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
    camBtn.addEventListener("click", () => cam.click());
    cam.addEventListener("change", () => { handle(cam.files[0]); cam.value = ""; });

    ["dragover", "dragenter"].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
    drop.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handle(f);
    });
  }

  function renderList() {
    const host = document.getElementById("rjList");
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
      <div class="rj-row" data-doc="${d.id}">
        <span class="rj-st ${cls}">${label}</span>
        <span class="rj-name">${esc(d.original_name || `Document ${d.id}`)}</span>
        <span class="rj-meta">${meta}</span>
        ${d.status === "posted" && d.journal_id ? `<span class="rj-meta">Jrnl ${d.journal_id}</span>` : ""}
        <span class="rj-amt">${d.total_amount ? fmt(d.total_amount) : ""}</span>
      </div>`;
    }).join("");

    host.querySelectorAll("[data-doc]").forEach((row) =>
      row.addEventListener("click", () => openReview(Number(row.dataset.doc))));
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

  async function openReview(docId) {
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
      `${doc.doc_type === "supplier_invoice" ? "Tax invoice" : "Receipt"} · ${doc.original_name || doc.id}`;

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

    renderEditor(doc);
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

  function renderEditor(doc) {
    const host = document.getElementById("rjEdit");
    const dj = doc.draft_journal || {};
    const facts = (doc.extracted && doc.extracted.facts) || {};
    const coa = coaList();
    const lines = (dj.lines && dj.lines.length ? dj.lines : [{ account_code: "", account_name: "", debit: 0, credit: 0, memo: "" }]);

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
      <div class="rj-actions">
        <button type="button" class="rj-btn rj-btn--ghost" id="rjAddLine">+ Add line</button>
        <button type="button" class="rj-btn rj-btn--ghost" id="rjReextract">↻ Re-extract</button>
        <button type="button" class="rj-btn rj-btn--teal" id="rjSaveDraft">Save draft</button>
        <button type="button" class="rj-btn rj-btn--solid" id="rjPost">Post to GL</button>
        <button type="button" class="rj-btn rj-btn--danger" id="rjDiscard">Discard</button>
        <span class="rj-msg" id="rjMsg"></span>
      </div>
      <div class="rj-dup" style="display:flex;gap:8px;align-items:center;margin-top:10px">
        <label style="font-size:12px;color:#475569;display:flex;gap:6px;align-items:center">
          <input type="checkbox" id="rjPaidBank"> Paid from bank (credit bank instead of Accounts payable)
        </label>
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
        const creditHint = host.querySelector("#rjPaidBank").checked ? "bank" : "ap";
        const d = await api(`${BASE(cid)}/documents/${doc.id}/extract`, {
          method: "POST",
          body: JSON.stringify({ credit_hint: creditHint }),
        });
        S.current = d; renderEditor(d); await listDocs();
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
        await listDocs();
        msg.textContent = "Draft saved.";
      } catch (e) { msg.textContent = e.message || "Save failed"; }
    });

    host.querySelector("#rjPost").addEventListener("click", async () => {
      const msg = host.querySelector("#rjMsg");
      const btn = host.querySelector("#rjPost");
      msg.textContent = "Posting…";
      btn.disabled = true;
      try {
        // 1) persist the reviewed/edited draft first
        const cid = companyId();
        const draft = collectDraft(doc);
        await api(`${BASE(cid)}/documents/${doc.id}/draft`, {
          method: "PUT", body: JSON.stringify({ draft }),
        });

        // 2) post through the REAL engine (server-side, source="receipt_scan")
        const res = await api(`${BASE(cid)}/documents/${doc.id}/post`, { method: "POST" });

        msg.textContent = `Posted — journal ${res.journal_id} (ref ${res.ref})`;

        // 3) refresh surfaces, mirror of postJournalBatch success path
        if (typeof window.renderRecentJournals === "function") {
          try { await window.renderRecentJournals(); } catch (e) { /* non-fatal */ }
        }
        await listDocs();
        setTimeout(closeReview, 1200);
      } catch (e) {
        msg.textContent = e.message || "Post failed";
        btn.disabled = false;
      }
    });

    host.querySelector("#rjDiscard").addEventListener("click", async () => {
      if (!confirm("Discard this document? The file stays stored for audit.")) return;
      const msg = host.querySelector("#rjMsg");
      try {
        await api(`${BASE(companyId())}/documents/${doc.id}/discard`, { method: "POST" });
        await listDocs();
        closeReview();
      } catch (e) { msg.textContent = e.message || "Discard failed"; }
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

    return {
      date: host.querySelector("#rjDjDate").value || today(),
      ref: host.querySelector("#rjDjRef").value.trim() || `RSCPT-${doc.id}`,
      description: host.querySelector("#rjDjDesc").value.trim(),
      currency: (window.CURRENT_CURRENCY || dj.currency || "ZAR").toUpperCase(),
      vat_amount: Math.round(vat * 100) / 100,
      credit_hint: host.querySelector("#rjPaidBank").checked ? "bank" : "ap",
      lines,
    };
  }

  // ─────────────────────────────────────────────
  // boot
  // ─────────────────────────────────────────────
  ready(function () {
    const screen = document.getElementById("screen-journal");
    if (!screen) return; // journal screen not present (role-restricted builds)
    if (!window.apiFetch || !window.getToken) {
      console.warn("[receipt-journal] apiFetch/token not ready — retrying in 1.5s");
      setTimeout(ready.bind(null, arguments.callee), 1500);
      return;
    }

    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const host = screen.querySelector(".cc-card") || screen.firstElementChild;
    const wrap = document.createElement("div");
    wrap.innerHTML = panelMarkup();
    (host && host.parentElement ? host.parentElement : screen).insertBefore(wrap, host || screen.firstChild);

    bindUpload();
    listDocs().catch((e) => console.warn("[receipt-journal] list failed", e));

    // refresh the doc list whenever the journal screen becomes visible
    const obs = new MutationObserver(() => {
      if (!screen.classList.contains("hidden")) listDocs().catch(() => {});
    });
    obs.observe(screen, { attributes: true, attributeFilter: ["class"] });

    console.log("[receipt-journal] panel ready");
  });
})();
