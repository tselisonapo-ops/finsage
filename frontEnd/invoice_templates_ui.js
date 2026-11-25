// frontEnd/invoice_templates_ui.js
// FinSage - Custom Invoice Templates Workspace
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

  function renderTemplatesList() {
    const host = document.getElementById("itTemplatesListHost");
    if (!host) return;

    if (!templatesState.length) {
      host.innerHTML = `
        <div class="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <p class="font-medium">No custom templates yet.</p>
          <p class="text-xs text-slate-400 mt-1">Click a preset below or "Create Custom Template" to get started.</p>
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
        <div class="p-4 rounded-xl border ${isDef ? "border-emerald-500 bg-emerald-50/20 shadow-sm" : "border-slate-200 bg-white"} flex flex-col justify-between gap-3 transition-all hover:shadow-md">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="w-3.5 h-3.5 rounded-full inline-block border shadow-xs" style="background:${pCol}"></span>
                <span class="w-2.5 h-2.5 rounded-full inline-block border shadow-xs" style="background:${aCol}"></span>
                <h4 class="font-bold text-slate-900 text-sm">${esc(t.template_name)}</h4>
              </div>
              <span class="text-xs text-slate-500 capitalize ml-6">${esc(t.layout_style || "modern")} • ${esc(t.font_family || "Helvetica")}</span>
            </div>
            ${
              isDef
                ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">★ ACTIVE DEFAULT</span>`
                : `<button type="button" class="it-set-default-btn text-xs font-semibold text-slate-600 hover:text-emerald-700 bg-slate-100 px-2 py-1 rounded" data-id="${t.id}">Set Default</button>`
            }
          </div>

          <div class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
            <div><strong>Bank:</strong> ${esc(t.bank_name || "Company Default")} ${t.bank_account_number ? `(${esc(t.bank_account_number)})` : ""}</div>
            <div class="truncate"><strong>Terms:</strong> ${esc(t.payment_terms_note || "Standard 30 Days")}</div>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-slate-100">
            <button type="button" class="it-edit-btn text-xs font-semibold text-blue-600 hover:text-blue-800" data-id="${t.id}">
              ✏️ Edit Template
            </button>
            ${
              !isDef
                ? `<button type="button" class="it-delete-btn text-xs font-semibold text-red-500 hover:text-red-700" data-id="${t.id}">🗑️ Delete</button>`
                : `<span class="text-[11px] text-slate-400">Default template</span>`
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

  function renderPresets() {
    const host = document.getElementById("itPresetsHost");
    if (!host || !presetsState.length) return;

    host.innerHTML = presetsState
      .map(
        (p) => `
        <div class="p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-400 cursor-pointer transition-all flex items-center justify-between gap-3 it-preset-card" data-preset="${p.preset_id}">
          <div class="flex items-center gap-2.5">
            <div class="flex -space-x-1">
              <span class="w-4 h-4 rounded-full border border-white shadow-xs" style="background:${p.primary_color}"></span>
              <span class="w-4 h-4 rounded-full border border-white shadow-xs" style="background:${p.accent_color}"></span>
            </div>
            <div>
              <div class="text-xs font-bold text-slate-800">${esc(p.name)}</div>
              <div class="text-[10px] text-slate-400 capitalize">${p.layout_style} layout</div>
            </div>
          </div>
          <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Use</span>
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

  function applyPresetToForm(p) {
    document.getElementById("itFormName").value = p.name + " Copy";
    document.getElementById("itFormPrimaryColor").value = p.primary_color;
    document.getElementById("itFormPrimaryHex").value = p.primary_color;
    document.getElementById("itFormAccentColor").value = p.accent_color;
    document.getElementById("itFormAccentHex").value = p.accent_color;
    document.getElementById("itFormFont").value = p.font_family || "Helvetica";
    document.getElementById("itFormLogoAlign").value = p.logo_alignment || "left";
    document.getElementById("itFormShowLogo").checked = p.show_logo !== false;
    document.getElementById("itFormShowTax").checked = p.show_tax_column !== false;
    document.getElementById("itFormShowDisc").checked = p.show_discount_column !== false;
    document.getElementById("itFormShowCode").checked = !!p.show_item_code;
    document.getElementById("itFormTerms").value = p.payment_terms_note || "";
    document.getElementById("itFormFooter").value = p.footer_note || "";
    currentEditingId = null;
    document.getElementById("itEditingBadge").classList.add("hidden");
    updateLivePreview();
  }

  function updateLivePreview() {
    const pCol = document.getElementById("itFormPrimaryColor")?.value || "#0F2A3D";
    const aCol = document.getElementById("itFormAccentColor")?.value || "#2FA4A9";
    const font = document.getElementById("itFormFont")?.value || "Helvetica";
    const logoAlign = document.getElementById("itFormLogoAlign")?.value || "left";
    const showLogo = document.getElementById("itFormShowLogo")?.checked ?? true;
    const showCode = document.getElementById("itFormShowCode")?.checked ?? false;
    const showDisc = document.getElementById("itFormShowDisc")?.checked ?? true;
    const showTax = document.getElementById("itFormShowTax")?.checked ?? true;

    const bankName = document.getElementById("itFormBankName")?.value || "First National Bank";
    const bankAcc = document.getElementById("itFormBankAcc")?.value || "62001122334";
    const terms = document.getElementById("itFormTerms")?.value || "Payment due within 30 days.";
    const footer = document.getElementById("itFormFooter")?.value || "Thank you for your business!";

    const preview = document.getElementById("itPreviewBox");
    if (!preview) return;

    preview.style.fontFamily = font === "Courier" ? "monospace" : font === "Times" ? "serif" : "sans-serif";

    preview.innerHTML = `
      <!-- Top Primary Accent Bar -->
      <div style="background:${pCol}; height: 10px; width: 100%; border-radius: 4px 4px 0 0;"></div>
      <div style="background:${aCol}; height: 3px; width: 100%;"></div>

      <div style="padding: 18px;">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 16px;">
          <div style="text-align: ${logoAlign === "right" ? "right" : "left"}; width: 100%;">
            ${showLogo ? `<div style="font-weight: 800; font-size: 16px; color: ${pCol};">🏢 [Company Logo / Name]</div>` : ""}
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Tax / VAT No: 4900123456 • Reg: 2024/1000/07</div>
            <div style="font-size: 11px; color: #64748b;">124 Innovation Way, Sandton, Johannesburg</div>
          </div>
        </div>

        <div style="background:${aCol}; height: 1.5px; width: 100%; margin: 10px 0;"></div>

        <!-- Bill To & Details -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; font-size: 11px;">
          <div style="border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px;">
            <strong style="color:${pCol}; font-size: 10px; text-transform:uppercase;">BILL TO</strong>
            <div style="font-weight:bold; margin-top:2px;">Acme Enterprises Ltd</div>
            <div style="color:#64748b;">accounts@acme.corp</div>
          </div>
          <div style="border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; text-align:right;">
            <strong style="color:${pCol}; font-size: 10px; text-transform:uppercase;">TAX INVOICE DETAILS</strong>
            <div style="font-weight:bold; margin-top:2px;">Invoice #: INV-2026-0042</div>
            <div style="color:#64748b;">Date: 25 Nov 2026</div>
          </div>
        </div>

        <!-- Lines Table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px;">
          <thead>
            <tr style="background:${pCol}; color: #ffffff;">
              ${showCode ? `<th style="padding: 6px; text-align:left;">Code</th>` : ""}
              <th style="padding: 6px; text-align:left;">Item / Description</th>
              <th style="padding: 6px; text-align:center;">Qty</th>
              <th style="padding: 6px; text-align:right;">Rate</th>
              ${showDisc ? `<th style="padding: 6px; text-align:right;">Disc</th>` : ""}
              ${showTax ? `<th style="padding: 6px; text-align:right;">VAT</th>` : ""}
              <th style="padding: 6px; text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              ${showCode ? `<td style="padding: 6px; color:#64748b;">SRV-01</td>` : ""}
              <td style="padding: 6px;"><strong>Financial Advisory & Consulting</strong></td>
              <td style="padding: 6px; text-align:center;">10</td>
              <td style="padding: 6px; text-align:right;">$ 150.00</td>
              ${showDisc ? `<td style="padding: 6px; text-align:right; color:#16a34a;">$ 0.00</td>` : ""}
              ${showTax ? `<td style="padding: 6px; text-align:right;">$ 225.00</td>` : ""}
              <td style="padding: 6px; text-align:right; font-weight:bold;">$ 1,725.00</td>
            </tr>
          </tbody>
        </table>

        <!-- Totals & Banking -->
        <div style="display:grid; grid-template-columns: 1.2fr 1fr; gap: 12px; font-size: 11px;">
          <div style="border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px;">
            <strong style="color:${pCol}; font-size: 10px; text-transform:uppercase;">BANKING PAYMENT DETAILS</strong>
            <div style="margin-top:4px;"><b>Bank:</b> ${esc(bankName)}</div>
            <div><b>Account #:</b> ${esc(bankAcc)}</div>
            <div><b>Reference:</b> INV-2026-0042</div>
            <div style="margin-top:6px; color:#64748b; font-size:10px;"><b>Terms:</b> ${esc(terms)}</div>
          </div>
          <div style="border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; text-align:right; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between;"><span>Subtotal</span><span>$ 1,500.00</span></div>
              <div style="display:flex; justify-content:space-between;"><span>VAT (15%)</span><span>$ 225.00</span></div>
            </div>
            <div style="border-top: 1px solid #e2e8f0; padding-top: 4px; display:flex; justify-content:space-between; font-weight:bold; font-size: 13px; color:${aCol};">
              <span>TOTAL DUE</span>
              <span>$ 1,725.00</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="margin-top: 16px; text-align:center; font-size: 10px; color: #94a3b8; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
          ${esc(footer)}
        </div>
      </div>
    `;
  }

  function editTemplate(id) {
    const t = templatesState.find((x) => String(x.id) === String(id));
    if (!t) return;
    currentEditingId = t.id;

    document.getElementById("itFormName").value = t.template_name || "";
    document.getElementById("itFormPrimaryColor").value = t.primary_color || "#0F2A3D";
    document.getElementById("itFormPrimaryHex").value = t.primary_color || "#0F2A3D";
    document.getElementById("itFormAccentColor").value = t.accent_color || "#2FA4A9";
    document.getElementById("itFormAccentHex").value = t.accent_color || "#2FA4A9";
    document.getElementById("itFormFont").value = t.font_family || "Helvetica";
    document.getElementById("itFormLogoAlign").value = t.logo_alignment || "left";
    document.getElementById("itFormShowLogo").checked = t.show_logo !== false;
    document.getElementById("itFormShowTax").checked = t.show_tax_column !== false;
    document.getElementById("itFormShowDisc").checked = t.show_discount_column !== false;
    document.getElementById("itFormShowCode").checked = !!t.show_item_code;
    document.getElementById("itFormBankName").value = t.bank_name || "";
    document.getElementById("itFormBankAccName").value = t.bank_account_name || "";
    document.getElementById("itFormBankAcc").value = t.bank_account_number || "";
    document.getElementById("itFormBranchCode").value = t.bank_branch_code || "";
    document.getElementById("itFormSwift").value = t.bank_swift_bic || "";
    document.getElementById("itFormTerms").value = t.payment_terms_note || "";
    document.getElementById("itFormFooter").value = t.footer_note || "";
    document.getElementById("itFormIsDefault").checked = !!t.is_default;

    const badge = document.getElementById("itEditingBadge");
    badge.textContent = `Editing Template #${t.id}`;
    badge.classList.remove("hidden");

    updateLivePreview();
    document.getElementById("itFormCard")?.scrollIntoView({ behavior: "smooth" });
  }

  async function saveTemplate() {
    const cid = getCid();
    const name = document.getElementById("itFormName")?.value.trim();
    if (!name) {
      alert("Please enter a Template Name.");
      return;
    }

    const payload = {
      template_name: name,
      layout_style: "modern",
      primary_color: document.getElementById("itFormPrimaryColor")?.value || "#0F2A3D",
      accent_color: document.getElementById("itFormAccentColor")?.value || "#2FA4A9",
      font_family: document.getElementById("itFormFont")?.value || "Helvetica",
      logo_alignment: document.getElementById("itFormLogoAlign")?.value || "left",
      show_logo: document.getElementById("itFormShowLogo")?.checked,
      show_tax_column: document.getElementById("itFormShowTax")?.checked,
      show_discount_column: document.getElementById("itFormShowDisc")?.checked,
      show_item_code: document.getElementById("itFormShowCode")?.checked,
      bank_name: document.getElementById("itFormBankName")?.value.trim(),
      bank_account_name: document.getElementById("itFormBankAccName")?.value.trim(),
      bank_account_number: document.getElementById("itFormBankAcc")?.value.trim(),
      bank_branch_code: document.getElementById("itFormBranchCode")?.value.trim(),
      bank_swift_bic: document.getElementById("itFormSwift")?.value.trim(),
      payment_terms_note: document.getElementById("itFormTerms")?.value.trim(),
      footer_note: document.getElementById("itFormFooter")?.value.trim(),
      is_default: document.getElementById("itFormIsDefault")?.checked,
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
      document.getElementById("itEditingBadge")?.classList.add("hidden");
      await fetchTemplates();
      renderTemplatesList();
    } catch (err) {
      alert("Failed to save template: " + (err?.message || "Error"));
    }
  }

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

  function bindEvents() {
    const form = document.getElementById("itCustomizerForm");
    if (!form) return;

    // Sync color inputs
    const pColor = document.getElementById("itFormPrimaryColor");
    const pHex = document.getElementById("itFormPrimaryHex");
    if (pColor && pHex) {
      pColor.addEventListener("input", (e) => {
        pHex.value = e.target.value;
        updateLivePreview();
      });
      pHex.addEventListener("input", (e) => {
        pColor.value = e.target.value;
        updateLivePreview();
      });
    }

    const aColor = document.getElementById("itFormAccentColor");
    const aHex = document.getElementById("itFormAccentHex");
    if (aColor && aHex) {
      aColor.addEventListener("input", (e) => {
        aHex.value = e.target.value;
        updateLivePreview();
      });
      aHex.addEventListener("input", (e) => {
        aColor.value = e.target.value;
        updateLivePreview();
      });
    }

    // Palette chips
    document.querySelectorAll(".it-palette-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const c = chip.dataset.color;
        if (c && pColor && pHex) {
          pColor.value = c;
          pHex.value = c;
          updateLivePreview();
        }
      });
    });

    // Inputs update preview
    [
      "itFormName",
      "itFormFont",
      "itFormLogoAlign",
      "itFormShowLogo",
      "itFormShowTax",
      "itFormShowDisc",
      "itFormShowCode",
      "itFormBankName",
      "itFormBankAcc",
      "itFormTerms",
      "itFormFooter",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", updateLivePreview);
        el.addEventListener("change", updateLivePreview);
      }
    });

    // Save button
    document.getElementById("itSaveBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      saveTemplate();
    });

    // Reset button
    document.getElementById("itResetBtn")?.addEventListener("click", () => {
      currentEditingId = null;
      document.getElementById("itEditingBadge")?.classList.add("hidden");
      if (presetsState[0]) applyPresetToForm(presetsState[0]);
    });
  }

  window.bindInvoiceTemplatesScreen = async function () {
    await fetchTemplates();
    renderTemplatesList();
    renderPresets();
    bindEvents();
    updateLivePreview();
  };
})();
