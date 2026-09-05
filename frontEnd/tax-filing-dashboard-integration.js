
(function() {
    'use strict';
    
    // ====================================================================
    // CONFIGURATION
    // ====================================================================
    
    const TAX_FILING_CONFIG = {
        authorities: {
            'SARS': {
                name: 'South African Revenue Service',
                country: 'South Africa 🇿🇦',
                currency: 'ZAR',
                monthlyReturn: 'EMP201',
                annualReturn: 'EMP501/IRP5',
                portalUrl: 'https://www.sars.gov.za/efiling/',
                supportsFormats: ['csv', 'xlsx', 'xml'],
                color: '#00875A',
                icon: '🇿🇦'
            },

            'RSL': {
                name: 'Revenue Services Lesotho',
                country: 'Lesotho 🇱🇸',
                currency: 'LSL',
                monthlyReturn: 'EMP160',
                annualReturn: 'EMP500',
                portalUrl: 'https://rsl.org.ls/',
                supportsFormats: ['csv', 'xlsx'],
                color: '#2563EB',
                icon: '🇱🇸'
            },

            'BURS': {
                name: 'Botswana Unified Revenue Service',
                country: 'Botswana 🇧🇼',
                currency: 'BWP',
                monthlyReturn: 'ITP1',
                annualReturn: 'ITP2',
                portalUrl: 'https://www.burs.org.bw/',
                supportsFormats: ['csv', 'xlsx'],
                color: '#D97706',
                icon: '🇧🇼'
            }
        }
    };
    
    // ====================================================================
    // STATE MANAGEMENT
    // ====================================================================
    
    const state = {
        selectedAuthority: null,
        selectedPeriod: null,
        validationResults: null,
        isProcessing: false,
        previewData: null,
        employeeCount: 0
    };

    async function apiCall(url, options = {}) {
        if (typeof apiFetch === 'function') {
            return await apiFetch(url, options);
        } else {
            console.warn('[Tax Filing] apiFetch not found, using fetch');
            const token = typeof getToken === 'function' ? getToken() : '';
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const response = await fetch(url, { ...options, headers });
            return await response.json();
        }
    }
    
    /**
     * Get company ID from your existing function
     */
    function getCompanyId() {
        if (typeof cid === 'function') {
            return cid();
        }
        console.warn('[Tax Filing] cid() not found');
        const match = window.location.pathname.match(/\/companies\/(\d+)/);
        return match ? match[1] : null;
    }
    
    /**
     * Format currency amount
     */
    function formatCurrency(amount, currency = '') {
        const num = parseFloat(amount) || 0;
        return new Intl.NumberFormat('en-ZA', {
            style: 'currency',
            currency: currency || 'ZAR',
            minimumFractionDigits: 2
        }).format(num);
    }
    
    // ================================================================
    // PAYE Preview + Export — called by the tax-filing panel buttons
    window.previewPayeData = async function () {
        const area       = document.getElementById("taxFilingPreview");
        const topBar     = document.getElementById("taxFilingTopBar");
        const previewBtn = document.getElementById("taxFilingPreviewBtn");
        const actions    = document.getElementById("taxFilingActions");
        const company    = window.getActiveCompanyId?.() || window.CURRENT_COMPANY_ID || window.CURRENT_COMPANY?.id;
        const authority  = window.__taxFiling?.getSelectedAuthority?.() || "SARS";

        let year  = document.getElementById("taxFilingYear")?.value || "";
        let month = document.getElementById("taxFilingMonth")?.value || "";

        if (/^\d{4}-\d{2}$/.test(month)) {
            year  = month.slice(0, 4);
            month = month.slice(5, 7);
        }

        if (!area) { console.warn("[PAYE Preview] #taxFilingPreview not found"); return; }

        const showMsg = (html) => { area.style.display = "block"; area.innerHTML = html; };

        const mm = String(month || "").padStart(2, "0");

        if (!year || !month || !/^\d{4}$/.test(String(year)) || !/^(0[1-9]|1[0-2])$/.test(mm)) {
            showMsg('<div style="padding:24px;text-align:center;color:#b45309;background:#fffbeb;border:1px dashed #fcd34d;border-radius:10px;">📅 Select a filing month first, then click <b>Preview Returns</b>.</div>');
            return;
        }

        if (!company) {
            showMsg('<div style="padding:24px;text-align:center;color:#b91c1c;background:#fef2f2;border:1px dashed #fca5a5;border-radius:10px;">No active company selected.</div>');
            return;
        }

        const periodStart = `${year}-${mm}-01`;
        const periodEnd = `${year}-${mm}-${String(new Date(Number(year), Number(month), 0).getDate()).padStart(2, "0")}`;
        const period = `${periodStart} to ${periodEnd}`;

        const oldLabel = previewBtn ? previewBtn.textContent : "";

        const stateToken = Symbol("tfPreview");
        if (previewBtn) previewBtn.__tfToken = stateToken;

        if (previewBtn) { previewBtn.disabled = true; previewBtn.textContent = "⏳ Loading…"; }
        showMsg(`<div style="padding:32px;text-align:center;color:#64748b;">Loading ${authority} PAYE preview for ${period}…</div>`);

        // Keep these helpers outside try/catch so they are available everywhere.
        const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
        const n = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const pick = (o, keys) => { for (const k of keys) { if (o && o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; } return ""; };

        try {
            const url = window.ENDPOINTS.taxFiling.preview(company, authority, period);
            const data = await window.apiFetch(url, { method: "GET" });

            const payload = data?.data || data;
            const rows = Array.isArray(payload) ? payload : (payload.records || payload.sample_records || payload.employees || payload.lines || payload.results || payload.data || []);
            const totals = (!Array.isArray(payload) && payload) ? (payload.totals || payload.summary || payload.statistics || null) : null;
            if (!rows.length) {
                showMsg(`<div style="padding:24px;text-align:center;color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;">📭 No PAYE data found for ${authority} — ${period}.</div>`);
                return;
            }

            let html = `<div style="max-height:60vh;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:#f1f5f9;position:sticky;top:0;">
                <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e2e8f0;">Employee</th>
                <th style="text-align:right;padding:10px 12px;border-bottom:2px solid #e2e8f0;">Gross</th>
                <th style="text-align:right;padding:10px 12px;border-bottom:2px solid #e2e8f0;">PAYE</th>
                <th style="text-align:right;padding:10px 12px;border-bottom:2px solid #e2e8f0;">Net Pay</th>
            </tr></thead><tbody>`;

            for (const r of rows) {
                html += `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${h([r.first_name, r.last_name].filter(Boolean).join(" "))}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${n(r.gross_income)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${n(r.paye_deducted)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${n(r.net_pay)}</td>
            </tr>`;
            }

            html += `</tbody>`;

            if (totals) {
                html += `<tfoot><tr style="background:#f8fafc;font-weight:600;">
                <td style="padding:10px 12px;border-top:2px solid #e2e8f0;">Totals</td>
                <td style="padding:10px 12px;border-top:2px solid #e2e8f0;text-align:right;">${n(totals.total_gross_income)}</td>
                <td style="padding:10px 12px;border-top:2px solid #e2e8f0;text-align:right;">${n(totals.total_paye_deducted)}</td>
                <td style="padding:10px 12px;border-top:2px solid #e2e8f0;text-align:right;">${n(totals.total_gross_income - totals.total_paye_deducted - (totals.total_uif_deducted || 0))}</td>
            </tr></tfoot>`;
            }

            html += `</table></div>`;
            showMsg(html);

            // ✅ SUCCESS ONLY → hide Preview, raise Validate + Exports to the top
            if (previewBtn) previewBtn.style.display = "none";
            if (topBar && actions) {
                actions.style.display = "flex";
                topBar.appendChild(actions); // physically moves the bar up (keeps its listeners)
            }

            const hint = document.getElementById("taxFilingTopHint");
            if (hint) hint.textContent = "Review the preview below, then Validate or Export.";

        } catch (err) {
            console.error("[PAYE Preview] failed:", err);
            showMsg(`<div style="padding:24px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;"><b>Preview failed:</b> ${h(err?.message || err)}</div>`);
        } finally {
            if (previewBtn && previewBtn.__tfToken === stateToken) {
                previewBtn.disabled = false;
                previewBtn.textContent = oldLabel || "👁 Preview Returns";
            }
        }
    };

    window.exportPayeFiling = async function (event, format) {
        if (event && typeof event.preventDefault === "function") event.preventDefault();

        const fmt       = (format || "csv").toLowerCase();
        const company   = window.getActiveCompanyId?.() || window.CURRENT_COMPANY_ID || window.CURRENT_COMPANY?.id;
        const authority = window.__taxFiling?.getSelectedAuthority?.() || "SARS";
        const results   = document.getElementById("taxFilingValidationResults");

        let year  = document.getElementById("taxFilingYear")?.value || "";
        let month = document.getElementById("taxFilingMonth")?.value || "";

        if (/^\d{4}-\d{2}$/.test(month)) {
            year  = month.slice(0, 4);
            month = month.slice(5, 7);
        }

        if (!company) {
            alert("No active company selected.");
            return;
        }

        if (!year || !month) {
            alert("Select a filing year and month first.");
            return;
        }

        const mm = String(month).padStart(2, "0");

        if (!/^\d{4}$/.test(String(year)) || !/^(0[1-9]|1[0-2])$/.test(mm)) {
            alert("Select a valid filing year and month first.");
            return;
        }

        const periodStart = `${year}-${mm}-01`;
        const periodEnd = `${year}-${mm}-${String(new Date(Number(year), Number(month), 0).getDate()).padStart(2, "0")}`;

        const btn = event?.currentTarget;
        const oldLabel = btn ? btn.textContent : "";

        const stateToken = Symbol("tfExport");
        if (btn) btn.__tfToken = stateToken;

        if (btn) {
            btn.disabled = true;
            btn.textContent = "⏳ Exporting…";
        }

        try {
            const payload = {
                authority_code: authority,
                format: fmt,
                period_start: periodStart,
                period_end: periodEnd,
                include_benefits: true
            };

            const headers = new Headers();

            headers.set("Content-Type", "application/json");

            let token = null;

            if (typeof window.getToken === "function") {
                token = window.getToken();
            }

            if (token && typeof token === "object") {
                token =
                    token.access_token ||
                    token.accessToken ||
                    token.token ||
                    token.value ||
                    null;
            }

            if (token) {
                const authValue = String(token).startsWith("Bearer ")
                    ? String(token)
                    : `Bearer ${token}`;

                headers.set("Authorization", authValue);
            }

            console.log(
                "EXPORT AUTH CHECK",
                {
                    hasToken: !!token,
                    hasAuthorization: headers.has("Authorization")
                }
            );

            const finalUrl = window.toApiUrl(
                window.ENDPOINTS.taxFiling.export(company)
            );

            console.log(
                "EXPORT FETCH HEADERS",
                finalUrl,
                Object.fromEntries(headers.entries())
            );

            const resp = await fetch(finalUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                let msg = `Export failed (HTTP ${resp.status})`;

                try {
                    const j = await resp.json();
                    msg = j.error || j.detail || j.message || msg;
                } catch (_) {}

                throw new Error(msg);
            }

            const blob = await resp.blob();

            const ext =
                fmt === "xlsx"
                    ? "xlsx"
                    : fmt === "xml"
                        ? "xml"
                        : "csv";

            const a = document.createElement("a");
            const objectUrl = URL.createObjectURL(blob);

            a.href = objectUrl;
            a.download = `${authority}_PAYE_${year}_${mm}.${ext}`;

            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(() => {
                URL.revokeObjectURL(objectUrl);
            }, 1000);

            if (results) {
                results.style.display = "block";
                results.innerHTML = `<div style="color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;">✅ Export downloaded: ${a.download}</div>`;
            }

        } catch (err) {
            console.error("[PAYE Export] failed:", err);

            if (results) {
                results.style.display = "block";
                results.innerHTML = `<div style="color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;"><b>Export failed:</b> ${err?.message || err}</div>`;
            }

        } finally {
            if (btn && btn.__tfToken === stateToken) {
                btn.disabled = false;
                btn.textContent = oldLabel;
            }
        }
    };

    function showStatus(message, type = 'info') {
        if (typeof showPayrollStatus === 'function') {
            showPayrollStatus(message, type);
        } else {
            console.log(`[Tax Filing ${type}]`, message);
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    // ====================================================================
    // UI RENDERING FUNCTIONS
    // ====================================================================
    function createTaxFilingPanel() {
        const authorities = [
            { code: "SARS", name: "SARS", country: "South Africa", icon: "🇿🇦", formats: ["CSV", "Excel", "XML"] },
            { code: "RSL",  name: "RSL",  country: "Lesotho",      icon: "🇱🇸", formats: ["CSV", "Excel"] },
            { code: "BURS", name: "BURS", country: "Botswana",     icon: "🇧🇼", formats: ["CSV", "Excel"] }
        ];

        const selectedAuthority = state.selectedAuthority || "SARS";

        return `
        <div id="taxFilingPanel" class="tax-filing-panel">

            <!-- Header -->
            <div class="tax-filing-header">
                <h3 class="tax-filing-title">
                    <span>📋</span>
                    PAYE Tax Filing Export
                </h3>
                <p class="tax-filing-subtitle">
                    Generate compliant tax files for SARS, RSL, or BURS portals
                </p>
            </div>

            <!-- Authority Selection -->
            <div class="tax-filing-section">
                <label class="tax-filing-label">Select Tax Authority</label>

                <div class="tax-filing-authorities" id="taxFilingAuthorities">
                    ${authorities.map(authority => `
                        <div
                            class="tax-filing-authority-card
                                ${selectedAuthority === authority.code ? "selected" : ""}"
                            data-tax-authority="${authority.code}"
                            role="button"
                            tabindex="0"
                        >
                            <div class="tax-filing-authority-icon">${authority.icon}</div>
                            <div class="tax-filing-authority-name">${authority.name}</div>
                            <div class="tax-filing-authority-country">${authority.country}</div>
                            <div class="tax-filing-authority-formats">
                                ${authority.formats.map(format => `
                                    <span class="tax-filing-format-badge">${format}</span>
                                `).join("")}
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>

            <!-- Authority Workspace -->
            <div id="taxFilingAuthorityWorkspace" class="tax-filing-authority-workspace">

                <!-- ============ TOP BAR (very top) ============ -->
                <div id="taxFilingTopBar" class="tax-filing-topbar" style="display:none;">

                    <span id="taxFilingTopHint" class="tax-filing-top-hint"></span>

                    <div class="tax-filing-topbar-actions">

                        <!-- Step 1: Preview only -->
                        <button
                            type="button"
                            class="payroll-primary"
                            id="taxFilingPreviewBtn"
                        >
                            👁 Preview Returns
                        </button>

                        <!-- Step 2: after preview — Validate + exports -->
                        <div
                            class="tax-filing-actions"
                            id="taxFilingActions"
                            style="display:none;"
                        >
                            <button
                                type="button"
                                class="payroll-primary"
                                id="taxFilingValidateBtn"
                            >
                                ✅ Validate Data
                            </button>

                            <div class="tax-filing-export-group">
                                <span class="tax-filing-export-label">Export as:</span>

                                <button type="button" class="payroll-secondary" id="taxFilingExportCsv">
                                    📄 CSV
                                </button>

                                <button type="button" class="payroll-secondary" id="taxFilingExportXlsx">
                                    📊 Excel
                                </button>

                                <button
                                    type="button"
                                    class="payroll-secondary tax-filing-xml-btn"
                                    id="taxFilingExportXml"
                                    style="display:none;"
                                >
                                    📝 XML (e-Filing)
                                </button>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- Period Filters -->
                <div class="tax-filing-period-section">
                    <div class="tax-filing-field">
                        <label for="taxFilingYear">Tax Year</label>
                        <select id="taxFilingYear">
                            ${generateYearOptions(selectedAuthority)}
                        </select>
                    </div>

                    <div class="tax-filing-field">
                        <label for="taxFilingMonth">Filing Month</label>
                        <select id="taxFilingMonth">
                            <option value="">All Filing Months</option>
                            <option value="01">January</option>
                            <option value="02">February</option>
                            <option value="03">March</option>
                            <option value="04">April</option>
                            <option value="05">May</option>
                            <option value="06">June</option>
                            <option value="07">July</option>
                            <option value="08">August</option>
                            <option value="09">September</option>
                            <option value="10">October</option>
                            <option value="11">November</option>
                            <option value="12">December</option>
                        </select>
                    </div>
                </div>

                <!-- Inline Returns Table -->
                <div id="taxFilingReturnsTable" class="tax-filing-returns-table">
                    <p class="payroll-muted">
                        Select a tax authority to load its returns.
                    </p>
                </div>

                <!-- Full-page Preview (filled by Preview button) -->
                <div
                    id="taxFilingPreview"
                    class="tax-filing-preview"
                    style="display:none;"
                ></div>

                <!-- Validation Results -->
                <div
                    id="taxFilingValidationResults"
                    class="tax-filing-validation"
                    style="display:none;"
                ></div>

                <!-- Loading -->
                <div
                    id="taxFilingLoading"
                    class="tax-filing-loading"
                    style="display:none;"
                >
                    <div class="spinner"></div>
                    <p>Processing...</p>
                </div>

            </div>
        </div>

        <style>
            .tax-filing-panel {
                margin-top: 20px;
                padding: 20px;
                background: #f8fafc;
                border-radius: 10px;
                border: 1px solid #e2e8f0;
            }

            .tax-filing-header { margin-bottom: 20px; }

            .tax-filing-title {
                font-size: 18px;
                font-weight: 600;
                margin: 0 0 5px 0;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .tax-filing-subtitle {
                color: #64748b;
                font-size: 14px;
                margin: 0;
            }

            .tax-filing-section { margin-bottom: 20px; }

            .tax-filing-label {
                display: block;
                font-weight: 600;
                margin-bottom: 10px;
                color: #334155;
            }

            /* ===== TOP BAR ===== */
            .tax-filing-topbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
                padding: 12px 14px;
                margin-bottom: 16px;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
            }

            .tax-filing-top-hint {
                font-size: 13px;
                color: #64748b;
            }

            .tax-filing-topbar-actions {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            .tax-filing-topbar-actions .tax-filing-actions {
                padding-top: 0;
                margin-top: 0;
                border-top: none;
            }

            /* ===== AUTHORITY CARDS ===== */
            .tax-filing-authorities {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 12px;
            }

            .tax-filing-authority-card {
                background: white;
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .tax-filing-authority-card:hover {
                border-color: #94a3b8;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }

            .tax-filing-authority-card.selected {
                border-color: #3b82f6;
                background: #eff6ff;
            }

            .tax-filing-authority-icon { font-size: 30px; margin-bottom: 8px; }
            .tax-filing-authority-name { font-weight: 600; margin-bottom: 4px; }
            .tax-filing-authority-country { font-size: 13px; color: #64748b; }

            .tax-filing-authority-formats {
                display: flex;
                gap: 4px;
                margin-top: 8px;
                flex-wrap: wrap;
            }

            .tax-filing-format-badge {
                font-size: 11px;
                padding: 2px 6px;
                background: #f1f5f9;
                border-radius: 4px;
                color: #475569;
            }

            /* ===== WORKSPACE ===== */
            .tax-filing-authority-workspace {
                margin-top: 20px;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 18px;
            }

            /* ===== PERIOD FILTERS ===== */
            .tax-filing-period-section {
                display: flex;
                align-items: flex-end;
                gap: 12px;
                margin-bottom: 18px;
                padding-bottom: 16px;
                border-bottom: 1px solid #e2e8f0;
            }

            .tax-filing-field {
                display: flex;
                flex-direction: column;
                gap: 6px;
                width: 180px;
                max-width: 180px;
            }

            .tax-filing-field label {
                font-size: 11px;
                font-weight: 600;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .tax-filing-field select {
                width: 100%;
                box-sizing: border-box;
                padding: 9px 12px;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                font-size: 13px;
                background: white;
                color: #334155;
            }

            /* ===== INLINE RETURNS TABLE ===== */
            .tax-filing-returns-table {
                width: 100%;
                overflow-x: auto;
                margin-top: 4px;
            }

            .tax-filing-returns-table .payroll-table-wrap { width: 100%; overflow-x: auto; }

            .tax-filing-returns-table .payroll-preview-table {
                width: 100%;
                min-width: 1050px;
                border-collapse: collapse;
                font-size: 13px;
            }

            .tax-filing-returns-table .payroll-preview-table th,
            .tax-filing-returns-table .payroll-preview-table td {
                padding: 9px 12px;
                text-align: left;
                border-bottom: 1px solid #e2e8f0;
                white-space: nowrap;
            }

            .tax-filing-returns-table .payroll-preview-table th {
                background: #f8fafc;
                font-weight: 600;
                color: #475569;
            }

            .tax-filing-returns-table .payroll-preview-table tbody tr:hover {
                background: #f8fafc;
            }

            /* ===== ACTIONS ===== */
            .tax-filing-actions {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding-top: 16px;
                margin-top: 8px;
                border-top: 1px solid #e2e8f0;
                flex-wrap: wrap;
                gap: 12px;
            }

            .tax-filing-export-group {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            .tax-filing-export-label {
                font-size: 13px;
                color: #64748b;
            }

            /* ===== VALIDATION ===== */
            .tax-filing-validation {
                margin-top: 16px;
                padding: 16px;
                border-radius: 8px;
            }

            .tax-filing-validation.success { background: #f0fdf4; border: 1px solid #86efac; }
            .tax-filing-validation.error { background: #fef2f2; border: 1px solid #fca5a5; }
            .tax-filing-validation.warning { background: #fffbeb; border: 1px solid #fde047; }

            /* ===== FULL-PAGE PREVIEW ===== */
            .tax-filing-preview {
                margin-top: 20px;
                padding: 16px;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                overflow-x: auto;
            }

            .tax-filing-preview .payroll-table-wrap { width: 100%; overflow-x: auto; }

            .tax-filing-preview .payroll-preview-table {
                width: 100%;
                min-width: 1050px;
                border-collapse: collapse;
                font-size: 13px;
            }

            .tax-filing-preview .payroll-preview-table th,
            .tax-filing-preview .payroll-preview-table td {
                padding: 10px 12px;
                text-align: left;
                border-bottom: 1px solid #e2e8f0;
                white-space: nowrap;
            }

            .tax-filing-preview .payroll-preview-table th {
                background: #f8fafc;
                font-weight: 600;
                color: #475569;
                position: sticky;
                top: 0;
            }

            /* ===== LOADING ===== */
            .tax-filing-loading {
                text-align: center;
                padding: 40px;
                color: #64748b;
            }

            .tax-filing-loading .spinner {
                width: 32px;
                height: 32px;
                border: 3px solid #e2e8f0;
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin: 0 auto 12px;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* ===== RESPONSIVE ===== */
            @media (max-width: 800px) {
                .tax-filing-authorities { grid-template-columns: 1fr; }
                .tax-filing-period-section { flex-wrap: wrap; }
                .tax-filing-field { width: 180px; max-width: 180px; }
                .tax-filing-actions { align-items: stretch; flex-direction: column; }
                .tax-filing-export-group { width: 100%; }
            }

            @media (max-width: 500px) {
                .tax-filing-field { width: 100%; max-width: 100%; }
                .tax-filing-export-group { flex-direction: column; align-items: stretch; }
                .tax-filing-export-group button { width: 100%; }
            }
        </style>
    `;
    }
    /**
     * Render authority selection cards
     */
    function renderAuthorityCards() {
        return Object.entries(TAX_FILING_CONFIG.authorities).map(([code, config]) => `
            <div class="tax-filing-authority-card" 
                 data-authority="${code}"
                 onclick="window.__taxFiling.selectAuthority('${code}')">
                <div class="tax-filing-authority-icon">${config.icon}</div>
                <div class="tax-filing-authority-name">${escapeHtml(config.name)}</div>
                <div class="tax-filing-authority-country">${escapeHtml(config.country)} • ${config.currency}</div>
                <div class="tax-filing-authority-formats">
                    ${config.supportsFormats.map(f => 
                        `<span class="tax-filing-format-badge">${f.toUpperCase()}</span>`
                    ).join('')}
                </div>
            </div>
        `).join('');
    }
    
    /**
     * Generate month options for period selector
     */
    function generateMonthOptions() {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const currentMonth = new Date().getMonth();
        return months.map((name, i) => 
            `<option value="${i + 1}" ${i === currentMonth ? 'selected' : ''}>${name}</option>`
        ).join('');
    }
    
    /**
     * Generate year options for period selector
     */
    function generateYearOptions(authorityCode) {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        let baseYear = currentYear;

        // SARS tax year starts in March
        if (authorityCode === 'SARS' && currentMonth < 3) {
            baseYear = currentYear - 1;
        }

        // Lesotho tax year starts in April
        if (authorityCode === 'RSL' && currentMonth < 4) {
            baseYear = currentYear - 1;
        }

        // Botswana tax year starts in July
        if (authorityCode === 'BURS' && currentMonth < 7) {
            baseYear = currentYear - 1;
        }

        let options = '';

        for (
            let year = baseYear;
            year >= baseYear - 3;
            year--
        ) {
            options += `
                <option
                    value="${year}"
                    ${year === baseYear ? 'selected' : ''}
                >
                    ${year}/${year + 1}
                </option>
            `;
        }

        return options;
    }
    
    function getTaxYearStartMonth(authorityCode) {
        if (authorityCode === 'SARS') {
            return 3;
        }

        if (authorityCode === 'RSL') {
            return 4;
        }

        if (authorityCode === 'BURS') {
            return 7;
        }

        return 1;
    }

    function initTaxFilingPanel() {

        const panel = $("taxFilingPanel");

        if (!panel) return;


        /*
        * Authority selection
        */
        panel
            .querySelectorAll("[data-tax-authority]")
            .forEach(card => {

                const selectAuthority = () => {

                    const authority =
                        card.dataset.taxAuthority;

                    state.selectedAuthority =
                        authority;


                    /*
                    * Update selected card
                    */
                    panel
                        .querySelectorAll(
                            "[data-tax-authority]"
                        )
                        .forEach(c => {
                            c.classList.toggle(
                                "selected",
                                c.dataset.taxAuthority === authority
                            );
                        });


                    /*
                    * Rebuild tax-year options
                    */
                    const yearEl =
                        $("taxFilingYear");

                    if (yearEl) {

                        yearEl.innerHTML =
                            generateYearOptions(authority);

                    }


                    /*
                    * Reset month
                    */
                    const monthEl =
                        $("taxFilingMonth");

                    if (monthEl) {
                        monthEl.value = "";
                    }


                    /*
                    * Re-render authority table
                    */
                    window.renderPayrollStatutoryReturns?.();

                };


                card.addEventListener(
                    "click",
                    selectAuthority
                );


                card.addEventListener(
                    "keydown",
                    event => {

                        if (
                            event.key === "Enter" ||
                            event.key === " "
                        ) {

                            event.preventDefault();

                            selectAuthority();

                        }

                    }
                );

            });


        /*
        * Year filter
        */
        const yearEl =
            $("taxFilingYear");

        if (yearEl) {

            yearEl.addEventListener(
                "change",
                () => window.renderPayrollStatutoryReturns?.()
            );

        }


        /*
        * Month filter
        */
        const monthEl =
            $("taxFilingMonth");

        if (monthEl) {

            monthEl.addEventListener(
                "change",
                () => window.renderPayrollStatutoryReturns?.()
            );

        }


        /*
        * Initial render
        */
        window.renderPayrollStatutoryReturns?.();
    }

    function generateFilingMonthOptions(authorityCode, taxYear) {
        const startMonth =
            getTaxYearStartMonth(authorityCode);

        const startYear = Number(taxYear);

        let options = '';

        for (let i = 0; i < 12; i++) {
            const date = new Date(
                startYear,
                startMonth - 1 + i,
                1
            );

            const year = date.getFullYear();
            const month = date.getMonth() + 1;

            const value =
                `${year}-${String(month).padStart(2, '0')}`;

            const label =
                date.toLocaleString('en-ZA', {
                    month: 'long',
                    year: 'numeric'
                });

            options += `
                <option value="${value}">
                    ${label}
                </option>
            `;
        }

        return options;
    }

    // ====================================================================
    // CORE FUNCTIONS (Exposed via window.__taxFiling)
    // ====================================================================
    
    const TaxFilingAPI = {
        /**
         * Initialize the tax filing panel
         */
        init() {
            this.injectPanel();

            /* FIX (dead-button bug): init() is called on EVERY statutory-tab
               visit via loadPayrollStatutoryWorkspace() -> window.__taxFiling.init().
               bindEvents() is NOT idempotent, so every visit stacked ANOTHER click
               listener on the same buttons (1 click => N parallel handlers fighting
               over disabled/textContent). Guard the binding to the lifetime of the
               injected section so each DOM binds exactly once. */
            const section = document.getElementById('payeTaxFilingSection');
            if (section && section.dataset.tfBound === '1') {
                console.log('[Tax Filing] init() repeat ignored (events already bound)');
                return;
            }

            this.bindEvents(section);
            console.log('[Tax Filing] Module initialized');
        },

        injectPanel() {
            const section = document.getElementById('payeTaxFilingSection');

            if (!section) {
                console.warn('[Tax Filing] Could not find payeTaxFilingSection element');
                return;
            }

            if (section.dataset.tfInjected === '1') return;

            section.innerHTML = createTaxFilingPanel();
            section.dataset.tfInjected = '1';

            console.log('[Tax Filing] Panel injected into Statutory Returns tab');
        },
        
        /**
         * Bind event listeners
         */
        bindEvents(section) {
            const self = this;

            // ---------- resolve preview/export however they were defined ----------
            const getPreviewFn = () => {
                if (typeof previewPayeData === 'function') return previewPayeData;              // local fn in this file
                if (typeof window.previewPayeData === 'function') return window.previewPayeData; // global
                return null;
            };
            const callPreview = () => {
                const fn = getPreviewFn();
                if (fn) fn();
                else console.warn('[Tax Filing] No preview function found (previewPayeData / window.previewPayeData)');
            };
            const callExport = (e, fmt) => {
                if (typeof exportPayeFiling === 'function') { exportPayeFiling(e, fmt); return; }
                if (typeof window.exportPayeFiling === 'function') { window.exportPayeFiling(e, fmt); return; }
                if (typeof self.export === 'function') { self.export(fmt); return; }  // module's own export(format)
                console.warn('[Tax Filing] No export function found (exportPayeFiling / window.exportPayeFiling)');
            };

            // ---------- top bar + Preview button (created if template lacks it) ----------
            const returnsTable = document.getElementById('taxFilingReturnsTable');
            let topBar = document.getElementById('taxFilingTopBar');
            if (!topBar && returnsTable) {
                returnsTable.insertAdjacentHTML('beforebegin', `
                    <div id="taxFilingTopBar"
                         style="display:none;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:14px 0;padding:12px 16px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
                        <span id="taxFilingTopHint" style="color:#64748b;font-size:13px;"></span>
                        <button type="button" class="payroll-primary" id="taxFilingPreviewBtn">👁 Preview Returns</button>
                    </div>
                `);
                topBar = document.getElementById('taxFilingTopBar');
            }

            // ---------- authority cards (template uses data-tax-authority!) ----------
            document.querySelectorAll('.tax-filing-authority-card').forEach(card => {
                card.addEventListener('click', () => {
                    this.selectAuthority(card.dataset.taxAuthority || card.dataset.authority);
                });
            });

            // ---------- period selects ----------
            document.getElementById('taxFilingMonth')?.addEventListener('change', () => {
                this.onPeriodChange();
                window.renderPayrollStatutoryReturns?.();
            });

            document.getElementById('taxFilingYear')?.addEventListener('change', () => {
                const authority = state.selectedAuthority || 'SARS';
                const year = document.getElementById('taxFilingYear')?.value;
                const monthSelect = document.getElementById('taxFilingMonth');
                if (monthSelect && year) {
                    monthSelect.innerHTML =
                        '<option value="">Select filing month</option>' +
                        generateFilingMonthOptions(authority, year);
                }
                this.onPeriodChange();
                window.renderPayrollStatutoryReturns?.();
            });

            // ---------- strip inline onclick (prevents double-fire), then bind once ----------
            ['taxFilingValidateBtn', 'taxFilingExportCsv', 'taxFilingExportXlsx',
             'taxFilingExportXml', 'taxFilingPreviewBtn']
                .forEach(id => document.getElementById(id)?.removeAttribute('onclick'));

            document.getElementById('taxFilingValidateBtn')?.addEventListener('click', () => this.validate());
            document.getElementById('taxFilingPreviewBtn')?.addEventListener('click', callPreview);
            document.getElementById('taxFilingExportCsv')?.addEventListener('click', (e) => callExport(e, 'csv'));
            document.getElementById('taxFilingExportXlsx')?.addEventListener('click', (e) => callExport(e, 'xlsx'));
            document.getElementById('taxFilingExportXml')?.addEventListener('click', (e) => callExport(e, 'xml'));

            /* FIX (dead-button bug): record on the section that this DOM is bound,
               so repeated init() calls (every tab visit / return save / recalc)
               can never stack duplicate listeners again. */
            if (section) section.dataset.tfBound = '1';

            console.log('[Tax Filing] bindEvents done | preview fn:',
                typeof getPreviewFn(), '| preview btn in DOM:',
                !!document.getElementById('taxFilingPreviewBtn'));
        },

        /* Re-render the inline table, and the full-page preview if it is open */
        refreshTables() {
            window.renderPayrollStatutoryReturns?.();
            if (state.previewRendered) {
                window.renderPayrollStatutoryReturns?.('taxFilingPreview');
            }
        },
        
        /**
         * Handle authority selection
         */
        selectAuthority(authorityCode) {
            const code = authorityCode || state.selectedAuthority || 'SARS';
            state.selectedAuthority = code;   // ← real value, so checkPrerequisites() can pass

            document.querySelectorAll('.tax-filing-authority-card').forEach(card => {
                card.classList.toggle('selected',
                    (card.dataset.taxAuthority || card.dataset.authority) === code);
            });

            const periodSection = document.getElementById('taxFilingPeriodSection');
            const topBar     = document.getElementById('taxFilingTopBar');
            const previewBtn = document.getElementById('taxFilingPreviewBtn');
            const actions    = document.getElementById('taxFilingActions');
            const area       = document.getElementById('taxFilingPreview');
            const hint       = document.getElementById('taxFilingTopHint');

            if (periodSection) periodSection.style.display = '';

            // Preview-first UX: Preview shows now, Validate + exports wait until preview succeeds
            if (topBar) topBar.style.display = 'flex';
            if (previewBtn) previewBtn.style.display = '';
            if (actions) actions.style.display = 'none';
            if (area) { area.style.display = 'none'; area.innerHTML = ''; }
            if (hint) hint.textContent = `Pick a filing month for ${code}, then click Preview to load employee data.`;

            const yearSelect = document.getElementById('taxFilingYear');
            const monthSelect = document.getElementById('taxFilingMonth');
            if (yearSelect && monthSelect && yearSelect.value) {
                monthSelect.innerHTML =
                    '<option value="">Select filing month</option>' +
                    generateFilingMonthOptions(code, yearSelect.value);
            }

            const config = TAX_FILING_CONFIG.authorities[code];
            const xmlBtn = document.getElementById('taxFilingExportXml');
            if (xmlBtn) {
                xmlBtn.style.display = config?.supportsFormats?.includes('xml') ? 'inline-flex' : 'none';
            }

            this.onPeriodChange();
            window.renderPayrollStatutoryReturns?.();

            console.log('[Tax Filing] Selected authority:', code);
        },
        /* Step 2 of the flow: render the table full-page, then hand the
           top bar over to Validate + export options. */
        preview() {
            const previewArea = document.getElementById('taxFilingPreview');
            if (!previewArea) return;

            if (typeof window.renderPayrollStatutoryReturns === 'function') {
                window.renderPayrollStatutoryReturns('taxFilingPreview');
            } else {
                previewArea.innerHTML =
                    '<p class="payroll-muted">Returns renderer not available (dashboard.js must expose window.renderPayrollStatutoryReturns).</p>';
            }

            previewArea.style.display = '';
            state.previewRendered = true;

            const previewBtn = document.getElementById('taxFilingPreviewBtn');
            const actions    = document.getElementById('taxFilingActions');
            const hint       = document.getElementById('taxFilingTopHint');

            if (previewBtn) previewBtn.style.display = 'none';
            if (actions) actions.style.display = 'flex';
            if (hint) hint.textContent = 'Validate the data, then export in the format you need.';

            previewArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        
        getSelectedAuthority() {
            return state.selectedAuthority || "SARS";
        },
        /**
         * Handle period change
         */
        onPeriodChange() {
            const monthValue = document.getElementById('taxFilingMonth')?.value;
            const taxYear = document.getElementById('taxFilingYear')?.value;

            if (!monthValue || !taxYear) {
                state.selectedPeriod = null;
                return;
            }

            const [year, month] = monthValue.split('-').map(Number);
            const lastDay = new Date(year, month, 0).getDate();

            state.selectedPeriod = {
                month,
                year,
                taxYear,
                periodStart: `${year}-${String(month).padStart(2, '0')}-01`,
                periodEnd: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
            };

            console.log('[Tax Filing] Selected monthly period:', state.selectedPeriod);
        },
        
        /**
         * Validate data before export
         */
        async validate() {
            if (!this.checkPrerequisites()) return;

            this.setLoading(true);

            try {
                const companyId = getActiveCompanyId();

                const {
                    periodStart,
                    periodEnd
                } = state.selectedPeriod;

                const response = await apiCall(ENDPOINTS.taxFiling.validate(companyId), {
                    method: 'POST',
                    body: JSON.stringify({
                        authority_code: state.selectedAuthority,
                        period_start: periodStart,
                        period_end: periodEnd,
                        include_benefits: true
                    })
                });

                if (response?.ok && response?.data) {
                    const results = response.data;

                    state.validationResults = results;

                    this.renderValidationResults(results);

                    showStatus(
                        `Validation complete: ${results.summary.total_records} records checked`,
                        'success'
                    );
                } else {
                    throw new Error(response?.error || 'Validation failed');
                }

            } catch (error) {
                console.error('[Tax Filing] Validation error:', error);
                console.error('[Tax Filing] Error object:', error);

                showStatus(
                    `Validation failed: ${error.message}`,
                    'error'
                );

            } finally {
                this.setLoading(false);
            }
        },
        
        /**
         * Export data in specified format
         */
        async export(format) {
            if (!this.checkPrerequisites()) return;
            
            this.setLoading(true);
            
            try {
                const companyId = getActiveCompanyId();

                if (!companyId) {
                    throw new Error('No active company selected');
                }
                const {
                    periodStart,
                    periodEnd
                } = state.selectedPeriod;
                const config = TAX_FILING_CONFIG.authorities[state.selectedAuthority];

                // Build export request
                const requestBody = {
                    authority_code: state.selectedAuthority,
                    format: format,
                    period_start: periodStart,
                    period_end: periodEnd,
                    employer_info: {
                        // These should come from your company settings
                        name: '',
                        tax_reference_number: ''
                    },
                    options: {
                        include_validation_report: true,
                        include_headers: true
                    }
                };
                
                // Make direct fetch call for file download
                const token = typeof getToken === 'function' ? getToken() : '';
                const response = await fetch(ENDPOINTS.taxFiling.export(companyId), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify(requestBody)
                });
                
                if (response.ok) {
                    // Get filename from header or construct one
                    const contentDisposition = response.headers.get('Content-Disposition');
                    let filename = `${state.selectedAuthority}_PAYE_${periodEnd}.${format}`;
                    if (contentDisposition) {
                        const match = contentDisposition.match(/filename="?([^"]+)"?/);
                        if (match) filename = match[1];
                    }
                    
                    // Trigger download
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    
                    showStatus(`✅ Exported successfully: ${filename}`, 'success');
                    
                    // Open authority portal link
                    setTimeout(() => {
                        if (confirm(`File downloaded!\n\nOpen ${config.name} portal to upload?`)) {
                            window.open(config.portalUrl, '_blank');
                        }
                    }, 500);
                    
                } else {
                    const error = await response.json();
                    throw new Error(error.error || 'Export failed');
                }
            } catch (error) {
                console.error('[Tax Filing] Export error:', error);
                showStatus(`Export failed: ${error.message}`, 'error');
            } finally {
                this.setLoading(false);
            }
        },
        
        /**
         * Check prerequisites before action
         */
        checkPrerequisites() {
            if (!state.selectedAuthority) {
                showStatus('Please select a tax authority first', 'warning');
                return false;
            }
            if (!state.selectedPeriod || !state.selectedPeriod.month) {
                showStatus('Please select a filing period', 'warning');
                return false;
            }
            return true;
        },
        
        /**
         * Set loading state
         */
        setLoading(isLoading) {
            state.isProcessing = isLoading;
            const loadingEl = document.getElementById('taxFilingLoading');
            const validateBtn = document.getElementById('taxFilingValidateBtn');
            const previewBtn = document.getElementById('taxFilingPreviewBtn');
            const exportBtns = ['taxFilingExportCsv', 'taxFilingExportXlsx', 'taxFilingExportXml'];

            if (loadingEl) loadingEl.style.display = isLoading ? '' : 'none';
            if (validateBtn) validateBtn.disabled = isLoading;
            if (previewBtn) previewBtn.disabled = isLoading;
            exportBtns.forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.disabled = isLoading;
            });
        },
        
        /**
         * Render validation results
         */
        renderValidationResults(results) {
            const container = document.getElementById('taxFilingValidationResults');
            if (!container) return;

            container.style.display = '';

            const isValid = results.is_valid;

            const summary = results.summary || {
                total_records: 0,
                valid_records: 0,
                error_count: results.errors?.length || 0,
                warning_count: results.warnings?.length || 0
            };

            container.className = `tax-filing-validation ${isValid ? 'success' : summary.error_count > 0 ? 'error' : 'warning'}`;

            container.innerHTML = `
                <div class="validation-summary">
                    <strong>${isValid ? '✅ All Checks Passed' : summary.error_count > 0 ? '❌ Issues Found' : '⚠️ Warnings Present'}</strong>
                    <p>
                        ${summary.total_records} records checked • 
                        ${summary.valid_records} valid • 
                        ${summary.error_count > 0 ? `<span style="color:#dc2626">${summary.error_count} errors</span> •` : ''}
                        ${summary.warning_count > 0 ? `<span style="color:#d97706">${summary.warning_count} warnings</span>` : ''}
                    </p>
                </div>
                ${results.errors?.length > 0 ? `
                    <details open style="margin-top:12px;">
                        <summary style="cursor:pointer;font-weight:600;color:#dc2626;">Errors (${results.errors.length})</summary>
                        <ul style="margin:8px 0 0 20px;padding:0;">
                            ${results.errors.slice(0, 10).map(e => 
                                `<li style="margin-bottom:4px;">${escapeHtml(e.message)}</li>`
                            ).join('')}
                            ${results.errors.length > 10 ? `<li>...and ${results.errors.length - 10} more</li>` : ''}
                        </ul>
                    </details>
                ` : ''}
                ${results.warnings?.length > 0 ? `
                    <details style="margin-top:8px;">
                        <summary style="cursor:pointer;font-weight:600;color:#d97706;">Warnings (${results.warnings.length})</summary>
                        <ul style="margin:8px 0 0 20px;padding:0;">
                            ${results.warnings.slice(0, 5).map(w => 
                                `<li style="margin-bottom:4px;">${escapeHtml(w.message)}</li>`
                            ).join('')}
                        </ul>
                    </details>
                ` : ''}
            `;
        }
    };
    
    // ====================================================================
    // INITIALIZATION
    // ====================================================================
    
    // Expose API globally
    window.__taxFiling = TaxFilingAPI;
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => TaxFilingAPI.init());
    } else {
        // Give existing scripts time to load
        setTimeout(() => TaxFilingAPI.init(), 100);
    }
    
    console.log('[Tax Filing Integration] Module loaded. Call window.__taxFiling.init() manually if needed.');
    
})();
