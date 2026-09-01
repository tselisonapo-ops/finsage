
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
    
    // ====================================================================
    // UTILITY FUNCTIONS
    // ====================================================================
    
    // Global functions for PAYE buttons
    window.previewPayeData = async function() {
    const authority = document.getElementById('payeAuthoritySelect')?.value || 'SARS';
    const period = document.getElementById('payePeriodSelect')?.value || '2024/2025';
    const previewArea = document.getElementById('payePreviewArea');
    
    if (!previewArea) return;
    
    previewArea.innerHTML = `
        <div style="text-align:center; padding:30px; color:#64748b;">
        <p style="font-size:24px; margin-bottom:12px;">⏳</p>
        <p>Loading employee data for ${authority} (${period})...</p>
        </div>
    `;
    
    try {
        // Call your backend API
        const companyId = typeof cid === 'function' ? cid() : window.CURRENT_COMPANY_ID;
        const url = ENDPOINTS.taxFiling.preview(
            companyId,
            authority,
            period
        );

        const data = await apiFetch(url);
        
        if (data.employees && data.employees.length > 0) {
        previewArea.innerHTML = `
            <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#1e293b;">Employee Preview (${data.employees.length} employees)</strong>
            <span style="font-size:12px; color:#64748b;">${authority} • ${period}</span>
            </div>
            
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
                <tr style="background:#f1f5f9;">
                <th style="padding:10px 8px; text-align:left; border-bottom:2px solid #e2e8f0;">Emp #</th>
                <th style="padding:10px 8px; text-align:left; border-bottom:2px solid #e2e8f0;">Full Name</th>
                <th style="padding:10px 8px; text-align:left; border-bottom:2px solid #e2e8f0;">Tax Reference</th>
                <th style="padding:10px 8px; text-align:right; border-bottom:2px solid #e2e8f0;">Gross Income</th>
                <th style="padding:10px 8px; text-align:right; border-bottom:2px solid #e2e8f0;">PAYE Deducted</th>
                <th style="padding:10px 8px; text-align:center; border-bottom:2px solid #e2e8f0;">Status</th>
                </tr>
            </thead>
            <tbody>
                ${data.employees.map(emp => `
                <tr style="border-bottom:1px solid #f1f5f9; transition:background 0.15s;"
                    onmouseover="this.style.background='#f8fafc'"
                    onmouseout="this.style.background='white'">
                    <td style="padding:10px 8px;"><strong>${esc(emp.employee_no)}</strong></td>
                    <td style="padding:10px 8px;">${esc(emp.first_name)} ${esc(emp.last_name)}</td>
                    <td style="padding:10px 8px; font-family:monospace; font-size:12px;">${esc(emp.tax_number) || '<em style="color:#94a3b8;">—</em>'}</td>
                    <td style="padding:10px 8px; text-align:right; font-variant-numeric:tabular-nums;">
                    ${(emp.gross_income || 0).toLocaleString('en-ZA', {minimumFractionDigits: 2})}
                    </td>
                    <td style="padding:10px 8px; text-align:right; font-variant-numeric:tabular-nums; color:#dc2626; font-weight:500;">
                    ${(emp.paye_deducted || 0).toLocaleString('en-ZA', {minimumFractionDigits: 2})}
                    </td>
                    <td style="padding:10px 8px; text-align:center;">
                    <span style="
                        padding:3px 10px; 
                        border-radius:12px; 
                        font-size:11px; 
                        font-weight:500;
                        ${emp.status === 'active' 
                        ? 'background:#dcfce7; color:#166534;' 
                        : emp.status === 'inactive'
                            ? 'background:#fef3c7; color:#92400e;'
                            : 'background:#f1f5f9; color:#64748b;'
                        }
                    ">
                        ${esc(emp.status || 'unknown')}
                    </span>
                    </td>
                </tr>
                `).join('')}
            </tbody>
            <tfoot>
                <tr style="font-weight:700; background:#f8fafc; border-top:2px solid #e2e8f0;">
                <td colspan="3" style="padding:12px 8px; text-align:right; color:#475569;">
                    Totals (${data.employees.length} employees):
                </td>
                <td style="padding:12px 8px; text-align:right; color:#1e293b;">
                    ${(data.totals?.gross_income || 0).toLocaleString('en-ZA', {minimumFractionDigits: 2})}
                </td>
                <td style="padding:12px 8px; text-align:right; color:#dc2626;">
                    ${(data.totals?.paye_deducted || 0).toLocaleString('en-ZA', {minimumFractionDigits: 2})}
                </td>
                <td></td>
                </tr>
            </tfoot>
            </table>
            
            <div style="
            margin-top:14px; 
            padding:12px 16px; 
            background:#eff6ff; 
            border-left:4px solid #3b82f6; 
            border-radius:0 6px 6px 0;
            font-size:13px;
            color:#1e40af;
            ">
            ✅ Ready to export. Click <strong>"Export Filing"</strong> to download your ${authority.toUpperCase()} return file.
            </div>
        `;
        } else {
        previewArea.innerHTML = `
            <div style="text-align:center; padding:30px; color:#94a3b8;">
            <p style="font-size:32px; margin-bottom:12px;">📭</p>
            <p style="margin:0 0 6px 0; font-size:14px;">No employee data found</p>
            <p style="margin:0; font-size:12px;">Try selecting a different period or check if employees have been processed.</p>
            </div>
        `;
        }
        
    } catch (err) {
        console.error('[PAYE] Preview error:', err);
        previewArea.innerHTML = `
        <div style="
            text-align:center; 
            padding:30px; 
            color:#dc2626; 
            background:#fef2f2; 
            border-radius:8px;
            border:1px solid #fecaca;
        ">
            <p style="font-size:28px; margin-bottom:10px;">⚠️</p>
            <p style="margin:0 0 6px 0; font-weight:600;">Failed to load data</p>
            <p style="margin:0; font-size:13px;">${err.message}</p>
        </div>
        `;
    }
    };

    window.exportPayeFiling = async function(event) {
        // 1. Get Selections from the DOM
        const authority = document.getElementById('payeAuthoritySelect')?.value || 'SARS';
        const periodStr = document.getElementById('payePeriodSelect')?.value || '2024/2025';
        const format = document.getElementById('payeFormatSelect')?.value || 'csv';
        
        // 2. Parse the period string (e.g., "2024/2025") into actual dates
        // Southern African tax years have different start months
        const startYear = parseInt(periodStr.split('/')[0]);
        let periodStart, periodEnd;

        if (authority === 'SARS') {
            // South Africa: March to February
            periodStart = `${startYear}-03-01`;
            periodEnd = `${startYear + 1}-02-28`;
        } else if (authority === 'RSL') {
            // Lesotho: April to March
            periodStart = `${startYear}-04-01`;
            periodEnd = `${startYear + 1}-03-31`;
        } else {
            // Botswana (BURS): July to June
            periodStart = `${startYear}-07-01`;
            periodEnd = `${startYear + 1}-06-30`;
        }

        // 3. Construct the Request Body
        // We pull employer info directly from the global payrollState
        const requestBody = {
            authority_code: authority,
            format: format,
            period_start: periodStart,
            period_end: periodEnd,
            include_benefits: true, // This triggers the backend benefits query
            employer_info: {
                name: payrollState.settings?.company_name || window.CURRENT_COMPANY?.name || '',
                tax_reference_number: payrollState.settings?.tax_reference_number || window.CURRENT_COMPANY?.tax_number || '',
                registration_number: window.CURRENT_COMPANY?.registration_number || ''
            }
        };

        // 4. Execute Export
        const btn = event?.currentTarget || event?.target;
        const originalText = btn?.innerHTML;
        const companyId = typeof cid === 'function' ? cid() : window.CURRENT_COMPANY_ID;

        try {
            if (btn) {
                btn.innerHTML = '⏳ Processing...';
                btn.disabled = true;
            }

            const response = await fetch(`/api/companies/${companyId}/payroll/tax-filing/export`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Include your standard auth header helper
                    ...(typeof AUTH_HEADER === 'function' ? AUTH_HEADER() : {})
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Export failed');
            }

            // 5. Handle File Download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            const timestamp = new Date().toISOString().slice(0, 10);
            
            a.href = url;
            a.download = `${authority}_PAYE_Export_${periodStr.replace('/', '-')}_${timestamp}.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            showPayrollStatus(`Successfully exported ${authority} filing.`, "success");

        } catch (err) {
            console.error('[PAYE Export] Error:', err);
            showPayrollStatus(`Export Error: ${err.message}`, "error");
        } finally {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    };
    /**
     * Safe wrapper around your existing apiFetch
     */
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
    
    /**
     * Show status message using your existing function
     */
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
    
    /**
     * Create the Tax Filing Panel HTML
     * This gets injected into your Statutory Returns tab
     */
    function createTaxFilingPanel() {
        return `
            <div id="taxFilingPanel" class="tax-filing-panel">
                <!-- Header -->
                <div class="tax-filing-header">
                    <h3 class="tax-filing-title">
                        <span>📋</span> PAYE Tax Filing Export
                    </h3>
                    <p class="tax-filing-subtitle">
                        Generate compliant tax files for SARS, RSL, or BURS portals
                    </p>
                </div>

                <!-- Authority Selection -->
                <div class="tax-filing-section">
                    <label class="tax-filing-label">Select Tax Authority</label>
                    <div class="tax-filing-authorities" id="taxFilingAuthorities">
                        ${renderAuthorityCards()}
                    </div>
                </div>

                <!-- Period Selection -->
                <div class="tax-filing-section" id="taxFilingPeriodSection" style="display:none;">
                    <label class="tax-filing-label">Filing Period</label>
                    <div class="tax-filing-period-row">
                        <select id="taxFilingMonth" class="tax-filing-select">
                            <option value="">Select Month</option>
                            ${generateMonthOptions()}
                        </select>
                        <select id="taxFilingYear" class="tax-filing-select">
                            <option value="">Year</option>
                            ${generateYearOptions()}
                        </select>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="tax-filing-actions" id="taxFilingActions" style="display:none;">
                    <button type="button" 
                            class="payroll-primary" 
                            id="taxFilingValidateBtn"
                            onclick="window.__taxFiling.validate()">
                        ✅ Validate Data
                    </button>
                    
                    <div class="tax-filing-export-group">
                        <span class="tax-filing-export-label">Export as:</span>
                        <button type="button" 
                                class="payroll-secondary" 
                                id="taxFilingExportCsv"
                                onclick="window.__taxFiling.export('csv')">
                            📄 CSV
                        </button>
                        <button type="button" 
                                class="payroll-secondary" 
                                id="taxFilingExportXlsx"
                                onclick="window.__taxFiling.export('xlsx')">
                            📊 Excel
                        </button>
                        <button type="button" 
                                class="payroll-secondary tax-filing-xml-btn" 
                                id="taxFilingExportXml"
                                onclick="window.__taxFiling.export('xml')"
                                style="display:none;">
                            📝 XML (e-Filing)
                        </button>
                    </div>
                </div>

                <!-- Validation Results -->
                <div id="taxFilingValidationResults" class="tax-filing-validation" style="display:none;"></div>

                <!-- Preview Table -->
                <div id="taxFilingPreview" class="tax-filing-preview" style="display:none;"></div>

                <!-- Loading Overlay -->
                <div id="taxFilingLoading" class="tax-filing-loading" style="display:none;">
                    <div class="spinner"></div>
                    <p>Processing...</p>
                </div>
            </div>
            
            <style>
                .tax-filing-panel { 
                    margin-top: 20px; 
                    padding: 20px; 
                    background: #f8fafc; 
                    border-radius: 8px; 
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
                
                /* Authority Cards */
                .tax-filing-authorities { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
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
                .tax-filing-authority-icon { font-size: 32px; margin-bottom: 8px; }
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
                
                /* Period Row */
                .tax-filing-period-row { display: flex; gap: 12px; }
                .tax-filing-select { 
                    flex: 1; 
                    padding: 10px 12px; 
                    border: 1px solid #d1d5db; 
                    border-radius: 6px; 
                    font-size: 14px; 
                }
                
                /* Actions */
                .tax-filing-actions { 
                    display: flex; 
                    align-items: center; 
                    justify-content: space-between;
                    padding-top: 16px;
                    border-top: 1px solid #e2e8f0;
                    flex-wrap: wrap;
                    gap: 12px;
                }
                .tax-filing-export-group { display: flex; align-items: center; gap: 8px; }
                .tax-filing-export-label { font-size: 13px; color: #64748b; }
                
                /* Validation Results */
                .tax-filing-validation { 
                    margin-top: 16px; 
                    padding: 16px; 
                    border-radius: 8px; 
                }
                .tax-filing-validation.success { background: #f0fdf4; border: 1px solid #86efac; }
                .tax-filing-validation.error { background: #fef2f2; border: 1px solid #fca5a5; }
                .tax-filing-validation.warning { background: #fffbeb; border: 1px solid #fde047; }
                
                /* Preview Table */
                .tax-filing-preview { margin-top: 16px; }
                .tax-filing-preview-table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    font-size: 13px; 
                }
                .tax-filing-preview-table th,
                .tax-filing-preview-table td { 
                    padding: 8px 12px; 
                    text-align: left; 
                    border-bottom: 1px solid #e2e8f0; 
                }
                .tax-filing-preview-table th { 
                    background: #f8fafc; 
                    font-weight: 600; 
                }
                
                /* Loading */
                .tax-filing-loading { 
                    text-align: center; 
                    padding: 40px; 
                    color: #64748b; 
                }
                .tax-filing-loading .spinner { 
                    width: 32px; height: 32px; 
                    border: 3px solid #e2e8f0; 
                    border-top-color: #3b82f6; 
                    border-radius: 50%; 
                    animation: spin 0.8s linear infinite; 
                    margin: 0 auto 12px; 
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                
                /* Responsive */
                @media (max-width: 640px) {
                    .tax-filing-authorities { grid-template-columns: 1fr; }
                    .tax-filing-period-row { flex-direction: column; }
                    .tax-filing-actions { flex-direction: column; align-items: stretch; }
                    .tax-filing-export-group { justify-content: stretch; }
                    .tax-filing-export-group button { flex: 1; }
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
    function generateYearOptions() {
        const currentYear = new Date().getFullYear();
        let options = '';
        for (let year = currentYear; year >= currentYear - 3; year--) {
            options += `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`;
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
            this.bindEvents();
            console.log('[Tax Filing] Module initialized');
        },
        
        /**
         * Inject the tax filing panel into the DOM
         */
        injectPanel() {
            // Find the statutory tab content area
            const statutoryPanel = document.getElementById('payrollTabStatutory');
            
            if (statutoryPanel) {
                // Insert our panel before the existing content or append
                const existingContent = statutoryPanel.querySelector('.payroll-statutory-content');
                const panelDiv = document.createElement('div');
                panelDiv.innerHTML = createTaxFilingPanel();
                
                if (existingContent) {
                    statutoryPanel.insertBefore(panelDiv, existingContent);
                } else {
                    statutoryPanel.appendChild(panelDiv);
                }
                
                console.log('[Tax Filing] Panel injected into Statutory Returns tab');
            } else {
                console.warn('[Tax Filing] Could not find payrollTabStatutory element');
            }
        },
        
        /**
         * Bind event listeners
         */
        bindEvents() {
            // Period change handlers
            document.getElementById('taxFilingMonth')?.addEventListener('change', () => this.onPeriodChange());
            document.getElementById('taxFilingYear')?.addEventListener('change', () => this.onPeriodChange());
        },
        
        /**
         * Handle authority selection
         */
        selectAuthority(authorityCode) {
            state.selectedAuthority = authorityCode;
            
            // Update card selection UI
            document.querySelectorAll('.tax-filing-authority-card').forEach(card => {
                card.classList.toggle('selected', card.dataset.authority === authorityCode);
            });
            
            // Show period selection
            document.getElementById('taxFilingPeriodSection').style.display = '';
            document.getElementById('taxFilingActions').style.display = '';
            
            // Show/hide XML button based on authority support
            const config = TAX_FILING_CONFIG.authorities[authorityCode];
            const xmlBtn = document.getElementById('taxFilingExportXml');
            if (xmlBtn) {
                xmlBtn.style.display = config.supportsFormats.includes('xml') ? '' : 'none';
            }
            
            console.log(`[Tax Filing] Selected authority: ${authorityCode}`);
        },
        
        /**
         * Handle period change
         */
        onPeriodChange() {
            const month = document.getElementById('taxFilingMonth')?.value;
            const year = document.getElementById('taxFilingYear')?.value;
            
            if (month && year) {
                state.selectedPeriod = { month, year };
                console.log(`[Tax Filing] Selected period: ${month}/${year}`);
            }
        },
        
        /**
         * Validate data before export
         */
        async validate() {
            if (!this.checkPrerequisites()) return;
            
            this.setLoading(true);
            
            try {
                const companyId = getCompanyId();
                const { month, year } = state.selectedPeriod;
                
                // Calculate period dates
                const lastDay = new Date(year, month, 0).getDate();
                const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
                const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
                
                const response = await apiCall(ENDPOINTS.taxFiling.validate(companyId), {
                    method: 'POST',
                    body: JSON.stringify({
                        authority_code: state.selectedAuthority,
                        period_start: periodStart,
                        period_end: periodEnd,
                        include_benefits: true
                    })
                });
                
                if (response.ok && response.data) {
                    state.validationResults = response.data;
                    this.renderValidationResults(response.data);
                    showStatus(`Validation complete: ${response.data.summary.total_records} records checked`, 'success');
                } else {
                    throw new Error(response.error || 'Validation failed');
                }
            } catch (error) {
                console.error('[Tax Filing] Validation error:', error);
                showStatus(`Validation failed: ${error.message}`, 'error');
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
                const companyId = getCompanyId();
                const { month, year } = state.selectedPeriod;
                const config = TAX_FILING_CONFIG.authorities[state.selectedAuthority];
                
                const lastDay = new Date(year, month, 0).getDate();
                const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
                const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
                
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
            const exportBtns = ['taxFilingExportCsv', 'taxFilingExportXlsx', 'taxFilingExportXml'];
            
            if (loadingEl) loadingEl.style.display = isLoading ? '' : 'none';
            if (validateBtn) validateBtn.disabled = isLoading;
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
            const summary = results.summary;
            
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
