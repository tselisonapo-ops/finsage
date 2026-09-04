
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
    const authorities = [
        {
            code: "SARS",
            name: "SARS",
            country: "South Africa",
            icon: "🇿🇦",
            formats: ["CSV", "Excel", "XML"]
        },
        {
            code: "RSL",
            name: "RSL",
            country: "Lesotho",
            icon: "🇱🇸",
            formats: ["CSV", "Excel"]
        },
        {
            code: "BURS",
            name: "BURS",
            country: "Botswana",
            icon: "🇧🇼",
            formats: ["CSV", "Excel"]
        }
    ];

    const selectedAuthority =
        state.selectedAuthority || "SARS";

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

                <label class="tax-filing-label">
                    Select Tax Authority
                </label>

                <div
                    class="tax-filing-authorities"
                    id="taxFilingAuthorities"
                >
                    ${authorities.map(authority => `
                        <div
                            class="tax-filing-authority-card
                                ${selectedAuthority === authority.code ? "selected" : ""}"
                            data-tax-authority="${authority.code}"
                            role="button"
                            tabindex="0"
                        >
                            <div class="tax-filing-authority-icon">
                                ${authority.icon}
                            </div>

                            <div class="tax-filing-authority-name">
                                ${authority.name}
                            </div>

                            <div class="tax-filing-authority-country">
                                ${authority.country}
                            </div>

                            <div class="tax-filing-authority-formats">
                                ${authority.formats.map(format => `
                                    <span class="tax-filing-format-badge">
                                        ${format}
                                    </span>
                                `).join("")}
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>


            <!-- Authority Workspace -->
            <div
                id="taxFilingAuthorityWorkspace"
                class="tax-filing-authority-workspace"
            >

                <!-- Period Filters -->
                <div class="tax-filing-period-section">

                    <div class="tax-filing-field">
                        <label for="taxFilingYear">
                            Tax Year
                        </label>

                        <select id="taxFilingYear">
                            ${generateYearOptions(selectedAuthority)}
                        </select>
                    </div>

                    <div class="tax-filing-field">
                        <label for="taxFilingMonth">
                            Filing Month
                        </label>

                        <select id="taxFilingMonth">
                            <option value="">
                                All Filing Months
                            </option>

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


                <!-- Returns Table -->
                <div
                    id="taxFilingReturnsTable"
                    class="tax-filing-returns-table"
                >
                    <p class="payroll-muted">
                        Loading ${selectedAuthority} returns...
                    </p>
                </div>


                <!-- Action Buttons -->
                <div
                    class="tax-filing-actions"
                    id="taxFilingActions"
                    style="display:none;"
                >

                    <button
                        type="button"
                        class="payroll-primary"
                        id="taxFilingValidateBtn"
                        onclick="window.__taxFiling.validate()"
                    >
                        ✅ Validate Data
                    </button>

                    <div class="tax-filing-export-group">

                        <span class="tax-filing-export-label">
                            Export as:
                        </span>

                        <button
                            type="button"
                            class="payroll-secondary"
                            id="taxFilingExportCsv"
                            onclick="window.__taxFiling.export('csv')"
                        >
                            📄 CSV
                        </button>

                        <button
                            type="button"
                            class="payroll-secondary"
                            id="taxFilingExportXlsx"
                            onclick="window.__taxFiling.export('xlsx')"
                        >
                            📊 Excel
                        </button>

                        <button
                            type="button"
                            class="payroll-secondary tax-filing-xml-btn"
                            id="taxFilingExportXml"
                            onclick="window.__taxFiling.export('xml')"
                            style="display:none;"
                        >
                            📝 XML (e-Filing)
                        </button>

                    </div>
                </div>


                <!-- Validation Results -->
                <div
                    id="taxFilingValidationResults"
                    class="tax-filing-validation"
                    style="display:none;"
                ></div>


                <!-- Preview -->
                <div
                    id="taxFilingPreview"
                    class="tax-filing-preview"
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

            .tax-filing-header {
                margin-bottom: 20px;
            }

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

            .tax-filing-section {
                margin-bottom: 20px;
            }

            .tax-filing-label {
                display: block;
                font-weight: 600;
                margin-bottom: 10px;
                color: #334155;
            }


            /* =========================================================
               AUTHORITY CARDS
            ========================================================= */

            .tax-filing-authorities {
                display: grid;
                grid-template-columns:
                    repeat(3, minmax(0, 1fr));
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
                box-shadow:
                    0 2px 4px rgba(0,0,0,0.05);
            }

            .tax-filing-authority-card.selected {
                border-color: #3b82f6;
                background: #eff6ff;
            }

            .tax-filing-authority-icon {
                font-size: 30px;
                margin-bottom: 8px;
            }

            .tax-filing-authority-name {
                font-weight: 600;
                margin-bottom: 4px;
            }

            .tax-filing-authority-country {
                font-size: 13px;
                color: #64748b;
            }

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


            /* =========================================================
               AUTHORITY WORKSPACE
            ========================================================= */

            .tax-filing-authority-workspace {
                margin-top: 20px;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 18px;
            }


            /* =========================================================
               PERIOD FILTERS
               Side by side and deliberately NOT full width
            ========================================================= */

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


            /* =========================================================
               RETURNS TABLE
            ========================================================= */

            .tax-filing-returns-table {
                width: 100%;
                overflow-x: auto;
                margin-top: 4px;
            }

            .tax-filing-returns-table .payroll-table-wrap {
                width: 100%;
                overflow-x: auto;
            }

            .tax-filing-returns-table .payroll-preview-table {
                width: 100%;
                min-width: 1050px;
                border-collapse: collapse;
                font-size: 13px;
            }

            .tax-filing-returns-table
            .payroll-preview-table th,
            .tax-filing-returns-table
            .payroll-preview-table td {
                padding: 9px 12px;
                text-align: left;
                border-bottom: 1px solid #e2e8f0;
                white-space: nowrap;
            }

            .tax-filing-returns-table
            .payroll-preview-table th {
                background: #f8fafc;
                font-weight: 600;
                color: #475569;
            }

            .tax-filing-returns-table
            .payroll-preview-table tbody tr:hover {
                background: #f8fafc;
            }


            /* =========================================================
               ACTIONS
            ========================================================= */

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


            /* =========================================================
               VALIDATION
            ========================================================= */

            .tax-filing-validation {
                margin-top: 16px;
                padding: 16px;
                border-radius: 8px;
            }

            .tax-filing-validation.success {
                background: #f0fdf4;
                border: 1px solid #86efac;
            }

            .tax-filing-validation.error {
                background: #fef2f2;
                border: 1px solid #fca5a5;
            }

            .tax-filing-validation.warning {
                background: #fffbeb;
                border: 1px solid #fde047;
            }


            /* =========================================================
               PREVIEW
            ========================================================= */

            .tax-filing-preview {
                margin-top: 16px;
                overflow-x: auto;
            }


            /* =========================================================
               LOADING
            ========================================================= */

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
                to {
                    transform: rotate(360deg);
                }
            }


            /* =========================================================
               RESPONSIVE
            ========================================================= */

            @media (max-width: 800px) {

                .tax-filing-authorities {
                    grid-template-columns: 1fr;
                }

                .tax-filing-period-section {
                    flex-wrap: wrap;
                }

                .tax-filing-field {
                    width: 180px;
                    max-width: 180px;
                }

                .tax-filing-actions {
                    align-items: stretch;
                    flex-direction: column;
                }

                .tax-filing-export-group {
                    width: 100%;
                }
            }

            @media (max-width: 500px) {

                .tax-filing-field {
                    width: 100%;
                    max-width: 100%;
                }

                .tax-filing-export-group {
                    flex-direction: column;
                    align-items: stretch;
                }

                .tax-filing-export-group button {
                    width: 100%;
                }
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
            this.bindEvents();
            console.log('[Tax Filing] Module initialized');
        },
        
        /**
         * Inject the tax filing panel into the DOM
         */
        /**
         * Inject the tax filing panel into the DOM
         */
        injectPanel() {
            const section = document.getElementById('payeTaxFilingSection');

            if (!section) {
                console.warn('[Tax Filing] Could not find payeTaxFilingSection element');
                return;
            }

            section.innerHTML = createTaxFilingPanel();

            console.log('[Tax Filing] Panel injected into Statutory Returns tab');
        },

        
        /**
         * Bind event listeners
         */
        bindEvents() {
            document.querySelectorAll('.tax-filing-authority-card').forEach(card => {
                card.addEventListener('click', () => {
                    // Read BOTH attribute variants — never undefined
                    const code =
                        card.dataset.taxAuthority ||
                        card.dataset.authority;

                    this.selectAuthority(code);
                });
            });

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

            document.getElementById('taxFilingValidateBtn')?.addEventListener('click', () => {
                this.validate();
            });

            document.getElementById('taxFilingExportCsv')?.addEventListener('click', () => {
                this.export('csv');
            });

            document.getElementById('taxFilingExportXlsx')?.addEventListener('click', () => {
                this.export('xlsx');
            });

            document.getElementById('taxFilingExportXml')?.addEventListener('click', () => {
                this.export('xml');
            });
        },
        
        /**
         * Handle authority selection
         */
        selectAuthority(authorityCode) {
            // Never store undefined/null — fall back to current, then SARS
            const code = authorityCode
                || state.selectedAuthority
                || 'SARS';

            state.selectedAuthority = code;

            document.querySelectorAll('.tax-filing-authority-card').forEach(card => {
                const cardCode =
                    card.dataset.taxAuthority || card.dataset.authority;
                card.classList.toggle('selected', cardCode === code);
            });

            const periodSection = document.getElementById('taxFilingPeriodSection');
            const actions = document.getElementById('taxFilingActions');

            if (periodSection) periodSection.style.display = '';
            if (actions) actions.style.display = '';

            const yearSelect = document.getElementById('taxFilingYear');
            const monthSelect = document.getElementById('taxFilingMonth');

            if (yearSelect && monthSelect && yearSelect.value) {
                monthSelect.innerHTML =
                    '<option value="">Select filing month</option>' +
                    generateFilingMonthOptions(authorityCode, yearSelect.value);
            }

            const config = TAX_FILING_CONFIG.authorities[authorityCode];
            const xmlBtn = document.getElementById('taxFilingExportXml');

            if (xmlBtn) {
                xmlBtn.style.display =
                    config?.supportsFormats?.includes('xml')
                        ? 'inline-flex'
                        : 'none';
            }

            this.onPeriodChange();

            // Call via window — bare call threw ReferenceError here
            if (typeof window.renderPayrollStatutoryReturns === 'function') {
                window.renderPayrollStatutoryReturns();
            }

            console.log(`[Tax Filing] Selected authority: ${code}`);
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
                
                if (response && !response.error) {
                    state.validationResults = response;
                    this.renderValidationResults(response);
                    showStatus(`Validation complete: ${response.summary.total_records} records checked`, 'success');
                } else {
                    throw new Error(response?.error || 'Validation failed');
                }
                } catch (error) {
                    console.error('[Tax Filing] Validation error:', error);
                    console.error('[Tax Filing] Error object:', error);
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
