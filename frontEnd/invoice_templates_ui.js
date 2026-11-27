// frontEnd/invoice_templates_ui.js
// FinSage - Custom Invoice Templates Workspace (v2)
// Full-screen side-by-side: Template Designer (left) + Live Preview (right)
(function () {
  "use strict";

  function getCid() {
    return (
      (typeof window.getActiveCompanyId === "function" && window.getActiveCompanyId()) ||
      window.CURRENT_COMPANY_ID ||
      localStorage.getItem("CURRENT_COMPANY_ID") ||
      localStorage.getItem("company_id") ||
      "1"
    );
  }

  function esc(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  let templatesState = [];
  let presetsState = [];
  let currentEditingId = null;

  // ── Expanded color palettes ─────────────────────────────────
  // Professional, brand-ready color schemes grouped by mood.
  var PRIMARY_PALETTES = [
    // Classic / Corporate
    { name: "Navy",        color: "#0F2A3D" },
    { name: "Royal Blue",  color: "#1E40AF" },
    { name: "Slate",       color: "#334155" },
    { name: "Charcoal",    color: "#18181B" },
    { name: "Graphite",    color: "#374151" },
    // Earth / Warm
    { name: "Espresso",    color: "#451A03" },
    { name: "Forest",      color: "#064E3B" },
    { name: "Olive",       color: "#3F6212" },
    { name: "Rust",        color: "#9A3412" },
    { name: "Bronze",      color: "#78350F" },
    // Bold / Vibrant
    { name: "Crimson",     color: "#881337" },
    { name: "Burgundy",    color: "#7F1D1D" },
    { name: "Plum",        color: "#581C87" },
    { name: "Indigo",      color: "#3730A3" },
    { name: "Teal Dark",   color: "#115E59" },
    // Modern / Cool
    { name: "Deep Sky",    color: "#0C4A6E" },
    { name: "Cobalt",      color: "#1E3A8A" },
    { name: "Midnight",    color: "#0C0A09" },
    { name: "Steel",       color: "#475569" },
    { name: "Gunmetal",    color: "#1F2937" },
  ];

  var ACCENT_PALETTES = [
    // Bright / Energetic
    { name: "Teal",        color: "#2FA4A9" },
    { name: "Emerald",     color: "#10B981" },
    { name: "Amber",       color: "#F59E0B" },
    { name: "Coral",       color: "#F97316" },
    { name: "Rose",        color: "#F43F5E" },
    { name: "Lime",        color: "#84CC16" },
    { name: "Cyan",        color: "#06B6D4" },
    { name: "Magenta",     color: "#D946EF" },
    { name: "Violet",     color: "#8B5CF6" },
    { name: "Sky",         color: "#0EA5E9" },
    // Warm / Gold
    { name: "Gold",        color: "#D4A017" },
    { name: "Sunset",      color: "#EF4444" },
    { name: "Pumpkin",     color: "#FB923C" },
    { name: "Saffron",     color: "#EAB308" },
    { name: "Copper",      color: "#B45309" },
    // Cool / Subtle
    { name: "Mint",        color: "#34D399" },
    { name: "Turquoise",  color: "#14B8A6" },
    { name: "Azure",       color: "#3B82F6" },
    { name: "Indigo Lt",   color: "#6366F1" },
    { name: "Fuchsia",    color: "#C026D3" },
  ];

  // ── API calls ──────────────────────────────────────────────
  async function fetchTemplates() {
    const cid = getCid();
    try {
      const res = await window.apiFetch(`/api/companies/${cid}/invoice-templates`);
      if (res && res.templates) {
        templatesState = res.templates;
        presetsState = res.presets || [];
      }
    } catch (err) {
      console.warn("[InvoiceTemplates] Fetch failed:", err);
    }
  }

  // ── Render templates list ──────────────────────────────────
  function renderTemplatesList() {
    const host = document.getElementById("itTemplatesListHost");
    if (!host) return;

    if (!templatesState.length) {
      host.innerHTML = `
        <div style="padding:24px;text-align:center;color:#94a3b8;background:#f8fafc;border-radius:12px;border:1.5px dashed #cbd5e1;">
          <div style="font-size:24px;margin-bottom:8px;">📄</div>
          <p style="font-weight:600;color:#64748b;margin:0 0 4px;">No custom templates yet.</p>
          <p style="font-size:12px;color:#94a3b8;margin:0;">Click a preset above or start designing below.</p>
        </div>
      `;
      return;
    }

    host.innerHTML = templatesState
      .map((t) => {
        const isDef = t.is_default;
        const pCol = t.primary_color || "#0F2A3D";
        const aCol = t.accent_color || "#2FA4A9";

        return `
        <div style="padding:14px;border-radius:12px;border:1px solid ${isDef ? "#10b981" : "#e2e8f0"};background:${isDef ? "#f0fdf4" : "#fff"};display:flex;flex-direction:column;gap:10px;transition:box-shadow .15s ease,transform .15s ease;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.08)';this.style.transform='translateY(-1px)'" onmouseout="this.style.boxShadow='';this.style.transform=''">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="width:14px;height:14px;border-radius:50%;display:inline-block;border:1px solid #e2e8f0;background:${pCol};"></span>
                <span style="width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid #e2e8f0;background:${aCol};"></span>
                <span style="font-weight:700;font-size:13px;color:#0f172a;">${esc(t.template_name)}</span>
              </div>
              <div style="font-size:11px;color:#64748b;margin-left:30px;text-transform:capitalize;">${esc(t.layout_style || "modern")} &middot; ${esc(t.font_family || "Helvetica")}</div>
            </div>
            ${
              isDef
                ? `<span style="padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;">★ DEFAULT</span>`
                : `<button type="button" class="it-set-default-btn" data-id="${t.id}" style="font-size:11px;font-weight:600;color:#475569;background:#f1f5f9;padding:3px 8px;border-radius:6px;border:none;cursor:pointer;">Set Default</button>`
            }
          </div>
          <div style="font-size:11px;color:#475569;background:#f8fafc;padding:8px 10px;border-radius:8px;border:1px solid #f1f5f9;">
            <div><strong>Bank:</strong> ${esc(t.bank_name || "Company Default")} ${t.bank_account_number ? `(${esc(t.bank_account_number)})` : ""}</div>
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><strong>Terms:</strong> ${esc(t.payment_terms_note || "Standard 30 Days")}</div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid #f1f5f9;">
            <button type="button" class="it-edit-btn" data-id="${t.id}" style="font-size:12px;font-weight:600;color:#2563eb;border:none;background:transparent;cursor:pointer;">✏️ Edit</button>
            ${
              !isDef
                ? `<button type="button" class="it-delete-btn" data-id="${t.id}" style="font-size:12px;font-weight:600;color:#ef4444;border:none;background:transparent;cursor:pointer;">🗑️ Delete</button>`
                : `<span style="font-size:10px;color:#94a3b8;">Default template</span>`
            }
          </div>
        </div>
      `;
      })
      .join("");

    // Bind list buttons
    host.querySelectorAll(".it-set-default-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        await setDefaultTemplate(id);
      });
    });

    host.querySelectorAll(".it-edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id;
        editTemplate(id);
      });
    });

    host.querySelectorAll(".it-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        if (confirm("Are you sure you want to delete this invoice template?")) {
          await deleteTemplate(id);
        }
      });
    });
  }

  // ── Render presets ─────────────────────────────────────────
  function renderPresets() {
    const host = document.getElementById("itPresetsHost");
    if (!host || !presetsState.length) return;

    host.innerHTML = presetsState
      .map(
        (p) => `
        <div class="it-preset-card" data-preset="${p.preset_id}" style="padding:10px 12px;background:#fff;border-radius:10px;border:1px solid #e2e8f0;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;transition:border-color .15s ease,box-shadow .15s ease;" onmouseover="this.style.borderColor='#94a3b8';this.style.boxShadow='0 2px 8px rgba(0,0,0,.06)'" onmouseout="this.style.borderColor='#e2e8f0';this.style.boxShadow=''">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="display:flex;gap:-2px;">
              <span style="width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #e2e8f0;background:${p.primary_color};"></span>
              <span style="width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #e2e8f0;background:${p.accent_color};margin-left:-4px;"></span>
            </div>
            <div>
              <div style="font-size:12px;font-weight:700;color:#1e293b;">${esc(p.name)}</div>
              <div style="font-size:10px;color:#94a3b8;text-transform:capitalize;">${p.layout_style} layout</div>
            </div>
          </div>
          <span style="font-size:11px;font-weight:700;color:#64748b;background:#f1f5f9;padding:3px 8px;border-radius:6px;">Use</span>
        </div>
      `
      )
      .join("");

    host.querySelectorAll(".it-preset-card").forEach((card) => {
      card.addEventListener("click", () => {
        const pId = card.dataset.preset;
        const found = presetsState.find((x) => x.preset_id === pId);
        if (found) {
          applyPresetToForm(found);
        }
      });
    });
  }

  // ── Render expanded color palette chips ───────────────────
  function renderColorChips() {
    var primaryHost = document.getElementById("itPrimaryPaletteChips");
    var accentHost = document.getElementById("itAccentPaletteChips");

    if (primaryHost) {
      primaryHost.innerHTML = PRIMARY_PALETTES.map(function(p){
        return '<button type="button" class="it-primary-chip" data-color="' + p.color + '" title="' + esc(p.name) + '" '
          + 'style="width:22px;height:22px;border-radius:6px;border:2px solid #fff;box-shadow:0 0 0 1px #e2e8f0;background:' + p.color + ';cursor:pointer;transition:transform .12s ease,box-shadow .12s ease;" '
          + 'onmouseover="this.style.transform=\'scale(1.15)\';this.style.boxShadow=\'0 0 0 2px #94a3b8\'" '
          + 'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'0 0 0 1px #e2e8f0\'"></button>';
      }).join("");

      primaryHost.querySelectorAll(".it-primary-chip").forEach(function(chip){
        chip.addEventListener("click", function(){
          var c = chip.dataset.color;
          var pc = document.getElementById("itFormPrimaryColor");
          var ph = document.getElementById("itFormPrimaryHex");
          if (pc) pc.value = c;
          if (ph) ph.value = c;
          updateLivePreview();
        });
      });
    }

    if (accentHost) {
      accentHost.innerHTML = ACCENT_PALETTES.map(function(p){
        return '<button type="button" class="it-accent-chip" data-color="' + p.color + '" title="' + esc(p.name) + '" '
          + 'style="width:22px;height:22px;border-radius:6px;border:2px solid #fff;box-shadow:0 0 0 1px #e2e8f0;background:' + p.color + ';cursor:pointer;transition:transform .12s ease,box-shadow .12s ease;" '
          + 'onmouseover="this.style.transform=\'scale(1.15)\';this.style.boxShadow=\'0 0 0 2px #94a3b8\'" '
          + 'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'0 0 0 1px #e2e8f0\'"></button>';
      }).join("");

      accentHost.querySelectorAll(".it-accent-chip").forEach(function(chip){
        chip.addEventListener("click", function(){
          var c = chip.dataset.color;
          var ac = document.getElementById("itFormAccentColor");
          var ah = document.getElementById("itFormAccentHex");
          if (ac) ac.value = c;
          if (ah) ah.value = c;
          updateLivePreview();
        });
      });
    }
  }

  // ── Apply preset to form ──────────────────────────────────
  function applyPresetToForm(p) {
    var el = document.getElementById("itFormName"); if (el) el.value = p.name + " Copy";
    el = document.getElementById("itFormPrimaryColor"); if (el) el.value = p.primary_color;
    el = document.getElementById("itFormPrimaryHex"); if (el) el.value = p.primary_color;
    el = document.getElementById("itFormAccentColor"); if (el) el.value = p.accent_color;
    el = document.getElementById("itFormAccentHex"); if (el) el.value = p.accent_color;
    el = document.getElementById("itFormFont"); if (el) el.value = p.font_family || "Helvetica";
    el = document.getElementById("itFormLogoAlign"); if (el) el.value = p.logo_alignment || "left";
    el = document.getElementById("itFormShowLogo"); if (el) el.checked = p.show_logo !== false;
    el = document.getElementById("itFormShowTax"); if (el) el.checked = p.show_tax_column !== false;
    el = document.getElementById("itFormShowDisc"); if (el) el.checked = p.show_discount_column !== false;
    el = document.getElementById("itFormShowCode"); if (el) el.checked = !!p.show_item_code;
    el = document.getElementById("itFormTerms"); if (el) el.value = p.payment_terms_note || "";
    el = document.getElementById("itFormFooter"); if (el) el.value = p.footer_note || "";
    currentEditingId = null;
    var badge = document.getElementById("itEditingBadge");
    if (badge) badge.classList.add("hidden");
    updateLivePreview();
  }

  // ── Live preview update ───────────────────────────────────
  function updateLivePreview() {
    var pCol = (document.getElementById("itFormPrimaryColor") || {}).value || "#0F2A3D";
    var aCol = (document.getElementById("itFormAccentColor") || {}).value || "#2FA4A9";
    var font = (document.getElementById("itFormFont") || {}).value || "Helvetica";
    var logoAlign = (document.getElementById("itFormLogoAlign") || {}).value || "left";
    var showLogo = (document.getElementById("itFormShowLogo") || {}).checked; if (showLogo === undefined) showLogo = true;
    var showCode = (document.getElementById("itFormShowCode") || {}).checked; if (showCode === undefined) showCode = false;
    var showDisc = (document.getElementById("itFormShowDisc") || {}).checked; if (showDisc === undefined) showDisc = true;
    var showTax = (document.getElementById("itFormShowTax") || {}).checked; if (showTax === undefined) showTax = true;

    var bankName = (document.getElementById("itFormBankName") || {}).value || "First National Bank";
    var bankAcc = (document.getElementById("itFormBankAcc") || {}).value || "62001122334";
    var bankAccName = (document.getElementById("itFormBankAccName") || {}).value || "FinSage Trading (Pty) Ltd";
    var branchCode = (document.getElementById("itFormBranchCode") || {}).value || "250655";
    var swift = (document.getElementById("itFormSwift") || {}).value || "FIRNZAJJ";
    var terms = (document.getElementById("itFormTerms") || {}).value || "Payment due within 30 days.";
    var footer = (document.getElementById("itFormFooter") || {}).value || "Thank you for your business!";

    var preview = document.getElementById("itPreviewBox");
    if (!preview) return;

    var fontFamily = font === "Courier" ? "monospace" : font === "Times" ? "Georgia, serif" : "system-ui, -apple-system, sans-serif";
    var logoTextAlign = logoAlign === "center" ? "center" : logoAlign === "right" ? "right" : "left";

    preview.style.fontFamily = fontFamily;

    preview.innerHTML = `
      <!-- Top accent bars -->
      <div style="background:${pCol};height:10px;width:100%;border-radius:8px 8px 0 0;flex-shrink:0;"></div>
      <div style="background:${aCol};height:3px;width:100%;flex-shrink:0;"></div>

      <div style="padding:20px 24px;">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
          <div style="text-align:${logoTextAlign};width:100%;">
            ${showLogo ? `<div style="font-weight:800;font-size:17px;color:${pCol};">🏢 [Company Logo / Name]</div>` : ""}
            <div style="font-size:11px;color:#64748b;margin-top:3px;">Tax / VAT No: 4900123456 &middot; Reg: 2024/1000/07</div>
            <div style="font-size:11px;color:#64748b;">124 Innovation Way, Sandton, Johannesburg</div>
          </div>
        </div>

        <div style="background:${aCol};height:2px;width:100%;margin:10px 0 16px;border-radius:1px;"></div>

        <!-- Bill To & Invoice Details -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;font-size:12px;">
          <div style="border:1px solid #e2e8f0;padding:12px;border-radius:8px;">
            <div style="color:${pCol};font-size:10px;text-transform:uppercase;font-weight:700;letter-spacing:.05em;margin-bottom:6px;">Bill To</div>
            <div style="font-weight:700;font-size:13px;">Acme Enterprises Ltd</div>
            <div style="color:#64748b;margin-top:2px;">accounts@acme.corp</div>
            <div style="color:#64748b;">123 Business Ave, Cape Town</div>
          </div>
          <div style="border:1px solid #e2e8f0;padding:12px;border-radius:8px;text-align:right;">
            <div style="color:${pCol};font-size:10px;text-transform:uppercase;font-weight:700;letter-spacing:.05em;margin-bottom:6px;">Tax Invoice</div>
            <div style="font-weight:700;font-size:13px;">Invoice #INV-2026-0042</div>
            <div style="color:#64748b;margin-top:2px;">Date: 25 Nov 2026</div>
            <div style="color:#64748b;">Due: 25 Dec 2026</div>
          </div>
        </div>

        <!-- Lines Table -->
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;">
          <thead>
            <tr style="background:${pCol};color:#fff;">
              ${showCode ? `<th style="padding:8px 10px;text-align:left;font-weight:600;font-size:11px;border-radius:6px 0 0 0;">Code</th>` : ""}
              <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:11px;${showCode ? "" : "border-radius:6px 0 0 0;"}">Item / Description</th>
              <th style="padding:8px 10px;text-align:center;font-weight:600;font-size:11px;">Qty</th>
              <th style="padding:8px 10px;text-align:right;font-weight:600;font-size:11px;">Rate</th>
              ${showDisc ? `<th style="padding:8px 10px;text-align:right;font-weight:600;font-size:11px;">Disc</th>` : ""}
              ${showTax ? `<th style="padding:8px 10px;text-align:right;font-weight:600;font-size:11px;">VAT</th>` : ""}
              <th style="padding:8px 10px;text-align:right;font-weight:600;font-size:11px;border-radius:0 6px 0 0;">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #f1f5f9;">
              ${showCode ? `<td style="padding:8px 10px;color:#64748b;font-size:11px;">SRV-01</td>` : ""}
              <td style="padding:8px 10px;"><strong>Financial Advisory &amp; Consulting</strong><br><span style="color:#94a3b8;font-size:10px;">Monthly retainer — strategic planning</span></td>
              <td style="padding:8px 10px;text-align:center;">10</td>
              <td style="padding:8px 10px;text-align:right;">$ 150.00</td>
              ${showDisc ? `<td style="padding:8px 10px;text-align:right;color:#16a34a;">$ 0.00</td>` : ""}
              ${showTax ? `<td style="padding:8px 10px;text-align:right;">$ 225.00</td>` : ""}
              <td style="padding:8px 10px;text-align:right;font-weight:700;">$ 1,725.00</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f5f9;">
              ${showCode ? `<td style="padding:8px 10px;color:#64748b;font-size:11px;">SRV-02</td>` : ""}
              <td style="padding:8px 10px;"><strong>Bookkeeping Services</strong><br><span style="color:#94a3b8;font-size:10px;">Monthly bookkeeping — 15 transactions</span></td>
              <td style="padding:8px 10px;text-align:center;">1</td>
              <td style="padding:8px 10px;text-align:right;">$ 850.00</td>
              ${showDisc ? `<td style="padding:8px 10px;text-align:right;color:#16a34a;">$ 85.00</td>` : ""}
              ${showTax ? `<td style="padding:8px 10px;text-align:right;">$ 114.75</td>` : ""}
              <td style="padding:8px 10px;text-align:right;font-weight:700;">$ 879.75</td>
            </tr>
          </tbody>
        </table>

        <!-- Totals & Banking -->
        <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:14px;font-size:12px;">
          <div style="border:1px solid #e2e8f0;padding:12px;border-radius:8px;">
            <div style="color:${pCol};font-size:10px;text-transform:uppercase;font-weight:700;letter-spacing:.05em;margin-bottom:8px;">Banking Payment Details</div>
            <div style="margin-bottom:4px;"><strong>Bank:</strong> ${esc(bankName)}</div>
            <div style="margin-bottom:4px;"><strong>Account Holder:</strong> ${esc(bankAccName)}</div>
            <div style="margin-bottom:4px;"><strong>Account #:</strong> ${esc(bankAcc)}</div>
            <div style="margin-bottom:4px;"><strong>Branch Code:</strong> ${esc(branchCode)}</div>
            <div style="margin-bottom:4px;"><strong>SWIFT/BIC:</strong> ${esc(swift)}</div>
            <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #e2e8f0;color:#64748b;font-size:11px;"><strong>Terms:</strong> ${esc(terms)}</div>
          </div>
          <div style="border:1px solid #e2e8f0;padding:12px;border-radius:8px;display:flex;flex-direction:column;justify-content:space-between;">
            <div style="margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal</span><span>$ 2,265.00</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Discount</span><span style="color:#16a34a;">- $ 85.00</span></div>
              <div style="display:flex;justify-content:space-between;"><span>VAT (15%)</span><span>$ 339.75</span></div>
            </div>
            <div style="border-top:2px solid ${pCol};padding-top:8px;display:flex;justify-content:space-between;font-weight:800;font-size:15px;color:${aCol};">
              <span>TOTAL DUE</span>
              <span>$ 2,519.75</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="margin-top:18px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px dashed #e2e8f0;padding-top:10px;">
          ${esc(footer)}
        </div>
      </div>
    `;
  }

  // ── Edit template ─────────────────────────────────────────
  function editTemplate(id) {
    const t = templatesState.find((x) => String(x.id) === String(id));
    if (!t) return;
    currentEditingId = t.id;

    var el;
    el = document.getElementById("itFormName"); if (el) el.value = t.template_name || "";
    el = document.getElementById("itFormPrimaryColor"); if (el) el.value = t.primary_color || "#0F2A3D";
    el = document.getElementById("itFormPrimaryHex"); if (el) el.value = t.primary_color || "#0F2A3D";
    el = document.getElementById("itFormAccentColor"); if (el) el.value = t.accent_color || "#2FA4A9";
    el = document.getElementById("itFormAccentHex"); if (el) el.value = t.accent_color || "#2FA4A9";
    el = document.getElementById("itFormFont"); if (el) el.value = t.font_family || "Helvetica";
    el = document.getElementById("itFormLogoAlign"); if (el) el.value = t.logo_alignment || "left";
    el = document.getElementById("itFormShowLogo"); if (el) el.checked = t.show_logo !== false;
    el = document.getElementById("itFormShowTax"); if (el) el.checked = t.show_tax_column !== false;
    el = document.getElementById("itFormShowDisc"); if (el) el.checked = t.show_discount_column !== false;
    el = document.getElementById("itFormShowCode"); if (el) el.checked = !!t.show_item_code;
    el = document.getElementById("itFormBankName"); if (el) el.value = t.bank_name || "";
    el = document.getElementById("itFormBankAccName"); if (el) el.value = t.bank_account_name || "";
    el = document.getElementById("itFormBankAcc"); if (el) el.value = t.bank_account_number || "";
    el = document.getElementById("itFormBranchCode"); if (el) el.value = t.bank_branch_code || "";
    el = document.getElementById("itFormSwift"); if (el) el.value = t.bank_swift_bic || "";
    el = document.getElementById("itFormTerms"); if (el) el.value = t.payment_terms_note || "";
    el = document.getElementById("itFormFooter"); if (el) el.value = t.footer_note || "";
    el = document.getElementById("itFormIsDefault"); if (el) el.checked = !!t.is_default;

    var badge = document.getElementById("itEditingBadge");
    if (badge) {
      badge.textContent = "Editing Template #" + t.id;
      badge.classList.remove("hidden");
    }

    updateLivePreview();
    // Scroll the designer panel into view
    var formCard = document.getElementById("itFormCard");
    if (formCard) formCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ── Save template ─────────────────────────────────────────
  async function saveTemplate() {
    const cid = getCid();
    const name = (document.getElementById("itFormName") || {}).value;
    if (!name || !name.trim()) {
      alert("Please enter a Template Name.");
      return;
    }

    const payload = {
      template_name: name.trim(),
      layout_style: "modern",
      primary_color: (document.getElementById("itFormPrimaryColor") || {}).value || "#0F2A3D",
      accent_color: (document.getElementById("itFormAccentColor") || {}).value || "#2FA4A9",
      font_family: (document.getElementById("itFormFont") || {}).value || "Helvetica",
      logo_alignment: (document.getElementById("itFormLogoAlign") || {}).value || "left",
      show_logo: (document.getElementById("itFormShowLogo") || {}).checked,
      show_tax_column: (document.getElementById("itFormShowTax") || {}).checked,
      show_discount_column: (document.getElementById("itFormShowDisc") || {}).checked,
      show_item_code: (document.getElementById("itFormShowCode") || {}).checked,
      bank_name: ((document.getElementById("itFormBankName") || {}).value || "").trim(),
      bank_account_name: ((document.getElementById("itFormBankAccName") || {}).value || "").trim(),
      bank_account_number: ((document.getElementById("itFormBankAcc") || {}).value || "").trim(),
      bank_branch_code: ((document.getElementById("itFormBranchCode") || {}).value || "").trim(),
      bank_swift_bic: ((document.getElementById("itFormSwift") || {}).value || "").trim(),
      payment_terms_note: ((document.getElementById("itFormTerms") || {}).value || "").trim(),
      footer_note: ((document.getElementById("itFormFooter") || {}).value || "").trim(),
      is_default: (document.getElementById("itFormIsDefault") || {}).checked,
    };

    try {
      if (currentEditingId) {
        await window.apiFetch(`/api/companies/${cid}/invoice-templates/${currentEditingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await window.apiFetch(`/api/companies/${cid}/invoice-templates`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      alert("Invoice Template saved successfully!");
      currentEditingId = null;
      var badge = document.getElementById("itEditingBadge");
      if (badge) badge.classList.add("hidden");
      await fetchTemplates();
      renderTemplatesList();
    } catch (err) {
      alert("Failed to save template: " + (err?.message || "Error"));
    }
  }

  // ── Set default template ──────────────────────────────────
  async function setDefaultTemplate(id) {
    const cid = getCid();
    try {
      await window.apiFetch(`/api/companies/${cid}/invoice-templates/${id}/set-default`, {
        method: "POST",
      });
      await fetchTemplates();
      renderTemplatesList();
    } catch (err) {
      alert("Failed to set default template: " + (err?.message || "Error"));
    }
  }

  // ── Delete template ───────────────────────────────────────
  async function deleteTemplate(id) {
    const cid = getCid();
    try {
      await window.apiFetch(`/api/companies/${cid}/invoice-templates/${id}`, {
        method: "DELETE",
      });
      await fetchTemplates();
      renderTemplatesList();
    } catch (err) {
      alert("Failed to delete template: " + (err?.message || "Error"));
    }
  }

  // ── Inject the full-screen layout if not already present ──
  function injectLayout() {
    var screen = document.getElementById("screen-invoice-templates");
    if (!screen) return;
    // Check if already injected
    if (document.getElementById("itMainLayout")) return;

    // Remove the max-width constraint to make it full-screen
    screen.classList.remove("max-w-7xl", "mx-auto");
    screen.style.padding = "0";
    screen.style.background = "#f6f8fb";

    // Build the new layout HTML
    screen.innerHTML = `
      <!-- Hero Header -->
      <div style="background:linear-gradient(135deg,#0F2A3D,#1e3a5f);color:#fff;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#2dd4bf;font-weight:700;margin-bottom:4px;">Receivables &middot; Brand Identity</div>
          <h2 style="font-size:22px;font-weight:900;margin:0;color:#fff;">Invoice Templates &amp; Customization</h2>
          <p style="font-size:13px;color:rgba(255,255,255,.7);margin:4px 0 0;max-width:600px;">
            Design custom invoice templates with live preview. Changes update instantly as you type.
          </p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <button type="button" onclick="window.switchScreen('ar')" style="padding:8px 16px;border-radius:10px;background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.2);font-size:12px;font-weight:600;cursor:pointer;transition:background .15s ease;" onmouseover="this.style.background='rgba(255,255,255,.22)'" onmouseout="this.style.background='rgba(255,255,255,.12)'">
            ← Back to Invoices
          </button>
        </div>
      </div>

      <!-- Presets bar -->
      <div style="padding:12px 28px;background:#fff;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">🎨 Quick Starter Presets</div>
        <div id="itPresetsHost" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;"></div>
      </div>

      <!-- Main side-by-side layout -->
      <div id="itMainLayout" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;height:calc(100vh - 200px);min-height:600px;">

        <!-- LEFT: Template Designer -->
        <div style="padding:16px 20px;overflow-y:auto;border-right:1px solid #e2e8f0;background:#fff;">
          <!-- Templates list + New button -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <h3 style="font-weight:800;font-size:15px;color:#0f172a;margin:0;">Your Templates</h3>
            <button type="button" id="itResetBtn" style="font-size:12px;font-weight:600;color:#2563eb;background:#eff6ff;padding:5px 12px;border-radius:8px;border:1px solid #dbeafe;cursor:pointer;">+ New Blank</button>
          </div>
          <div id="itTemplatesListHost" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
            <div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px;">Loading...</div>
          </div>

          <!-- Designer form -->
          <div id="itFormCard" style="background:#f8fafc;padding:16px;border-radius:14px;border:1px solid #e2e8f0;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid #e2e8f0;margin-bottom:14px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <h3 style="font-weight:800;font-size:14px;color:#0f172a;margin:0;">Template Designer</h3>
                <span id="itEditingBadge" class="hidden" style="padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;"></span>
              </div>
              <button type="button" id="itSaveBtn" style="padding:7px 16px;background:#10b981;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(16,185,129,.25);transition:filter .15s ease;" onmouseover="this.style.filter='brightness(1.08)'" onmouseout="this.style.filter=''">
                💾 Save Template
              </button>
            </div>

            <form id="itCustomizerForm" style="display:flex;flex-direction:column;gap:14px;">
              <!-- Template Name + Font -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div>
                  <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px;">Template Name *</label>
                  <input id="itFormName" style="width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;" placeholder="e.g. Modern VIP Client" required />
                </div>
                <div>
                  <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px;">Font Family</label>
                  <select id="itFormFont" style="width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;background:#fff;">
                    <option value="Helvetica">Helvetica (Clean Sans)</option>
                    <option value="Times">Times (Classic Serif)</option>
                    <option value="Courier">Courier (Monospace)</option>
                  </select>
                </div>
              </div>

              <!-- Brand Colors -->
              <div style="padding:12px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;">
                <div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:10px;">🎨 Brand Colors</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                  <!-- Primary -->
                  <div>
                    <label style="display:block;font-size:10px;color:#64748b;margin-bottom:4px;font-weight:600;">Primary (Headers)</label>
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                      <input type="color" id="itFormPrimaryColor" value="#0F2A3D" style="width:28px;height:28px;border-radius:6px;border:1px solid #cbd5e1;cursor:pointer;background:none;padding:0;" />
                      <input id="itFormPrimaryHex" value="#0F2A3D" style="width:80px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;font-family:monospace;" />
                    </div>
                    <div id="itPrimaryPaletteChips" style="display:flex;flex-wrap:wrap;gap:4px;max-width:220px;"></div>
                  </div>
                  <!-- Accent -->
                  <div>
                    <label style="display:block;font-size:10px;color:#64748b;margin-bottom:4px;font-weight:600;">Accent (Highlights)</label>
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                      <input type="color" id="itFormAccentColor" value="#2FA4A9" style="width:28px;height:28px;border-radius:6px;border:1px solid #cbd5e1;cursor:pointer;background:none;padding:0;" />
                      <input id="itFormAccentHex" value="#2FA4A9" style="width:80px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;font-family:monospace;" />
                    </div>
                    <div id="itAccentPaletteChips" style="display:flex;flex-wrap:wrap;gap:4px;max-width:220px;"></div>
                  </div>
                </div>
              </div>

              <!-- Display Options -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <label style="display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;font-size:12px;">
                  <input type="checkbox" id="itFormShowLogo" checked /> Show Logo
                </label>
                <label style="display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;font-size:12px;">
                  <input type="checkbox" id="itFormShowTax" checked /> Show Tax Column
                </label>
                <label style="display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;font-size:12px;">
                  <input type="checkbox" id="itFormShowDisc" checked /> Show Discount
                </label>
                <label style="display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;font-size:12px;">
                  <input type="checkbox" id="itFormShowCode" /> Show Item Code
                </label>
              </div>

              <!-- Logo Alignment -->
              <div>
                <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px;">Logo Alignment</label>
                <select id="itFormLogoAlign" style="width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;background:#fff;">
                  <option value="left">Left Aligned</option>
                  <option value="center">Centered</option>
                  <option value="right">Right Aligned</option>
                </select>
              </div>

              <!-- Banking Details -->
              <div style="padding:12px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;">
                <div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:10px;">🏦 Banking Details</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <div>
                    <label style="display:block;font-size:10px;color:#64748b;margin-bottom:3px;">Bank Name</label>
                    <input id="itFormBankName" style="width:100%;padding:6px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:12px;" placeholder="e.g. FNB" />
                  </div>
                  <div>
                    <label style="display:block;font-size:10px;color:#64748b;margin-bottom:3px;">Account #</label>
                    <input id="itFormBankAcc" style="width:100%;padding:6px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:12px;" placeholder="62001122334" />
                  </div>
                  <div>
                    <label style="display:block;font-size:10px;color:#64748b;margin-bottom:3px;">Account Holder</label>
                    <input id="itFormBankAccName" style="width:100%;padding:6px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:12px;" placeholder="Company Name" />
                  </div>
                  <div>
                    <label style="display:block;font-size:10px;color:#64748b;margin-bottom:3px;">Branch Code</label>
                    <input id="itFormBranchCode" style="width:100%;padding:6px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:12px;" placeholder="250655" />
                  </div>
                  <div style="grid-column:1 / -1;">
                    <label style="display:block;font-size:10px;color:#64748b;margin-bottom:3px;">SWIFT / BIC Code</label>
                    <input id="itFormSwift" style="width:100%;padding:6px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:12px;" placeholder="FIRNZAJJ" />
                  </div>
                </div>
              </div>

              <!-- Terms & Footer -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div>
                  <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px;">Payment Terms</label>
                  <textarea id="itFormTerms" rows="2" style="width:100%;padding:6px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:12px;resize:vertical;" placeholder="Payment due within 30 days."></textarea>
                </div>
                <div>
                  <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px;">Footer Message</label>
                  <textarea id="itFormFooter" rows="2" style="width:100%;padding:6px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:12px;resize:vertical;" placeholder="Thank you for your business!"></textarea>
                </div>
              </div>

              <!-- Set as default -->
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;font-weight:700;color:#1e293b;padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;">
                <input type="checkbox" id="itFormIsDefault" /> Set as Active Company Default
              </label>
            </form>
          </div>
        </div>

        <!-- RIGHT: Live Interactive Preview -->
        <div style="padding:16px 20px;overflow-y:auto;background:#f1f5f9;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <span style="font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.04em;">👁️ Live Interactive Preview</span>
            <span style="font-size:10px;color:#94a3b8;font-weight:600;">Updates in real-time</span>
          </div>
          <div id="itPreviewBox" style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.06);overflow:hidden;max-width:680px;margin:0 auto;">
            <!-- Preview populated via JS -->
          </div>
        </div>
      </div>

      <!-- Responsive: stack on narrow screens -->
      <style>
        @media (max-width: 1024px) {
          #itMainLayout {
            grid-template-columns: 1fr !important;
            height: auto !important;
          }
          #itMainLayout > div:first-child {
            border-right: none !important;
            border-bottom: 1px solid #e2e8f0;
          }
          #itMainLayout > div:last-child {
            min-height: 500px;
          }
        }
      </style>
    `;

    // Re-bind events since we replaced the innerHTML
    bindEvents();
    renderColorChips();
  }

  // ── Bind events ───────────────────────────────────────────
  function bindEvents() {
    var form = document.getElementById("itCustomizerForm");

    // Sync color inputs
    var pColor = document.getElementById("itFormPrimaryColor");
    var pHex = document.getElementById("itFormPrimaryHex");
    if (pColor && pHex) {
      pColor.addEventListener("input", function(e) {
        pHex.value = e.target.value;
        updateLivePreview();
      });
      pHex.addEventListener("input", function(e) {
        pColor.value = e.target.value;
        updateLivePreview();
      });
    }

    var aColor = document.getElementById("itFormAccentColor");
    var aHex = document.getElementById("itFormAccentHex");
    if (aColor && aHex) {
      aColor.addEventListener("input", function(e) {
        aHex.value = e.target.value;
        updateLivePreview();
      });
      aHex.addEventListener("input", function(e) {
        aColor.value = e.target.value;
        updateLivePreview();
      });
    }

    // Palette chips (also re-bound by renderColorChips)
    document.querySelectorAll(".it-palette-chip").forEach(function(chip) {
      chip.addEventListener("click", function() {
        var c = chip.dataset.color;
        if (c && pColor && pHex) {
          pColor.value = c;
          pHex.value = c;
          updateLivePreview();
        }
      });
    });

    // All form inputs update preview live
    var inputIds = [
      "itFormName", "itFormFont", "itFormLogoAlign",
      "itFormShowLogo", "itFormShowTax", "itFormShowDisc", "itFormShowCode",
      "itFormBankName", "itFormBankAcc", "itFormBankAccName",
      "itFormBranchCode", "itFormSwift",
      "itFormTerms", "itFormFooter",
    ];
    inputIds.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", updateLivePreview);
        el.addEventListener("change", updateLivePreview);
      }
    });

    // Save button
    var saveBtn = document.getElementById("itSaveBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", function(e) {
        e.preventDefault();
        saveTemplate();
      });
    }

    // Reset / New Blank button
    var resetBtn = document.getElementById("itResetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function() {
        currentEditingId = null;
        var badge = document.getElementById("itEditingBadge");
        if (badge) badge.classList.add("hidden");
        if (presetsState[0]) applyPresetToForm(presetsState[0]);
      });
    }
  }

  // ── Main entry point ───────────────────────────────────────
  window.bindInvoiceTemplatesScreen = async function () {
    // Inject the new full-screen layout (replaces the old HTML)
    injectLayout();

    // Fetch data
    await fetchTemplates();

    // Render content
    renderTemplatesList();
    renderPresets();
    renderColorChips();
    bindEvents();
    updateLivePreview();
  };
})();
