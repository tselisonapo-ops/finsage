(function dataMigrationWorkspace() {
  "use strict";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const esc = value =>
    String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]
    );

  const isoDate = value => {
    if (!value) return "";

    const text = String(value);

    return text.length >= 10
      ? text.slice(0, 10)
      : text;
  };

  const companyId = () =>
    Number(
      window.CURRENT_COMPANY?.id ||
      window.CURRENT_COMPANY_ID ||
      window.currentCompanyId ||
      0
    );

  function resolveCurrency(currency) {
    return (
      String(currency || "").trim().toUpperCase() ||
      String(window.CURRENT_CURRENCY || "").trim().toUpperCase() ||
      String(window.CURRENT_COMPANY?.currency || "").trim().toUpperCase() ||
      String(document.getElementById("invCurrency")?.value || "").trim().toUpperCase() ||
      String(document.getElementById("billCurrency")?.value || "").trim().toUpperCase() ||
      "USD"
    );
  }

  window.resolveCurrency = resolveCurrency;

  const sourceSystems = [
    {
      code: "sage_pastel",
      name: "Sage Pastel",
      format: "accounting_export",
    },
    {
      code: "sage_business_cloud",
      name: "Sage Business Cloud",
      format: "accounting_export",
    },
    {
      code: "quickbooks",
      name: "QuickBooks",
      format: "accounting_export",
    },
    {
      code: "xero",
      name: "Xero",
      format: "accounting_export",
    },
    {
      code: "excel_csv",
      name: "Excel / CSV",
      format: "excel_csv",
    },
    {
      code: "sql_database",
      name: "SQL database",
      format: "sql_extract",
    },
    {
      code: "other",
      name: "Other",
      format: "other",
    },
  ];

  const steps = [
    ["project", "Project"],
    ["source", "Source"],
    ["scope", "Scope"],
    ["files", "Files"],
    ["detect", "Detection"],
    ["mapping", "Field Mapping"],
    ["accounts", "Account Mapping"],
    ["validate", "Validation"],
    ["preview", "Preview"],
    ["stage", "Staging"],
    ["reconcile", "Reconcile"],
    ["commit", "Commit"],
  ];

  const state = {
    bound: false,
    initialising: false,
    loading: false,
    saving: false,
    loaded: false,
    dirty: false,

    activeStep: "project",
    projects: [],
    sourceProfiles: [],
    project: null,
    activity: [],
    error: "",

    scope: {
      migration_mode: "opening",
      selected_count: 0,
      entities: [],
    },

    scopeLoaded: false,
    scopeDirty: false,
    scopeSaving: false,

    files: [],
    datasets: [],

    filesLoaded: false,
    filesUploading: false,
    datasetSavingId: null,

    dragActive: false,
    detection:{datasets:[],record_count:0,detected_count:0},
    detectionLoaded:false,
    detecting:false,

    fieldMappings:{datasets:[],dataset_count:0,complete_count:0,required_unmapped_count:0,duplicate_count:0},
    fieldMappingsLoaded:false,
    mappingDatasetId:null,
    mappingSaving:false,
    mappingAutoRunning:false,
    mappingValidating:false,

    referenceMappings:{
      groups:[],
      reference_count:0,
      group_count:0,
      unresolved_count:0,
      pending_count:0,
      complete_count:0,
    },
    referenceMappingsLoaded:false,
    referenceMappingType:null,
    referenceMappingDirty:false,
    referenceScanning:false,
    referenceAutoRunning:false,
    referenceSaving:false,
    referenceValidating:false,

    ppe:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    },
    ppeLoaded:false,
    ppeSaving:false,
    ppePreviewLoading:false,

    leases:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    },
    leasesLoaded:false,
    leaseSaving:false,
    leasePreviewLoading:false,

    loans:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    },
    loansLoaded:false,
    loanSaving:false,
    loanPreviewLoading:false,
  
    revenue:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    },
    revenueLoaded:false,
    revenueSaving:false,
    revenuePreviewLoading:false,

    accruals:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    },
    accrualsLoaded:false,
    accrualSaving:false,
    accrualPreviewLoading:false,

    payroll:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    },
    payrollLoaded:false,
    payrollSaving:false,
    payrollPreviewLoading:false,

    payrollItems:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    },
    payrollItemsLoaded:false,
    payrollItemsSaving:false,
    payrollItemsPreviewLoading:false,

    payrollLeave:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    },

    payrollEmployeeLoans:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    },

    payrollLeaveLoaded:false,
    payrollLeaveSaving:false,
    payrollLeavePreviewLoading:false,

    payrollEmployeeLoansLoaded:false,
    payrollEmployeeLoansSaving:false,
    payrollEmployeeLoansPreviewLoading:false,

    payrollHistory:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    },
    payrollHistoryLoaded:false,
    payrollHistorySaving:false,
    payrollHistoryPreviewLoading:false,

    payrollReconciliation:null,
    payrollReconciliationHistory:[],
    payrollReconciliationLoaded:false,
    payrollReconciliationRunning:false,

    products:{
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
      accounting:null,
      accountingPreview:null,
    },
    productsLoaded:false,
    productsSaving:false,
    productsAccountingSaving:false,
    productsPreviewLoading:false,
    productsAccountingPreviewLoading:false,

    inventoryMigration:{
      datasets:[],
      datasetId:null,
      settings:null,
      targets:[],
      mapping:null,
      preview:null,
    },
    inventoryMigrationLoaded:false,
    inventoryMigrationSaving:false,
    inventoryLocationSaving:false,
    inventoryLocationPreviewLoading:false,

    inventoryOpening:{
      datasets:[],
      datasetId:null,
      settings:null,
      preview:null,
      reconciliation:null,
    },
    inventoryOpeningLoaded:false,
    inventoryOpeningSaving:false,
    inventoryOpeningPreviewLoading:false,
    inventoryOpeningReconciling:false,

    inventoryMovements:{
      datasets:[],
      datasetId:null,
      settings:null,
      typeMapping:null,
      preview:null,
      reconciliation:null,
    },
    inventoryMovementsLoaded:false,
    inventoryMovementsSaving:false,
    inventoryMovementTypesSaving:false,
    inventoryMovementPreviewLoading:false,
    inventoryMovementReconciling:false,

    posMigration:{
      datasets:[],
      datasetId:null,
      settings:null,
      terminals:null,
      paymentMethods:null,
      catalogue:null,
      preview:null,
      reconciliation:null,
    },
    posMigrationLoaded:false,
    posMigrationSaving:false,
    posMappingSaving:false,
    posPreviewLoading:false,
    posReconciling:false,

    posMenuMigration:{
      datasets:[],
      datasetId:null,
      settings:null,
      menuItems:null,
      components:null,
      addons:null,
      preview:null,
      reconciliation:null,
    },
    posMenuMigrationLoaded:false,
    posMenuMigrationSaving:false,
    posMenuMappingSaving:false,
    posMenuPreviewLoading:false,
    posMenuReconciling:false,

    posHistoryMigration:{
      datasets:[],
      datasetId:null,
      settings:null,
      preview:null,
      reconciliation:null,
    },
    posHistoryMigrationLoaded:false,
    posHistorySaving:false,
    posHistoryPreviewLoading:false,
    posHistoryReconciling:false,
  };

  function defaultProject() {
    const today = new Date()
      .toISOString()
      .slice(0, 10);

    const currency = window.resolveCurrency?.() || "USD";

    return {
      id: null,
      company_id: companyId(),

      reference: "",

      name: "",
      description: "",

      status: "draft",
      migration_mode: "opening",
      import_mode: "create_only",

      financial_year_start: "",
      cutover_date: "",

      default_currency: currency,
      source_timezone:
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone || "Africa/Maseru",

      source_country_code: "",
      source_tax_regime: "",

      source_system_code: "excel_csv",
      source_system_name: "Excel / CSV",
      source_system_version: "",
      source_format: "excel_csv",

      date_format: "YYYY-MM-DD",
      decimal_separator: ".",
      thousands_separator: ",",
      debit_credit_convention:
        "separate_columns",

      configuration_json: {},
      metadata_json: {},

      source: {
        source_profile_id: null,
        source_system_code: "excel_csv",
        source_system_name: "Excel / CSV",
        source_system_version: "",
        source_format: "excel_csv",

        country_code: "",
        tax_regime: "",
        default_currency: currency,
        source_timezone:
          Intl.DateTimeFormat()
            .resolvedOptions()
            .timeZone || "Africa/Maseru",

        date_format: "YYYY-MM-DD",
        decimal_separator: ".",
        thousands_separator: ",",
        debit_credit_convention:
          "separate_columns",

        connection_type: "file_upload",
        connection_name:
          "Primary migration source",

        settings_json: {},
        metadata_json: {},
      },
    };
  }

  function normalizeProject(project) {
    const base = defaultProject();
    const source = project?.source || {};

    return {
      ...base,
      ...(project || {}),

      financial_year_start: isoDate(
        project?.financial_year_start
      ),

      cutover_date: isoDate(
        project?.cutover_date ||
        base.cutover_date
      ),

      configuration_json:
        project?.configuration_json || {},

      metadata_json:
        project?.metadata_json || {},

      source: {
        ...base.source,
        ...source,

        country_code:
          source.country_code ??
          project?.source_country_code ??
          "",

        tax_regime:
          source.tax_regime ??
          project?.source_tax_regime ??
          "",

        default_currency:
          source.default_currency ??
          project?.default_currency ??
          base.default_currency,

        source_timezone:
          source.source_timezone ??
          project?.source_timezone ??
          base.source_timezone,

        date_format:
          source.date_format ??
          project?.date_format ??
          "YYYY-MM-DD",

        decimal_separator:
          source.decimal_separator ??
          project?.decimal_separator ??
          ".",

        thousands_separator:
          source.thousands_separator ??
          project?.thousands_separator ??
          ",",

        debit_credit_convention:
          source.debit_credit_convention ??
          project?.debit_credit_convention ??
          "separate_columns",

        settings_json:
          source.settings_json || {},

        metadata_json:
          source.metadata_json || {},
      },
    };
  }

  function log(message) {
    const time = new Date()
      .toLocaleTimeString();

    state.activity.push(
      `${time} — ${message}`
    );
  }

  function setLoading(value) {
    state.loading = Boolean(value);
    render();
  }

  function notify(message) {
    if (
      typeof window.showToast === "function"
    ) {
      window.showToast(message);
      return;
    }

    alert(message);
  }

  function errorMessage(error) {
    return (
      error?.data?.error ||
      error?.data?.detail ||
      error?.message ||
      "Unexpected migration error"
    );
  }

  async function bindDataMigrationScreen() {
    const root = $("#migrationWorkspace");

    if (!root) {
      console.warn(
        "[DataMigration] #migrationWorkspace not found"
      );
      return;
    }

    if (!state.bound) {
      state.bound = true;

      root.addEventListener("click", handleClick);
      root.addEventListener("change", handleChange);
      root.addEventListener("input", handleInput);

      const fileInput =
        $("#mwFileInput");

      fileInput?.addEventListener(
        "change",
        event => {
          uploadFiles(
            event.target.files
          );

          event.target.value = "";
        }
      );

      root.addEventListener(
        "dragenter",
        handleDragEnter
      );

      root.addEventListener(
        "dragover",
        handleDragOver
      );

      root.addEventListener(
        "dragleave",
        handleDragLeave
      );

      root.addEventListener(
        "drop",
        handleDrop
      );
    }

    if (!state.loaded && !state.initialising) {
      await initialise();
      return;
    }

    render();
  }

  async function initialise() {
    if (state.initialising) return;

    state.initialising = true;

    const cid = companyId();
    if (!cid) {
      state.error =
        "Select a company before opening Data Migration.";

      state.project = defaultProject();
      state.loaded = true;
      render();
      return;
    }

    state.loading = true;
    state.error = "";
    render();

    try {
      const [
        projectResponse,
        profileResponse,
      ] = await Promise.all([
        apiFetch(
          ENDPOINTS.migrations.projects(
            cid,
            { limit: 200 }
          )
        ),

        apiFetch(
          ENDPOINTS.migrations.sourceProfiles(
            cid
          )
        ),
      ]);

      state.projects =
        projectResponse?.projects || [];

      state.sourceProfiles =
        profileResponse?.profiles || [];

      if (state.projects.length) {
      await loadProject(
          state.projects[0].id,
          { renderAfter: false }
      );
      } else {
      state.project = defaultProject();
      state.dirty = true;
      }

      state.loaded = true;
      log("Migration workspace loaded");

    } catch (error) {
      console.error(
        "[DataMigration] initialise failed",
        error
      );

      state.error = errorMessage(error);
      state.project = defaultProject();
      state.loaded = true;

    } finally {
      state.initialising = false;
      state.loading = false;
      render();
    }
  }

  async function refreshProjects(
    selectedProjectId = null
  ) {
    const cid = companyId();

    const response = await apiFetch(
      ENDPOINTS.migrations.projects(
        cid,
        { limit: 200 }
      )
    );

    state.projects =
      response?.projects || [];

    if (selectedProjectId) {
      const found = state.projects.find(
        project =>
          Number(project.id) ===
          Number(selectedProjectId)
      );

      if (!found) {
        state.projects.unshift({
          id: selectedProjectId,
          name:
            state.project?.name ||
            `Migration ${selectedProjectId}`,
          reference:
            state.project?.reference || "",
          status:
            state.project?.status || "draft",
        });
      }
    }
  }

  async function loadProject(
    projectId,
    {
      renderAfter = true,
    } = {}
  ) {
    const cid = companyId();
    const id = Number(projectId);

    if (!cid || !id) return;

    state.loading = true;
    state.error = "";

    if (renderAfter) render();

    try {
      const response = await apiFetch(
        ENDPOINTS.migrations.project(
          cid,
          id
        )
      );

      state.project = normalizeProject(
        response?.project
      );

      await loadScope(
        state.project.id,
        {
          renderAfter: false,
        }
      );

      await loadFiles(
        state.project.id,
        {
          renderAfter: false,
        }
      );

      await loadDetection(state.project.id,{renderAfter:false});
      await loadFieldMappings(state.project.id,{renderAfter:false});
      await loadReferenceMappings(state.project.id,{renderAfter:false});
      await loadPpeMapping(state.project.id,{renderAfter:false});
      await loadLeaseMapping(state.project.id,{renderAfter:false});
      await loadLoanMapping(state.project.id,{renderAfter:false});
      await loadRevenueMapping(state.project.id,{renderAfter:false});
      await loadAccrualMapping(state.project.id,{renderAfter:false});
      await loadPayrollMapping(state.project.id,{renderAfter:false});
      await loadPayrollItems(state.project.id,{renderAfter:false});
      await loadPayrollLeave(state.project.id,{renderAfter:false});
      await loadPayrollEmployeeLoans(state.project.id,{renderAfter:false});
      await loadPayrollHistory(state.project.id,{renderAfter:false});
      await loadPayrollReconciliation(state.project.id,{renderAfter:false});
      await loadProducts(state.project.id,{renderAfter:false});
      await loadProducts(state.project.id,{renderAfter:false});
      await loadInventoryMigration(state.project.id,{renderAfter:false});
      await loadInventoryOpening(state.project.id,{renderAfter:false});
      await loadInventoryMovements(state.project.id,{renderAfter:false});
      await loadPosMigration(state.project.id,{renderAfter:false});
      await loadPosMigration(state.project.id,{renderAfter:false});
      await loadPosMenuMigration(state.project.id,{renderAfter:false});
      await loadPosHistoryMigration(state.project.id,{renderAfter:false});
      state.dirty = false;
      state.scopeDirty = false;

      log(
        `Loaded ${state.project.name}`
      );

    } catch (error) {
      state.error = errorMessage(error);

      console.error(
        "[DataMigration] loadProject failed",
        error
      );

    } finally {
      state.loading = false;

      if (renderAfter) render();
    }
  }

  async function loadFiles(
    projectId,
    {
      renderAfter = true,
    } = {}
  ) {
    const cid = companyId();
    const id = Number(projectId);

    if (!cid || !id) {
      state.files = [];
      state.datasets = [];
      state.filesLoaded = false;

      if (renderAfter) render();
      return;
    }

    try {
      const response = await apiFetch(
        ENDPOINTS.migrations.projectFiles(
          cid,
          id
        )
      );

      state.files =
        response?.files || [];

      state.datasets =
        state.files.flatMap(
          file =>
            (file.datasets || []).map(
              dataset => ({
                ...dataset,
                source_file_name:
                  dataset.source_file_name ||
                  file.original_name,
              })
            )
        );

      state.filesLoaded = true;

    } catch (error) {
      state.error = errorMessage(error);

      console.error(
        "[DataMigration] loadFiles failed",
        error
      );
    }

    if (renderAfter) render();
  }

  async function uploadFiles(
    fileList
  ) {
    const files = [
      ...(fileList || []),
    ];

    if (!state.project?.id) {
      notify(
        "Save the migration project before uploading files."
      );
      return;
    }

    if (!files.length) return;

    const allowed = new Set([
      "csv",
      "xlsx",
      "xls",
      "json",
      "xml",
      "sql",
      "txt",
    ]);

    const invalid = files.find(file => {
      const extension = String(
        file.name || ""
      )
        .split(".")
        .pop()
        .toLowerCase();

      return !allowed.has(extension);
    });

    if (invalid) {
      notify(
        `Unsupported file type: ${invalid.name}`
      );
      return;
    }

    const formData = new FormData();

    files.forEach(file => {
      formData.append(
        "files",
        file,
        file.name
      );
    });

    state.filesUploading = true;
    state.error = "";
    render();

    try {
      await apiFetch(
        ENDPOINTS.migrations.projectFiles(
          companyId(),
          state.project.id
        ),
        {
          method: "POST",
          body: formData,
        }
      );

      await loadFiles(
        state.project.id,
        {
          renderAfter: false,
        }
      );

      state.project.status =
        "files_uploaded";

      log(
        `Uploaded ${files.length} migration file(s)`
      );

      notify(
        `${files.length} migration file(s) uploaded.`
      );

    } catch (error) {
      state.error = errorMessage(error);

      console.error(
        "[DataMigration] uploadFiles failed",
        error
      );

      notify(state.error);

    } finally {
      state.filesUploading = false;
      render();
    }
  }

  function updateDatasetLocal(datasetId,field,value){
    const update=list=>{
      const dataset=(list||[]).find(item=>Number(item.id)===Number(datasetId));
      if(!dataset)return;
      dataset[field]=value;
      dataset._dirty=true;
    };

    update(state.datasets);
    update(state.detection.datasets);
    state.files.forEach(file=>update(file.datasets));

    render();
  }

  async function saveDataset(button){
    const datasetId=Number(button?.dataset?.mwDatasetId);
    const dataset=state.datasets.find(item=>Number(item.id)===datasetId)||
      state.detection.datasets.find(item=>Number(item.id)===datasetId);

    if(!dataset)return;

    if(!dataset.dataset_name?.trim()){
      notify("Dataset name is required.");
      return;
    }

    if(Number(dataset.header_row)<0){
      notify("Header row cannot be negative.");
      return;
    }

    if(Number(dataset.data_start_row)<1){
      notify("Data start row must be at least 1.");
      return;
    }

    state.datasetSavingId=datasetId;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.projectDataset(companyId(),state.project.id,datasetId),
        {
          method:"PATCH",
          body:JSON.stringify({
            dataset_name:dataset.dataset_name.trim(),
            entity_code:dataset.entity_code||null,
            header_row:Number(dataset.header_row||0),
            data_start_row:Number(dataset.data_start_row||1),
            data_end_row:dataset.data_end_row?Number(dataset.data_end_row):null,
            delimiter:dataset.delimiter??null,
            encoding:dataset.encoding??null,
            date_format:dataset.date_format||null,
            decimal_separator:dataset.decimal_separator??null,
            thousands_separator:dataset.thousands_separator??null,
            is_selected:dataset.is_selected!==false,
            settings_json:dataset.settings_json||{},
            metadata_json:dataset.metadata_json||{},
          }),
        }
      );

      const updated=response?.dataset;

      if(updated){
        const sync=list=>{
          const row=(list||[]).find(item=>Number(item.id)===datasetId);
          if(row)Object.assign(row,updated,{_dirty:false});
        };

        sync(state.datasets);
        sync(state.detection.datasets);
        state.files.forEach(file=>sync(file.datasets));
      }

      await loadDetection(state.project.id,{renderAfter:false});
      await loadFieldMappings(state.project.id,{renderAfter:false});
      await loadPpeMapping(state.project.id,{renderAfter:false});
      await loadLeaseMapping(state.project.id,{renderAfter:false});
      await loadLoanMapping(state.project.id,{renderAfter:false});
      await loadRevenueMapping(state.project.id,{renderAfter:false});
      await loadAccrualMapping(state.project.id,{renderAfter:false});
      await loadPayrollMapping(state.project.id,{renderAfter:false});
      await loadPayrollItems(state.project.id,{renderAfter:false});
      await loadPayrollLeave(state.project.id,{renderAfter:false});
      await loadPayrollEmployeeLoans(state.project.id,{renderAfter:false});
      await loadPayrollHistory(state.project.id,{renderAfter:false});
      await loadPayrollReconciliation(state.project.id,{renderAfter:false});
      await loadProducts(state.project.id,{renderAfter:false});
      await loadProducts(state.project.id,{renderAfter:false});
      await loadInventoryMigration(state.project.id,{renderAfter:false});
      await loadInventoryOpening(state.project.id,{renderAfter:false});
      await loadInventoryMovements(state.project.id,{renderAfter:false});
      await loadPosMigration(state.project.id,{renderAfter:false});
      await loadPosMigration(state.project.id,{renderAfter:false});
      await loadPosMenuMigration(state.project.id,{renderAfter:false});
      await loadPosHistoryMigration(state.project.id,{renderAfter:false});
      log(`Configured dataset ${dataset.dataset_name}`);
      notify("Dataset configuration saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.datasetSavingId=null;
      render();
    }
  }

  function filesView() {
    if (!state.project?.id) {
      return `
        <h2>Source files</h2>

        <div class="mw-alert warn">
          <strong>Project required:</strong>
          Save the migration project before uploading files.
        </div>
      `;
    }

    return `
      <div
        class="mw-inline"
        style="justify-content:space-between"
      >
        <div>
          <h2>Source files</h2>

          <p class="mw-muted">
            Upload accounting exports, migration workbooks
            and supporting source files.
          </p>
        </div>

        <span class="mw-badge info">
          ${state.files.length}
          file${state.files.length === 1 ? "" : "s"}
        </span>
      </div>

      <div
        class="mw-dropzone ${
          state.dragActive
            ? "drag"
            : ""
        }"
        data-mw-action="choose-files"
        style="margin-top:16px"
      >
        <div style="font-size:34px">
          📤
        </div>

        <h3>
          ${
            state.filesUploading
              ? "Uploading files…"
              : "Choose or drop migration files"
          }
        </h3>

        <p class="mw-muted">
          CSV, XLSX, XLS, JSON, XML, SQL or TXT
        </p>

        <button
          type="button"
          class="mw-btn primary"
          ${
            state.filesUploading
              ? "disabled"
              : ""
          }
        >
          ${
            state.filesUploading
              ? "Uploading…"
              : "Browse files"
          }
        </button>
      </div>

      ${
        state.files.length
          ? state.files.map(
              file =>
                sourceFileCard(file)
            ).join("")
          : `
            <div class="mw-empty">
              No source files have been uploaded.
            </div>
          `
      }
    `;
  }

  function sourceFileCard(file) {
    const datasets =
      file.datasets || [];

    return `
      <div
        class="mw-card"
        style="margin-top:16px"
      >
        <div
          class="mw-inline"
          style="justify-content:space-between"
        >
          <div>
            <h3>
              ${esc(file.original_name)}
            </h3>

            <p class="mw-muted mw-small">
              ${formatBytes(file.size_bytes)}
              · ${esc(
                String(
                  file.extension || "file"
                ).toUpperCase()
              )}
              · Uploaded
              ${formatDateTime(
                file.uploaded_at
              )}
            </p>
          </div>

          <div class="mw-inline">
            <span class="mw-badge ${
              file.file_status === "invalid"
                ? "error"
                : file.file_status === "detected"
                  ? "ok"
                  : "info"
            }">
              ${esc(
                titleCase(
                  file.file_status
                )
              )}
            </span>

            <button
              type="button"
              class="mw-btn danger"
              data-mw-action="remove-file"
              data-mw-file-id="${esc(file.id)}"
            >
              Remove
            </button>
          </div>
        </div>

        ${
          datasets.length
            ? datasets.map(
                dataset =>
                  datasetConfigurationCard(
                    dataset
                  )
              ).join("")
            : `
              <div class="mw-empty">
                No datasets were created for this file.
              </div>
            `
        }
      </div>
    `;
  }

  function datasetConfigurationCard(
    dataset
  ) {
    const scopeEntities =
      state.scope.entities.filter(
        entity =>
          entity.is_selected
      );

    return `
      <div
        class="mw-list-item"
        style="margin-top:12px"
      >
        <div
          class="mw-inline"
          style="justify-content:space-between"
        >
          <div>
            <strong>
              ${esc(dataset.dataset_name)}
            </strong>

            <div class="mw-muted mw-small">
              ${
                dataset.sheet_name
                  ? `Worksheet: ${esc(dataset.sheet_name)}`
                  : esc(
                      titleCase(
                        dataset.dataset_type
                      )
                    )
              }
            </div>
          </div>

          <span class="mw-badge ${
            dataset.entity_code
              ? "ok"
              : "warn"
          }">
            ${
              dataset.entity_code
                ? "Configured"
                : "Entity required"
            }
          </span>
        </div>

        <div
          class="mw-grid-3"
          style="margin-top:12px"
        >
          ${datasetInput({
            dataset,
            field: "dataset_name",
            label: "Dataset name",
          })}

          ${datasetSelect({
            dataset,
            field: "entity_code",
            label: "Migration entity",
            first:
              "Select migration entity",
            options:
              scopeEntities.map(
                entity => [
                  entity.code,
                  entity.label,
                ]
              ),
          })}

          ${datasetInput({
            dataset,
            field: "header_row",
            label: "Header row",
            type: "number",
            min: "0",
          })}

          ${datasetInput({
            dataset,
            field: "data_start_row",
            label: "First data row",
            type: "number",
            min: "1",
          })}

          ${datasetInput({
            dataset,
            field: "data_end_row",
            label: "Last data row",
            type: "number",
            min: "1",
            placeholder: "Automatic",
          })}

          ${datasetSelect({
            dataset,
            field: "encoding",
            label: "Encoding",
            first: "Automatic",
            options: [
              ["utf-8", "UTF-8"],
              ["utf-8-sig", "UTF-8 with BOM"],
              ["windows-1252", "Windows-1252"],
              ["iso-8859-1", "ISO-8859-1"],
            ],
          })}

          ${datasetSelect({
            dataset,
            field: "delimiter",
            label: "Delimiter",
            first: "Not applicable",
            options: [
              [",", "Comma"],
              [";", "Semicolon"],
              ["\t", "Tab"],
              ["|", "Pipe"],
            ],
          })}

          ${datasetSelect({
            dataset,
            field: "date_format",
            label: "Date format",
            first: "Project default",
            options: [
              ["YYYY-MM-DD", "YYYY-MM-DD"],
              ["DD/MM/YYYY", "DD/MM/YYYY"],
              ["MM/DD/YYYY", "MM/DD/YYYY"],
              ["DD-MM-YYYY", "DD-MM-YYYY"],
            ],
          })}

          <div class="mw-field">
            <label>Include dataset</label>

            <label class="mw-check">
              <input
                type="checkbox"
                data-mw-dataset-field="is_selected"
                data-mw-dataset-id="${esc(dataset.id)}"
                ${
                  dataset.is_selected !== false
                    ? "checked"
                    : ""
                }
              >

              <span>
                Use this dataset
              </span>
            </label>
          </div>
        </div>

        <div
          class="mw-inline"
          style="margin-top:12px;justify-content:flex-end"
        >
          <button
            type="button"
            class="mw-btn primary"
            data-mw-action="save-dataset"
            data-mw-dataset-id="${esc(dataset.id)}"
            ${
              state.datasetSavingId ===
              Number(dataset.id)
                ? "disabled"
                : ""
            }
          >
            ${
              state.datasetSavingId ===
              Number(dataset.id)
                ? "Saving…"
                : dataset._dirty
                  ? "Save dataset"
                  : "Configured"
            }
          </button>
        </div>
      </div>
    `;
  }

  function datasetInput({
    dataset,
    field,
    label,
    type = "text",
    min = "",
    placeholder = "",
  }) {
    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <input
          class="mw-input"
          type="${esc(type)}"
          value="${esc(
            dataset[field] ?? ""
          )}"
          placeholder="${esc(placeholder)}"
          data-mw-dataset-field="${esc(field)}"
          data-mw-dataset-id="${esc(dataset.id)}"
          ${min !== "" ? `min="${esc(min)}"` : ""}
        >
      </div>
    `;
  }


  function datasetSelect({
    dataset,
    field,
    label,
    options,
    first = "",
  }) {
    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select
          class="mw-select"
          data-mw-dataset-field="${esc(field)}"
          data-mw-dataset-id="${esc(dataset.id)}"
        >
          <option value="">
            ${esc(first)}
          </option>

          ${options.map(
            ([value, optionLabel]) => `
              <option
                value="${esc(value)}"
                ${
                  String(
                    dataset[field] ?? ""
                  ) === String(value)
                    ? "selected"
                    : ""
                }
              >
                ${esc(optionLabel)}
              </option>
            `
          ).join("")}
        </select>
      </div>
    `;
  }

  function formatBytes(value) {
    const bytes = Number(
      value || 0
    );

    if (!bytes) return "0 B";

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${
        (bytes / 1024).toFixed(1)
      } KB`;
    }

    return `${
      (
        bytes /
        (1024 * 1024)
      ).toFixed(1)
    } MB`;
  }


  function formatDateTime(value) {
    if (!value) return "";

    const parsed = new Date(value);

    if (
      Number.isNaN(
        parsed.getTime()
      )
    ) {
      return String(value);
    }

    return parsed.toLocaleString();
  }

  async function removeFile(
    button
  ) {
    const fileId = Number(
      button?.dataset?.mwFileId
    );

    const file = state.files.find(
      item =>
        Number(item.id) === fileId
    );

    if (!file) return;

    if (
      !confirm(
        `Remove "${file.original_name}" from this migration project?`
      )
    ) {
      return;
    }

    try {
      await apiFetch(
        ENDPOINTS.migrations.projectFile(
          companyId(),
          state.project.id,
          fileId
        ),
        {
          method: "DELETE",
        }
      );

      await loadFiles(
        state.project.id,
        {
          renderAfter: false,
        }
      );

      log(
        `Removed ${file.original_name}`
      );

      render();

    } catch (error) {
      state.error = errorMessage(error);
      notify(state.error);
      render();
    }
  }

  function handleDragEnter(event) {
    if (
      !event.target.closest(
        ".mw-dropzone"
      )
    ) {
      return;
    }

    event.preventDefault();
    state.dragActive = true;
    render();
  }


  function handleDragOver(event) {
    if (
      !event.target.closest(
        ".mw-dropzone"
      )
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect =
      "copy";
  }


  function handleDragLeave(event) {
    if (
      !event.target.closest(
        ".mw-dropzone"
      )
    ) {
      return;
    }

    const dropzone =
      event.target.closest(
        ".mw-dropzone"
      );

    if (
      dropzone.contains(
        event.relatedTarget
      )
    ) {
      return;
    }

    state.dragActive = false;
    render();
  }


  function handleDrop(event) {
    if (
      !event.target.closest(
        ".mw-dropzone"
      )
    ) {
      return;
    }

    event.preventDefault();

    state.dragActive = false;

    uploadFiles(
      event.dataTransfer.files
    );
  }

  function handleClick(event){
    const stepButton=event.target.closest("[data-mw-step]");
    if(stepButton)return go(stepButton.dataset.mwStep);

    const actionButton=event.target.closest("[data-mw-action]");
    if(!actionButton)return;

    const action=actionButton.dataset.mwAction;
    const actions={
      "new-project":newProject,
      "save-project":saveProject,
      "cancel-project":cancelProject,
      "reload-project":reloadCurrentProject,
      "save-scope":saveScope,
      "select-recommended-scope":selectRecommendedScope,
      "clear-optional-scope":clearOptionalScope,
      "choose-files":()=>$("#mwFileInput")?.click(),
      "remove-file":removeFile,
      "save-dataset":saveDataset,
      "run-detection":runDetection,
      "auto-map-fields":autoMapFields,
      "save-field-mappings":saveFieldMappings,
      "reset-field-mappings":resetFieldMappings,
      "validate-field-mappings":validateFieldMappings,
      "copy-field-mappings":copyFieldMappings,
      "scan-reference-mappings":scanReferenceMappings,
      "auto-reference-mappings":autoReferenceMappings,
      "save-reference-mappings":saveReferenceMappings,
      "validate-reference-mappings":validateReferenceMappings,
      "reset-reference-mappings":resetReferenceMappings,

      "save-ppe-settings":savePpeSettings,
      "save-ppe-mapping":savePpeMapping,
      "preview-ppe":previewPpe,

      "save-lease-settings":saveLeaseSettings,
      "save-lease-references":saveLeaseReferences,
      "preview-leases":previewLeaseMigration,

      "save-loan-settings":saveLoanSettings,
      "save-loan-references":saveLoanReferences,
      "preview-loans":previewLoanMigration,

      "save-revenue-settings":saveRevenueSettings,
      "save-revenue-references":saveRevenueReferences,
      "preview-revenue":previewRevenueMigration,
      
      "save-accrual-settings":saveAccrualSettings,
      "save-accrual-references":saveAccrualReferences,
      "preview-accruals":previewAccrualMigration,

      "save-payroll-settings":savePayrollSettings,
      "save-payroll-references":savePayrollReferences,
      "preview-payroll":previewPayrollMigration,

      "save-payroll-item-settings":savePayrollItemSettings,
      "save-payroll-item-mapping":savePayrollItemMapping,
      "preview-payroll-items":previewPayrollItems,

      "save-payroll-leave-settings":savePayrollLeaveSettings,
      "save-payroll-leave-mapping":savePayrollLeaveMapping,
      "preview-payroll-leave":previewPayrollLeave,

      "save-payroll-employee-loan-settings":savePayrollEmployeeLoanSettings,
      "preview-payroll-employee-loans":previewPayrollEmployeeLoans,
      "save-payroll-history-settings":savePayrollHistorySettings,
      "preview-payroll-history":previewPayrollHistory,
      "run-payroll-reconciliation":runPayrollReconciliation,

      "save-product-settings":saveProductSettings,
      "save-product-types":saveProductTypes,
      "preview-products":previewProducts,
      "save-product-accounts":saveProductAccounts,
      "save-product-vat":saveProductVat,
      "preview-product-accounting":previewProductAccounting,

      "save-inventory-settings":saveInventoryMigrationSettings,
      "save-inventory-locations":saveInventoryLocationMappings,
      "preview-inventory-locations":previewInventoryLocations,

      "save-inventory-opening-settings":saveInventoryOpeningSettings,
      "preview-inventory-opening":previewInventoryOpening,
      "reconcile-inventory-opening":reconcileInventoryOpening,

      "save-inventory-movement-settings":saveInventoryMovementSettings,
      "save-inventory-movement-types":saveInventoryMovementTypes,
      "preview-inventory-movements":previewInventoryMovements,
      "reconcile-inventory-movements":reconcileInventoryMovements,

      "save-pos-settings":savePosSettings,
      "save-pos-terminals":savePosTerminals,
      "save-pos-payment-methods":savePosPaymentMethods,
      "save-pos-catalogue":savePosCatalogue,
      "preview-pos":previewPosMigration,
      "reconcile-pos":reconcilePosMigration,

      "save-pos-menu-settings":savePosMenuSettings,
      "save-pos-menu-items":savePosMenuItems,
      "save-pos-menu-components":savePosMenuComponents,
      "save-pos-menu-addons":savePosMenuAddons,
      "preview-pos-menu":previewPosMenu,
      "reconcile-pos-menu":reconcilePosMenu,

      "save-pos-history-settings":savePosHistorySettings,
      "preview-pos-history":previewPosHistory,
      "reconcile-pos-history":reconcilePosHistory,
      previous,
      next,
    };

    actions[action]?.(actionButton);
  }

  function handleChange(event) {
    const element = event.target;

    if (
      element.id === "mwProjectSelect"
    ) {
      return projectSelectionChanged(
        element.value
      );
    }

    if (
      element.id === "mwSourceSystem"
    ) {
      setSourceSystem(element.value);
      return;
    }

    if (
      element.id === "mwCutoverDate"
    ) {
      updateProjectField(
        "cutover_date",
        element.value
      );
      return;
    }

    if (
      element.id === "mwMigrationDepth"
    ) {
      updateProjectField(
        "migration_mode",
        element.value
      );
      return;
    }

    if (
      element.matches(
        "[data-mw-project-field]"
      )
    ) {
      updateProjectField(
        element.dataset.mwProjectField,
        element.value
      );
      return;
    }

    if (
      element.matches(
        "[data-mw-source-field]"
      )
    ) {
      updateSourceField(
        element.dataset.mwSourceField,
        element.value
      );
    }

    if(element.matches("[data-mw-scope-entity]")){
      toggleScopeEntity(element.dataset.mwScopeEntity,element.checked);
      return;
    }

    if(element.matches("[data-mw-scope-history]")){
      updateScopeEntity(element.dataset.mwScopeHistory,"history_mode",element.value);
      return;
    }

    if(element.matches("[data-mw-scope-import]")){
      updateScopeEntity(element.dataset.mwScopeImport,"import_mode",element.value);
      return;
    }

    if(element.id==="mwMappingDataset"){
      state.mappingDatasetId=Number(element.value)||null;
      render();
      return;
    }

    if(element.matches("[data-mw-map-target]")){
      updateFieldMapping(Number(element.dataset.mwMapTarget),"target_field_code",element.value);
      return;
    }

    if(element.matches("[data-mw-map-transform]")){
      updateFieldMapping(Number(element.dataset.mwMapTransform),"transformation",element.value);
      return;
    }

    if(element.matches("[data-mw-map-ignore]")){
      updateFieldMapping(Number(element.dataset.mwMapIgnore),"mapping_status",element.checked?"ignored":"unmapped");
      return;
    }

    if(element.id==="mwReferenceMappingType"){
      state.referenceMappingType=element.value;
      render();
      return;
    }

    if(element.matches("[data-mw-reference-target]")){
      updateReferenceTarget(
        element.dataset.mwReferenceType,
        element.dataset.mwReferenceValue,
        element.value
      );
      return;
    }

    if(element.matches("[data-mw-reference-action]")){
      updateReferenceAction(
        element.dataset.mwReferenceType,
        element.dataset.mwReferenceValue,
        element.value
      );
      return;
    }

    if(element.id==="mwPpeDataset"){
      loadPpeDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-ppe-setting]")){
      if(state.ppe.settings){
        const field=element.dataset.mwPpeSetting;
        state.ppe.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }
      render();
      return;
    }

    if(element.matches("[data-mw-ppe-class-field]")){
      const sourceClass=element.dataset.mwPpeSourceClass;
      const field=element.dataset.mwPpeClassField;

      const row=(state.ppe.mapping?.mappings||[]).find(
        item=>String(item.source_class)===String(sourceClass)
      );

      if(row){
        row[field]=element.value;
        row._dirty=true;
      }

      render();
      return;
    }

    if(element.id==="mwLeaseDataset"){
      loadLeaseDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-lease-setting]")){
      if(state.leases.settings){
        const field=element.dataset.mwLeaseSetting;

        state.leases.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-lease-reference]")){
      const type=element.dataset.mwLeaseReference;
      const sourceValue=element.dataset.mwLeaseSource;

      const group=state.leases.mapping?.references?.[type];
      const row=group?.rows?.find(
        item=>String(item.source_value)===String(sourceValue)
      );

      if(row){
        row.target_id=Number(element.value)||null;
        row._dirty=true;
      }

      render();
      return;
    }

    if(element.id==="mwLoanDataset"){
      loadLoanDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-loan-setting]")){
      if(state.loans.settings){
        const field=element.dataset.mwLoanSetting;

        state.loans.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-loan-reference]")){
      const type=element.dataset.mwLoanReference;
      const sourceValue=element.dataset.mwLoanSource;

      const group=state.loans.mapping?.references?.[type];

      const row=group?.rows?.find(
        item=>String(item.source_value)===String(sourceValue)
      );

      if(row){
        row.target_id=Number(element.value)||null;
        row._dirty=true;
      }

      render();
      return;
    }

    if(element.id==="mwRevenueDataset"){
      loadRevenueDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-revenue-setting]")){
      if(state.revenue.settings){
        const field=element.dataset.mwRevenueSetting;

        state.revenue.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-revenue-reference]")){
      const type=element.dataset.mwRevenueReference;
      const sourceValue=element.dataset.mwRevenueSource;
      const group=state.revenue.mapping?.references?.[type];

      const row=group?.rows?.find(
        item=>String(item.source_value)===String(sourceValue)
      );

      if(row){
        row.target_id=Number(element.value)||null;
        row._dirty=true;
      }

      render();
      return;
    }

    if(element.id==="mwAccrualDataset"){
      loadAccrualDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-accrual-setting]")){
      if(state.accruals.settings){
        const field=element.dataset.mwAccrualSetting;

        state.accruals.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-accrual-reference]")){
      const type=element.dataset.mwAccrualReference;
      const sourceValue=element.dataset.mwAccrualSource;
      const group=state.accruals.mapping?.references?.[type];

      const row=group?.rows?.find(
        item=>String(item.source_value)===String(sourceValue)
      );

      if(row){
        row.target_id=Number(element.value)||null;
        row._dirty=true;
      }

      render();
      return;
    }

    if(element.id==="mwPayrollDataset"){
      loadPayrollDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-payroll-setting]")){
      const field=element.dataset.mwPayrollSetting;

      if(state.payroll.settings){
        state.payroll.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-payroll-reference]")){
      const type=element.dataset.mwPayrollReference;
      const sourceValue=element.dataset.mwPayrollSource;
      const group=state.payroll.mapping?.references?.[type];

      const row=group?.rows?.find(
        item=>String(item.source_value)===String(sourceValue)
      );

      if(row){
        row.target_id=Number(element.value)||null;
        row._dirty=true;
      }

      render();
      return;
    }
      
    if(element.id==="mwPayrollItemDataset"){
      loadPayrollItemDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-payroll-item-setting]")){
      const field=element.dataset.mwPayrollItemSetting;

      if(state.payrollItems.settings){
        state.payrollItems.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if(element.matches("[data-mw-payroll-map-type]")){
      const index=Number(element.dataset.mwPayrollMapType);
      const row=state.payrollItems.mapping?.detection?.items?.[index];

      if(row){
        row.item_type=element.value||null;
        row.target_id=null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-payroll-map-target]")){
      const index=Number(element.dataset.mwPayrollMapTarget);
      const row=state.payrollItems.mapping?.detection?.items?.[index];

      if(row){
        row.target_id=Number(element.value)||null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.id==="mwPayrollLeaveDataset"){
      loadPayrollLeaveDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-payroll-leave-setting]")){
      const field=element.dataset.mwPayrollLeaveSetting;

      if(state.payrollLeave.settings){
        state.payrollLeave.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if(element.matches("[data-mw-payroll-leave-target]")){
      const index=Number(element.dataset.mwPayrollLeaveTarget);
      const row=state.payrollLeave.mapping?.leave_types?.items?.[index];

      if(row){
        row.target_leave_type_id=Number(element.value)||null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.id==="mwPayrollEmployeeLoanDataset"){
      loadPayrollEmployeeLoanDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-payroll-loan-setting]")){
      const field=element.dataset.mwPayrollLoanSetting;

      if(state.payrollEmployeeLoans.settings){
        state.payrollEmployeeLoans.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if(element.id==="mwPayrollHistoryDataset"){
      loadPayrollHistoryDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-payroll-history-setting]")){
      const field=element.dataset.mwPayrollHistorySetting;

      if(state.payrollHistory.settings){
        state.payrollHistory.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if(element.id==="mwProductDataset"){
      loadProductDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-product-setting]")){
      const field=element.dataset.mwProductSetting;

      if(state.products.settings){
        state.products.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if(element.matches("[data-mw-product-account]")){
      const index=Number(element.dataset.mwProductAccount);
      const row=state.products.accounting?.accounts?.items?.[index];

      if(row){
        const target=(state.products.accounting?.accounts?.targets||[])
          .find(item=>Number(item.id)===Number(element.value));

        row.target_account_id=target?.id||null;
        row.target_account_code=target?.code||null;
        row.target_account_name=target?.name||null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-product-vat]")){
      const index=Number(element.dataset.mwProductVat);
      const row=state.products.accounting?.vat?.items?.[index];

      if(row){
        row.target_vat_code=element.value||null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-product-type]")){
      const index=Number(element.dataset.mwProductType);
      const row=state.products.mapping?.type_mapping?.items?.[index];

      if(row){
        row.item_kind=element.value||null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.id==="mwInventoryLocationDataset"){
      loadInventoryLocationDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-inventory-setting]")){
      const field=element.dataset.mwInventorySetting;

      if(state.inventoryMigration.settings){
        state.inventoryMigration.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if(element.matches("[data-mw-inventory-location-action]")){
      const index=Number(element.dataset.mwInventoryLocationAction);
      const row=state.inventoryMigration.mapping?.items?.[index];

      if(row){
        row.mapping_action=element.value;
        row.target_location_id=null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-inventory-location-target]")){
      const index=Number(element.dataset.mwInventoryLocationTarget);
      const row=state.inventoryMigration.mapping?.items?.[index];

      if(row){
        const target=(state.inventoryMigration.mapping?.targets||[])
          .find(item=>Number(item.id)===Number(element.value));

        row.target_location_id=target?.id||null;
        row.target_code=target?.code||null;
        row.target_name=target?.name||null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.id==="mwInventoryOpeningDataset"){
      loadInventoryOpeningDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-inventory-opening-setting]")){
      const field=element.dataset.mwInventoryOpeningSetting;

      if(state.inventoryOpening.settings){
        state.inventoryOpening.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if(element.id==="mwInventoryMovementDataset"){
      loadInventoryMovementDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-inventory-movement-setting]")){
      const field=element.dataset.mwInventoryMovementSetting;

      if(state.inventoryMovements.settings){
        state.inventoryMovements.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if(element.matches("[data-mw-inventory-movement-type]")){
      const index=Number(element.dataset.mwInventoryMovementType);
      const row=state.inventoryMovements.typeMapping?.items?.[index];

      if(row){
        row.target_movement_type=element.value||null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.id==="mwPosDataset"){
      loadPosDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-pos-setting]")){
      const field=element.dataset.mwPosSetting;

      if(state.posMigration.settings){
        state.posMigration.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if(element.matches("[data-mw-pos-payment]")){
      const index=Number(element.dataset.mwPosPayment);
      const row=state.posMigration.paymentMethods?.items?.[index];

      if(row){
        row.target_payment_method=element.value||null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-pos-terminal-action]")){
      const index=Number(element.dataset.mwPosTerminalAction);
      const row=state.posMigration.terminals?.items?.[index];

      if(row){
        row.mapping_action=element.value;
        if(element.value!=="map")row.target_terminal_id=null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.matches("[data-mw-pos-terminal-target]")){
      const index=Number(element.dataset.mwPosTerminalTarget);
      const row=state.posMigration.terminals?.items?.[index];

      if(row){
        const target=(state.posMigration.terminals?.targets||[])
          .find(item=>Number(item.id)===Number(element.value));

        row.target_terminal_id=target?.id||null;
        row.target_terminal_code=target?.code||null;
        row.target_terminal_name=target?.name||null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.id==="mwPosMenuDataset"){
      loadPosMenuDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-pos-menu-setting]")){
      const field=element.dataset.mwPosMenuSetting;

      if(state.posMenuMigration.settings){
        state.posMenuMigration.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if(element.matches("[data-mw-pos-menu-action]")){
      const index=Number(element.dataset.mwPosMenuAction);
      const row=state.posMenuMigration.menuItems?.items?.[index];

      if(row){
        row.mapping_action=element.value;
        if(element.value!=="map")row.target_menu_item_id=null;
        row.is_approved=false;
      }

      render();
      return;
    }

    if(element.id==="mwPosHistoryDataset"){
      loadPosHistoryDataset(Number(element.value));
      return;
    }

    if(element.matches("[data-mw-pos-history-setting]")){
      const field=element.dataset.mwPosHistorySetting;

      if(state.posHistoryMigration.settings){
        state.posHistoryMigration.settings[field]=element.type==="checkbox"
          ?element.checked
          :element.value;
      }

      return;
    }

    if (
      element.matches(
        "[data-mw-dataset-field]"
      )
    ) {
      const datasetId = Number(
        element.dataset.mwDatasetId
      );

      const field =
        element.dataset.mwDatasetField;

      updateDatasetLocal(
        datasetId,
        field,
        element.type === "checkbox"
          ? element.checked
          : element.value
      );

      return;
    }
  }

  function handleInput(event) {
    const element = event.target;

    if (
      element.matches(
        "[data-mw-project-field]"
      )
    ) {
      updateProjectField(
        element.dataset.mwProjectField,
        element.value,
        false
      );
      return;
    }

    if (
      element.matches(
        "[data-mw-source-field]"
      )
    ) {
      updateSourceField(
        element.dataset.mwSourceField,
        element.value,
        false
      );
    }
  }

  async function projectSelectionChanged(
    projectId
  ) {
    if (
      state.dirty &&
      !confirm(
        "Discard unsaved migration project changes?"
      )
    ) {
      renderSelectors();
      return;
    }

    await loadProject(projectId);
  }

  function updateProjectField(
    field,
    value,
    shouldRender = true
  ) {
    if (!state.project) {
      state.project = defaultProject();
    }

    state.project[field] = value;
    state.dirty = true;

    if (shouldRender) render();
    else renderSaveState();
  }

  function updateSourceField(
    field,
    value,
    shouldRender = true
  ) {
    if (!state.project) {
      state.project = defaultProject();
    }

    if (!state.project.source) {
      state.project.source =
        defaultProject().source;
    }

    state.project.source[field] = value;

    const mirroredFields = {
      source_system_code:
        "source_system_code",

      source_system_name:
        "source_system_name",

      source_system_version:
        "source_system_version",

      source_format:
        "source_format",

      country_code:
        "source_country_code",

      tax_regime:
        "source_tax_regime",

      default_currency:
        "default_currency",

      source_timezone:
        "source_timezone",

      date_format:
        "date_format",

      decimal_separator:
        "decimal_separator",

      thousands_separator:
        "thousands_separator",

      debit_credit_convention:
        "debit_credit_convention",
    };

    if (mirroredFields[field]) {
      state.project[
        mirroredFields[field]
      ] = value;
    }

    state.dirty = true;

    if (shouldRender) render();
    else renderSaveState();
  }

  function setSourceSystem(code) {
    const source =
      sourceSystems.find(
        item => item.code === code
      ) || sourceSystems.at(-1);

    state.project.source_system_code =
      source.code;

    state.project.source_system_name =
      source.name;

    state.project.source_format =
      source.format;

    state.project.source = {
      ...(state.project.source || {}),
      source_system_code: source.code,
      source_system_name: source.name,
      source_format: source.format,
    };

    state.dirty = true;

    log(
      `Source system changed to ${source.name}`
    );

    render();
  }

  function newProject() {
    if (
      state.dirty &&
      !confirm(
        "Discard unsaved migration project changes?"
      )
    ) {
      return;
    }

    state.project = defaultProject();
    state.activeStep = "project";
    state.error = "";
    state.dirty = true;

    state.scope = {
      migration_mode: "opening",
      selected_count: 0,
      entities: [],
    };

    state.scopeLoaded = false;
    state.scopeDirty = false;
    state.files = [];
    state.datasets = [];
    state.filesLoaded = false;
    state.filesUploading = false;
    state.datasetSavingId = null;
    state.dragActive = false;
    state.detection={datasets:[],record_count:0,detected_count:0};
    state.detectionLoaded=false;
    state.detecting=false;

    state.fieldMappings={datasets:[],dataset_count:0,complete_count:0,required_unmapped_count:0,duplicate_count:0};
    state.fieldMappingsLoaded=false;
    state.mappingDatasetId=null;
    state.mappingSaving=false;
    state.mappingAutoRunning=false;
    state.mappingValidating=false;

    state.referenceMappings={
      groups:[],
      reference_count:0,
      group_count:0,
      unresolved_count:0,
      pending_count:0,
      complete_count:0,
    };
    state.referenceMappingsLoaded=false;
    state.referenceMappingType=null;
    state.referenceMappingDirty=false;
    state.referenceScanning=false;
    state.referenceAutoRunning=false;
    state.referenceSaving=false;
    state.referenceValidating=false;

    state.ppe={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    };
    state.ppeLoaded=false;
    state.ppeSaving=false;
    state.ppePreviewLoading=false;

    state.leases={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    };
    state.leasesLoaded=false;
    state.leaseSaving=false;
    state.leasePreviewLoading=false;

    state.loans={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    };
    state.loansLoaded=false;
    state.loanSaving=false;
    state.loanPreviewLoading=false;

    state.revenue={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    };
    state.revenueLoaded=false;
    state.revenueSaving=false;
    state.revenuePreviewLoading=false;

    state.accruals={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    };
    state.accrualsLoaded=false;
    state.accrualSaving=false;
    state.accrualPreviewLoading=false;

    state.payroll={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    };
    state.payrollLoaded=false;
    state.payrollSaving=false;
    state.payrollPreviewLoading=false;

    state.payrollItems={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    };
    state.payrollItemsLoaded=false;
    state.payrollItemsSaving=false;
    state.payrollItemsPreviewLoading=false;

    state.payrollLeave={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    };

    state.payrollEmployeeLoans={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    };

    state.payrollLeaveLoaded=false;
    state.payrollLeaveSaving=false;
    state.payrollLeavePreviewLoading=false;

    state.payrollEmployeeLoansLoaded=false;
    state.payrollEmployeeLoansSaving=false;
    state.payrollEmployeeLoansPreviewLoading=false;

    state.payrollHistory={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
    };
    state.payrollHistoryLoaded=false;
    state.payrollHistorySaving=false;
    state.payrollHistoryPreviewLoading=false;

    state.payrollReconciliation=null;
    state.payrollReconciliationHistory=[];
    state.payrollReconciliationLoaded=false;
    state.payrollReconciliationRunning=false;

    state.products={
      datasets:[],
      datasetId:null,
      settings:null,
      mapping:null,
      preview:null,
      accounting:null,
      accountingPreview:null,
    };
    state.productsLoaded=false;
    state.productsSaving=false;
    state.productsAccountingSaving=false;
    state.productsPreviewLoading=false;
    state.productsAccountingPreviewLoading=false;

    state.inventoryMigration={
      datasets:[],
      datasetId:null,
      settings:null,
      targets:[],
      mapping:null,
      preview:null,
    };
    state.inventoryMigrationLoaded=false;
    state.inventoryMigrationSaving=false;
    state.inventoryLocationSaving=false;
    state.inventoryLocationPreviewLoading=false;

    state.inventoryOpening={
      datasets:[],
      datasetId:null,
      settings:null,
      preview:null,
      reconciliation:null,
    };
    state.inventoryOpeningLoaded=false;
    state.inventoryOpeningSaving=false;
    state.inventoryOpeningPreviewLoading=false;
    state.inventoryOpeningReconciling=false;

    state.inventoryMovements={
      datasets:[],
      datasetId:null,
      settings:null,
      typeMapping:null,
      preview:null,
      reconciliation:null,
    };
    state.inventoryMovementsLoaded=false;
    state.inventoryMovementsSaving=false;
    state.inventoryMovementTypesSaving=false;
    state.inventoryMovementPreviewLoading=false;
    state.inventoryMovementReconciling=false;

    state.posMigration={
      datasets:[],
      datasetId:null,
      settings:null,
      terminals:null,
      paymentMethods:null,
      catalogue:null,
      preview:null,
      reconciliation:null,
    };
    state.posMigrationLoaded=false;
    state.posMigrationSaving=false;
    state.posMappingSaving=false;
    state.posPreviewLoading=false;
    state.posReconciling=false;

    state.posMenuMigration={
      datasets:[],
      datasetId:null,
      settings:null,
      menuItems:null,
      components:null,
      addons:null,
      preview:null,
      reconciliation:null,
    };
    state.posMenuMigrationLoaded=false;
    state.posMenuMigrationSaving=false;
    state.posMenuMappingSaving=false;
    state.posMenuPreviewLoading=false;
    state.posMenuReconciling=false;

    state.posHistoryMigration={
      datasets:[],
      datasetId:null,
      settings:null,
      preview:null,
      reconciliation:null,
    };
    state.posHistoryMigrationLoaded=false;
    state.posHistorySaving=false;
    state.posHistoryPreviewLoading=false;
    state.posHistoryReconciling=false;
    log("New migration project prepared");
    render();
  }

  async function loadScope(
    projectId,
    {
      renderAfter = true,
    } = {}
  ) {
    const cid = companyId();
    const id = Number(projectId);

    if (!cid || !id) {
      state.scope = {
        migration_mode:
          state.project?.migration_mode ||
          "opening",
        selected_count: 0,
        entities: [],
      };

      state.scopeLoaded = false;
      state.scopeDirty = false;

      if (renderAfter) render();
      return;
    }

    try {
      const response = await apiFetch(
        ENDPOINTS.migrations.projectScope(
          cid,
          id
        )
      );

      state.scope = response?.scope || {
        migration_mode:
          state.project?.migration_mode ||
          "opening",
        selected_count: 0,
        entities: [],
      };

      state.scopeLoaded = true;
      state.scopeDirty = false;

    } catch (error) {
      state.error = errorMessage(error);

      console.error(
        "[DataMigration] loadScope failed",
        error
      );
    }

    if (renderAfter) render();
  }

  function scopeEntity(code) {
    return state.scope.entities.find(
      entity => entity.code === code
    );
  }

  async function loadDetection(projectId,{renderAfter=true}={}){
    if(!projectId){state.detection={datasets:[],record_count:0,detected_count:0};state.detectionLoaded=false;if(renderAfter)render();return}
    try{
      const response=await apiFetch(ENDPOINTS.migrations.projectDetection(companyId(),projectId));
      state.detection=response?.detection||{datasets:[],record_count:0,detected_count:0};
      state.detectionLoaded=true;
    }catch(error){state.error=errorMessage(error)}
    if(renderAfter)render();
  }

  async function runDetection(){
    if(!state.project?.id||!state.files.length)return notify("Upload source files first.");
    state.detecting=true;state.error="";render();
    try{
      await apiFetch(ENDPOINTS.migrations.projectDetection(companyId(),state.project.id),{method:"POST",body:"{}"});
      await loadFiles(state.project.id,{renderAfter:false});
      await loadDetection(state.project.id,{renderAfter:false});
      await loadFieldMappings(state.project.id,{renderAfter:false});
      state.project.status="detected";
      log(`Detection completed for ${state.detection.detected_count} dataset(s)`);
    }catch(error){state.error=errorMessage(error);notify(state.error)}
    finally{state.detecting=false;render()}
  }

  function heading(title,subtitle="",actions=""){
    return `
      <div class="mw-inline mw-heading" style="justify-content:space-between;align-items:flex-start;gap:16px">
        <div>
          <h2>${esc(title)}</h2>
          ${subtitle?`<p class="mw-muted">${esc(subtitle)}</p>`:""}
        </div>
        ${actions?`<div class="mw-inline mw-heading-actions">${actions}</div>`:""}
      </div>
    `;
  }

  function detectionView(){
    const datasets=state.detection.datasets||[];
    return `
      ${heading("File and entity detection","Inspect worksheets, headers, columns, samples and probable FinSage entities.",
        `<button class="mw-btn primary" data-mw-action="run-detection" ${state.detecting?"disabled":""}>${state.detecting?"Detecting…":"Run detection"}</button>`)}
      ${datasets.length?datasets.map(detectionDatasetCard).join(""):`<div class="mw-empty">Run detection after configuring source files.</div>`}
    `;
  }

  function detectionDatasetCard(dataset){
    const candidates=dataset.candidates||[];
    const sampleRows=dataset.sample_rows||[];

    return `
      <div class="mw-card" style="margin-top:16px">
        <div class="mw-inline" style="justify-content:space-between">
          <div>
            <h3>${esc(dataset.dataset_name)}</h3>
            <p class="mw-muted mw-small">
              ${esc(dataset.source_file_name||"")} ·
              ${Number(dataset.record_count||0).toLocaleString()} records ·
              ${dataset.column_count||0} columns
            </p>
          </div>

          <span class="mw-badge ${dataset.entity_code?"ok":"warn"}">
            ${dataset.entity_code?esc(dataset.entity_label||dataset.entity_code):"Entity not detected"}
          </span>
        </div>

        <div class="mw-grid-2" style="margin-top:12px">
          <div class="mw-field">
            <label>Detected entity</label>
            ${datasetEntitySelect(dataset)}
          </div>

          <div class="mw-field">
            <label>Confidence</label>
            <input class="mw-input" readonly value="${Number(dataset.detection_confidence||0).toFixed(1)}%">
          </div>
        </div>

        ${table(
          ["Column","Detected type","Samples"],
          (dataset.columns||[]).map(column=>[
            esc(column.source_name),
            esc(column.detected_type||"text"),
            esc((column.sample_values_json||[]).join(", "))
          ]),
          "No columns detected."
        )}

        ${sampleRows.length?`
          <details style="margin-top:12px">
            <summary class="mw-btn">Preview sample rows</summary>
            <pre class="mw-log" style="margin-top:10px">${esc(JSON.stringify(sampleRows,null,2))}</pre>
          </details>
        `:""}

        ${candidates.length?`
          <p class="mw-muted mw-small" style="margin-top:10px">
            Other suggestions:
            ${candidates.slice(1,4).map(item=>
              `${esc(item.entity_code)} (${Number(item.confidence).toFixed(0)}%)`
            ).join(", ")||"None"}
          </p>
        `:""}

        <div class="mw-inline" style="justify-content:flex-end;margin-top:12px">
          <button
            type="button"
            class="mw-btn primary"
            data-mw-action="save-dataset"
            data-mw-dataset-id="${esc(dataset.id)}"
            ${state.datasetSavingId===Number(dataset.id)?"disabled":""}
          >
            ${state.datasetSavingId===Number(dataset.id)
              ?"Saving…"
              :dataset._dirty
                ?"Save detection override"
                :"Detection confirmed"}
          </button>
        </div>
      </div>
    `;
  }

  function datasetEntitySelect(dataset){
    const entities=state.scope.entities.filter(entity=>entity.is_selected);
    return `<select class="mw-select" data-mw-dataset-field="entity_code" data-mw-dataset-id="${esc(dataset.id)}">
      <option value="">Select entity</option>
      ${entities.map(entity=>`<option value="${esc(entity.code)}" ${dataset.entity_code===entity.code?"selected":""}>${esc(entity.label)}</option>`).join("")}
    </select>`;
  }

  function requiredDependencies(code) {
    const entity = scopeEntity(code);

    return (
      entity?.dependencies || []
    )
      .filter(
        dependency =>
          dependency.type === "required"
      )
      .map(
        dependency => dependency.code
      );
  }


  function dependencyClosure(codes) {
    const selected = new Set(codes);
    let changed = true;

    while (changed) {
      changed = false;

      [...selected].forEach(code => {
        requiredDependencies(code)
          .forEach(dependencyCode => {
            if (!selected.has(dependencyCode)) {
              selected.add(dependencyCode);
              changed = true;
            }
          });
      });
    }

    return selected;
  }

  async function loadFieldMappings(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.fieldMappings={datasets:[],dataset_count:0,complete_count:0,required_unmapped_count:0,duplicate_count:0};
      state.fieldMappingsLoaded=false;
      state.mappingDatasetId=null;
      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(ENDPOINTS.migrations.fieldMappings(companyId(),projectId));
      state.fieldMappings=response?.field_mappings||{datasets:[],dataset_count:0,complete_count:0,required_unmapped_count:0,duplicate_count:0};
      state.fieldMappingsLoaded=true;

      const datasets=state.fieldMappings.datasets||[];
      if(!datasets.some(dataset=>Number(dataset.dataset_id)===Number(state.mappingDatasetId))){
        state.mappingDatasetId=datasets[0]?.dataset_id||null;
      }
    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadFieldMappings failed",error);
    }

    if(renderAfter)render();
  }

  function currentMappingDataset(){
    return (state.fieldMappings.datasets||[]).find(dataset=>Number(dataset.dataset_id)===Number(state.mappingDatasetId))||null;
  }

  function updateFieldMapping(columnId,field,value){
    const dataset=currentMappingDataset();
    const row=dataset?.rows?.find(item=>Number(item.column_id)===Number(columnId));
    if(!row)return;

    row[field]=value;
    row._dirty=true;

    if(field==="target_field_code"){
      row.mapping_status=value?"mapped":"unmapped";
      row.mapping_method="manual";
      row.is_approved=Boolean(value);
    }

    if(field==="mapping_status"&&value==="ignored"){
      row.target_field_code=null;
      row.mapping_method="manual";
      row.is_approved=true;
    }

    recalculateFieldMappingDataset(dataset);
    render();
  }

  function recalculateFieldMappingDataset(dataset){
    if(!dataset)return;

    const mappedTargets=new Set(
      (dataset.rows||[])
        .filter(row=>row.mapping_status==="mapped"&&row.target_field_code)
        .map(row=>row.target_field_code)
    );

    dataset.required_unmapped=(dataset.targets||[])
      .filter(target=>target.is_required&&!mappedTargets.has(target.field_code));

    dataset.required_unmapped_count=dataset.required_unmapped.length;

    dataset.duplicate_targets=(dataset.targets||[])
      .filter(target=>!target.allow_duplicate_mapping)
      .filter(target=>(dataset.rows||[])
        .filter(row=>row.mapping_status==="mapped"&&row.target_field_code===target.field_code).length>1)
      .map(target=>target.field_code);

    dataset.is_complete=!dataset.required_unmapped_count&&!dataset.duplicate_targets.length&&Boolean(dataset.rows?.length);
  }

  async function autoMapFields(){
    const dataset=currentMappingDataset();
    if(!dataset)return notify("Select a dataset first.");

    state.mappingAutoRunning=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.autoDatasetFieldMappings(companyId(),state.project.id,dataset.dataset_id),
        {method:"POST",body:"{}"}
      );

      const updated=response?.dataset;
      const index=(state.fieldMappings.datasets||[]).findIndex(item=>Number(item.dataset_id)===Number(dataset.dataset_id));
      if(updated&&index>=0)state.fieldMappings.datasets[index]=updated;

      log(`Auto-mapped fields for ${dataset.dataset_name}`);
    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }finally{
      state.mappingAutoRunning=false;
      render();
    }
  }

  async function saveFieldMappings(){
    const dataset=currentMappingDataset();
    if(!dataset)return notify("Select a dataset first.");

    const duplicates=dataset.duplicate_targets||[];
    if(duplicates.length)return notify(`Resolve duplicate mappings first: ${duplicates.join(", ")}.`);

    state.mappingSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.datasetFieldMappings(companyId(),state.project.id,dataset.dataset_id),
        {
          method:"PUT",
          body:JSON.stringify({
            mappings:(dataset.rows||[]).map(row=>({
              column_id:row.column_id,
              target_field_code:row.target_field_code||null,
              mapping_status:row.mapping_status||"unmapped",
              confidence:Number(row.confidence||0),
              transformation:row.transformation||"none",
              default_value:row.default_value??null,
              transformation_json:row.transformation_json||{},
              is_approved:row.mapping_status!=="unmapped",
              notes:row.notes||null,
            }))
          })
        }
      );

      const updated=response?.dataset;
      const index=(state.fieldMappings.datasets||[]).findIndex(item=>Number(item.dataset_id)===Number(dataset.dataset_id));
      if(updated&&index>=0)state.fieldMappings.datasets[index]=updated;

      await loadFieldMappings(state.project.id,{renderAfter:false});
      log(`Saved field mapping for ${dataset.dataset_name}`);
      notify("Field mapping saved.");
    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }finally{
      state.mappingSaving=false;
      render();
    }
  }

  async function resetFieldMappings(){
    const dataset=currentMappingDataset();
    if(!dataset)return;
    if(!confirm(`Reset all field mappings for "${dataset.dataset_name}"?`))return;

    try{
      await apiFetch(
        ENDPOINTS.migrations.resetDatasetFieldMappings(companyId(),state.project.id,dataset.dataset_id),
        {method:"DELETE"}
      );
      await loadFieldMappings(state.project.id,{renderAfter:false});
      log(`Reset field mappings for ${dataset.dataset_name}`);
      render();
    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }
  }


  async function validateFieldMappings(){
    state.mappingValidating=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.validateFieldMappings(companyId(),state.project.id),
        {method:"POST",body:"{}"}
      );

      const validation=response?.validation;
      if(validation?.valid){
        notify("All field mappings are valid.");
        log("Field mapping validation passed");
      }else{
        const issue=validation?.issues?.[0];
        notify(issue?.message||"Field mapping validation failed.");
      }

      await loadFieldMappings(state.project.id,{renderAfter:false});
    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }finally{
      state.mappingValidating=false;
      render();
    }
  }

  async function copyFieldMappings(){
    const target=currentMappingDataset();
    if(!target)return;

    const compatible=(state.fieldMappings.datasets||[])
      .filter(dataset=>dataset.dataset_id!==target.dataset_id&&dataset.entity_code===target.entity_code);

    if(!compatible.length)return notify("No other dataset with the same entity is available.");

    const sourceId=Number(prompt(
      `Copy mapping from dataset ID:\n${compatible.map(dataset=>`${dataset.dataset_id} — ${dataset.dataset_name}`).join("\n")}`
    ));

    if(!compatible.some(dataset=>Number(dataset.dataset_id)===sourceId))return notify("Invalid source dataset.");

    try{
      await apiFetch(
        ENDPOINTS.migrations.copyFieldMappings(companyId(),state.project.id),
        {method:"POST",body:JSON.stringify({source_dataset_id:sourceId,target_dataset_id:target.dataset_id})}
      );

      await loadFieldMappings(state.project.id,{renderAfter:false});
      notify("Field mapping copied.");
      render();
    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }
  }

  function fieldMappingView(){
    const datasets=state.fieldMappings.datasets||[];

    if(!state.fieldMappingsLoaded){
      return `<div class="mw-empty">Loading field mappings…</div>`;
    }

    if(!datasets.length){
      return `
        <h2>Field Mapping</h2>
        <div class="mw-alert warn">
          Run source detection and assign entities before field mapping.
        </div>
      `;
    }

    const dataset=currentMappingDataset()||datasets[0];

    return `
      ${heading(
        "Field Mapping",
        "Map source columns to FinSage migration fields before account and reference mapping.",
        `
          <button class="mw-btn" data-mw-action="copy-field-mappings">Copy mapping</button>
          <button class="mw-btn danger" data-mw-action="reset-field-mappings">Reset</button>
          <button class="mw-btn" data-mw-action="validate-field-mappings" ${state.mappingValidating?"disabled":""}>
            ${state.mappingValidating?"Validating…":"Validate"}
          </button>
          <button class="mw-btn" data-mw-action="auto-map-fields" ${state.mappingAutoRunning?"disabled":""}>
            ${state.mappingAutoRunning?"Mapping…":"Auto map"}
          </button>
          <button class="mw-btn primary" data-mw-action="save-field-mappings" ${state.mappingSaving?"disabled":""}>
            ${state.mappingSaving?"Saving…":"Save mapping"}
          </button>
        `
      )}

      <div class="mw-grid-3" style="margin-top:14px">
        <div class="mw-field">
          <label>Dataset</label>
          <select id="mwMappingDataset" class="mw-select">
            ${datasets.map(item=>`
              <option value="${item.dataset_id}" ${Number(item.dataset_id)===Number(dataset.dataset_id)?"selected":""}>
                ${esc(item.dataset_name)} — ${esc(item.entity_label||item.entity_code)}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="mw-stat">
          <span>Required fields</span>
          <strong>${dataset.required_count||0}</strong>
        </div>

        <div class="mw-stat">
          <span>Required unmapped</span>
          <strong>${dataset.required_unmapped_count||0}</strong>
        </div>
      </div>

      ${fieldMappingStatus(dataset)}
      ${fieldMappingTable(dataset)}
    `;
  }

  function fieldMappingStatus(dataset){
    if(dataset.duplicate_targets?.length){
      return `
        <div class="mw-alert error" style="margin-top:14px">
          <strong>Duplicate target mappings:</strong>
          ${esc(dataset.duplicate_targets.join(", "))}
        </div>
      `;
    }

    if(dataset.required_unmapped_count){
      return `
        <div class="mw-alert warn" style="margin-top:14px">
          <strong>${dataset.required_unmapped_count} required field(s) still unmapped:</strong>
          ${dataset.required_unmapped.map(field=>esc(field.label)).join(", ")}
        </div>
      `;
    }

    return `
      <div class="mw-alert ok" style="margin-top:14px">
        <strong>Required field mapping complete.</strong>
        Optional source columns can still be mapped or ignored.
      </div>
    `;
  }

  function fieldMappingTable(dataset){
    const targets=dataset.targets||[];

    return table(
      ["Source Column","Detected Type","Sample","FinSage Field","Transform","Confidence","Ignore"],
      (dataset.rows||[]).map(row=>[
        `<strong>${esc(row.source_name)}</strong>`,
        badge(titleCase(row.detected_type||"text"),"info"),
        esc((row.samples||[]).slice(0,2).join(", ")),
        fieldTargetSelect(row,targets),
        fieldTransformSelect(row),
        badge(`${Number(row.confidence||0).toFixed(0)}%`,Number(row.confidence||0)>=85?"ok":Number(row.confidence||0)>=60?"warn":""),
        `<input type="checkbox" data-mw-map-ignore="${row.column_id}" ${row.mapping_status==="ignored"?"checked":""}>`
      ]),
      "No source columns were detected."
    );
  }

  function fieldTargetSelect(row,targets){
    if(row.mapping_status==="ignored")return `<span class="mw-muted">Ignored</span>`;

    return `
      <select class="mw-select" data-mw-map-target="${row.column_id}">
        <option value="">Select field</option>
        ${targets.map(target=>`
          <option value="${esc(target.field_code)}" ${row.target_field_code===target.field_code?"selected":""}>
            ${esc(target.label)}${target.is_required?" *":""}
          </option>
        `).join("")}
      </select>
    `;
  }

  function fieldTransformSelect(row){
    const options=[
      ["none","None"],["trim","Trim spaces"],["uppercase","Uppercase"],["lowercase","Lowercase"],
      ["parse_number","Parse number"],["parse_date","Parse date"],["reverse_sign","Reverse sign"],
      ["absolute","Absolute value"],["use_default","Use default"]
    ];

    return `
      <select class="mw-select" data-mw-map-transform="${row.column_id}" ${row.mapping_status==="ignored"?"disabled":""}>
        ${options.map(([value,label])=>`
          <option value="${value}" ${(row.transformation||"none")===value?"selected":""}>${label}</option>
        `).join("")}
      </select>
    `;
  }

  async function loadReferenceMappings(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.referenceMappings={
        groups:[],
        reference_count:0,
        group_count:0,
        unresolved_count:0,
        pending_count:0,
        complete_count:0,
      };
      state.referenceMappingsLoaded=false;
      state.referenceMappingType=null;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.referenceMappings(companyId(),projectId)
      );

      state.referenceMappings=response?.reference_mappings||{
        groups:[],
        reference_count:0,
        group_count:0,
        unresolved_count:0,
        pending_count:0,
        complete_count:0,
      };

      state.referenceMappingsLoaded=true;

      const groups=state.referenceMappings.groups||[];

      if(!groups.some(group=>group.reference_type===state.referenceMappingType)){
        state.referenceMappingType=groups[0]?.reference_type||null;
      }

      state.referenceMappingDirty=false;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadReferenceMappings failed",error);
    }

    if(renderAfter)render();
  }

  function currentReferenceGroup(){
    return (state.referenceMappings.groups||[]).find(
      group=>group.reference_type===state.referenceMappingType
    )||null;
  }

  function updateReferenceTarget(referenceType,sourceValue,targetId){
    const group=(state.referenceMappings.groups||[]).find(
      item=>item.reference_type===referenceType
    );

    const row=group?.rows?.find(
      item=>String(item.source_value)===String(sourceValue)
    );

    if(!row)return;

    const target=(group.targets||[]).find(
      item=>Number(item.id)===Number(targetId)
    );

    row.target_id=target?.id||null;
    row.target_code=target?.code||null;
    row.target_label=target?.label||null;
    row.mapping_action=target?"map":"create";
    row.mapping_method="manual";
    row.is_approved=Boolean(target);
    row._dirty=true;

    state.referenceMappingDirty=true;
    recalculateReferenceMappings();
    render();
  }

  function updateReferenceAction(referenceType,sourceValue,action){
    const group=(state.referenceMappings.groups||[]).find(
      item=>item.reference_type===referenceType
    );

    const row=group?.rows?.find(
      item=>String(item.source_value)===String(sourceValue)
    );

    if(!row)return;

    row.mapping_action=action;
    row.mapping_method="manual";
    row._dirty=true;

    if(action!=="map"){
      row.target_id=null;
      row.target_code=null;
      row.target_label=null;
      row.is_approved=true;
    }else{
      row.is_approved=Boolean(row.target_id);
    }

    state.referenceMappingDirty=true;
    recalculateReferenceMappings();
    render();
  }

  function recalculateReferenceMappings(){
    const groups=state.referenceMappings.groups||[];

    groups.forEach(group=>{
      group.unresolved_count=(group.rows||[]).filter(
        row=>row.mapping_action==="map"&&!row.target_id
      ).length;

      group.pending_count=(group.rows||[]).filter(
        row=>!row.is_approved
      ).length;

      group.is_complete=!group.unresolved_count&&!group.pending_count;
    });

    state.referenceMappings.reference_count=groups.reduce(
      (sum,group)=>sum+(group.rows||[]).length,
      0
    );

    state.referenceMappings.group_count=groups.length;

    state.referenceMappings.unresolved_count=groups.reduce(
      (sum,group)=>sum+group.unresolved_count,
      0
    );

    state.referenceMappings.pending_count=groups.reduce(
      (sum,group)=>sum+group.pending_count,
      0
    );

    state.referenceMappings.complete_count=groups.filter(
      group=>group.is_complete
    ).length;
  }

  function recalculateReferenceMappings(){
    const groups=state.referenceMappings.groups||[];

    groups.forEach(group=>{
      group.unresolved_count=(group.rows||[]).filter(
        row=>row.mapping_action==="map"&&!row.target_id
      ).length;

      group.pending_count=(group.rows||[]).filter(
        row=>!row.is_approved
      ).length;

      group.is_complete=!group.unresolved_count&&!group.pending_count;
    });

    state.referenceMappings.reference_count=groups.reduce(
      (sum,group)=>sum+(group.rows||[]).length,
      0
    );

    state.referenceMappings.group_count=groups.length;

    state.referenceMappings.unresolved_count=groups.reduce(
      (sum,group)=>sum+group.unresolved_count,
      0
    );

    state.referenceMappings.pending_count=groups.reduce(
      (sum,group)=>sum+group.pending_count,
      0
    );

    state.referenceMappings.complete_count=groups.filter(
      group=>group.is_complete
    ).length;
  }

  async function scanReferenceMappings(){
    if(!state.project?.id)return;

    state.referenceScanning=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.scanReferenceMappings(
          companyId(),
          state.project.id
        ),
        {method:"POST",body:"{}"}
      );

      state.referenceMappings=response?.reference_mappings||state.referenceMappings;
      state.referenceMappingsLoaded=true;

      const groups=state.referenceMappings.groups||[];

      if(!groups.some(group=>group.reference_type===state.referenceMappingType)){
        state.referenceMappingType=groups[0]?.reference_type||null;
      }

      state.referenceMappingDirty=false;

      log(`Scanned ${state.referenceMappings.reference_count||0} reference values`);

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.referenceScanning=false;
      render();
    }
  }

  async function autoReferenceMappings(){
    if(!state.referenceMappings.reference_count){
      return notify("Scan reference values before running automatic matching.");
    }

    state.referenceAutoRunning=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.autoReferenceMappings(
          companyId(),
          state.project.id
        ),
        {method:"POST",body:"{}"}
      );

      state.referenceMappings=response?.reference_mappings||state.referenceMappings;
      state.referenceMappingDirty=false;

      log("Automatic reference matching completed");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.referenceAutoRunning=false;
      render();
    }
  }

  async function saveReferenceMappings(){
    const groups=state.referenceMappings.groups||[];
    const mappings=[];

    for(const group of groups){
      for(const row of group.rows||[]){
        if(row.mapping_action==="map"&&!row.target_id){
          notify(`Select a target for "${row.source_value}".`);
          state.referenceMappingType=group.reference_type;
          render();
          return;
        }

        mappings.push({
          reference_type:group.reference_type,
          source_value:row.source_value,
          source_label:row.source_label,
          target_id:row.target_id||null,
          target_code:row.target_code||null,
          target_label:row.target_label||null,
          mapping_action:row.mapping_action||"create",
          confidence:Number(row.confidence||0),
          notes:row.notes||null,
        });
      }
    }

    state.referenceSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.referenceMappings(
          companyId(),
          state.project.id
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings}),
        }
      );

      state.referenceMappings=response?.reference_mappings||state.referenceMappings;
      state.referenceMappingDirty=false;

      log("Reference mappings saved");
      notify("Reference mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.referenceSaving=false;
      render();
    }
  }

  async function validateReferenceMappings(){
    state.referenceValidating=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.validateReferenceMappings(
          companyId(),
          state.project.id
        ),
        {method:"POST",body:"{}"}
      );

      const validation=response?.validation;

      if(validation?.valid){
        notify("Reference mappings are valid.");
        log("Reference mapping validation passed");
      }else{
        const issue=validation?.issues?.[0];
        notify(issue?.message||"Reference mapping validation failed.");
      }

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.referenceValidating=false;
      render();
    }
  }

  async function resetReferenceMappings(){
    if(!confirm("Reset all account and reference mappings for this migration project?"))return;

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.resetReferenceMappings(
          companyId(),
          state.project.id
        ),
        {method:"DELETE"}
      );

      state.referenceMappings=response?.reference_mappings||state.referenceMappings;
      state.referenceMappingDirty=false;

      notify("Reference mappings reset.");
      render();

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }
  }

  function referenceMappingView(){
    const groups=state.referenceMappings.groups||[];

    if(!state.referenceMappingsLoaded){
      return `<div class="mw-empty">Loading account and reference mappings…</div>`;
    }

    if(!state.referenceMappings.reference_count){
      return `
        ${heading(
          "Account and Reference Mapping",
          "Scan mapped source fields for accounts, customers, vendors, products and other references.",
          `
            <button class="mw-btn primary" data-mw-action="scan-reference-mappings" ${state.referenceScanning?"disabled":""}>
              ${state.referenceScanning?"Scanning…":"Scan references"}
            </button>
          `
        )}

        <div class="mw-empty">
          No reference values have been scanned yet.
        </div>
      `;
    }

    const group=currentReferenceGroup()||groups[0];

    return `
      ${heading(
        "Account and Reference Mapping",
        "Match source accounting references to existing FinSage records or mark them for creation.",
        `
          <button class="mw-btn" data-mw-action="scan-reference-mappings" ${state.referenceScanning?"disabled":""}>
            ${state.referenceScanning?"Scanning…":"Rescan"}
          </button>

          <button class="mw-btn" data-mw-action="auto-reference-mappings" ${state.referenceAutoRunning?"disabled":""}>
            ${state.referenceAutoRunning?"Matching…":"Auto match"}
          </button>

          <button class="mw-btn" data-mw-action="validate-reference-mappings" ${state.referenceValidating?"disabled":""}>
            ${state.referenceValidating?"Validating…":"Validate"}
          </button>

          <button class="mw-btn danger" data-mw-action="reset-reference-mappings">
            Reset
          </button>

          <button class="mw-btn primary" data-mw-action="save-reference-mappings" ${state.referenceSaving?"disabled":""}>
            ${state.referenceSaving?"Saving…":state.referenceMappingDirty?"Save mappings":"Mappings saved"}
          </button>
        `
      )}

      <div class="mw-grid-3" style="margin-top:14px">
        <div class="mw-field">
          <label>Reference type</label>

          <select id="mwReferenceMappingType" class="mw-select">
            ${groups.map(item=>`
              <option value="${esc(item.reference_type)}"
                ${item.reference_type===group.reference_type?"selected":""}>
                ${esc(referenceTypeLabel(item.reference_type))}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="mw-stat">
          <span>References</span>
          <strong>${group.rows?.length||0}</strong>
        </div>

        <div class="mw-stat">
          <span>Pending</span>
          <strong>${group.pending_count||0}</strong>
        </div>
      </div>

      ${referenceMappingStatus(group)}
      ${referenceMappingTable(group)}
    `;
  }

  function referenceTypeLabel(type){
    return {
      account:"Chart of Accounts",
      customer:"Customers",
      vendor:"Vendors",
      product:"Products",
      tax_code:"Tax Codes",
      bank_account:"Bank Accounts",
      department:"Departments",
    }[type]||titleCase(type);
  }

  function referenceMappingStatus(group){
    if(group.unresolved_count){
      return `
        <div class="mw-alert error" style="margin-top:14px">
          <strong>${group.unresolved_count} unresolved mapping(s).</strong>
          Select a FinSage target or choose Create New.
        </div>
      `;
    }

    if(group.pending_count){
      return `
        <div class="mw-alert warn" style="margin-top:14px">
          <strong>${group.pending_count} mapping(s) require approval.</strong>
          Review automatic matches and save the mappings.
        </div>
      `;
    }

    return `
      <div class="mw-alert ok" style="margin-top:14px">
        <strong>${esc(referenceTypeLabel(group.reference_type))} mapping complete.</strong>
      </div>
    `;
  }

  function referenceMappingTable(group){
    return table(
      ["Source Value","Occurrences","Action","FinSage Target","Confidence"],
      (group.rows||[]).map(row=>[
        `
          <strong>${esc(row.source_value)}</strong>
          ${row.source_label&&row.source_label!==row.source_value
            ?`<div class="mw-muted mw-small">${esc(row.source_label)}</div>`
            :""
          }
        `,

        Number(row.occurrence_count||0).toLocaleString(),

        referenceActionSelect(group,row),

        referenceTargetSelect(group,row),

        badge(
          `${Number(row.confidence||0).toFixed(0)}%`,
          Number(row.confidence||0)>=90
            ?"ok"
            :Number(row.confidence||0)>=70
              ?"warn"
              :""
        ),
      ]),
      "No source references were found."
    );
  }

  function referenceActionSelect(group,row){
    return `
      <select
        class="mw-select"
        data-mw-reference-action="1"
        data-mw-reference-type="${esc(group.reference_type)}"
        data-mw-reference-value="${esc(row.source_value)}"
      >
        <option value="map" ${row.mapping_action==="map"?"selected":""}>Map existing</option>
        <option value="create" ${row.mapping_action==="create"?"selected":""}>Create new</option>
        <option value="ignore" ${row.mapping_action==="ignore"?"selected":""}>Ignore</option>
      </select>
    `;
  }

  function referenceTargetSelect(group,row){
    if(row.mapping_action!=="map"){
      return `<span class="mw-muted">${row.mapping_action==="create"?"Create during migration":"Ignored"}</span>`;
    }

    return `
      <select
        class="mw-select"
        data-mw-reference-target="${esc(row.source_value)}"
        data-mw-reference-type="${esc(group.reference_type)}"
        data-mw-reference-value="${esc(row.source_value)}"
      >
        <option value="">Select target</option>

        ${(group.targets||[]).map(target=>`
          <option value="${esc(target.id)}"
            ${Number(row.target_id)===Number(target.id)?"selected":""}>
            ${esc(target.code||"")}${target.code?" — ":""}${esc(target.label||"")}
          </option>
        `).join("")}
      </select>
    `;
  }

  async function loadPpeMapping(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.ppe={datasets:[],datasetId:null,settings:null,mapping:null,preview:null};
      state.ppeLoaded=false;
      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.ppe(companyId(),projectId)
      );

      state.ppe.datasets=response?.datasets||[];

      if(!state.ppe.datasets.some(
        dataset=>Number(dataset.dataset_id)===Number(state.ppe.datasetId)
      )){
        state.ppe.datasetId=state.ppe.datasets[0]?.dataset_id||null;
      }

      if(state.ppe.datasetId){
        await loadPpeDataset(state.ppe.datasetId,{renderAfter:false});
      }

      state.ppeLoaded=true;
    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadPpeMapping failed",error);
    }

    if(renderAfter)render();
  }

  async function loadPpeDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.ppeSettings(companyId(),state.project.id,id)
      ),
      apiFetch(
        ENDPOINTS.migrations.ppeMapping(companyId(),state.project.id,id)
      ),
    ]);

    state.ppe.datasetId=id;
    state.ppe.settings=settingsResponse?.settings||null;
    state.ppe.mapping=mappingResponse?.mapping||null;
    state.ppe.preview=null;

    if(renderAfter)render();
  }

  async function savePpeSettings(){
    if(!state.ppe.datasetId||!state.ppe.settings)return;

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.ppeSettings(
          companyId(),state.project.id,state.ppe.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(state.ppe.settings),
        }
      );

      state.ppe.settings=response?.settings||state.ppe.settings;
      notify("PPE migration settings saved.");
    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }

    render();
  }

  async function savePpeMapping(){
    const mappings=state.ppe.mapping?.mappings||[];
    if(!state.ppe.datasetId||!mappings.length)return;

    const invalid=mappings.find(row=>
      !row.target_asset_class||
      !row.target_asset_class_group||
      (state.ppe.settings?.require_gl_mapping&&!row.asset_account_code)
    );

    if(invalid){
      notify(`Complete PPE mapping for "${invalid.source_class}".`);
      return;
    }

    state.ppeSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.ppeClasses(
          companyId(),state.project.id,state.ppe.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings}),
        }
      );

      state.ppe.mapping=response?.mapping||state.ppe.mapping;
      notify("PPE class mapping saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.ppeSaving=false;
      render();
    }
  }

  async function previewPpe(){
    if(!state.ppe.datasetId)return;

    state.ppePreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.ppePreview(
          companyId(),state.project.id,state.ppe.datasetId
        )
      );

      state.ppe.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.ppePreviewLoading=false;
      render();
    }
  }


  function ppeMappingView(){
    const datasets=state.ppe.datasets||[];
    const mapping=state.ppe.mapping;
    const settings=state.ppe.settings;

    if(!datasets.length){
      return `<div class="mw-empty">No PPE datasets detected.</div>`;
    }

    if(!mapping||!settings){
      return `<div class="mw-empty">Loading PPE mapping…</div>`;
    }

    return `
      ${heading(
        "PPE Migration Mapping",
        "Configure how source fixed assets will be transformed into the existing FinSage PPE onboarding structure.",
        `
          <button class="mw-btn" data-mw-action="save-ppe-settings">Save settings</button>
          <button class="mw-btn primary" data-mw-action="save-ppe-mapping" ${state.ppeSaving?"disabled":""}>
            ${state.ppeSaving?"Saving…":"Save PPE mapping"}
          </button>
          <button class="mw-btn" data-mw-action="preview-ppe" ${state.ppePreviewLoading?"disabled":""}>
            ${state.ppePreviewLoading?"Building preview…":"Preview payload"}
          </button>
        `
      )}

      <div class="mw-grid-3" style="margin-top:14px">
        <div class="mw-field">
          <label>PPE Dataset</label>
          <select id="mwPpeDataset" class="mw-select">
            ${datasets.map(dataset=>`
              <option value="${dataset.dataset_id}"
                ${Number(dataset.dataset_id)===Number(state.ppe.datasetId)?"selected":""}>
                ${esc(dataset.dataset_name)}
              </option>
            `).join("")}
          </select>
        </div>

        ${ppeSettingSelect(
          "Default entry mode","default_entry_mode",
          [["opening_balance","Opening balance"],["acquisition","Acquisition"]]
        )}

        ${ppeSettingInput(
          "Opening as at","default_opening_as_at","date"
        )}
      </div>

      <div class="mw-grid-3" style="margin-top:14px">
        ${ppeSettingSelect(
          "Default standard","default_accounting_standard",
          [["ias16","IAS 16"],["ias38","IAS 38"],["ias40","IAS 40"]]
        )}

        ${ppeSettingSelect(
          "Measurement basis","default_measurement_basis",
          [["cost","Cost"],["revaluation","Revaluation"]]
        )}

        ${ppeSettingSelect(
          "Depreciation method","default_depreciation_method",
          [["SL","Straight line"],["RB","Reducing balance"],["UOP","Units of production"],["APP","Not depreciated"]]
        )}
      </div>

      <div style="margin-top:20px">
        <h3>Asset class mapping</h3>
        <p class="mw-muted">
          Map each source asset class to its FinSage PPE classification and GL accounts.
        </p>

        ${(mapping.mappings||[]).map(ppeClassCard).join("")||
          `<div class="mw-empty">No source asset classes were detected.</div>`
        }
      </div>

      ${ppePreviewView()}
    `;
  }

  function ppeSettingInput(label,field,type="text"){
    const value=state.ppe.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>
        <input class="mw-input" type="${type}"
          value="${esc(value)}"
          data-mw-ppe-setting="${esc(field)}">
      </div>
    `;
  }

  function ppeSettingSelect(label,field,options){
    const value=state.ppe.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>
        <select class="mw-select" data-mw-ppe-setting="${esc(field)}">
          ${options.map(([id,name])=>`
            <option value="${esc(id)}" ${String(value)===String(id)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function ppeClassCard(row){
    return `
      <div class="mw-card" style="margin-top:12px">
        <div class="mw-inline" style="justify-content:space-between">
          <div>
            <strong>${esc(row.source_class)}</strong>
            <div class="mw-muted mw-small">
              ${Number(row.sample_count||0)} sample record(s)
            </div>
          </div>

          <span class="mw-badge ${row.is_approved?"ok":"warn"}">
            ${row.is_approved?"Mapped":"Review required"}
          </span>
        </div>

        <div class="mw-grid-3" style="margin-top:12px">
          ${ppeClassInput(row,"target_asset_class","FinSage Asset Class")}
          ${ppeClassSelect(row,"target_asset_class_group","Asset Class Group",
            state.ppe.mapping?.targets?.class_groups?.map(value=>[value,value])||[]
          )}
          ${ppeClassSelect(row,"accounting_standard","Standard",[
            ["ias16","IAS 16"],["ias38","IAS 38"],["ias40","IAS 40"]
          ])}

          ${ppeClassSelect(row,"measurement_basis","Measurement",[
            ["cost","Cost"],["revaluation","Revaluation"]
          ])}

          ${ppeClassSelect(row,"depreciation_method","Depreciation",[
            ["","Use source/default"],["SL","Straight line"],
            ["RB","Reducing balance"],["UOP","Units of production"],
            ["APP","Not depreciated"]
          ])}

          ${ppeClassInput(row,"useful_life_months","Useful Life Months","number")}
        </div>

        <div class="mw-grid-3" style="margin-top:12px">
          ${ppeClassCoa(row,"asset_account_code","Asset Cost Account")}
          ${ppeClassCoa(row,"accum_dep_account_code","Accumulated Depreciation")}
          ${ppeClassCoa(row,"dep_expense_account_code","Depreciation Expense")}
        </div>
      </div>
    `;
  }
  function ppeClassInput(row,field,label,type="text"){
    return `
      <div class="mw-field">
        <label>${esc(label)}</label>
        <input class="mw-input" type="${type}"
          value="${esc(row[field]??"")}"
          data-mw-ppe-class-field="${esc(field)}"
          data-mw-ppe-source-class="${esc(row.source_class)}">
      </div>
    `;
  }

  function ppeClassSelect(row,field,label,options){
    return `
      <div class="mw-field">
        <label>${esc(label)}</label>
        <select class="mw-select"
          data-mw-ppe-class-field="${esc(field)}"
          data-mw-ppe-source-class="${esc(row.source_class)}">

          ${options.map(([value,name])=>`
            <option value="${esc(value)}" ${String(row[field]??"")===String(value)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function ppeClassCoa(row,field,label){
    const accounts=window.COA_ACCOUNTS||
      window.ACCOUNTS||
      window.chartOfAccounts||
      [];

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select"
          data-mw-ppe-class-field="${esc(field)}"
          data-mw-ppe-source-class="${esc(row.source_class)}">

          <option value="">Select account</option>

          ${accounts.map(account=>{
            const code=account.code||account.account_code||"";
            const name=account.name||account.account_name||code;

            return `
              <option value="${esc(code)}"
                ${String(row[field]||"")===String(code)?"selected":""}>
                ${esc(name)}
              </option>
            `;
          }).join("")}
        </select>
      </div>
    `;
  }

  function ppePreviewView(){
    const preview=state.ppe.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:22px">
        <h3>PPE Payload Preview</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Rows previewed</span>
            <strong>${preview.row_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>
        </div>

        ${(preview.rows||[]).map(row=>`
          <div class="mw-card" style="margin-top:12px">
            <div class="mw-inline" style="justify-content:space-between">
              <strong>
                ${esc(row.payload?.asset_code||`Row ${row.row_number}`)}
                ${row.payload?.asset_name?` — ${esc(row.payload.asset_name)}`:""}
              </strong>

              <span class="mw-badge ${row.valid?"ok":"error"}">
                ${row.valid?"Ready":"Needs attention"}
              </span>
            </div>

            <div class="mw-grid-3" style="margin-top:12px">
              <div>
                <span class="mw-muted mw-small">Class</span>
                <div>${esc(row.payload?.asset_class||"—")}</div>
              </div>

              <div>
                <span class="mw-muted mw-small">Historical Cost</span>
                <div>${Number(row.payload?.cost||0).toLocaleString()}</div>
              </div>

              <div>
                <span class="mw-muted mw-small">Opening Carrying Amount</span>
                <div>${Number(row.payload?.calculated_carrying_amount||0).toLocaleString()}</div>
              </div>
            </div>

            ${row.issues?.length?`
              <div class="mw-alert error" style="margin-top:12px">
                ${row.issues.map(issue=>`<div>${esc(issue)}</div>`).join("")}
              </div>
            `:""}
          </div>
        `).join("")}
      </div>
    `;
  }

  async function loadLeaseMapping(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.leases={
        datasets:[],
        datasetId:null,
        settings:null,
        mapping:null,
        preview:null,
      };
      state.leasesLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.leases(companyId(),projectId)
      );

      state.leases.datasets=response?.datasets||[];

      if(!state.leases.datasets.some(
        dataset=>Number(dataset.dataset_id)===Number(state.leases.datasetId)
      )){
        state.leases.datasetId=state.leases.datasets[0]?.dataset_id||null;
      }

      if(state.leases.datasetId){
        await loadLeaseDataset(
          state.leases.datasetId,
          {renderAfter:false}
        );
      }

      state.leasesLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadLeaseMapping failed",error);
    }

    if(renderAfter)render();
  }

  async function loadLeaseDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.leaseSettings(
          companyId(),state.project.id,id
        )
      ),

      apiFetch(
        ENDPOINTS.migrations.leaseMapping(
          companyId(),state.project.id,id
        )
      ),
    ]);

    state.leases.datasetId=id;
    state.leases.settings=settingsResponse?.settings||null;
    state.leases.mapping=mappingResponse?.mapping||null;
    state.leases.preview=null;

    if(renderAfter)render();
  }

  async function saveLeaseSettings(){
    if(!state.leases.datasetId||!state.leases.settings)return;

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.leaseSettings(
          companyId(),
          state.project.id,
          state.leases.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(state.leases.settings),
        }
      );

      state.leases.settings=response?.settings||state.leases.settings;

      await loadLeaseDataset(
        state.leases.datasetId,
        {renderAfter:false}
      );

      notify("Lease migration settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }

    render();
  }

  async function saveLeaseReferences(){
    const references=state.leases.mapping?.references||{};
    const mappings=[];

    for(const [referenceType,group] of Object.entries(references)){
      for(const row of group.rows||[]){
        if(!row.target_id){
          notify(`Select a target for "${row.source_value}".`);
          return;
        }

        mappings.push({
          reference_type:referenceType,
          source_value:row.source_value,
          source_label:row.source_label||row.source_value,
          target_id:Number(row.target_id),
        });
      }
    }

    state.leaseSaving=true;
    render();

    try{
      await apiFetch(
        ENDPOINTS.migrations.leaseReferences(
          companyId(),
          state.project.id,
          state.leases.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings}),
        }
      );

      await loadLeaseDataset(
        state.leases.datasetId,
        {renderAfter:false}
      );

      notify("Lease reference mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.leaseSaving=false;
      render();
    }
  }

  async function previewLeaseMigration(){
    if(!state.leases.datasetId)return;

    state.leasePreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.leasePreview(
          companyId(),
          state.project.id,
          state.leases.datasetId
        )
      );

      state.leases.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.leasePreviewLoading=false;
      render();
    }
  }

  function leaseMigrationView(){
    const datasets=state.leases.datasets||[];
    const settings=state.leases.settings;
    const mapping=state.leases.mapping;

    if(!datasets.length)return "";

    if(!settings||!mapping){
      return `<div class="mw-empty">Loading IFRS 16 mapping…</div>`;
    }

    const role=settings.default_role||"lessee";

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "IFRS 16 Lease Migration",
          "Transform source lease contracts into FinSage lessee or lessor lease payloads without posting them.",
          `
            <button class="mw-btn" data-mw-action="save-lease-settings">
              Save settings
            </button>

            <button class="mw-btn primary" data-mw-action="save-lease-references"
              ${state.leaseSaving?"disabled":""}>
              ${state.leaseSaving?"Saving…":"Save references"}
            </button>

            <button class="mw-btn" data-mw-action="preview-leases"
              ${state.leasePreviewLoading?"disabled":""}>
              ${state.leasePreviewLoading?"Calculating…":"Preview leases"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Lease Dataset</label>
            <select id="mwLeaseDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.leases.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          ${leaseSettingSelect(
            "Default Role",
            "default_role",
            [
              ["lessee","Lessee"],
              ["lessor","Lessor"],
            ]
          )}

          ${role==="lessee"
            ?leaseSettingSelect(
                "Setup Mode",
                "default_wizard_mode",
                [
                  ["existing","Existing lease / transition"],
                  ["inception","Lease inception"],
                ]
              )
            :leaseSettingSelect(
                "Billing Basis",
                "default_billing_basis",
                [
                  ["gross","Gross"],
                  ["net","Net"],
                ]
              )
          }
        </div>

        ${role==="lessee"
          ?lesseeMigrationSettings()
          :lessorMigrationSettings()
        }

        ${leaseReferenceMappingView(role)}
        ${leaseMigrationPreviewView()}
      </div>
    `;
  }

  function leaseSettingSelect(label,field,options){
    const value=state.leases.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select" data-mw-lease-setting="${esc(field)}">
          ${options.map(([id,name])=>`
            <option value="${esc(id)}"
              ${String(value)===String(id)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function leaseSettingInput(label,field,type="text"){
    const value=state.leases.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <input class="mw-input"
          type="${esc(type)}"
          value="${esc(value)}"
          data-mw-lease-setting="${esc(field)}">
      </div>
    `;
  }

  function lesseeMigrationSettings(){
    return `
      <div class="mw-grid-3" style="margin-top:14px">
        ${leaseSettingInput(
          "Go-live Date",
          "default_go_live_date",
          "date"
        )}

        ${leaseSettingSelect(
          "Payment Frequency",
          "default_payment_frequency",
          [
            ["monthly","Monthly"],
            ["quarterly","Quarterly"],
            ["annually","Annually"],
          ]
        )}

        ${leaseSettingSelect(
          "Payment Timing",
          "default_payment_timing",
          [
            ["arrears","Arrears"],
            ["advance","Advance"],
          ]
        )}
      </div>

      <div class="mw-grid-3" style="margin-top:14px">
        ${leaseSettingCoa(
          "ROU Asset",
          "lessee_rou_asset_account"
        )}

        ${leaseSettingCoa(
          "Current Lease Liability",
          "lessee_liability_current_account"
        )}

        ${leaseSettingCoa(
          "Non-current Lease Liability",
          "lessee_liability_noncurrent_account"
        )}

        ${leaseSettingCoa(
          "Interest Expense",
          "lessee_interest_expense_account"
        )}

        ${leaseSettingCoa(
          "ROU Depreciation Expense",
          "lessee_depreciation_expense_account"
        )}
      </div>
    `;
  }

  function lessorMigrationSettings(){
    return `
      <div class="mw-grid-3" style="margin-top:14px">
        ${leaseSettingSelect(
          "Billing Frequency",
          "default_billing_frequency",
          [
            ["weekly","Weekly"],
            ["monthly","Monthly"],
            ["quarterly","Quarterly"],
            ["annually","Annually"],
          ]
        )}

        ${leaseSettingSelect(
          "Billing Timing",
          "default_billing_timing",
          [
            ["arrears","Arrears"],
            ["advance","Advance"],
          ]
        )}

        ${leaseSettingInput(
          "Currency",
          "default_currency"
        )}
      </div>

      <div class="mw-grid-3" style="margin-top:14px">
        ${leaseSettingCoa(
          "Current Lease Receivable",
          "lessor_receivable_current_account"
        )}

        ${leaseSettingCoa(
          "Non-current Lease Receivable",
          "lessor_receivable_noncurrent_account"
        )}

        ${leaseSettingCoa(
          "Rental Income",
          "lessor_revenue_account"
        )}

        ${leaseSettingCoa(
          "Finance Income",
          "lessor_finance_income_account"
        )}

        ${leaseSettingCoa(
          "Accounts Receivable",
          "lessor_ar_account"
        )}

        ${leaseSettingCoa(
          "VAT Output",
          "lessor_vat_output_account"
        )}

        ${leaseSettingCoa(
          "Security Deposit",
          "lessor_security_deposit_account"
        )}

        ${leaseSettingCoa(
          "Accrued Rental",
          "lessor_accrued_rental_account"
        )}

        ${leaseSettingCoa(
          "Deferred Rental",
          "lessor_deferred_rental_account"
        )}
      </div>
    `;
  }

  function lessorMigrationSettings(){
    return `
      <div class="mw-grid-3" style="margin-top:14px">
        ${leaseSettingSelect(
          "Billing Frequency",
          "default_billing_frequency",
          [
            ["weekly","Weekly"],
            ["monthly","Monthly"],
            ["quarterly","Quarterly"],
            ["annually","Annually"],
          ]
        )}

        ${leaseSettingSelect(
          "Billing Timing",
          "default_billing_timing",
          [
            ["arrears","Arrears"],
            ["advance","Advance"],
          ]
        )}

        ${leaseSettingInput(
          "Currency",
          "default_currency"
        )}
      </div>

      <div class="mw-grid-3" style="margin-top:14px">
        ${leaseSettingCoa(
          "Current Lease Receivable",
          "lessor_receivable_current_account"
        )}

        ${leaseSettingCoa(
          "Non-current Lease Receivable",
          "lessor_receivable_noncurrent_account"
        )}

        ${leaseSettingCoa(
          "Rental Income",
          "lessor_revenue_account"
        )}

        ${leaseSettingCoa(
          "Finance Income",
          "lessor_finance_income_account"
        )}

        ${leaseSettingCoa(
          "Accounts Receivable",
          "lessor_ar_account"
        )}

        ${leaseSettingCoa(
          "VAT Output",
          "lessor_vat_output_account"
        )}

        ${leaseSettingCoa(
          "Security Deposit",
          "lessor_security_deposit_account"
        )}

        ${leaseSettingCoa(
          "Accrued Rental",
          "lessor_accrued_rental_account"
        )}

        ${leaseSettingCoa(
          "Deferred Rental",
          "lessor_deferred_rental_account"
        )}
      </div>
    `;
  }

  function leaseReferenceMappingView(role){
    const refs=state.leases.mapping?.references||{};

    const types=role==="lessee"
      ?["lessor"]
      :["customer","asset"];

    return `
      <div style="margin-top:20px">
        <h3>Lease References</h3>

        <p class="mw-muted">
          Match source counterparties and underlying assets to existing FinSage records.
        </p>

        ${types.map(type=>
          leaseReferenceGroup(type,refs[type])
        ).join("")}
      </div>
    `;
  }

  function leaseReferenceGroup(type,group){
    if(!group?.rows?.length)return "";

    const label={
      lessor:"Lessors",
      customer:"Customers",
      asset:"Underlying Assets",
    }[type]||titleCase(type);

    return `
      <div class="mw-card" style="margin-top:12px">
        <h3>${esc(label)}</h3>

        ${table(
          ["Source","Records","FinSage Target"],
          group.rows.map(row=>[
            `<strong>${esc(row.source_value)}</strong>`,
            Number(row.sample_count||0).toLocaleString(),
            leaseReferenceSelect(type,row,group.targets||[]),
          ]),
          `No ${label.toLowerCase()} detected.`
        )}
      </div>
    `;
  }

  function leaseReferenceSelect(type,row,targets){
    return `
      <select class="mw-select"
        data-mw-lease-reference="${esc(type)}"
        data-mw-lease-source="${esc(row.source_value)}">

        <option value="">Select target</option>

        ${targets.map(target=>`
          <option value="${target.id}"
            ${Number(row.target_id)===Number(target.id)?"selected":""}>
            ${esc(
              `${target.code?`${target.code} — `:""}${target.label||""}`
            )}
          </option>
        `).join("")}
      </select>
    `;
  }

  function leaseMigrationPreviewView(){
    const preview=state.leases.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:22px">
        <h3>IFRS 16 Payload Preview</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Rows</span>
            <strong>${preview.row_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Lessee</span>
            <strong>${preview.lessee_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Lessor</span>
            <strong>${preview.lessor_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>
        </div>

        ${(preview.rows||[]).map(leasePreviewCard).join("")}
      </div>
    `;
  }

  function leasePreviewCard(row){
    const payload=row.payload||{};

    return `
      <div class="mw-card" style="margin-top:12px">
        <div class="mw-inline" style="justify-content:space-between">
          <div>
            <strong>
              ${esc(
                payload.lease_name||
                payload.contract_name||
                `Row ${row.row_number}`
              )}
            </strong>

            <div class="mw-muted mw-small">
              ${row.role==="lessor"?"Lessor":"Lessee"}
            </div>
          </div>

          <span class="mw-badge ${row.valid?"ok":"error"}">
            ${row.valid?"Ready":"Needs attention"}
          </span>
        </div>

        ${row.role==="lessee"
          ?lesseePreviewSummary(row)
          :lessorPreviewSummary(row)
        }

        ${row.issues?.length?`
          <div class="mw-alert ${row.valid?"warn":"error"}" style="margin-top:12px">
            ${row.issues.map(issue=>`<div>${esc(issue)}</div>`).join("")}
          </div>
        `:""}
      </div>
    `;
  }

  function lesseePreviewSummary(row){
    return `
      <div class="mw-grid-3" style="margin-top:12px">
        <div>
          <span class="mw-muted mw-small">Opening Liability</span>
          <div>${Number(row.opening_lease_liability||0).toLocaleString()}</div>
        </div>

        <div>
          <span class="mw-muted mw-small">Opening ROU</span>
          <div>${Number(row.opening_rou_asset||0).toLocaleString()}</div>
        </div>

        <div>
          <span class="mw-muted mw-small">Opening Journal</span>
          <div>${row.opening_journal?.length||0} lines</div>
        </div>
      </div>
    `;
  }

  function lessorPreviewSummary(row){
    const classification=
      row.classification?.classification||
      row.payload?.lease_classification||
      "—";

    const terms=row.terms?.terms||row.terms||{};

    return `
      <div class="mw-grid-3" style="margin-top:12px">
        <div>
          <span class="mw-muted mw-small">Classification</span>
          <div>${esc(titleCase(classification))}</div>
        </div>

        <div>
          <span class="mw-muted mw-small">Initial Net Investment</span>
          <div>${Number(terms.initial_net_investment||0).toLocaleString()}</div>
        </div>

        <div>
          <span class="mw-muted mw-small">Periods</span>
          <div>${terms.period_count||terms.schedule?.length||0}</div>
        </div>
      </div>
    `;
  }


  async function loadLoanMapping(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.loans={
        datasets:[],
        datasetId:null,
        settings:null,
        mapping:null,
        preview:null,
      };
      state.loansLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.loans(companyId(),projectId)
      );

      state.loans.datasets=response?.datasets||[];

      if(!state.loans.datasets.some(
        dataset=>Number(dataset.dataset_id)===Number(state.loans.datasetId)
      )){
        state.loans.datasetId=state.loans.datasets[0]?.dataset_id||null;
      }

      if(state.loans.datasetId){
        await loadLoanDataset(
          state.loans.datasetId,
          {renderAfter:false}
        );
      }

      state.loansLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadLoanMapping failed",error);
    }

    if(renderAfter)render();
  }

  async function loadLoanDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.loanSettings(
          companyId(),state.project.id,id
        )
      ),

      apiFetch(
        ENDPOINTS.migrations.loanMapping(
          companyId(),state.project.id,id
        )
      ),
    ]);

    state.loans.datasetId=id;
    state.loans.settings=settingsResponse?.settings||null;
    state.loans.mapping=mappingResponse?.mapping||null;
    state.loans.preview=null;

    if(renderAfter)render();
  }

  async function saveLoanSettings(){
    if(!state.loans.datasetId||!state.loans.settings)return;

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.loanSettings(
          companyId(),
          state.project.id,
          state.loans.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(state.loans.settings),
        }
      );

      state.loans.settings=response?.settings||state.loans.settings;

      await loadLoanDataset(
        state.loans.datasetId,
        {renderAfter:false}
      );

      notify("Loan migration settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }

    render();
  }

  async function saveLoanReferences(){
    const references=state.loans.mapping?.references||{};
    const mappings=[];

    for(const [referenceType,group] of Object.entries(references)){
      for(const row of group.rows||[]){
        if(!row.target_id){
          if(referenceType==="bank_account"&&!state.loans.settings?.require_bank_mapping){
            continue;
          }

          notify(`Select a target for "${row.source_value}".`);
          return;
        }

        mappings.push({
          reference_type:referenceType,
          source_value:row.source_value,
          source_label:row.source_label||row.source_value,
          target_id:Number(row.target_id),
        });
      }
    }

    if(!mappings.length){
      notify("No loan reference mappings require saving.");
      return;
    }

    state.loanSaving=true;
    render();

    try{
      await apiFetch(
        ENDPOINTS.migrations.loanReferences(
          companyId(),
          state.project.id,
          state.loans.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings}),
        }
      );

      await loadLoanDataset(
        state.loans.datasetId,
        {renderAfter:false}
      );

      notify("Loan reference mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.loanSaving=false;
      render();
    }
  }

  async function previewLoanMigration(){
    if(!state.loans.datasetId)return;

    state.loanPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.loanPreview(
          companyId(),
          state.project.id,
          state.loans.datasetId
        )
      );

      state.loans.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.loanPreviewLoading=false;
      render();
    }
  }

  function loanMigrationView(){
    const datasets=state.loans.datasets||[];
    const settings=state.loans.settings;
    const mapping=state.loans.mapping;

    if(!datasets.length)return "";

    if(!settings||!mapping){
      return `<div class="mw-empty">Loading loan migration mapping…</div>`;
    }

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Loan Migration",
          "Reconstruct existing borrowings, validate amortisation schedules and establish the cutover loan position.",
          `
            <button class="mw-btn" data-mw-action="save-loan-settings">
              Save settings
            </button>

            <button class="mw-btn" data-mw-action="save-loan-references"
              ${state.loanSaving?"disabled":""}>
              ${state.loanSaving?"Saving…":"Save references"}
            </button>

            <button class="mw-btn primary" data-mw-action="preview-loans"
              ${state.loanPreviewLoading?"disabled":""}>
              ${state.loanPreviewLoading?"Reconstructing…":"Reconstruct & preview"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Loan Dataset</label>

            <select id="mwLoanDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.loans.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          ${loanSettingSelect(
            "Source Mode",
            "source_mode",
            [
              ["contract_terms","Reconstruct from contract terms"],
              ["existing_schedule","Use existing amortisation schedule"],
              ["opening_balance_only","Opening balance only"],
            ]
          )}

          ${loanSettingInput(
            "Migration Date",
            "migration_date",
            "date"
          )}
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${loanSettingSelect(
            "Default Loan Type",
            "default_loan_type",
            [
              ["term_loan","Term Loan"],
              ["vehicle","Vehicle Finance"],
              ["mortgage","Mortgage"],
              ["overdraft","Overdraft"],
              ["director_loan","Director Loan"],
              ["other","Other"],
            ]
          )}

          ${loanSettingSelect(
            "Interest Method",
            "default_interest_method",
            [
              ["amortised_fixed_payment","Amortised Fixed Payment"],
              ["straight_line_interest","Straight-line Interest"],
              ["interest_only","Interest Only"],
              ["manual","Manual"],
            ]
          )}

          ${loanSettingSelect(
            "Payment Frequency",
            "default_payment_frequency",
            [
              ["weekly","Weekly"],
              ["monthly","Monthly"],
              ["quarterly","Quarterly"],
              ["annually","Annually"],
            ]
          )}
        </div>

        ${loanAccountSettings()}
        ${loanReferenceMappingView()}
        ${loanPreviewView()}
      </div>
    `;
  }

  function loanSettingInput(label,field,type="text"){
    const value=state.loans.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <input class="mw-input"
          type="${esc(type)}"
          value="${esc(value)}"
          data-mw-loan-setting="${esc(field)}">
      </div>
    `;
  }


  function loanSettingSelect(label,field,options){
    const value=state.loans.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select" data-mw-loan-setting="${esc(field)}">
          ${options.map(([id,name])=>`
            <option value="${esc(id)}"
              ${String(value)===String(id)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function loanAccountSettings(){
    return `
      <div style="margin-top:20px">
        <h3>Loan Accounting</h3>

        <div class="mw-grid-3" style="margin-top:12px">
          ${loanSettingCoa(
            "Interest Expense",
            "interest_expense_account_code"
          )}

          ${loanSettingCoa(
            "Accrued Interest",
            "accrued_interest_account_code"
          )}

          ${loanSettingCoa(
            "Current Loan Payable",
            "loan_payable_current_account_code"
          )}

          ${loanSettingCoa(
            "Non-current Loan Payable",
            "loan_payable_noncurrent_account_code"
          )}

          ${loanSettingCoa(
            "Deferred Fees Asset",
            "fees_asset_account_code"
          )}

          ${loanSettingCoa(
            "Loan Fees Expense",
            "fees_expense_account_code"
          )}
        </div>
      </div>
    `;
  }

  function loanSettingCoa(label,field){
    const accounts=window.COA_ACCOUNTS||
      window.ACCOUNTS||
      window.chartOfAccounts||
      [];

    const selected=state.loans.settings?.[field]||"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select" data-mw-loan-setting="${esc(field)}">
          <option value="">Select account</option>

          ${accounts.map(account=>{
            const code=account.code||account.account_code||"";
            const name=account.name||account.account_name||code;

            return `
              <option value="${esc(code)}"
                ${String(selected)===String(code)?"selected":""}>
                ${esc(name)}
              </option>
            `;
          }).join("")}
        </select>
      </div>
    `;
  }

  function loanReferenceMappingView(){
    const refs=state.loans.mapping?.references||{};

    return `
      <div style="margin-top:20px">
        <h3>Loan References</h3>

        ${loanReferenceGroup(
          "bank_account",
          "Bank Accounts",
          refs.bank_account
        )}

        ${state.loans.settings?.enable_ias23_mapping
          ?loanReferenceGroup(
              "qualifying_asset",
              "IAS 23 Qualifying Assets",
              refs.qualifying_asset
            )
          :""
        }
      </div>
    `;
  }
  function loanReferenceGroup(type,label,group){
    if(!group?.rows?.length)return "";

    return `
      <div class="mw-card" style="margin-top:12px">
        <h3>${esc(label)}</h3>

        ${table(
          ["Source Reference","Records","FinSage Target"],
          group.rows.map(row=>[
            `<strong>${esc(row.source_value)}</strong>`,

            Number(row.sample_count||0).toLocaleString(),

            loanReferenceSelect(
              type,
              row,
              group.targets||[]
            ),
          ]),
          `No ${label.toLowerCase()} detected.`
        )}
      </div>
    `;
  }
  function loanReferenceSelect(type,row,targets){
    return `
      <select class="mw-select"
        data-mw-loan-reference="${esc(type)}"
        data-mw-loan-source="${esc(row.source_value)}">

        <option value="">Select target</option>

        ${targets.map(target=>`
          <option value="${target.id}"
            ${Number(row.target_id)===Number(target.id)?"selected":""}>
            ${esc(
              `${target.code?`${target.code} — `:""}${target.label||""}`
            )}
          </option>
        `).join("")}
      </select>
    `;
  }

  function loanPreviewCard(row){
    const payload=row.payload||{};
    const recon=row.reconciliation||{};
    const cutover=row.cutover||{};
    const next=row.next_payment||{};

    return `
      <div class="mw-card" style="margin-top:12px">
        <div class="mw-inline" style="justify-content:space-between">
          <div>
            <strong>
              ${esc(
                payload.loan_name||
                row.loan_key||
                `Loan ${row.row_number}`
              )}
            </strong>

            <div class="mw-muted mw-small">
              ${esc(payload.lender_name||"")}
            </div>
          </div>

          <span class="mw-badge ${row.valid?"ok":"error"}">
            ${row.valid?"Ready":"Needs attention"}
          </span>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          <div>
            <span class="mw-muted mw-small">Outstanding Principal</span>
            <div>
              ${Number(cutover.outstanding_principal||0).toLocaleString()}
            </div>
          </div>

          <div>
            <span class="mw-muted mw-small">Current Portion</span>
            <div>
              ${Number(cutover.current_portion||0).toLocaleString()}
            </div>
          </div>

          <div>
            <span class="mw-muted mw-small">Non-current Portion</span>
            <div>
              ${Number(cutover.noncurrent_portion||0).toLocaleString()}
            </div>
          </div>
        </div>

        ${row.source_mode==="contract_terms"||row.source_mode==="existing_schedule"
          ?`
            <div class="mw-grid-3" style="margin-top:14px">
              <div>
                <span class="mw-muted mw-small">Calculated Balance</span>
                <div>${Number(recon.calculated_outstanding||0).toLocaleString()}</div>
              </div>

              <div>
                <span class="mw-muted mw-small">Imported Balance</span>
                <div>${Number(recon.imported_outstanding||0).toLocaleString()}</div>
              </div>

              <div>
                <span class="mw-muted mw-small">Difference</span>
                <div>${Number(recon.difference||0).toLocaleString()}</div>
              </div>
            </div>
          `
          :""
        }

        ${next?.due_date?`
          <div class="mw-alert" style="margin-top:14px">
            <strong>Next payment: ${esc(next.due_date)}</strong>

            <div class="mw-grid-3" style="margin-top:8px">
              <div>
                <span class="mw-muted mw-small">Payment</span>
                <div>${Number(next.payment??next.scheduled_payment??0).toLocaleString()}</div>
              </div>

              <div>
                <span class="mw-muted mw-small">Interest</span>
                <div>${Number(next.interest??next.scheduled_interest??0).toLocaleString()}</div>
              </div>

              <div>
                <span class="mw-muted mw-small">Principal</span>
                <div>${Number(next.principal??next.scheduled_principal??0).toLocaleString()}</div>
              </div>
            </div>
          </div>
        `:""}

        ${row.issues?.length?`
          <div class="mw-alert ${row.valid?"warn":"error"}" style="margin-top:12px">
            ${row.issues.map(
              issue=>`<div>${esc(issue)}</div>`
            ).join("")}
          </div>
        `:""}
      </div>
    `;
  }

  async function loadRevenueMapping(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.revenue={
        datasets:[],
        datasetId:null,
        settings:null,
        mapping:null,
        preview:null,
      };
      state.revenueLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.revenue(
          companyId(),
          projectId
        )
      );

      state.revenue.datasets=response?.datasets||[];

      if(!state.revenue.datasets.some(
        dataset=>Number(dataset.dataset_id)===Number(state.revenue.datasetId)
      )){
        state.revenue.datasetId=
          state.revenue.datasets[0]?.dataset_id||null;
      }

      if(state.revenue.datasetId){
        await loadRevenueDataset(
          state.revenue.datasetId,
          {renderAfter:false}
        );
      }

      state.revenueLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadRevenueMapping failed",error);
    }

    if(renderAfter)render();
  }

  async function loadRevenueDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.revenueSettings(
          companyId(),
          state.project.id,
          id
        )
      ),

      apiFetch(
        ENDPOINTS.migrations.revenueMapping(
          companyId(),
          state.project.id,
          id
        )
      ),
    ]);

    state.revenue.datasetId=id;
    state.revenue.settings=settingsResponse?.settings||null;
    state.revenue.mapping=mappingResponse?.mapping||null;
    state.revenue.preview=null;

    if(renderAfter)render();
  }

  async function saveRevenueReferences(){
    const references=state.revenue.mapping?.references||{};
    const mappings=[];

    for(const [referenceType,group] of Object.entries(references)){
      for(const row of group.rows||[]){
        if(!row.target_id){
          if(
            referenceType==="project"&&
            !state.revenue.settings?.require_project_mapping
          ){
            continue;
          }

          notify(`Select a target for "${row.source_value}".`);
          return;
        }

        mappings.push({
          reference_type:referenceType,
          source_value:row.source_value,
          source_label:row.source_label||row.source_value,
          target_id:Number(row.target_id),
        });
      }
    }

    if(!mappings.length){
      notify("No revenue reference mappings require saving.");
      return;
    }

    state.revenueSaving=true;
    render();

    try{
      await apiFetch(
        ENDPOINTS.migrations.revenueReferences(
          companyId(),
          state.project.id,
          state.revenue.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings}),
        }
      );

      await loadRevenueDataset(
        state.revenue.datasetId,
        {renderAfter:false}
      );

      notify("Revenue reference mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.revenueSaving=false;
      render();
    }
  }

  async function previewRevenueMigration(){
    if(!state.revenue.datasetId)return;

    state.revenuePreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.revenuePreview(
          companyId(),
          state.project.id,
          state.revenue.datasetId
        )
      );

      state.revenue.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.revenuePreviewLoading=false;
      render();
    }
  }

  function revenueMigrationView(){
    const datasets=state.revenue.datasets||[];
    const settings=state.revenue.settings;
    const mapping=state.revenue.mapping;

    if(!datasets.length)return "";

    if(!settings||!mapping){
      return `<div class="mw-empty">Loading IFRS 15 migration mapping…</div>`;
    }

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "IFRS 15 Revenue Migration",
          "Reconstruct contracts, performance obligations, project progress, billings and the cutover contract position.",
          `
            <button class="mw-btn" data-mw-action="save-revenue-settings">
              Save settings
            </button>

            <button class="mw-btn" data-mw-action="save-revenue-references"
              ${state.revenueSaving?"disabled":""}>
              ${state.revenueSaving?"Saving…":"Save references"}
            </button>

            <button class="mw-btn primary" data-mw-action="preview-revenue"
              ${state.revenuePreviewLoading?"disabled":""}>
              ${state.revenuePreviewLoading?"Reconstructing…":"Reconstruct & preview"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Revenue Dataset</label>

            <select id="mwRevenueDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.revenue.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          ${revenueSettingSelect(
            "Source Mode",
            "source_mode",
            [
              ["full_history","Full Contract History"],
              ["contract_and_progress","Contract + Progress"],
              ["opening_position","Opening Position"],
            ]
          )}

          ${revenueSettingInput(
            "Migration Date",
            "migration_date",
            "date"
          )}
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${revenueSettingSelect(
            "Billing Method",
            "default_billing_method",
            [
              ["milestone","Milestone"],
              ["progress","Progress"],
              ["periodic","Periodic"],
              ["manual","Manual"],
            ]
          )}

          ${revenueSettingSelect(
            "Recognition Timing",
            "default_recognition_timing",
            [
              ["over_time","Over Time"],
              ["point_in_time","Point in Time"],
            ]
          )}

          ${revenueSettingSelect(
            "Progress Method",
            "default_progress_method",
            [
              ["cost_to_cost","Cost-to-Cost"],
              ["units","Units"],
              ["units_delivered","Units Delivered"],
              ["milestone","Milestone"],
              ["time_elapsed","Time Elapsed"],
              ["manual","Manual"],
            ]
          )}
        </div>

        ${revenueAccountSettings()}
        ${revenueReferenceMappingView()}
        ${revenuePreviewView()}
      </div>
    `;
  }

  function revenueSettingInput(label,field,type="text"){
    const value=state.revenue.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <input class="mw-input"
          type="${esc(type)}"
          value="${esc(value)}"
          data-mw-revenue-setting="${esc(field)}">
      </div>
    `;
  }


  function revenueSettingSelect(label,field,options){
    const value=state.revenue.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select"
          data-mw-revenue-setting="${esc(field)}">

          ${options.map(([id,name])=>`
            <option value="${esc(id)}"
              ${String(value)===String(id)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function revenueAccountSettings(){
    return `
      <div style="margin-top:20px">
        <h3>IFRS 15 Accounting</h3>

        <p class="mw-muted">
          Existing FinSage IFRS 15 roles are used as defaults. Override only where necessary.
        </p>

        <div class="mw-grid-3" style="margin-top:12px">
          ${revenueSettingCoa(
            "Contract Revenue",
            "revenue_account_code"
          )}

          ${revenueSettingCoa(
            "Contract Asset",
            "contract_asset_account_code"
          )}

          ${revenueSettingCoa(
            "Contract Liability",
            "contract_liability_account_code"
          )}

          ${revenueSettingCoa(
            "Accounts Receivable",
            "receivable_account_code"
          )}
        </div>
      </div>
    `;
  }
  function revenueSettingCoa(label,field){
    const accounts=window.COA_ACCOUNTS||
      window.ACCOUNTS||
      window.chartOfAccounts||
      [];

    const selected=state.revenue.settings?.[field]||"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select"
          data-mw-revenue-setting="${esc(field)}">

          <option value="">Select account</option>

          ${accounts.map(account=>{
            const code=account.code||account.account_code||"";
            const name=account.name||account.account_name||code;

            return `
              <option value="${esc(code)}"
                ${String(selected)===String(code)?"selected":""}>
                ${esc(name)}
              </option>
            `;
          }).join("")}
        </select>
      </div>
    `;
  }

  function revenueReferenceMappingView(){
    const refs=state.revenue.mapping?.references||{};

    return `
      <div style="margin-top:20px">
        <h3>Contract References</h3>

        ${revenueReferenceGroup(
          "customer",
          "Customers",
          refs.customer
        )}

        ${revenueReferenceGroup(
          "project",
          "Projects",
          refs.project
        )}
      </div>
    `;
  }
  function revenueReferenceGroup(type,label,group){
    if(!group?.rows?.length)return "";

    return `
      <div class="mw-card" style="margin-top:12px">
        <h3>${esc(label)}</h3>

        ${table(
          ["Source Reference","Records","FinSage Target"],
          group.rows.map(row=>[
            `<strong>${esc(row.source_value)}</strong>`,

            Number(row.sample_count||0).toLocaleString(),

            revenueReferenceSelect(
              type,
              row,
              group.targets||[]
            ),
          ]),
          `No ${label.toLowerCase()} detected.`
        )}
      </div>
    `;
  }
  function revenueReferenceSelect(type,row,targets){
    return `
      <select class="mw-select"
        data-mw-revenue-reference="${esc(type)}"
        data-mw-revenue-source="${esc(row.source_value)}">

        <option value="">Select target</option>

        ${targets.map(target=>`
          <option value="${target.id}"
            ${Number(row.target_id)===Number(target.id)?"selected":""}>
            ${esc(
              `${target.code?`${target.code} — `:""}${target.label||""}`
            )}
          </option>
        `).join("")}
      </select>
    `;
  }

  function revenuePreviewView(){
    const preview=state.revenue.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:22px">
        <h3>Revenue Contract Reconstruction</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Contracts</span>
            <strong>${preview.contract_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Contract Assets</span>
            <strong>${money(preview.total_contract_assets||0)}</strong>
          </div>

          <div class="mw-stat">
            <span>Contract Liabilities</span>
            <strong>${money(preview.total_contract_liabilities||0)}</strong>
          </div>
        </div>

        ${(preview.contracts||[]).map(
          revenuePreviewCard
        ).join("")}
      </div>
    `;
  }

  function money(value){
    return Number(value||0).toLocaleString(undefined,{
      minimumFractionDigits:2,
      maximumFractionDigits:2,
    });
  }

  function revenuePreviewCard(row){
    const payload=row.payload||{};
    const recon=row.reconciliation||{};
    const position=row.position||{};
    const history=row.history||{};

    return `
      <div class="mw-card" style="margin-top:12px">
        <div class="mw-inline" style="justify-content:space-between">
          <div>
            <strong>
              ${esc(
                payload.contract_number||
                row.contract_key||
                `Contract ${row.row_number}`
              )}
              ${payload.contract_title
                ?` — ${esc(payload.contract_title)}`
                :""
              }
            </strong>

            <div class="mw-muted mw-small">
              ${esc(payload.contract_currency||"")}
            </div>
          </div>

          <span class="mw-badge ${row.valid?"ok":"error"}">
            ${row.valid?"Ready":"Needs attention"}
          </span>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          <div>
            <span class="mw-muted mw-small">Transaction Price</span>
            <div>${money(recon.transaction_price)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">Revenue to Date</span>
            <div>${money(position.recognized_revenue_to_date)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">Billed to Date</span>
            <div>${money(position.billed_to_date)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">Cash Received</span>
            <div>${money(position.cash_received_to_date)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">Accounts Receivable</span>
            <div>${money(position.accounts_receivable_balance)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">
              ${position.position_type==="asset"
                ?"Contract Asset"
                :position.position_type==="liability"
                  ?"Contract Liability"
                  :"Contract Position"
              }
            </span>

            <div>${money(position.position_amount)}</div>
          </div>
        </div>

        ${revenueProgressSummary(row)}

        <div class="mw-inline" style="margin-top:14px">
          <span class="mw-badge info">
            ${row.obligations?.length||0} obligation(s)
          </span>

          <span class="mw-badge">
            ${history.progress_event_count||0} progress update(s)
          </span>

          <span class="mw-badge">
            ${history.billing_event_count||0} billing event(s)
          </span>

          <span class="mw-badge">
            ${history.cash_event_count||0} cash event(s)
          </span>

          ${history.variation_count
            ?`<span class="mw-badge warn">${history.variation_count} variation(s)</span>`
            :""
          }

          ${history.claim_count
            ?`<span class="mw-badge warn">${history.claim_count} claim(s)</span>`
            :""
          }
        </div>

        ${row.issues?.length?`
          <div class="mw-alert ${row.valid?"warn":"error"}" style="margin-top:12px">
            ${row.issues.map(
              issue=>`<div>${esc(issue)}</div>`
            ).join("")}
          </div>
        `:""}
      </div>
    `;
  }

  function revenueProgressSummary(row){
    if(!row.obligations?.length)return "";

    return `
      <div style="margin-top:16px">
        <h3>Performance Obligations</h3>

        ${(row.obligations||[]).map(obligation=>{
          const pct=Math.max(
            0,
            Math.min(100,Number(obligation.progress_percent||0))
          );

          return `
            <div class="mw-list-item" style="margin-top:8px">
              <div class="mw-inline" style="justify-content:space-between">
                <div>
                  <strong>
                    ${esc(
                      obligation.obligation_code||
                      obligation.obligation_name
                    )}
                  </strong>

                  ${obligation.obligation_name
                    ?`<div class="mw-muted mw-small">${esc(obligation.obligation_name)}</div>`
                    :""
                  }
                </div>

                <strong>${pct.toFixed(2)}%</strong>
              </div>

              <div class="mw-progress" style="margin-top:8px">
                <span style="width:${pct}%"></span>
              </div>

              <div class="mw-grid-3" style="margin-top:10px">
                <div>
                  <span class="mw-muted mw-small">Allocated Price</span>
                  <div>${money(obligation.allocated_transaction_price)}</div>
                </div>

                <div>
                  <span class="mw-muted mw-small">Revenue Required</span>
                  <div>${money(obligation.revenue_required_to_date)}</div>
                </div>

                <div>
                  <span class="mw-muted mw-small">Method</span>
                  <div>${esc(
                    obligation.progress_method||
                    obligation.recognition_timing||
                    "—"
                  )}</div>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  async function loadAccrualMapping(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.accruals={
        datasets:[],
        datasetId:null,
        settings:null,
        mapping:null,
        preview:null,
      };
      state.accrualsLoaded=false;
      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.accrualDeferrals(
          companyId(),projectId
        )
      );

      state.accruals.datasets=response?.datasets||[];

      if(!state.accruals.datasets.some(
        dataset=>Number(dataset.dataset_id)===Number(state.accruals.datasetId)
      )){
        state.accruals.datasetId=
          state.accruals.datasets[0]?.dataset_id||null;
      }

      if(state.accruals.datasetId){
        await loadAccrualDataset(
          state.accruals.datasetId,
          {renderAfter:false}
        );
      }

      state.accrualsLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadAccrualMapping failed",error);
    }

    if(renderAfter)render();
  }
  async function loadAccrualDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.accrualSettings(
          companyId(),state.project.id,id
        )
      ),
      apiFetch(
        ENDPOINTS.migrations.accrualMapping(
          companyId(),state.project.id,id
        )
      ),
    ]);

    state.accruals.datasetId=id;
    state.accruals.settings=settingsResponse?.settings||null;
    state.accruals.mapping=mappingResponse?.mapping||null;
    state.accruals.preview=null;

    if(renderAfter)render();
  }

  async function saveAccrualSettings(){
    if(!state.accruals.datasetId||!state.accruals.settings)return;

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.accrualSettings(
          companyId(),
          state.project.id,
          state.accruals.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(state.accruals.settings),
        }
      );

      state.accruals.settings=
        response?.settings||state.accruals.settings;

      await loadAccrualDataset(
        state.accruals.datasetId,
        {renderAfter:false}
      );

      notify("Accrual migration settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }

    render();
  }
  async function saveAccrualReferences(){
    const references=state.accruals.mapping?.references||{};
    const mappings=[];

    for(const [referenceType,group] of Object.entries(references)){
      for(const row of group.rows||[]){
        if(!row.target_id){
          if(!state.accruals.settings?.require_counterparty_mapping){
            continue;
          }

          notify(`Select a target for "${row.source_value}".`);
          return;
        }

        mappings.push({
          reference_type:referenceType,
          source_value:row.source_value,
          source_label:row.source_label||row.source_value,
          target_id:Number(row.target_id),
        });
      }
    }

    if(!mappings.length){
      notify("No accrual reference mappings require saving.");
      return;
    }

    state.accrualSaving=true;
    render();

    try{
      await apiFetch(
        ENDPOINTS.migrations.accrualReferences(
          companyId(),
          state.project.id,
          state.accruals.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings}),
        }
      );

      await loadAccrualDataset(
        state.accruals.datasetId,
        {renderAfter:false}
      );

      notify("Accrual reference mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.accrualSaving=false;
      render();
    }
  }
  async function previewAccrualMigration(){
    if(!state.accruals.datasetId)return;

    state.accrualPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.accrualPreview(
          companyId(),
          state.project.id,
          state.accruals.datasetId
        )
      );

      state.accruals.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.accrualPreviewLoading=false;
      render();
    }
  }

  function accrualMigrationView(){
    const datasets=state.accruals.datasets||[];
    const settings=state.accruals.settings;
    const mapping=state.accruals.mapping;

    if(!datasets.length)return "";

    if(!settings||!mapping){
      return `<div class="mw-empty">Loading accruals and prepayments mapping…</div>`;
    }

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Accruals, Prepayments & Deferrals",
          "Reconstruct prepaid expenses, deferred balances, accrued income and accrued expenses at migration cutover.",
          `
            <button class="mw-btn" data-mw-action="save-accrual-settings">
              Save settings
            </button>

            <button class="mw-btn" data-mw-action="save-accrual-references"
              ${state.accrualSaving?"disabled":""}>
              ${state.accrualSaving?"Saving…":"Save references"}
            </button>

            <button class="mw-btn primary" data-mw-action="preview-accruals"
              ${state.accrualPreviewLoading?"disabled":""}>
              ${state.accrualPreviewLoading?"Reconstructing…":"Reconstruct & preview"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Dataset</label>

            <select id="mwAccrualDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.accruals.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          ${accrualSettingSelect(
            "Source Mode",
            "source_mode",
            [
              ["original_terms","Reconstruct from Original Terms"],
              ["existing_schedule","Existing Recognition Schedule"],
              ["opening_position","Opening Position"],
            ]
          )}

          ${accrualSettingInput(
            "Migration Date",
            "migration_date",
            "date"
          )}
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${accrualSettingSelect(
            "Default Item Type",
            "default_item_type",
            [
              ["prepaid_expense","Prepaid Expense"],
              ["deferred_expense","Deferred Expense"],
              ["deferred_income","Deferred Income"],
              ["accrued_income","Accrued Income"],
              ["accrued_expense","Accrued Expense"],
            ]
          )}

          ${accrualSettingSelect(
            "Recognition Method",
            "default_recognition_method",
            [
              ["straight_line","Straight Line"],
              ["manual","Manual"],
              ["units","Units"],
              ["milestone","Milestone"],
            ]
          )}

          ${accrualSettingSelect(
            "Frequency",
            "default_frequency",
            [
              ["monthly","Monthly"],
              ["quarterly","Quarterly"],
              ["annually","Annually"],
              ["once","Once"],
              ["manual","Manual"],
            ]
          )}
        </div>

        ${accrualAccountSettings()}
        ${accrualReferenceMappingView()}
        ${accrualPreviewView()}
      </div>
    `;
  }


  function accrualSettingInput(label,field,type="text"){
    const value=state.accruals.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>
        <input class="mw-input"
          type="${esc(type)}"
          value="${esc(value)}"
          data-mw-accrual-setting="${esc(field)}">
      </div>
    `;
  }


  function accrualSettingSelect(label,field,options){
    const value=state.accruals.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select"
          data-mw-accrual-setting="${esc(field)}">
          ${options.map(([id,name])=>`
            <option value="${esc(id)}"
              ${String(value)===String(id)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function accrualAccountSettings(){
    return `
      <div style="margin-top:20px">
        <h3>Balance Sheet Controls</h3>

        <div class="mw-grid-3" style="margin-top:12px">
          ${accrualSettingCoa(
            "Prepaid Expense",
            "prepaid_expense_account"
          )}

          ${accrualSettingCoa(
            "Deferred Expense",
            "deferred_expense_account"
          )}

          ${accrualSettingCoa(
            "Deferred Income",
            "deferred_income_account"
          )}

          ${accrualSettingCoa(
            "Accrued Income",
            "accrued_income_account"
          )}

          ${accrualSettingCoa(
            "Accrued Expense",
            "accrued_expense_account"
          )}
        </div>

        <h3 style="margin-top:18px">Default Posting Accounts</h3>

        <div class="mw-grid-3" style="margin-top:12px">
          ${accrualSettingCoa(
            "Recognition Expense / Income",
            "default_recognition_account"
          )}

          ${accrualSettingCoa(
            "Settlement / Contra",
            "default_settlement_account"
          )}

          ${accrualSettingCoa(
            "VAT / Tax",
            "default_tax_account"
          )}
        </div>
      </div>
    `;
  }
  function accrualSettingCoa(label,field){
    const accounts=window.COA_ACCOUNTS||
      window.ACCOUNTS||
      window.chartOfAccounts||
      [];

    const selected=state.accruals.settings?.[field]||"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select"
          data-mw-accrual-setting="${esc(field)}">

          <option value="">Select account</option>

          ${accounts.map(account=>{
            const code=account.code||account.account_code||"";
            const name=account.name||account.account_name||code;

            return `
              <option value="${esc(code)}"
                ${String(selected)===String(code)?"selected":""}>
                ${esc(name)}
              </option>
            `;
          }).join("")}
        </select>
      </div>
    `;
  }

  function accrualReferenceMappingView(){
    const refs=state.accruals.mapping?.references||{};

    return `
      <div style="margin-top:20px">
        <h3>Counterparty Mapping</h3>

        ${accrualReferenceGroup(
          "customer",
          "Customers",
          refs.customer
        )}

        ${accrualReferenceGroup(
          "vendor",
          "Vendors / Suppliers",
          refs.vendor
        )}

        ${accrualReferenceGroup(
          "employee",
          "Employees",
          refs.employee
        )}
      </div>
    `;
  }
  function accrualReferenceGroup(type,label,group){
    if(!group?.rows?.length)return "";

    return `
      <div class="mw-card" style="margin-top:12px">
        <h3>${esc(label)}</h3>

        ${table(
          ["Source Reference","Records","FinSage Target"],
          group.rows.map(row=>[
            `<strong>${esc(row.source_value)}</strong>`,
            Number(row.sample_count||0).toLocaleString(),
            accrualReferenceSelect(
              type,row,group.targets||[]
            ),
          ]),
          `No ${label.toLowerCase()} detected.`
        )}
      </div>
    `;
  }

  function accrualReferenceSelect(type,row,targets){
    return `
      <select class="mw-select"
        data-mw-accrual-reference="${esc(type)}"
        data-mw-accrual-source="${esc(row.source_value)}">

        <option value="">Select target</option>

        ${targets.map(target=>`
          <option value="${target.id}"
            ${Number(row.target_id)===Number(target.id)?"selected":""}>
            ${esc(
              `${target.code?`${target.code} — `:""}${target.label||""}`
            )}
          </option>
        `).join("")}
      </select>
    `;
  }

  function accrualPreviewView(){
    const preview=state.accruals.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:22px">
        <h3>Cutover Reconstruction</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Items</span>
            <strong>${preview.item_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Recognised</span>
            <strong>${money(preview.total_recognized_to_date||0)}</strong>
          </div>

          <div class="mw-stat">
            <span>Remaining</span>
            <strong>${money(preview.total_remaining_balance||0)}</strong>
          </div>
        </div>

        ${(preview.items||[]).map(
          accrualPreviewCard
        ).join("")}
      </div>
    `;
  }
  function accrualPreviewCard(row){
    const payload=row.payload||{};
    const cutover=row.cutover||{};
    const recon=row.reconciliation||{};
    const next=row.next_recognition||{};

    return `
      <div class="mw-card" style="margin-top:12px">
        <div class="mw-inline" style="justify-content:space-between">
          <div>
            <strong>
              ${esc(
                payload.item_title||
                payload.item_number||
                row.item_key||
                `Item ${row.row_number}`
              )}
            </strong>

            <div class="mw-muted mw-small">
              ${esc(
                String(payload.item_type||"")
                  .replaceAll("_"," ")
              )}
            </div>
          </div>

          <span class="mw-badge ${row.valid?"ok":"error"}">
            ${row.valid?"Ready":"Needs attention"}
          </span>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          <div>
            <span class="mw-muted mw-small">Original Amount</span>
            <div>${money(payload.original_amount)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">Recognised to Date</span>
            <div>${money(cutover.recognized_to_date)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">Remaining Balance</span>
            <div>${money(cutover.remaining_balance)}</div>
          </div>
        </div>

        ${recon.remaining_difference!=null?`
          <div class="mw-grid-3" style="margin-top:12px">
            <div>
              <span class="mw-muted mw-small">Calculated Remaining</span>
              <div>${money(recon.calculated_remaining_balance)}</div>
            </div>

            <div>
              <span class="mw-muted mw-small">Imported Remaining</span>
              <div>${money(recon.imported_remaining_balance)}</div>
            </div>

            <div>
              <span class="mw-muted mw-small">Difference</span>
              <div>${money(recon.remaining_difference)}</div>
            </div>
          </div>
        `:""}

        ${next?.date||next?.recognition_date?`
          <div class="mw-alert" style="margin-top:14px">
            <strong>
              Next recognition:
              ${esc(next.date||next.recognition_date)}
            </strong>

            <div class="mw-grid-3" style="margin-top:8px">
              <div>
                <span class="mw-muted mw-small">Amount</span>
                <div>${money(next.amount??next.recognition_amount)}</div>
              </div>

              <div>
                <span class="mw-muted mw-small">Opening</span>
                <div>${money(next.opening_balance)}</div>
              </div>

              <div>
                <span class="mw-muted mw-small">Closing</span>
                <div>${money(next.closing_balance)}</div>
              </div>
            </div>
          </div>
        `:""}

        ${row.issues?.length?`
          <div class="mw-alert ${row.valid?"warn":"error"}" style="margin-top:12px">
            ${row.issues.map(
              issue=>`<div>${esc(issue)}</div>`
            ).join("")}
          </div>
        `:""}
      </div>
    `;
  }

  async function loadPayrollMapping(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.payroll={
        datasets:[],
        datasetId:null,
        settings:null,
        mapping:null,
        preview:null,
      };
      state.payrollLoaded=false;
      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payroll(
          companyId(),
          projectId
        )
      );

      state.payroll.datasets=response?.datasets||[];

      if(!state.payroll.datasets.some(
        item=>Number(item.dataset_id)===Number(state.payroll.datasetId)
      )){
        state.payroll.datasetId=
          state.payroll.datasets[0]?.dataset_id||null;
      }

      if(state.payroll.datasetId){
        await loadPayrollDataset(
          state.payroll.datasetId,
          {renderAfter:false}
        );
      }

      state.payrollLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error(
        "[DataMigration] loadPayrollMapping failed",
        error
      );
    }

    if(renderAfter)render();
  }
  async function loadPayrollDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.payrollSettings(
          companyId(),
          state.project.id,
          id
        )
      ),

      apiFetch(
        ENDPOINTS.migrations.payrollMapping(
          companyId(),
          state.project.id,
          id
        )
      ),
    ]);

    state.payroll.datasetId=id;
    state.payroll.settings=settingsResponse?.settings||null;
    state.payroll.mapping=mappingResponse?.mapping||null;
    state.payroll.preview=null;

    if(renderAfter)render();
  }

  async function savePayrollSettings(){
    if(!state.payroll.datasetId||!state.payroll.settings)return;

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollSettings(
          companyId(),
          state.project.id,
          state.payroll.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(state.payroll.settings),
        }
      );

      state.payroll.settings=
        response?.settings||state.payroll.settings;

      await loadPayrollDataset(
        state.payroll.datasetId,
        {renderAfter:false}
      );

      notify("Payroll migration settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }

    render();
  }
  async function savePayrollReferences(){
    const references=state.payroll.mapping?.references||{};
    const mappings=[];

    for(const [referenceType,group] of Object.entries(references)){
      for(const row of group.rows||[]){
        if(!row.target_id)continue;

        mappings.push({
          reference_type:referenceType,
          source_value:row.source_value,
          source_label:row.source_label||row.source_value,
          target_id:Number(row.target_id),
        });
      }
    }

    if(!mappings.length){
      notify("No payroll reference mappings require saving.");
      return;
    }

    state.payrollSaving=true;
    render();

    try{
      await apiFetch(
        ENDPOINTS.migrations.payrollReferences(
          companyId(),
          state.project.id,
          state.payroll.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings}),
        }
      );

      await loadPayrollDataset(
        state.payroll.datasetId,
        {renderAfter:false}
      );

      notify("Payroll reference mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.payrollSaving=false;
      render();
    }
  }
  async function previewPayrollMigration(){
    if(!state.payroll.datasetId)return;

    state.payrollPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollPreview(
          companyId(),
          state.project.id,
          state.payroll.datasetId
        )
      );

      state.payroll.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.payrollPreviewLoading=false;
      render();
    }
  }

  function moduleMappingView(){
    const hasPpe=Boolean(state.ppe.datasets?.length);
    const hasLeases=Boolean(state.leases.datasets?.length);
    const hasLoans=Boolean(state.loans.datasets?.length);
    const hasRevenue=Boolean(state.revenue.datasets?.length);
    const hasAccruals=Boolean(state.accruals.datasets?.length);
    const hasPayroll=Boolean(state.payroll.datasets?.length);
    const hasProducts=Boolean(state.products.datasets?.length);
    const hasInventory=Boolean(
      state.scope.entities?.some(entity=>
        entity.is_selected&&[
          "products",
          "warehouses",
          "inventory_opening",
          "inventory_movements"
        ].includes(entity.code)
      )
    );
    const hasInventoryOpening=Boolean(
      state.inventoryOpening.datasets?.length
    );
    const hasInventoryMovements=Boolean(state.inventoryMovements.datasets?.length);
    const hasPos=Boolean(state.posMigration.datasets?.length);
    const hasPosMenu=Boolean(state.posMenuMigration.datasets?.length);
    const hasPosHistory=Boolean(state.posHistoryMigration.datasets?.length);

    return `
      <div>
        <div class="mw-inline" style="margin-bottom:14px">
          ${hasPpe?`<span class="mw-badge info">PPE</span>`:""}
          ${hasLeases?`<span class="mw-badge info">Leases</span>`:""}
          ${hasLoans?`<span class="mw-badge info">Loans</span>`:""}
          ${hasRevenue?`<span class="mw-badge info">Revenue</span>`:""}
          ${hasAccruals?`<span class="mw-badge info">Accruals</span>`:""}
          ${hasPayroll?`<span class="mw-badge info">Payroll</span>`:""}
          ${hasProducts?`<span class="mw-badge info">Products & Services</span>`:""}
          ${hasInventory?`<span class="mw-badge info">Inventory</span>`:""}
          ${hasInventoryOpening?`<span class="mw-badge info">Opening Inventory</span>`:""}
          ${hasInventoryMovements?`<span class="mw-badge info">Inventory History</span>`:""}
          ${hasPos?`<span class="mw-badge info">POS</span>`:""}
          ${hasPosMenu?`<span class="mw-badge info">POS Menu</span>`:""}
          ${hasPosHistory?`<span class="mw-badge info">POS History</span>`:""}
        </div>

        ${hasPpe?ppeMappingView():""}
        ${hasLeases?leaseMigrationView():""}
        ${hasLoans?loanMigrationView():""}
        ${hasRevenue?revenueMigrationView():""}
        ${hasAccruals?accrualMigrationView():""}
        ${hasPayroll?payrollMigrationView():""}
        ${hasProducts?productMigrationView():""}
        ${hasInventory?inventoryMigrationView():""}
        ${hasInventoryOpening?inventoryOpeningMigrationView():""}
        ${hasInventoryMovements?inventoryMovementMigrationView():""}
        ${hasPos?posMigrationView():""}
        ${hasPosMenu?posMenuMigrationView():""}
        ${hasPosMenu?posMenuMigrationView():""}
        ${hasPosHistory?posHistoryMigrationView():""}

        ${!hasPpe&&!hasLeases&&!hasLoans&&!hasRevenue&&!hasAccruals&&!hasPayroll
          &&!hasProducts&&!hasInventory&&!hasInventoryOpening&&!hasInventoryMovements&&!hasPos
          &&!hasPosMenu&&!hasPosHistory
          ?`<div class="mw-empty">No module-specific mappings are required yet.</div>`
          :""
        }
      </div>
    `;
  }

  function payrollMigrationView(){
    const datasets=state.payroll.datasets||[];
    const settings=state.payroll.settings;
    const mapping=state.payroll.mapping;

    if(!datasets.length)return "";

    if(!settings||!mapping){
      return `
        <div class="mw-empty">
          Loading payroll migration mapping…
        </div>
      `;
    }

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Payroll",
          "Map employees, contracts, tax profiles, bank details and current payroll setup.",
          `
            <button class="mw-btn" data-mw-action="save-payroll-settings">
              Save settings
            </button>

            <button class="mw-btn" data-mw-action="save-payroll-references"
              ${state.payrollSaving?"disabled":""}>
              ${state.payrollSaving?"Saving…":"Save references"}
            </button>

            <button class="mw-btn primary" data-mw-action="preview-payroll"
              ${state.payrollPreviewLoading?"disabled":""}>
              ${state.payrollPreviewLoading?"Validating…":"Validate & preview"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Dataset</label>

            <select id="mwPayrollDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.payroll.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          ${payrollSettingInput(
            "Migration Date",
            "migration_date",
            "date"
          )}

          ${payrollSettingSelect(
            "Payroll Frequency",
            "default_pay_frequency",
            [
              ["weekly","Weekly"],
              ["fortnightly","Fortnightly"],
              ["monthly","Monthly"],
            ]
          )}
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${payrollSettingSelect(
            "Default Pay Basis",
            "default_pay_basis",
            [
              ["monthly","Monthly"],
              ["hourly","Hourly"],
              ["daily","Daily"],
              ["quantity","Quantity"],
              ["commission_only","Commission Only"],
            ]
          )}

          ${payrollSettingSelect(
            "Tax Residency",
            "default_residency_status",
            [
              ["resident","Resident"],
              ["non_resident","Non-resident"],
            ]
          )}

          ${payrollSettingSelect(
            "Tax Method",
            "default_tax_calculation_method",
            [
              ["standard","Standard"],
              ["directive","Directive"],
              ["manual","Manual"],
              ["exempt","Exempt"],
            ]
          )}
        </div>

        ${payrollTaxSettingsView()}
        ${payrollReferenceMappingView()}
        ${payrollPreviewView()}
        ${payrollItemsMigrationView()}
        ${payrollLeaveMigrationView()}
        ${payrollEmployeeLoansMigrationView()}
        ${payrollHistoryMigrationView()}
        ${payrollReconciliationView()}
      </div>
    `;
  }

  function payrollSettingInput(label,field,type="text"){
    const value=state.payroll.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <input class="mw-input"
          type="${esc(type)}"
          value="${esc(value)}"
          data-mw-payroll-setting="${esc(field)}">
      </div>
    `;
  }

  function payrollSettingSelect(label,field,options){
    const value=state.payroll.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select"
          data-mw-payroll-setting="${esc(field)}">

          ${options.map(([id,name])=>`
            <option value="${esc(id)}"
              ${String(value)===String(id)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function payrollTaxSettingsView(){
    const mapping=state.payroll.mapping||{};
    const tax=mapping.tax_options||{};
    const settings=state.payroll.settings||{};

    return `
      <div style="margin-top:20px">
        <h3>Tax Configuration</h3>

        <div class="mw-grid-3" style="margin-top:12px">
          <div class="mw-field">
            <label>Default Tax Authority</label>

            <select class="mw-select"
              data-mw-payroll-setting="default_tax_authority_id">

              <option value="">Select authority</option>

              ${(tax.authorities||[]).map(item=>`
                <option value="${item.id}"
                  ${Number(settings.default_tax_authority_id)===Number(item.id)?"selected":""}>
                  ${esc(item.name)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="mw-field">
            <label>Default Payroll Tax Regime</label>

            <select class="mw-select"
              data-mw-payroll-setting="default_tax_regime_id">

              <option value="">Select regime</option>

              ${(tax.regimes||[]).map(item=>`
                <option value="${item.id}"
                  ${Number(settings.default_tax_regime_id)===Number(item.id)?"selected":""}>
                  ${esc(`${item.name} — ${item.country_code}`)}
                </option>
              `).join("")}
            </select>
          </div>

          ${payrollSettingSelect(
            "Proration Method",
            "default_proration_method",
            [
              ["working_days","Working Days"],
              ["calendar_days","Calendar Days"],
              ["fixed_30_days","Fixed 30 Days"],
              ["scheduled_hours","Scheduled Hours"],
              ["actual_hours","Actual Hours"],
              ["no_proration","No Proration"],
            ]
          )}
        </div>
      </div>
    `;
  }

  function payrollReferenceMappingView(){
    const refs=state.payroll.mapping?.references||{};

    return `
      <div style="margin-top:20px">
        <h3>Reference Mapping</h3>

        ${payrollReferenceGroup(
          "department",
          "Departments",
          refs.department
        )}

        ${payrollReferenceGroup(
          "position",
          "Positions",
          refs.position
        )}

        ${payrollReferenceGroup(
          "tax_authority",
          "Tax Authorities",
          refs.tax_authority
        )}

        ${payrollReferenceGroup(
          "tax_regime",
          "Payroll Tax Regimes",
          refs.tax_regime
        )}
      </div>
    `;
  }
  function payrollReferenceGroup(type,label,group){
    if(!group?.rows?.length)return "";

    return `
      <div class="mw-card" style="margin-top:12px">
        <h3>${esc(label)}</h3>

        ${table(
          ["Source Value","Records","FinSage Target"],
          group.rows.map(row=>[
            `<strong>${esc(row.source_value)}</strong>`,
            Number(row.sample_count||0).toLocaleString(),
            payrollReferenceSelect(
              type,
              row,
              group.targets||[]
            ),
          ]),
          `No ${label.toLowerCase()} detected.`
        )}
      </div>
    `;
  }
  function payrollReferenceSelect(type,row,targets){
    return `
      <select class="mw-select"
        data-mw-payroll-reference="${esc(type)}"
        data-mw-payroll-source="${esc(row.source_value)}">

        <option value="">Select target</option>

        ${targets.map(target=>`
          <option value="${target.id}"
            ${Number(row.target_id)===Number(target.id)?"selected":""}>
            ${esc(
              `${target.code?`${target.code} — `:""}${target.label||""}`
            )}
          </option>
        `).join("")}
      </select>
    `;
  }

  function payrollPreviewView(){
    const preview=state.payroll.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:22px">
        <h3>Payroll Migration Preview</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Employees</span>
            <strong>${preview.employee_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Tax Profiles</span>
            <strong>${preview.tax_profile_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Bank Accounts</span>
            <strong>${preview.bank_account_count||0}</strong>
          </div>
        </div>

        ${table(
          [
            "Employee",
            "Department",
            "Pay Basis",
            "Basic Salary",
            "Tax",
            "Status",
          ],

          (preview.employees||[]).map(row=>{
            const employee=row.employee||{};
            const contract=row.contract||{};
            const setup=row.pay_setup||{};
            const tax=row.tax_profile||{};

            return [
              `<strong>${esc(
                `${employee.first_name||""} ${employee.last_name||""}`.trim()
              )}</strong>
              <div class="mw-muted mw-small">
                ${esc(employee.employee_no||"Number will be generated")}
              </div>`,

              employee.department_id
                ?`Mapped #${esc(employee.department_id)}`
                :"—",

              esc(setup.pay_basis||"—"),

              money(contract.basic_salary||0),

              tax.tax_authority_id
                ?`<span class="mw-badge ok">Configured</span>`
                :`<span class="mw-badge warn">Missing</span>`,

              row.valid
                ?`<span class="mw-badge ok">Ready</span>`
                :`<span class="mw-badge error">${row.issues?.length||1} issue(s)</span>`,
            ];
          }),

          "No payroll employees found."
        )}
      </div>
    `;
  }

  async function loadPayrollItems(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.payrollItems={
        datasets:[],
        datasetId:null,
        settings:null,
        mapping:null,
        preview:null,
      };
      state.payrollItemsLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollItems(
          companyId(),
          projectId
        )
      );

      state.payrollItems.datasets=response?.datasets||[];

      if(!state.payrollItems.datasets.some(
        item=>Number(item.dataset_id)===Number(state.payrollItems.datasetId)
      )){
        state.payrollItems.datasetId=
          state.payrollItems.datasets[0]?.dataset_id||null;
      }

      if(state.payrollItems.datasetId){
        await loadPayrollItemDataset(
          state.payrollItems.datasetId,
          {renderAfter:false}
        );
      }

      state.payrollItemsLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error(
        "[DataMigration] loadPayrollItems failed",
        error
      );
    }

    if(renderAfter)render();
  }
  async function loadPayrollItemDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.payrollItemSettings(
          companyId(),
          state.project.id,
          id
        )
      ),

      apiFetch(
        ENDPOINTS.migrations.payrollItemMapping(
          companyId(),
          state.project.id,
          id
        )
      ),
    ]);

    state.payrollItems.datasetId=id;
    state.payrollItems.settings=settingsResponse?.settings||null;
    state.payrollItems.mapping=mappingResponse?.mapping||null;
    state.payrollItems.preview=null;

    if(renderAfter)render();
  }

  async function savePayrollItemSettings(){
    if(!state.payrollItems.datasetId||!state.payrollItems.settings)return;

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollItemSettings(
          companyId(),
          state.project.id,
          state.payrollItems.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(
            state.payrollItems.settings
          ),
        }
      );

      state.payrollItems.settings=
        response?.settings||state.payrollItems.settings;

      notify("Payroll item settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }

    render();
  }

  async function savePayrollItemMapping(){
    const rows=
      state.payrollItems.mapping?.detection?.items||[];

    const mappings=[];

    for(const row of rows){
      if(!row.item_type){
        notify(
          `Select an item type for "${row.source_name}".`
        );
        return;
      }

      if(!row.target_id){
        notify(
          `Select a FinSage item for "${row.source_name}".`
        );
        return;
      }

      mappings.push({
        item_type:row.item_type,
        source_code:row.source_code||null,
        source_name:row.source_name,

        target_id:Number(row.target_id),

        default_calculation_method:
          row.default_calculation_method||"fixed_amount",

        default_amount:
          row.default_amount??null,

        default_percentage:
          row.default_percentage??null,

        default_quantity:
          row.default_quantity??null,

        default_rate:
          row.default_rate??null,

        taxable:
          row.taxable??null,

        pensionable:
          row.pensionable??null,
      });
    }

    if(!mappings.length){
      notify("No payroll items detected.");
      return;
    }

    state.payrollItemsSaving=true;
    render();

    try{
      await apiFetch(
        ENDPOINTS.migrations.payrollItemMapping(
          companyId(),
          state.project.id,
          state.payrollItems.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings}),
        }
      );

      await loadPayrollItemDataset(
        state.payrollItems.datasetId,
        {renderAfter:false}
      );

      notify("Payroll item mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.payrollItemsSaving=false;
      render();
    }
  }

  async function previewPayrollItems(){
    if(!state.payrollItems.datasetId)return;

    state.payrollItemsPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollItemPreview(
          companyId(),
          state.project.id,
          state.payrollItems.datasetId
        )
      );

      state.payrollItems.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.payrollItemsPreviewLoading=false;
      render();
    }
  }

  
  function payrollItemsMigrationView(){
    const datasets=state.payrollItems.datasets||[];

    if(!datasets.length)return "";

    const settings=state.payrollItems.settings;
    const mapping=state.payrollItems.mapping;

    if(!settings||!mapping){
      return `
        <div class="mw-empty">
          Loading payroll items…
        </div>
      `;
    }

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Earnings, Deductions, Benefits & Contributions",
          "Map legacy payroll items to the FinSage payroll catalogue before importing employee pay setup.",
          `
            <button class="mw-btn"
              data-mw-action="save-payroll-item-settings">
              Save settings
            </button>

            <button class="mw-btn"
              data-mw-action="save-payroll-item-mapping"
              ${state.payrollItemsSaving?"disabled":""}>
              ${state.payrollItemsSaving?"Saving…":"Save mappings"}
            </button>

            <button class="mw-btn primary"
              data-mw-action="preview-payroll-items"
              ${state.payrollItemsPreviewLoading?"disabled":""}>
              ${state.payrollItemsPreviewLoading?"Validating…":"Validate items"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Dataset</label>

            <select id="mwPayrollItemDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.payrollItems.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="mw-field">
            <label>Source Layout</label>

            <select class="mw-select"
              data-mw-payroll-item-setting="source_layout">

              <option value="item_rows"
                ${settings.source_layout==="item_rows"?"selected":""}>
                One Payroll Item Per Row
              </option>

              <option value="employee_rows"
                ${settings.source_layout==="employee_rows"?"selected":""}>
                One Employee Per Row
              </option>
            </select>
          </div>

          <div class="mw-field">
            <label>Default Effective From</label>

            <input type="date"
              class="mw-input"
              value="${esc(settings.default_effective_from||"")}"
              data-mw-payroll-item-setting="default_effective_from">
          </div>
        </div>

        ${payrollItemMappingTable()}
        ${payrollItemsPreviewView()}
      </div>
    `;
  }

  function payrollItemMappingTable(){
    const mapping=state.payrollItems.mapping||{};
    const rows=mapping.detection?.items||[];
    const targets=mapping.targets||{};

    return `
      <div style="margin-top:18px">
        <h3>Payroll Item Mapping</h3>

        ${table(
          [
            "Source Item",
            "Records",
            "Type",
            "FinSage Item",
            "Confidence",
          ],

          rows.map((row,index)=>[
            `
              <strong>${esc(row.source_name||row.source_code)}</strong>
              <div class="mw-muted mw-small">
                ${esc(row.source_code||"No source code")}
              </div>
            `,

            Number(row.sample_count||0).toLocaleString(),

            `
              <select class="mw-select"
                data-mw-payroll-map-type="${index}">
                <option value="">Select type</option>

                ${[
                  ["earning","Earning"],
                  ["deduction","Deduction"],
                  ["benefit","Benefit"],
                  ["contribution","Employer Contribution"],
                ].map(([value,label])=>`
                  <option value="${value}"
                    ${row.item_type===value?"selected":""}>
                    ${label}
                  </option>
                `).join("")}
              </select>
            `,

            payrollItemTargetSelect(
              row,
              index,
              targets[row.item_type]||[]
            ),

            row.target_id
              ?`<span class="mw-badge ${row.is_approved?"ok":"info"}">
                  ${Number(row.confidence||0).toFixed(0)}%
                </span>`
              :`<span class="mw-badge warn">Unmapped</span>`,
          ]),

          "No payroll items detected."
        )}
      </div>
    `;
  }
  function payrollItemTargetSelect(row,index,targets){
    if(!row.item_type){
      return `
        <select class="mw-select" disabled>
          <option>Select item type first</option>
        </select>
      `;
    }

    return `
      <select class="mw-select"
        data-mw-payroll-map-target="${index}">

        <option value="">Select FinSage item</option>

        ${targets.map(target=>`
          <option value="${target.id}"
            ${Number(row.target_id)===Number(target.id)?"selected":""}>
            ${esc(`${target.code||""} — ${target.name||""}`)}
          </option>
        `).join("")}
      </select>
    `;
  }

  function payrollItemsPreviewView(){
    const preview=state.payrollItems.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:20px">
        <h3>Payroll Items Preview</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Items</span>
            <strong>${preview.item_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Earnings</span>
            <strong>${money(preview.totals?.earning||0)}</strong>
          </div>

          <div class="mw-stat">
            <span>Deductions</span>
            <strong>${money(preview.totals?.deduction||0)}</strong>
          </div>
        </div>

        ${table(
          [
            "Employee",
            "Source Item",
            "FinSage Item",
            "Method",
            "Amount",
            "Status",
          ],

          (preview.items||[]).map(row=>{
            const employee=row.employee||{};
            const item=row.item||{};

            return [
              esc(employee.employee_no||"—"),

              esc(
                item.source_name
                ||item.source_code
                ||"—"
              ),

              item.target_code
                ?`${esc(item.target_code)} — ${esc(item.target_name||"")}`
                :"—",

              esc(
                String(item.calculation_method||"")
                  .replaceAll("_"," ")
              ),

              money(item.amount||0),

              row.valid
                ?`<span class="mw-badge ok">Ready</span>`
                :`<span class="mw-badge error">${row.issues?.length||1} issue(s)</span>`,
            ];
          }),

          "No payroll items available."
        )}
      </div>
    `;
  }

  async function loadPayrollLeave(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.payrollLeave={
        datasets:[],
        datasetId:null,
        settings:null,
        mapping:null,
        preview:null,
      };
      state.payrollLeaveLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollLeaveBalances(
          companyId(),
          projectId
        )
      );

      state.payrollLeave.datasets=response?.datasets||[];

      if(!state.payrollLeave.datasets.some(
        item=>Number(item.dataset_id)===Number(state.payrollLeave.datasetId)
      )){
        state.payrollLeave.datasetId=
          state.payrollLeave.datasets[0]?.dataset_id||null;
      }

      if(state.payrollLeave.datasetId){
        await loadPayrollLeaveDataset(
          state.payrollLeave.datasetId,
          {renderAfter:false}
        );
      }

      state.payrollLeaveLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadPayrollLeave failed",error);
    }

    if(renderAfter)render();
  }
  async function loadPayrollLeaveDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.payrollLeaveSettings(
          companyId(),state.project.id,id
        )
      ),

      apiFetch(
        ENDPOINTS.migrations.payrollLeaveMapping(
          companyId(),state.project.id,id
        )
      ),
    ]);

    state.payrollLeave.datasetId=id;
    state.payrollLeave.settings=settingsResponse?.settings||null;
    state.payrollLeave.mapping=mappingResponse?.mapping||null;
    state.payrollLeave.preview=null;

    if(renderAfter)render();
  }

  async function loadPayrollEmployeeLoans(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.payrollEmployeeLoans={
        datasets:[],
        datasetId:null,
        settings:null,
        mapping:null,
        preview:null,
      };
      state.payrollEmployeeLoansLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollEmployeeLoans(
          companyId(),
          projectId
        )
      );

      state.payrollEmployeeLoans.datasets=response?.datasets||[];

      if(!state.payrollEmployeeLoans.datasets.some(
        item=>Number(item.dataset_id)===Number(state.payrollEmployeeLoans.datasetId)
      )){
        state.payrollEmployeeLoans.datasetId=
          state.payrollEmployeeLoans.datasets[0]?.dataset_id||null;
      }

      if(state.payrollEmployeeLoans.datasetId){
        await loadPayrollEmployeeLoanDataset(
          state.payrollEmployeeLoans.datasetId,
          {renderAfter:false}
        );
      }

      state.payrollEmployeeLoansLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error(
        "[DataMigration] loadPayrollEmployeeLoans failed",
        error
      );
    }

    if(renderAfter)render();
  }
  async function loadPayrollEmployeeLoanDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.payrollEmployeeLoanSettings(
          companyId(),state.project.id,id
        )
      ),

      apiFetch(
        ENDPOINTS.migrations.payrollEmployeeLoanMapping(
          companyId(),state.project.id,id
        )
      ),
    ]);

    state.payrollEmployeeLoans.datasetId=id;
    state.payrollEmployeeLoans.settings=settingsResponse?.settings||null;
    state.payrollEmployeeLoans.mapping=mappingResponse?.mapping||null;
    state.payrollEmployeeLoans.preview=null;

    if(renderAfter)render();
  }

  async function savePayrollLeaveSettings(){
    if(!state.payrollLeave.datasetId||!state.payrollLeave.settings)return;

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollLeaveSettings(
          companyId(),
          state.project.id,
          state.payrollLeave.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(
            state.payrollLeave.settings
          ),
        }
      );

      state.payrollLeave.settings=
        response?.settings||state.payrollLeave.settings;

      notify("Payroll leave settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }

    render();
  }

  async function savePayrollLeaveMapping(){
    const rows=
      state.payrollLeave.mapping?.leave_types?.items||[];

    const mappings=[];

    for(const row of rows){
      if(!row.target_leave_type_id){
        notify(
          `Select a leave type for "${row.source_name}".`
        );
        return;
      }

      mappings.push({
        source_code:row.source_code||null,
        source_name:row.source_name,
        target_leave_type_id:Number(
          row.target_leave_type_id
        ),
      });
    }

    if(!mappings.length){
      notify("No leave types detected.");
      return;
    }

    state.payrollLeaveSaving=true;
    render();

    try{
      await apiFetch(
        ENDPOINTS.migrations.payrollLeaveMapping(
          companyId(),
          state.project.id,
          state.payrollLeave.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings}),
        }
      );

      await loadPayrollLeaveDataset(
        state.payrollLeave.datasetId,
        {renderAfter:false}
      );

      notify("Leave type mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.payrollLeaveSaving=false;
      render();
    }
  }

  async function previewPayrollLeave(){
    if(!state.payrollLeave.datasetId)return;

    state.payrollLeavePreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollLeavePreview(
          companyId(),
          state.project.id,
          state.payrollLeave.datasetId
        )
      );

      state.payrollLeave.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.payrollLeavePreviewLoading=false;
      render();
    }
  }

  async function savePayrollEmployeeLoanSettings(){
    if(
      !state.payrollEmployeeLoans.datasetId||
      !state.payrollEmployeeLoans.settings
    )return;

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollEmployeeLoanSettings(
          companyId(),
          state.project.id,
          state.payrollEmployeeLoans.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(
            state.payrollEmployeeLoans.settings
          ),
        }
      );

      state.payrollEmployeeLoans.settings=
        response?.settings||state.payrollEmployeeLoans.settings;

      notify("Employee loan migration settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);
    }

    render();
  }
  async function previewPayrollEmployeeLoans(){
    if(!state.payrollEmployeeLoans.datasetId)return;

    state.payrollEmployeeLoansPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollEmployeeLoanPreview(
          companyId(),
          state.project.id,
          state.payrollEmployeeLoans.datasetId
        )
      );

      state.payrollEmployeeLoans.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.payrollEmployeeLoansPreviewLoading=false;
      render();
    }
  }

  function payrollLeaveMigrationView(){
    const datasets=state.payrollLeave.datasets||[];

    if(!datasets.length)return "";

    const settings=state.payrollLeave.settings;
    const mapping=state.payrollLeave.mapping;

    if(!settings||!mapping){
      return `
        <div class="mw-empty">
          Loading leave opening balances…
        </div>
      `;
    }

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Leave Opening Balances",
          "Map legacy leave types and reconstruct employee leave balances at migration cutover.",
          `
            <button class="mw-btn"
              data-mw-action="save-payroll-leave-settings">
              Save settings
            </button>

            <button class="mw-btn"
              data-mw-action="save-payroll-leave-mapping"
              ${state.payrollLeaveSaving?"disabled":""}>
              ${state.payrollLeaveSaving?"Saving…":"Save leave mapping"}
            </button>

            <button class="mw-btn primary"
              data-mw-action="preview-payroll-leave"
              ${state.payrollLeavePreviewLoading?"disabled":""}>
              ${state.payrollLeavePreviewLoading?"Validating…":"Validate balances"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Dataset</label>

            <select id="mwPayrollLeaveDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.payrollLeave.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="mw-field">
            <label>Opening Balance Source</label>

            <select class="mw-select"
              data-mw-payroll-leave-setting="default_opening_source">

              <option value="legacy_balance"
                ${settings.default_opening_source==="legacy_balance"?"selected":""}>
                Legacy Closing Balance
              </option>

              <option value="entitlement_less_taken"
                ${settings.default_opening_source==="entitlement_less_taken"?"selected":""}>
                Entitlement Less Leave Taken
              </option>

              <option value="movement_history"
                ${settings.default_opening_source==="movement_history"?"selected":""}>
                Movement History
              </option>
            </select>
          </div>

          <div class="mw-field">
            <label>Balance Unit</label>

            <select class="mw-select"
              data-mw-payroll-leave-setting="default_balance_unit">

              <option value="days"
                ${settings.default_balance_unit==="days"?"selected":""}>
                Days
              </option>

              <option value="hours"
                ${settings.default_balance_unit==="hours"?"selected":""}>
                Hours
              </option>
            </select>
          </div>
        </div>

        ${payrollLeaveTypeMappingView()}
        ${payrollLeavePreviewView()}
      </div>
    `;
  }

  function payrollLeaveTypeMappingView(){
    const mapping=state.payrollLeave.mapping||{};
    const rows=mapping.leave_types?.items||[];
    const targets=mapping.leave_types?.targets||[];

    if(!rows.length)return "";

    return `
      <div style="margin-top:18px">
        <h3>Leave Type Mapping</h3>

        ${table(
          [
            "Source Leave Type",
            "Records",
            "FinSage Leave Type",
            "Confidence",
          ],

          rows.map((row,index)=>[
            `
              <strong>${esc(row.source_name)}</strong>
              <div class="mw-muted mw-small">
                ${esc(row.source_code||"No source code")}
              </div>
            `,

            Number(row.sample_count||0).toLocaleString(),

            `
              <select class="mw-select"
                data-mw-payroll-leave-target="${index}">

                <option value="">Select leave type</option>

                ${targets.map(target=>`
                  <option value="${target.id}"
                    ${Number(row.target_leave_type_id)===Number(target.id)?"selected":""}>
                    ${esc(`${target.code||""} — ${target.name||""}`)}
                  </option>
                `).join("")}
              </select>
            `,

            row.target_leave_type_id
              ?`<span class="mw-badge ${row.is_approved?"ok":"info"}">
                  ${Number(row.confidence||0).toFixed(0)}%
                </span>`
              :`<span class="mw-badge warn">Unmapped</span>`,
          ]),

          "No leave types detected."
        )}
      </div>
    `;
  }

  function payrollLeavePreviewView(){
    const preview=state.payrollLeave.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:20px">
        <h3>Leave Opening Position</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Balances</span>
            <strong>${preview.balance_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Total Opening Balance</span>
            <strong>${Number(preview.total_opening_balance||0).toLocaleString()}</strong>
          </div>
        </div>

        ${table(
          [
            "Employee",
            "Leave Type",
            "Entitlement",
            "Taken",
            "Opening Balance",
            "Status",
          ],

          (preview.items||[]).map(row=>[
            esc(row.employee?.employee_no||"—"),

            esc(row.leave?.leave_type_name||"—"),

            Number(row.leave?.opening_entitlement||0).toLocaleString(),

            Number(row.leave?.leave_taken_to_date||0).toLocaleString(),

            `<strong>${Number(row.leave?.opening_balance||0).toLocaleString()}</strong>`,

            row.valid
              ?`<span class="mw-badge ok">Ready</span>`
              :`<span class="mw-badge error">${row.issues?.length||1} issue(s)</span>`,
          ]),

          "No leave balances available."
        )}
      </div>
    `;
  }

  function payrollEmployeeLoansMigrationView(){
    const datasets=state.payrollEmployeeLoans.datasets||[];

    if(!datasets.length)return "";

    const settings=state.payrollEmployeeLoans.settings;

    if(!settings){
      return `
        <div class="mw-empty">
          Loading employee loans…
        </div>
      `;
    }

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Employee Loans",
          "Reconstruct outstanding employee-loan balances and repayment settings at payroll cutover.",
          `
            <button class="mw-btn"
              data-mw-action="save-payroll-employee-loan-settings">
              Save settings
            </button>

            <button class="mw-btn primary"
              data-mw-action="preview-payroll-employee-loans"
              ${state.payrollEmployeeLoansPreviewLoading?"disabled":""}>
              ${state.payrollEmployeeLoansPreviewLoading?"Validating…":"Validate loans"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Dataset</label>

            <select id="mwPayrollEmployeeLoanDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.payrollEmployeeLoans.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="mw-field">
            <label>Repayment Frequency</label>

            <select class="mw-select"
              data-mw-payroll-loan-setting="default_frequency">

              <option value="weekly"
                ${settings.default_frequency==="weekly"?"selected":""}>
                Weekly
              </option>

              <option value="fortnightly"
                ${settings.default_frequency==="fortnightly"?"selected":""}>
                Fortnightly
              </option>

              <option value="monthly"
                ${settings.default_frequency==="monthly"?"selected":""}>
                Monthly
              </option>
            </select>
          </div>

          <div class="mw-field">
            <label>Interest Method</label>

            <select class="mw-select"
              data-mw-payroll-loan-setting="default_interest_method">

              <option value="reducing_balance"
                ${settings.default_interest_method==="reducing_balance"?"selected":""}>
                Reducing Balance
              </option>

              <option value="flat"
                ${settings.default_interest_method==="flat"?"selected":""}>
                Flat
              </option>

              <option value="interest_free"
                ${settings.default_interest_method==="interest_free"?"selected":""}>
                Interest Free
              </option>

              <option value="manual"
                ${settings.default_interest_method==="manual"?"selected":""}>
                Manual
              </option>
            </select>
          </div>
        </div>

        ${payrollEmployeeLoanPreviewView()}
      </div>
    `;
  }

  function payrollEmployeeLoanPreviewView(){
    const preview=state.payrollEmployeeLoans.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:20px">
        <h3>Employee Loan Opening Position</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Loans</span>
            <strong>${preview.loan_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Outstanding</span>
            <strong>${money(preview.total_outstanding||0)}</strong>
          </div>

          <div class="mw-stat">
            <span>Payroll Repayments</span>
            <strong>${money(preview.total_repayment_amount||0)}</strong>
          </div>
        </div>

        ${table(
          [
            "Employee",
            "Loan",
            "Original",
            "Repaid",
            "Outstanding",
            "Repayment",
            "Status",
          ],

          (preview.items||[]).map(row=>[
            esc(row.employee?.employee_no||"—"),

            `
              <strong>${esc(row.loan?.loan_name||"—")}</strong>
              <div class="mw-muted mw-small">
                ${esc(row.loan?.loan_reference||"")}
              </div>
            `,

            money(row.loan?.original_amount||0),

            money(row.loan?.amount_repaid_to_date||0),

            `<strong>${money(row.loan?.outstanding_balance||0)}</strong>`,

            money(row.loan?.repayment_amount||0),

            row.valid
              ?`<span class="mw-badge ok">Ready</span>`
              :`<span class="mw-badge error">${row.issues?.length||1} issue(s)</span>`,
          ]),

          "No employee loans available."
        )}
      </div>
    `;
  }

  async function loadPayrollHistory(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.payrollHistory={
        datasets:[],
        datasetId:null,
        settings:null,
        mapping:null,
        preview:null,
      };
      state.payrollHistoryLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollHistory(
          companyId(),
          projectId
        )
      );

      state.payrollHistory.datasets=response?.datasets||[];

      if(!state.payrollHistory.datasets.some(
        item=>Number(item.dataset_id)===Number(state.payrollHistory.datasetId)
      )){
        state.payrollHistory.datasetId=
          state.payrollHistory.datasets[0]?.dataset_id||null;
      }

      if(state.payrollHistory.datasetId){
        await loadPayrollHistoryDataset(
          state.payrollHistory.datasetId,
          {renderAfter:false}
        );
      }

      state.payrollHistoryLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error(
        "[DataMigration] loadPayrollHistory failed",
        error
      );
    }

    if(renderAfter)render();
  }
  async function loadPayrollHistoryDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.payrollHistorySettings(
          companyId(),
          state.project.id,
          id
        )
      ),

      apiFetch(
        ENDPOINTS.migrations.payrollHistoryMapping(
          companyId(),
          state.project.id,
          id
        )
      ),
    ]);

    state.payrollHistory.datasetId=id;
    state.payrollHistory.settings=settingsResponse?.settings||null;
    state.payrollHistory.mapping=mappingResponse?.mapping||null;
    state.payrollHistory.preview=null;

    if(renderAfter)render();
  }

  async function savePayrollHistorySettings(){
    if(!state.payrollHistory.datasetId||!state.payrollHistory.settings)return;

    state.payrollHistorySaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollHistorySettings(
          companyId(),
          state.project.id,
          state.payrollHistory.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(
            state.payrollHistory.settings
          ),
        }
      );

      state.payrollHistory.settings=
        response?.settings||state.payrollHistory.settings;

      await loadPayrollHistoryDataset(
        state.payrollHistory.datasetId,
        {renderAfter:false}
      );

      notify("Historical payroll settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.payrollHistorySaving=false;
      render();
    }
  }

  async function previewPayrollHistory(){
    if(!state.payrollHistory.datasetId)return;

    state.payrollHistoryPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollHistoryPreview(
          companyId(),
          state.project.id,
          state.payrollHistory.datasetId
        )
      );

      state.payrollHistory.preview=
        response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.payrollHistoryPreviewLoading=false;
      render();
    }
  }


  function payrollHistoryMigrationView(){
    const datasets=state.payrollHistory.datasets||[];

    if(!datasets.length)return "";

    const settings=state.payrollHistory.settings;
    const mapping=state.payrollHistory.mapping;

    if(!settings||!mapping){
      return `
        <div class="mw-empty">
          Loading historical payroll…
        </div>
      `;
    }

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Historical Payroll & Payslips",
          "Import prior payroll results without recalculating historical tax or changing source payroll values.",
          `
            <button class="mw-btn"
              data-mw-action="save-payroll-history-settings"
              ${state.payrollHistorySaving?"disabled":""}>
              ${state.payrollHistorySaving?"Saving…":"Save settings"}
            </button>

            <button class="mw-btn primary"
              data-mw-action="preview-payroll-history"
              ${state.payrollHistoryPreviewLoading?"disabled":""}>
              ${state.payrollHistoryPreviewLoading?"Reconstructing…":"Reconstruct history"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Dataset</label>

            <select id="mwPayrollHistoryDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.payrollHistory.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="mw-field">
            <label>Source Layout</label>

            <select class="mw-select"
              data-mw-payroll-history-setting="source_layout">

              <option value="summary_rows"
                ${settings.source_layout==="summary_rows"?"selected":""}>
                Employee Payroll Summary Rows
              </option>

              <option value="item_rows"
                ${settings.source_layout==="item_rows"?"selected":""}>
                Payroll Item Rows
              </option>
            </select>
          </div>

          <div class="mw-field">
            <label>Default Frequency</label>

            <select class="mw-select"
              data-mw-payroll-history-setting="default_pay_frequency">

              <option value="weekly"
                ${settings.default_pay_frequency==="weekly"?"selected":""}>
                Weekly
              </option>

              <option value="fortnightly"
                ${settings.default_pay_frequency==="fortnightly"?"selected":""}>
                Fortnightly
              </option>

              <option value="monthly"
                ${settings.default_pay_frequency==="monthly"?"selected":""}>
                Monthly
              </option>
            </select>
          </div>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${payrollHistoryCheck(
            "Preserve legacy PAYE",
            "preserve_source_tax"
          )}

          ${payrollHistoryCheck(
            "Preserve legacy net pay",
            "preserve_source_net_pay"
          )}

          ${payrollHistoryCheck(
            "Require payroll item mapping",
            "require_item_mapping"
          )}
        </div>

        ${payrollHistoryMappingStatus()}
        ${payrollHistoryPreviewView()}
      </div>
    `;
  }

  function payrollHistoryCheck(label,field){
    const checked=Boolean(
      state.payrollHistory.settings?.[field]
    );

    return `
      <label class="mw-check">
        <input type="checkbox"
          ${checked?"checked":""}
          data-mw-payroll-history-setting="${esc(field)}">

        <span>${esc(label)}</span>
      </label>
    `;
  }

  function payrollHistoryMappingStatus(){
    const mapping=state.payrollHistory.mapping||{};
    const missing=mapping.missing_fields||[];

    return `
      <div style="margin-top:18px">
        <h3>Historical Payroll Readiness</h3>

        ${mapping.is_complete
          ?`
            <div class="mw-alert ok">
              Historical payroll fields are mapped and ready for reconstruction.
            </div>
          `
          :`
            <div class="mw-alert warn">
              <strong>Missing mapped fields:</strong>
              ${missing.map(esc).join(", ")}
            </div>
          `
        }
      </div>
    `;
  }

  function payrollHistoryPreviewView(){
    const preview=state.payrollHistory.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:20px">
        <h3>Historical Payroll Reconstruction</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Payroll Runs</span>
            <strong>${preview.run_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Employee Results</span>
            <strong>${preview.employee_result_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Gross Pay</span>
            <strong>${money(preview.total_gross||0)}</strong>
          </div>

          <div class="mw-stat">
            <span>PAYE</span>
            <strong>${money(preview.total_paye||0)}</strong>
          </div>

          <div class="mw-stat">
            <span>Net Pay</span>
            <strong>${money(preview.total_net||0)}</strong>
          </div>
        </div>

        ${(preview.runs||[]).map(
          payrollHistoryRunCard
        ).join("")}
      </div>
    `;
  }

  function payrollHistoryRunCard(run){
    return `
      <div class="mw-card" style="margin-top:12px">
        <div class="mw-inline" style="justify-content:space-between">
          <div>
            <strong>${esc(run.run_name||run.run_reference)}</strong>

            <div class="mw-muted mw-small">
              ${esc(run.period_start||"")} → ${esc(run.period_end||"")}
              ${run.payment_date?` • Paid ${esc(run.payment_date)}`:""}
            </div>
          </div>

          <span class="mw-badge ${run.valid?"ok":"error"}">
            ${run.valid?"Ready":`${run.error_count||0} issue(s)`}
          </span>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          <div>
            <span class="mw-muted mw-small">Employees</span>
            <div>${Number(run.employee_count||0).toLocaleString()}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">Gross Pay</span>
            <div>${money(run.gross_pay||0)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">PAYE</span>
            <div>${money(run.paye_amount||0)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">Other Deductions</span>
            <div>${money(run.employee_deductions||0)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">Employer Contributions</span>
            <div>${money(run.employer_contributions||0)}</div>
          </div>

          <div>
            <span class="mw-muted mw-small">Net Pay</span>
            <div><strong>${money(run.net_pay||0)}</strong></div>
          </div>
        </div>

        ${payrollHistoryEmployeesTable(run.employees||[])}
      </div>
    `;
  }

  function payrollHistoryEmployeesTable(rows){
    if(!rows.length)return "";

    return `
      <div style="margin-top:14px">
        ${table(
          [
            "Employee",
            "Gross",
            "PAYE",
            "Deductions",
            "Net",
            "Status",
          ],

          rows.map(row=>{
            const employee=row.employee||{};
            const result=row.result||{};

            return [
              `
                <strong>${esc(employee.employee_no||"—")}</strong>
                ${employee.employee_name
                  ?`<div class="mw-muted mw-small">${esc(employee.employee_name)}</div>`
                  :""
                }
              `,

              money(result.gross_pay||0),
              money(result.paye_amount||0),
              money(result.total_deductions||0),

              `<strong>${money(result.net_pay||0)}</strong>`,

              row.valid
                ?`<span class="mw-badge ok">Reconciled</span>`
                :`<span class="mw-badge error">${row.issues?.length||1} issue(s)</span>`,
            ];
          }),

          "No employee payroll results."
        )}
      </div>
    `;
  }

  async function loadPayrollReconciliation(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.payrollReconciliation=null;
      state.payrollReconciliationHistory=[];
      state.payrollReconciliationLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const [reconResponse,historyResponse]=await Promise.all([
        apiFetch(
          ENDPOINTS.migrations.payrollReconciliation(
            companyId(),
            projectId
          )
        ),

        apiFetch(
          ENDPOINTS.migrations.payrollReconciliationHistory(
            companyId(),
            projectId
          )
        ),
      ]);

      state.payrollReconciliation=
        reconResponse?.reconciliation||null;

      state.payrollReconciliationHistory=
        historyResponse?.history||[];

      state.payrollReconciliationLoaded=true;

    }catch(error){
      state.error=errorMessage(error);

      console.error(
        "[DataMigration] loadPayrollReconciliation failed",
        error
      );
    }

    if(renderAfter)render();
  }

  async function runPayrollReconciliation(){
    if(!state.project?.id)return;

    state.payrollReconciliationRunning=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.payrollReconciliation(
          companyId(),
          state.project.id
        ),
        {
          method:"POST",
          body:JSON.stringify({}),
        }
      );

      state.payrollReconciliation=
        response?.reconciliation||null;

      const historyResponse=await apiFetch(
        ENDPOINTS.migrations.payrollReconciliationHistory(
          companyId(),
          state.project.id
        )
      );

      state.payrollReconciliationHistory=
        historyResponse?.history||[];

      if(state.payrollReconciliation?.is_ready){
        notify("Payroll migration is ready.");
      }else{
        notify(
          `${state.payrollReconciliation?.blocking_error_count||0} payroll migration issue(s) require attention.`
        );
      }

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.payrollReconciliationRunning=false;
      render();
    }
  }

  function payrollReconciliationView(){
    const recon=state.payrollReconciliation;

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Payroll Migration Readiness",
          "Run a complete cutover assessment across employee master data, payroll setup, leave, employee loans, tax and historical payroll.",
          `
            <button class="mw-btn primary"
              data-mw-action="run-payroll-reconciliation"
              ${state.payrollReconciliationRunning?"disabled":""}>
              ${state.payrollReconciliationRunning
                ?"Running reconciliation…"
                :"Run payroll reconciliation"
              }
            </button>
          `
        )}

        ${!recon
          ?`
            <div class="mw-empty">
              Run payroll reconciliation to assess cutover readiness.
            </div>
          `
          :`
            ${payrollReconciliationSummary(recon)}
            ${payrollReconciliationChecks(recon)}
            ${payrollReconciliationModules(recon)}
            ${payrollReconciliationHistoryView()}
          `
        }
      </div>
    `;
  }

  function payrollReconciliationSummary(recon){
    const ready=Boolean(recon.is_ready);
    const percent=Number(recon.readiness_percent||0);

    return `
      <div style="margin-top:16px">
        <div class="mw-alert ${ready?"ok":"error"}">
          <div class="mw-inline" style="justify-content:space-between">
            <div>
              <strong>
                ${ready
                  ?"Payroll migration is ready"
                  :"Payroll migration is blocked"
                }
              </strong>

              <div class="mw-muted mw-small" style="margin-top:4px">
                ${ready
                  ?"All blocking payroll cutover controls have passed."
                  :`${recon.blocking_error_count||0} blocking control(s) require attention.`
                }
              </div>
            </div>

            <span class="mw-badge ${ready?"ok":"error"}">
              ${percent.toFixed(0)}%
            </span>
          </div>
        </div>

        <div class="mw-progress" style="margin-top:12px">
          <span style="width:${Math.min(100,Math.max(0,percent))}%"></span>
        </div>
      </div>
    `;
  }

  function payrollReconciliationChecks(recon){
    const checks=recon.checks_json||[];

    if(!checks.length)return "";

    return `
      <div style="margin-top:20px">
        <h3>Cutover Controls</h3>

        <div class="mw-list" style="margin-top:12px">
          ${checks.map(check=>`
            <div class="mw-list-item">
              <div class="mw-inline" style="justify-content:space-between">
                <div>
                  <strong>${esc(check.label)}</strong>

                  ${check.message
                    ?`<div class="mw-muted mw-small" style="margin-top:4px">
                        ${esc(check.message)}
                      </div>`
                    :""
                  }
                </div>

                <span class="mw-badge ${
                  check.passed
                    ?"ok"
                    :check.blocking
                      ?"error"
                      :"warn"
                }">
                  ${check.passed
                    ?"Passed"
                    :check.blocking
                      ?"Blocking"
                      :"Warning"
                  }
                </span>
              </div>

              ${(check.value!==null&&check.value!==undefined)
                ?`
                  <div class="mw-muted mw-small" style="margin-top:6px">
                    Actual: ${esc(check.value)}
                    ${check.expected!==null&&check.expected!==undefined
                      ?` • Expected: ${esc(check.expected)}`
                      :""
                    }
                  </div>
                `
                :""
              }
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function payrollReconciliationModules(recon){
    const summary=recon.summary_json||{};

    const employees=summary.employees||{};
    const items=summary.payroll_items||{};
    const leave=summary.leave||{};
    const loans=summary.employee_loans||{};
    const history=summary.history||{};

    return `
      <div style="margin-top:20px">
        <h3>Payroll Opening Position</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Employees Ready</span>
            <strong>
              ${employees.ready_count||0}/${employees.employee_count||0}
            </strong>
          </div>

          <div class="mw-stat">
            <span>Payroll Items Ready</span>
            <strong>
              ${items.ready_count||0}/${items.item_count||0}
            </strong>
          </div>

          <div class="mw-stat">
            <span>Leave Balances Ready</span>
            <strong>
              ${leave.ready_count||0}/${leave.balance_count||0}
            </strong>
          </div>

          <div class="mw-stat">
            <span>Employee Loans Ready</span>
            <strong>
              ${loans.ready_count||0}/${loans.loan_count||0}
            </strong>
          </div>

          <div class="mw-stat">
            <span>Historical Runs Ready</span>
            <strong>
              ${history.ready_count||0}/${history.run_count||0}
            </strong>
          </div>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${payrollReconAmount(
            "Monthly Basic Payroll",
            employees.total_basic_salary,
            true
          )}

          ${payrollReconAmount(
            "Employee Loan Opening Balance",
            loans.total_outstanding,
            true
          )}

          ${payrollReconAmount(
            "Leave Opening Balance",
            leave.total_opening_balance,
            false
          )}

          ${payrollReconAmount(
            "Historical Gross Pay",
            history.total_gross,
            true
          )}

          ${payrollReconAmount(
            "Historical PAYE",
            history.total_paye,
            true
          )}

          ${payrollReconAmount(
            "Historical Net Pay",
            history.total_net,
            true
          )}
        </div>

        ${payrollOrphanEmployeeReferences(summary)}
      </div>
    `;
  }


  function payrollReconAmount(label,value,isMoney){
    return `
      <div class="mw-card">
        <div class="mw-muted mw-small">${esc(label)}</div>

        <strong style="display:block;margin-top:5px">
          ${isMoney
            ?money(value||0)
            :Number(value||0).toLocaleString()
          }
        </strong>
      </div>
    `;
  }

  function payrollOrphanEmployeeReferences(summary){
    const rows=summary.orphan_employee_references||[];

    if(!rows.length){
      return `
        <div class="mw-alert ok" style="margin-top:14px">
          All payroll child records reference known employees.
        </div>
      `;
    }

    return `
      <div class="mw-alert error" style="margin-top:14px">
        <strong>Unresolved employee references</strong>

        <div class="mw-table-wrap" style="margin-top:10px">
          <table class="mw-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Dataset</th>
                <th>Employee Number</th>
              </tr>
            </thead>

            <tbody>
              ${rows.map(row=>`
                <tr>
                  <td>${esc(row.source)}</td>
                  <td>${esc(row.dataset_id)}</td>
                  <td><strong>${esc(row.employee_no)}</strong></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function payrollReconciliationHistoryView(){
    const rows=state.payrollReconciliationHistory||[];

    if(!rows.length)return "";

    return `
      <div style="margin-top:20px">
        <h3>Reconciliation History</h3>

        ${table(
          [
            "Run",
            "Date",
            "Employees",
            "Items",
            "Leave",
            "Loans",
            "History",
            "Readiness",
            "Status",
          ],

          rows.map(row=>[
            `#${esc(row.id)}`,

            esc(
              String(row.created_at||"")
                .replace("T"," ")
                .slice(0,19)
            ),

            Number(row.employee_count||0).toLocaleString(),

            Number(row.payroll_item_count||0).toLocaleString(),

            Number(row.leave_balance_count||0).toLocaleString(),

            Number(row.employee_loan_count||0).toLocaleString(),

            Number(row.history_run_count||0).toLocaleString(),

            `${Number(row.readiness_percent||0).toFixed(0)}%`,

            row.is_ready
              ?`<span class="mw-badge ok">Ready</span>`
              :`<span class="mw-badge error">${row.blocking_error_count||0} blocking</span>`,
          ]),

          "No reconciliation runs."
        )}
      </div>
    `;
  }

  async function loadProducts(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.products={
        datasets:[],
        datasetId:null,
        settings:null,
        mapping:null,
        preview:null,
      };
      state.productsLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.products(
          companyId(),
          projectId
        )
      );

      state.products.datasets=
        response?.datasets||[];

      if(!state.products.datasets.some(
        item=>Number(item.dataset_id)===Number(state.products.datasetId)
      )){
        state.products.datasetId=
          state.products.datasets[0]?.dataset_id||null;
      }

      if(state.products.datasetId){
        await loadProductDataset(
          state.products.datasetId,
          {renderAfter:false}
        );
      }

      state.productsLoaded=true;

    }catch(error){
      state.error=errorMessage(error);

      console.error(
        "[DataMigration] loadProducts failed",
        error
      );
    }

    if(renderAfter)render();
  }

  async function loadProductDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,mappingResponse,accountingResponse]=await Promise.all([
      apiFetch(ENDPOINTS.migrations.productSettings(companyId(),state.project.id,id)),
      apiFetch(ENDPOINTS.migrations.productMapping(companyId(),state.project.id,id)),
      apiFetch(ENDPOINTS.migrations.productAccounting(companyId(),state.project.id,id)),
    ]);

    state.products.datasetId=id;
    state.products.settings=settingsResponse?.settings||null;
    state.products.mapping=mappingResponse?.mapping||null;
    state.products.accounting=accountingResponse?.accounting||null;
    state.products.preview=null;
    state.products.accountingPreview=null;

    if(renderAfter)render();
  }

  async function saveProductSettings(){
    if(!state.products.datasetId||!state.products.settings)return;

    state.productsSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.productSettings(
          companyId(),
          state.project.id,
          state.products.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(
            state.products.settings
          ),
        }
      );

      state.products.settings=
        response?.settings||state.products.settings;

      await loadProductDataset(
        state.products.datasetId,
        {renderAfter:false}
      );

      notify("Product migration settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.productsSaving=false;
      render();
    }
  }

  async function saveProductTypes(){
    const rows=
      state.products.mapping?.type_mapping?.items||[];

    if(!rows.length){
      notify(
        "No source product types require mapping."
      );
      return;
    }

    const mappings=[];

    for(const row of rows){
      if(!row.item_kind){
        notify(
          `Select a product type for "${row.source_value}".`
        );
        return;
      }

      mappings.push({
        source_value:row.source_value,
        source_label:row.source_label||row.source_value,
        item_kind:row.item_kind,
      });
    }

    state.productsSaving=true;
    render();

    try{
      await apiFetch(
        ENDPOINTS.migrations.productTypes(
          companyId(),
          state.project.id,
          state.products.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings}),
        }
      );

      await loadProductDataset(
        state.products.datasetId,
        {renderAfter:false}
      );

      notify(
        "Product type mappings saved."
      );

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.productsSaving=false;
      render();
    }
  }

  async function previewProducts(){
    if(!state.products.datasetId)return;

    state.productsPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.productPreview(
          companyId(),
          state.project.id,
          state.products.datasetId
        )
      );

      state.products.preview=
        response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.productsPreviewLoading=false;
      render();
    }
  }

  function productSettingSelect(label,field,options){
    const value=state.products.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select"
          data-mw-product-setting="${esc(field)}">

          ${options.map(([id,name])=>`
            <option value="${esc(id)}"
              ${String(value)===String(id)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function productSettingInput(label,field,type="text"){
    const value=state.products.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <input
          class="mw-input"
          type="${esc(type)}"
          value="${esc(value)}"
          data-mw-product-setting="${esc(field)}">
      </div>
    `;
  }

  function productSettingCheck(label,field){
    const checked=Boolean(
      state.products.settings?.[field]
    );

    return `
      <label class="mw-check">
        <input
          type="checkbox"
          ${checked?"checked":""}
          data-mw-product-setting="${esc(field)}">

        <span>${esc(label)}</span>
      </label>
    `;
  }

  function productMigrationView(){
    const datasets=state.products.datasets||[];
    const settings=state.products.settings;
    const mapping=state.products.mapping;

    if(!datasets.length)return "";

    if(!settings||!mapping){
      return `
        <div class="mw-empty">
          Loading product catalogue mapping…
        </div>
      `;
    }

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Product Catalogue Migration",
          "Classify and validate inventory items, services, non-stock products and POS menu items before importing stock or POS history.",
          `
            <button
              class="mw-btn"
              data-mw-action="save-product-settings"
              ${state.productsSaving?"disabled":""}>
              Save settings
            </button>

            ${mapping.type_mapping?.items?.length
              ?`
                <button
                  class="mw-btn"
                  data-mw-action="save-product-types"
                  ${state.productsSaving?"disabled":""}>
                  Save product types
                </button>
              `
              :""
            }

            <button
              class="mw-btn primary"
              data-mw-action="preview-products"
              ${state.productsPreviewLoading?"disabled":""}>
              ${state.productsPreviewLoading
                ?"Validating…"
                :"Validate catalogue"
              }
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Dataset</label>

            <select id="mwProductDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option
                  value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.products.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          ${productSettingSelect(
            "Default Product Type",
            "default_item_kind",
            [
              ["inventory","Inventory Item"],
              ["service","Service"],
              ["non_stock","Non-stock Product"],
              ["menu_item","POS Menu Item"],
            ]
          )}

          ${productSettingSelect(
            "Inventory Valuation",
            "default_valuation_method",
            [
              ["AVG","Weighted Average"],
              ["FIFO","FIFO"],
            ]
          )}
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${productSettingInput(
            "Default Unit",
            "default_unit"
          )}

          ${productSettingInput(
            "Default Currency",
            "default_currency"
          )}

          <div class="mw-field">
            <label>Code Handling</label>

            <div class="mw-list">
              ${productSettingCheck(
                "Generate missing item codes",
                "generate_missing_codes"
              )}

              ${productSettingCheck(
                "Preserve source barcodes",
                "preserve_source_barcodes"
              )}
            </div>
          </div>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${productSettingCheck(
            "Track inventory by default",
            "default_track_stock"
          )}

          ${productSettingCheck(
            "Taxable by default",
            "default_is_taxable"
          )}

          ${productSettingCheck(
            "Require unique barcodes",
            "require_unique_barcode"
          )}
        </div>

        ${productMappingStatusView()}
        ${productTypeMappingView()}
        ${productPreviewView()}
        ${productAccountingView()}
      </div>
    `;
  }

  function productMappingStatusView(){
    const mapping=state.products.mapping||{};
    const missing=mapping.missing_fields||[];
    const unresolved=mapping.unresolved_types||[];

    return `
      <div style="margin-top:20px">
        <h3>Catalogue Readiness</h3>

        ${mapping.is_complete
          ?`
            <div class="mw-alert ok">
              Required product catalogue fields and product classifications are mapped.
            </div>
          `
          :`
            <div class="mw-alert warn">
              ${missing.length
                ?`
                  <div>
                    <strong>Missing fields:</strong>
                    ${missing.map(esc).join(", ")}
                  </div>
                `
                :""
              }

              ${unresolved.length
                ?`
                  <div style="margin-top:5px">
                    <strong>Unresolved product types:</strong>
                    ${unresolved.length}
                  </div>
                `
                :""
              }
            </div>
          `
        }
      </div>
    `;
  }

  function productTypeMappingView(){
    const rows=
      state.products.mapping?.type_mapping?.items||[];

    if(!rows.length){
      return `
        <div class="mw-alert" style="margin-top:14px">
          No source product-type values were detected. The default product type will be used.
        </div>
      `;
    }

    return `
      <div style="margin-top:20px">
        <h3>Product Type Classification</h3>

        ${table(
          [
            "Source Type",
            "Records",
            "FinSage Type",
            "Confidence",
          ],

          rows.map((row,index)=>[
            `<strong>${esc(row.source_value)}</strong>`,

            Number(
              row.sample_count||0
            ).toLocaleString(),

            `
              <select
                class="mw-select"
                data-mw-product-type="${index}">

                <option value="">
                  Select type
                </option>

                ${[
                  ["inventory","Inventory Item"],
                  ["service","Service"],
                  ["non_stock","Non-stock Product"],
                  ["menu_item","POS Menu Item"],
                ].map(([value,label])=>`
                  <option
                    value="${value}"
                    ${row.item_kind===value?"selected":""}>
                    ${label}
                  </option>
                `).join("")}
              </select>
            `,

            row.item_kind
              ?`
                <span class="mw-badge ${row.is_approved?"ok":"info"}">
                  ${Number(row.confidence||0).toFixed(0)}%
                </span>
              `
              :`
                <span class="mw-badge warn">
                  Unclassified
                </span>
              `,
          ]),

          "No source product types detected."
        )}
      </div>
    `;
  }

  function productPreviewView(){
    const preview=state.products.preview;

    if(!preview)return "";

    const counts=preview.counts||{};

    return `
      <div style="margin-top:20px">
        <h3>Catalogue Preview</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Records</span>
            <strong>${preview.record_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Inventory</span>
            <strong>${counts.inventory||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Services</span>
            <strong>${counts.service||0}</strong>
          </div>
        </div>

        <div class="mw-inline" style="margin-top:12px">
          <span class="mw-badge info">
            Non-stock: ${counts.non_stock||0}
          </span>

          <span class="mw-badge info">
            Menu items: ${counts.menu_item||0}
          </span>

          ${counts.unclassified
            ?`
              <span class="mw-badge warn">
                Unclassified: ${counts.unclassified}
              </span>
            `
            :""
          }

          ${preview.duplicate_code_count
            ?`
              <span class="mw-badge error">
                Duplicate codes: ${preview.duplicate_code_count}
              </span>
            `
            :""
          }

          ${preview.duplicate_barcode_count
            ?`
              <span class="mw-badge error">
                Duplicate barcodes: ${preview.duplicate_barcode_count}
              </span>
            `
            :""
          }
        </div>

        ${productPreviewTable(preview.items||[])}
      </div>
    `;
  }

  function productPreviewTable(rows){
    return `
      <div style="margin-top:14px">
        ${table(
          [
            "Code",
            "Item",
            "Type",
            "Category",
            "Sales Price",
            "Cost",
            "VAT",
            "Target",
            "Status",
          ],

          rows.map(row=>{
            const item=row.item||{};
            const classification=row.classification||{};

            return [
              `<strong>${esc(item.code||"—")}</strong>`,

              `
                <strong>${esc(item.name||"—")}</strong>

                ${item.barcode
                  ?`
                    <div class="mw-muted mw-small">
                      ${esc(item.barcode)}
                    </div>
                  `
                  :""
                }
              `,

              productKindBadge(
                classification.item_kind
              ),

              esc(item.category||"—"),

              money(item.sales_price||0),

              money(item.purchase_cost||0),

              esc(item.vat_code||"—"),

              esc(
                classification.target_table||"—"
              ),

              row.valid
                ?`
                  <span class="mw-badge ok">
                    Ready
                  </span>
                `
                :`
                  <span class="mw-badge error"
                    title="${esc((row.issues||[]).join(" • "))}">
                    ${row.issues?.length||1} issue(s)
                  </span>
                `,
            ];
          }),

          "No product records available."
        )}
      </div>
    `;
  }

  function productKindBadge(kind){
    const labels={
      inventory:"Inventory",
      service:"Service",
      non_stock:"Non-stock",
      menu_item:"Menu Item",
    };

    return kind
      ?`<span class="mw-badge info">${esc(labels[kind]||kind)}</span>`
      :`<span class="mw-badge warn">Unclassified</span>`;
  }

  async function saveProductAccounts(){
    const rows=state.products.accounting?.accounts?.items||[];
    if(!rows.length)return notify("No product accounts require mapping.");

    const invalid=rows.find(row=>!row.target_account_id);
    if(invalid)return notify(`Select a FinSage account for "${invalid.source_value}".`);

    state.productsAccountingSaving=true;
    render();

    try{
      await apiFetch(
        ENDPOINTS.migrations.productAccounts(
          companyId(),state.project.id,state.products.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({
            mappings:rows.map(row=>({
              account_role:row.account_role,
              source_value:row.source_value,
              source_label:row.source_label,
              target_account_id:Number(row.target_account_id),
            })),
          }),
        }
      );

      await loadProductDataset(state.products.datasetId,{renderAfter:false});
      notify("Product account mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.productsAccountingSaving=false;
      render();
    }
  }

  async function saveProductVat(){
    const rows=state.products.accounting?.vat?.items||[];
    if(!rows.length)return notify("No product VAT treatments require mapping.");

    const invalid=rows.find(row=>!row.target_vat_code);
    if(invalid)return notify(`Select VAT treatment for "${invalid.source_value}".`);

    state.productsAccountingSaving=true;
    render();

    try{
      await apiFetch(
        ENDPOINTS.migrations.productVat(
          companyId(),state.project.id,state.products.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({
            mappings:rows.map(row=>({
              source_value:row.source_value,
              source_label:row.source_label,
              source_rate:row.source_rate,
              target_vat_code:row.target_vat_code,
              target_rate:row.target_rate,
            })),
          }),
        }
      );

      await loadProductDataset(state.products.datasetId,{renderAfter:false});
      notify("Product VAT mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.productsAccountingSaving=false;
      render();
    }
  }

  async function previewProductAccounting(){
    if(!state.products.datasetId)return;

    state.productsAccountingPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.productAccountingPreview(
          companyId(),state.project.id,state.products.datasetId
        )
      );

      state.products.accountingPreview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.productsAccountingPreviewLoading=false;
      render();
    }
  }


  function productAccountSelect(row,index){
    const targets=state.products.accounting?.accounts?.targets||[];

    return `
      <select class="mw-select" data-mw-product-account="${index}">
        <option value="">Select account</option>

        ${targets.map(account=>`
          <option value="${account.id}"
            ${Number(row.target_account_id)===Number(account.id)?"selected":""}>
            ${esc(`${account.code} — ${account.name}`)}
          </option>
        `).join("")}
      </select>
    `;
  }

  function productAccountRoleLabel(role){
    return {
      inventory_asset:"Inventory Asset",
      sales_revenue:"Sales Revenue",
      cogs:"Cost of Sales / COGS",
      service_revenue:"Service Revenue",
      service_cost:"Service Cost",
    }[role]||titleCase(role);
  }

  function productVatSelect(row,index){
    const targets=state.products.accounting?.vat?.targets||[];

    return `
      <select class="mw-select" data-mw-product-vat="${index}">
        <option value="">Select VAT treatment</option>

        ${targets.map(target=>`
          <option value="${esc(target.code)}"
            ${String(row.target_vat_code||"")===String(target.code)?"selected":""}>
            ${esc(target.label||target.code)}
          </option>
        `).join("")}
      </select>
    `;
  }

  function productAccountingView(){
    const accounting=state.products.accounting;
    if(!accounting)return "";

    const accountRows=accounting.accounts?.items||[];
    const vatRows=accounting.vat?.items||[];

    return `
      <div style="margin-top:20px">
        ${heading(
          "Product Accounting & VAT",
          "Map source inventory, sales, cost and service accounts plus VAT treatments to FinSage.",
          `
            ${accountRows.length
              ?`<button class="mw-btn" data-mw-action="save-product-accounts" ${state.productsAccountingSaving?"disabled":""}>
                  Save account mappings
                </button>`
              :""
            }

            ${vatRows.length
              ?`<button class="mw-btn" data-mw-action="save-product-vat" ${state.productsAccountingSaving?"disabled":""}>
                  Save VAT mappings
                </button>`
              :""
            }

            <button class="mw-btn primary"
              data-mw-action="preview-product-accounting"
              ${state.productsAccountingPreviewLoading?"disabled":""}>
              ${state.productsAccountingPreviewLoading?"Validating…":"Validate accounting"}
            </button>
          `
        )}

        ${productAccountingStatusView()}
        ${productAccountMappingView()}
        ${productVatMappingView()}
        ${productAccountingPreviewView()}
      </div>
    `;
  }

  function productAccountingStatusView(){
    const accounting=state.products.accounting||{};
    const accountCount=accounting.unresolved_accounts?.length||0;
    const vatCount=accounting.unresolved_vat?.length||0;

    if(accounting.is_complete){
      return `
        <div class="mw-alert ok" style="margin-top:14px">
          Product accounting and VAT mappings are complete.
        </div>
      `;
    }

    return `
      <div class="mw-alert warn" style="margin-top:14px">
        ${accountCount?`<div><strong>Account mappings requiring review:</strong> ${accountCount}</div>`:""}
        ${vatCount?`<div><strong>VAT mappings requiring review:</strong> ${vatCount}</div>`:""}
      </div>
    `;
  }

  function productAccountMappingView(){
    const rows=state.products.accounting?.accounts?.items||[];
    if(!rows.length)return "";

    return `
      <div style="margin-top:18px">
        <h3>Account Mapping</h3>

        ${table(
          ["Role","Source Account","Records","FinSage Account","Status"],
          rows.map((row,index)=>[
            `<strong>${esc(productAccountRoleLabel(row.account_role))}</strong>`,

            `
              <strong>${esc(row.source_value)}</strong>
              ${row.source_label&&row.source_label!==row.source_value
                ?`<div class="mw-muted mw-small">${esc(row.source_label)}</div>`
                :""
              }
            `,

            Number(row.sample_count||0).toLocaleString(),

            productAccountSelect(row,index),

            row.is_approved
              ?`<span class="mw-badge ok">Mapped</span>`
              :row.target_account_id
                ?`<span class="mw-badge info">Review</span>`
                :`<span class="mw-badge warn">Unmapped</span>`,
          ]),
          "No source product accounts detected."
        )}
      </div>
    `;
  }

  function productVatMappingView(){
    const rows=state.products.accounting?.vat?.items||[];
    if(!rows.length)return "";

    return `
      <div style="margin-top:18px">
        <h3>VAT Treatment Mapping</h3>

        ${table(
          ["Source VAT","Source Rate","Records","FinSage VAT","Status"],
          rows.map((row,index)=>[
            `<strong>${esc(row.source_value)}</strong>`,

            row.source_rate!==null&&row.source_rate!==undefined
              ?`${Number(row.source_rate).toFixed(2)}%`
              :"—",

            Number(row.sample_count||0).toLocaleString(),

            productVatSelect(row,index),

            row.is_approved
              ?`<span class="mw-badge ok">Mapped</span>`
              :row.target_vat_code
                ?`<span class="mw-badge info">Review</span>`
                :`<span class="mw-badge warn">Unmapped</span>`,
          ]),
          "No VAT treatments detected."
        )}
      </div>
    `;
  }

  function productAccountingPreviewView(){
    const preview=state.products.accountingPreview;
    if(!preview)return "";

    return `
      <div style="margin-top:18px">
        <h3>Accounting Validation</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Records</span>
            <strong>${preview.record_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Warnings</span>
            <strong>${preview.warning_count||0}</strong>
          </div>
        </div>

        ${table(
          ["Item","Type","Inventory / Revenue","Cost","VAT","Status"],
          (preview.items||[]).map(row=>[
            `
              <strong>${esc(row.item_code||"—")}</strong>
              <div class="mw-muted mw-small">${esc(row.item_name||"")}</div>
            `,

            productKindBadge(row.item_kind),

            esc(
              row.accounts?.inventory_account||
              row.accounts?.income_account||
              row.accounts?.revenue_account||
              "—"
            ),

            esc(
              row.accounts?.cogs_account||
              row.accounts?.cost_account||
              "—"
            ),

            esc(row.vat?.target_vat_code||"—"),

            row.valid
              ?`<span class="mw-badge ok">Ready</span>`
              :`<span class="mw-badge error" title="${esc((row.issues||[]).join(" • "))}">
                  ${row.issues?.length||1} issue(s)
                </span>`,
          ]),
          "No product accounting preview available."
        )}
      </div>
    `;
  }

  async function loadInventoryMigration(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.inventoryMigration={
        datasets:[],
        datasetId:null,
        settings:null,
        targets:[],
        mapping:null,
        preview:null,
      };
      state.inventoryMigrationLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryConfiguration(companyId(),projectId)
      );

      const configuration=response?.configuration||{};

      state.inventoryMigration.datasets=configuration.datasets||[];
      state.inventoryMigration.settings=configuration.settings||null;
      state.inventoryMigration.targets=configuration.targets||[];

      if(!state.inventoryMigration.datasets.some(
        row=>Number(row.dataset_id)===Number(state.inventoryMigration.datasetId)
      )){
        state.inventoryMigration.datasetId=
          state.inventoryMigration.datasets[0]?.dataset_id||null;
      }

      if(state.inventoryMigration.datasetId){
        await loadInventoryLocationDataset(
          state.inventoryMigration.datasetId,
          {renderAfter:false}
        );
      }

      state.inventoryMigrationLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadInventoryMigration failed",error);
    }

    if(renderAfter)render();
  }

  async function loadInventoryLocationDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const response=await apiFetch(
      ENDPOINTS.migrations.inventoryLocations(
        companyId(),state.project.id,id
      )
    );

    state.inventoryMigration.datasetId=id;
    state.inventoryMigration.mapping=response?.mapping||null;
    state.inventoryMigration.preview=null;

    if(renderAfter)render();
  }

  async function saveInventoryMigrationSettings(){
    const settings=state.inventoryMigration.settings;
    if(!settings)return;

    state.inventoryMigrationSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryConfiguration(
          companyId(),state.project.id
        ),
        {
          method:"PUT",
          body:JSON.stringify(settings),
        }
      );

      state.inventoryMigration.settings=
        response?.settings||settings;

      notify("Inventory migration settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.inventoryMigrationSaving=false;
      render();
    }
  }

  async function saveInventoryLocationMappings(){
    const rows=state.inventoryMigration.mapping?.items||[];
    if(!rows.length)return;

    const invalid=rows.find(row=>
      row.mapping_action==="map"&&!row.target_location_id
    );

    if(invalid){
      return notify(`Select a FinSage location for "${invalid.source_name}".`);
    }

    state.inventoryLocationSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryLocations(
          companyId(),
          state.project.id,
          state.inventoryMigration.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({
            mappings:rows.map(row=>({
              source_code:row.source_code,
              source_name:row.source_name,
              source_type:row.source_type,
              mapping_action:row.mapping_action,
              target_location_id:row.target_location_id||null,
            })),
          }),
        }
      );

      state.inventoryMigration.mapping=
        response?.mapping||state.inventoryMigration.mapping;

      notify("Inventory location mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.inventoryLocationSaving=false;
      render();
    }
  }

  async function previewInventoryLocations(){
    if(!state.inventoryMigration.datasetId)return;

    state.inventoryLocationPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryLocationsPreview(
          companyId(),
          state.project.id,
          state.inventoryMigration.datasetId
        )
      );

      state.inventoryMigration.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.inventoryLocationPreviewLoading=false;
      render();
    }
  }

  function inventoryMigrationCheck(label,field){
    const checked=Boolean(state.inventoryMigration.settings?.[field]);

    return `
      <label class="mw-check">
        <input type="checkbox"
          ${checked?"checked":""}
          data-mw-inventory-setting="${esc(field)}">
        <span>${esc(label)}</span>
      </label>
    `;
  }


  function inventoryMigrationSelect(label,field,options){
    const value=state.inventoryMigration.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>
        <select class="mw-select" data-mw-inventory-setting="${esc(field)}">
          ${options.map(([id,name])=>`
            <option value="${esc(id)}" ${String(value)===String(id)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function inventoryMigrationView(){
    if(!state.inventoryMigrationLoaded){
      return `<div class="mw-empty">Loading inventory configuration…</div>`;
    }

    const settings=state.inventoryMigration.settings;
    const datasets=state.inventoryMigration.datasets||[];

    if(!settings)return "";

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Inventory Configuration & Locations",
          "Configure stock-control rules and map legacy warehouses, stores and stockrooms before importing opening inventory.",
          `
            <button class="mw-btn"
              data-mw-action="save-inventory-settings"
              ${state.inventoryMigrationSaving?"disabled":""}>
              ${state.inventoryMigrationSaving?"Saving…":"Save configuration"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          ${inventoryMigrationSelect(
            "Valuation Method",
            "valuation_method",
            [
              ["AVG","Weighted Average"],
              ["FIFO","FIFO"],
            ]
          )}

          <div class="mw-field">
            <label>Default Location</label>

            <select class="mw-select" data-mw-inventory-setting="default_location_id">
              <option value="">No default yet</option>

              ${(state.inventoryMigration.targets||[]).map(location=>`
                <option value="${location.id}"
                  ${Number(settings.default_location_id)===Number(location.id)?"selected":""}>
                  ${esc(`${location.code} — ${location.name}`)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="mw-field">
            <label>Stock Policy</label>

            <div class="mw-list">
              ${inventoryMigrationCheck("Require inventory location","require_location")}
              ${inventoryMigrationCheck("Allow negative stock","allow_negative_stock")}
            </div>
          </div>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${inventoryMigrationCheck("Batch tracking","batch_tracking_enabled")}
          ${inventoryMigrationCheck("Expiry-date tracking","expiry_tracking_enabled")}
          ${inventoryMigrationCheck("Serial-number tracking","serial_tracking_enabled")}
        </div>

        ${inventoryLocationMigrationView(datasets)}
      </div>
    `;
  }

  function inventoryLocationMigrationView(datasets){
    if(!datasets.length){
      return `
        <div class="mw-alert" style="margin-top:18px">
          No warehouse/location dataset was supplied. Existing or default FinSage locations can be used for opening inventory.
        </div>
      `;
    }

    const mapping=state.inventoryMigration.mapping;

    return `
      <div style="margin-top:20px">
        ${heading(
          "Warehouse & Location Mapping",
          "Match source warehouses to existing FinSage locations or mark them for creation.",
          `
            <button class="mw-btn"
              data-mw-action="save-inventory-locations"
              ${state.inventoryLocationSaving?"disabled":""}>
              ${state.inventoryLocationSaving?"Saving…":"Save location mappings"}
            </button>

            <button class="mw-btn primary"
              data-mw-action="preview-inventory-locations"
              ${state.inventoryLocationPreviewLoading?"disabled":""}>
              ${state.inventoryLocationPreviewLoading?"Validating…":"Validate locations"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Location Dataset</label>

            <select id="mwInventoryLocationDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.inventoryMigration.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="mw-stat">
            <span>Locations Detected</span>
            <strong>${mapping?.detected_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Create New</span>
            <strong>${mapping?.create_count||0}</strong>
          </div>
        </div>

        ${inventoryLocationMappingTable()}
        ${inventoryLocationPreviewView()}
      </div>
    `;
  }

  function inventoryLocationActionSelect(row,index){
    return `
      <select class="mw-select" data-mw-inventory-location-action="${index}">
        ${[
          ["map","Map Existing"],
          ["create","Create New"],
          ["ignore","Ignore"],
        ].map(([value,label])=>`
          <option value="${value}" ${row.mapping_action===value?"selected":""}>
            ${label}
          </option>
        `).join("")}
      </select>
    `;
  }

  function inventoryLocationTargetSelect(row,index){
    if(row.mapping_action!=="map"){
      return `<span class="mw-muted">${row.mapping_action==="create"?"New FinSage location":"Not imported"}</span>`;
    }

    return `
      <select class="mw-select" data-mw-inventory-location-target="${index}">
        <option value="">Select location</option>

        ${(state.inventoryMigration.mapping?.targets||[]).map(target=>`
          <option value="${target.id}"
            ${Number(row.target_location_id)===Number(target.id)?"selected":""}>
            ${esc(`${target.code} — ${target.name}`)}
          </option>
        `).join("")}
      </select>
    `;
  }

  function inventoryLocationMappingTable(){
    const rows=state.inventoryMigration.mapping?.items||[];
    if(!rows.length)return "";

    return `
      <div style="margin-top:14px">
        ${table(
          ["Source Code","Location","Type","Records","Action","FinSage Location","Status"],
          rows.map((row,index)=>[
            esc(row.source_code||"—"),
            `<strong>${esc(row.source_name)}</strong>`,
            esc(titleCase(row.source_type||"other")),
            Number(row.sample_count||0).toLocaleString(),
            inventoryLocationActionSelect(row,index),
            inventoryLocationTargetSelect(row,index),

            row.is_approved
              ?`<span class="mw-badge ok">Approved</span>`
              :row.mapping_action==="map"&&row.target_location_id
                ?`<span class="mw-badge info">Review</span>`
                :row.mapping_action==="create"
                  ?`<span class="mw-badge info">Create</span>`
                  :`<span class="mw-badge warn">Pending</span>`,
          ]),
          "No locations detected."
        )}
      </div>
    `;
  }

  function inventoryLocationPreviewView(){
    const preview=state.inventoryMigration.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:18px">
        <h3>Location Validation</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Locations</span>
            <strong>${preview.record_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Ready</span>
            <strong>${preview.valid_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Warnings</span>
            <strong>${preview.warning_count||0}</strong>
          </div>
        </div>

        ${table(
          ["Code","Location","Type","City","Default","Status"],
          (preview.items||[]).map(row=>{
            const location=row.location||{};

            return [
              `<strong>${esc(location.code||"—")}</strong>`,
              esc(location.name||"—"),
              esc(titleCase(location.location_type||"other")),
              esc(location.city||"—"),
              location.is_default
                ?`<span class="mw-badge info">Default</span>`
                :"—",
              row.valid
                ?`<span class="mw-badge ok">Ready</span>`
                :`<span class="mw-badge error" title="${esc((row.issues||[]).join(" • "))}">
                    ${row.issues?.length||1} issue(s)
                  </span>`,
            ];
          }),
          "No location preview available."
        )}
      </div>
    `;
  }

  async function loadInventoryOpening(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.inventoryOpening={
        datasets:[],
        datasetId:null,
        settings:null,
        preview:null,
        reconciliation:null,
      };
      state.inventoryOpeningLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryOpening(companyId(),projectId)
      );

      state.inventoryOpening.datasets=response?.datasets||[];

      if(!state.inventoryOpening.datasets.some(
        row=>Number(row.dataset_id)===Number(state.inventoryOpening.datasetId)
      )){
        state.inventoryOpening.datasetId=
          state.inventoryOpening.datasets[0]?.dataset_id||null;
      }

      if(state.inventoryOpening.datasetId){
        await loadInventoryOpeningDataset(
          state.inventoryOpening.datasetId,
          {renderAfter:false}
        );
      }

      state.inventoryOpeningLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadInventoryOpening failed",error);
    }

    if(renderAfter)render();
  }

  async function loadInventoryOpeningDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,reconResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.inventoryOpeningSettings(
          companyId(),state.project.id,id
        )
      ),

      apiFetch(
        ENDPOINTS.migrations.inventoryOpeningReconcile(
          companyId(),state.project.id,id
        )
      ),
    ]);

    state.inventoryOpening.datasetId=id;
    state.inventoryOpening.settings=settingsResponse?.settings||null;
    state.inventoryOpening.reconciliation=reconResponse?.reconciliation||null;
    state.inventoryOpening.preview=null;

    if(renderAfter)render();
  }

  async function saveInventoryOpeningSettings(){
    const settings=state.inventoryOpening.settings;
    if(!settings)return;

    state.inventoryOpeningSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryOpeningSettings(
          companyId(),
          state.project.id,
          state.inventoryOpening.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(settings),
        }
      );

      state.inventoryOpening.settings=response?.settings||settings;
      state.inventoryOpening.preview=null;
      state.inventoryOpening.reconciliation=null;

      notify("Opening inventory settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.inventoryOpeningSaving=false;
      render();
    }
  }

  async function previewInventoryOpening(){
    if(!state.inventoryOpening.datasetId)return;

    state.inventoryOpeningPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryOpeningPreview(
          companyId(),
          state.project.id,
          state.inventoryOpening.datasetId
        )
      );

      state.inventoryOpening.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.inventoryOpeningPreviewLoading=false;
      render();
    }
  }

  async function reconcileInventoryOpening(){
    if(!state.inventoryOpening.datasetId)return;

    state.inventoryOpeningReconciling=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryOpeningReconcile(
          companyId(),
          state.project.id,
          state.inventoryOpening.datasetId
        ),
        {
          method:"POST",
          body:JSON.stringify({}),
        }
      );

      state.inventoryOpening.reconciliation=
        response?.reconciliation||null;

      state.inventoryOpening.preview=
        response?.reconciliation?.preview||
        state.inventoryOpening.preview;

      if(state.inventoryOpening.reconciliation?.is_ready){
        notify("Opening inventory reconciled and ready.");
      }else{
        notify(
          `${state.inventoryOpening.reconciliation?.error_count||0} opening inventory issue(s) require attention.`
        );
      }

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.inventoryOpeningReconciling=false;
      render();
    }
  }

  function inventoryOpeningCheck(label,field){
    const checked=Boolean(state.inventoryOpening.settings?.[field]);

    return `
      <label class="mw-check">
        <input type="checkbox"
          ${checked?"checked":""}
          data-mw-inventory-opening-setting="${esc(field)}">
        <span>${esc(label)}</span>
      </label>
    `;
  }

  function inventoryOpeningSelect(label,field,options){
    const value=state.inventoryOpening.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select"
          data-mw-inventory-opening-setting="${esc(field)}">

          ${options.map(([id,name])=>`
            <option value="${esc(id)}" ${String(value)===String(id)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function inventoryOpeningInput(label,field,type="text"){
    const value=state.inventoryOpening.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <input class="mw-input"
          type="${esc(type)}"
          value="${esc(value)}"
          data-mw-inventory-opening-setting="${esc(field)}">
      </div>
    `;
  }

  function inventoryOpeningMigrationView(){
    const datasets=state.inventoryOpening.datasets||[];
    const settings=state.inventoryOpening.settings;

    if(!datasets.length)return "";
    if(!settings)return `<div class="mw-empty">Loading opening inventory…</div>`;

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Opening Inventory",
          "Reconstruct stock quantities and carrying values at the FinSage cutover date.",
          `
            <button class="mw-btn"
              data-mw-action="save-inventory-opening-settings"
              ${state.inventoryOpeningSaving?"disabled":""}>
              ${state.inventoryOpeningSaving?"Saving…":"Save settings"}
            </button>

            <button class="mw-btn"
              data-mw-action="preview-inventory-opening"
              ${state.inventoryOpeningPreviewLoading?"disabled":""}>
              ${state.inventoryOpeningPreviewLoading?"Validating…":"Validate opening stock"}
            </button>

            <button class="mw-btn primary"
              data-mw-action="reconcile-inventory-opening"
              ${state.inventoryOpeningReconciling?"disabled":""}>
              ${state.inventoryOpeningReconciling?"Reconciling…":"Reconcile inventory"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Opening Stock Dataset</label>

            <select id="mwInventoryOpeningDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.inventoryOpening.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          ${inventoryOpeningInput("Opening Date","opening_date","date")}

          ${inventoryOpeningSelect(
            "Quantity Basis",
            "quantity_basis",
            [
              ["quantity_on_hand","Quantity On Hand"],
              ["available_quantity","Available Quantity"],
            ]
          )}
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${inventoryOpeningSelect(
            "Cost Basis",
            "cost_basis",
            [
              ["unit_cost","Unit Cost"],
              ["average_cost","Average Cost"],
              ["total_value","Source Total Value"],
            ]
          )}

          ${inventoryOpeningInput("Value Tolerance","value_tolerance","number")}

          <div class="mw-field">
            <label>Validation</label>

            <div class="mw-list">
              ${inventoryOpeningCheck("Require inventory cost","require_cost")}
              ${inventoryOpeningCheck("Validate source inventory value","validate_source_value")}
            </div>
          </div>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${inventoryOpeningCheck("Allow zero quantity","allow_zero_quantity")}
          ${inventoryOpeningCheck("Allow zero cost","allow_zero_cost")}
          ${inventoryOpeningCheck("Allow negative quantity","allow_negative_quantity")}
        </div>

        ${inventoryOpeningPreviewView()}
        ${inventoryOpeningReconciliationView()}
      </div>
    `;
  }

  function inventoryOpeningPreviewView(){
    const preview=state.inventoryOpening.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:20px">
        <h3>Opening Inventory Preview</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Records</span>
            <strong>${preview.record_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Items</span>
            <strong>${preview.item_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Total Quantity</span>
            <strong>${Number(preview.total_quantity||0).toLocaleString()}</strong>
          </div>

          <div class="mw-stat">
            <span>Inventory Value</span>
            <strong>${money(preview.calculated_inventory_value||0)}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>
        </div>

        ${inventoryOpeningPreviewTable(preview.items||[])}
      </div>
    `;
  }

  function inventoryOpeningPreviewTable(rows){
    return `
      <div style="margin-top:14px">
        ${table(
          [
            "Item",
            "Location",
            "Quantity",
            "Unit Cost",
            "Calculated Value",
            "Source Value",
            "Batch / Serial",
            "Status",
          ],

          rows.map(row=>[
            `
              <strong>${esc(row.item?.code||"—")}</strong>
              <div class="mw-muted mw-small">${esc(row.item?.name||"")}</div>
            `,

            esc(
              row.location
                ?`${row.location.code||""}${row.location.name?` — ${row.location.name}`:""}`
                :"—"
            ),

            Number(row.quantity||0).toLocaleString(),

            money(row.unit_cost||0),

            money(row.calculated_value||0),

            money(row.source_value||0),

            `
              ${row.batch_no?`Batch: ${esc(row.batch_no)}<br>`:""}
              ${row.serial_number?`Serial: ${esc(row.serial_number)}`:""}
              ${row.expiry_date?`<span class="mw-muted mw-small">Expiry: ${esc(row.expiry_date)}</span>`:""}
            `||"—",

            row.valid
              ?`<span class="mw-badge ok">Ready</span>`
              :`<span class="mw-badge error" title="${esc((row.issues||[]).join(" • "))}">
                  ${row.issues?.length||1} issue(s)
                </span>`,
          ]),

          "No opening inventory rows available."
        )}
      </div>
    `;
  }

  function inventoryOpeningReconciliationView(){
    const recon=state.inventoryOpening.reconciliation;
    if(!recon)return "";

    return `
      <div style="margin-top:20px">
        <h3>Inventory Reconciliation</h3>

        <div class="mw-alert ${recon.is_ready?"ok":"error"}">
          <div class="mw-inline" style="justify-content:space-between">
            <div>
              <strong>
                ${recon.is_ready
                  ?"Opening inventory is reconciled"
                  :"Opening inventory requires attention"
                }
              </strong>

              <div class="mw-muted mw-small" style="margin-top:4px">
                ${recon.is_ready
                  ?"The opening quantity and carrying value are ready for the later migration commit."
                  :`${recon.error_count||0} blocking issue(s) remain.`
                }
              </div>
            </div>

            <span class="mw-badge ${recon.is_ready?"ok":"error"}">
              ${recon.is_ready?"Ready":"Blocked"}
            </span>
          </div>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-card">
            <div class="mw-muted mw-small">Calculated Inventory</div>
            <strong>${money(recon.calculated_inventory_value||0)}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Source Inventory</div>
            <strong>${money(recon.source_inventory_value||0)}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Difference</div>
            <strong>${money(recon.reconciliation_difference||0)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  async function loadInventoryMovements(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.inventoryMovements={
        datasets:[],
        datasetId:null,
        settings:null,
        typeMapping:null,
        preview:null,
        reconciliation:null,
      };
      state.inventoryMovementsLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryMovements(companyId(),projectId)
      );

      state.inventoryMovements.datasets=response?.datasets||[];

      if(!state.inventoryMovements.datasets.some(
        row=>Number(row.dataset_id)===Number(state.inventoryMovements.datasetId)
      )){
        state.inventoryMovements.datasetId=
          state.inventoryMovements.datasets[0]?.dataset_id||null;
      }

      if(state.inventoryMovements.datasetId){
        await loadInventoryMovementDataset(
          state.inventoryMovements.datasetId,
          {renderAfter:false}
        );
      }

      state.inventoryMovementsLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadInventoryMovements failed",error);
    }

    if(renderAfter)render();
  }

  async function loadInventoryMovementDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,typeResponse,reconResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.inventoryMovementSettings(
          companyId(),state.project.id,id
        )
      ),
      apiFetch(
        ENDPOINTS.migrations.inventoryMovementTypes(
          companyId(),state.project.id,id
        )
      ),
      apiFetch(
        ENDPOINTS.migrations.inventoryMovementReconcile(
          companyId(),state.project.id,id
        )
      ),
    ]);

    state.inventoryMovements.datasetId=id;
    state.inventoryMovements.settings=settingsResponse?.settings||null;
    state.inventoryMovements.typeMapping=typeResponse?.mapping||null;
    state.inventoryMovements.reconciliation=reconResponse?.reconciliation||null;
    state.inventoryMovements.preview=null;

    if(renderAfter)render();
  }

  async function saveInventoryMovementSettings(){
    const settings=state.inventoryMovements.settings;
    if(!settings)return;

    state.inventoryMovementsSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryMovementSettings(
          companyId(),
          state.project.id,
          state.inventoryMovements.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(settings),
        }
      );

      state.inventoryMovements.settings=response?.settings||settings;
      state.inventoryMovements.preview=null;
      state.inventoryMovements.reconciliation=null;

      notify("Inventory movement settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.inventoryMovementsSaving=false;
      render();
    }
  }

  async function saveInventoryMovementTypes(){
    const rows=state.inventoryMovements.typeMapping?.items||[];
    if(!rows.length)return notify("No inventory movement types require mapping.");

    const invalid=rows.find(row=>!row.target_movement_type);
    if(invalid)return notify(`Select a movement type for "${invalid.source_value}".`);

    state.inventoryMovementTypesSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryMovementTypes(
          companyId(),
          state.project.id,
          state.inventoryMovements.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({
            mappings:rows.map(row=>({
              source_value:row.source_value,
              source_label:row.source_label,
              target_movement_type:row.target_movement_type,
            })),
          }),
        }
      );

      state.inventoryMovements.typeMapping=response?.mapping||state.inventoryMovements.typeMapping;

      notify("Inventory movement types saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.inventoryMovementTypesSaving=false;
      render();
    }
  }

  async function previewInventoryMovements(){
    if(!state.inventoryMovements.datasetId)return;

    state.inventoryMovementPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryMovementPreview(
          companyId(),
          state.project.id,
          state.inventoryMovements.datasetId
        )
      );

      state.inventoryMovements.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.inventoryMovementPreviewLoading=false;
      render();
    }
  }

  async function reconcileInventoryMovements(){
    if(!state.inventoryMovements.datasetId)return;

    state.inventoryMovementReconciling=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.inventoryMovementReconcile(
          companyId(),
          state.project.id,
          state.inventoryMovements.datasetId
        ),
        {
          method:"POST",
          body:JSON.stringify({}),
        }
      );

      state.inventoryMovements.reconciliation=response?.reconciliation||null;
      state.inventoryMovements.preview=
        response?.reconciliation?.preview||state.inventoryMovements.preview;

      if(state.inventoryMovements.reconciliation?.is_ready){
        notify("Inventory movement history is reconciled.");
      }else{
        notify(
          `${state.inventoryMovements.reconciliation?.error_count||0} inventory history issue(s) require attention.`
        );
      }

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.inventoryMovementReconciling=false;
      render();
    }
  }

  function inventoryMovementCheck(label,field){
    const checked=Boolean(state.inventoryMovements.settings?.[field]);

    return `
      <label class="mw-check">
        <input type="checkbox"
          ${checked?"checked":""}
          data-mw-inventory-movement-setting="${esc(field)}">
        <span>${esc(label)}</span>
      </label>
    `;
  }

  function inventoryMovementInput(label,field,type="text"){
    const value=state.inventoryMovements.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>
        <input class="mw-input"
          type="${esc(type)}"
          value="${esc(value)}"
          data-mw-inventory-movement-setting="${esc(field)}">
      </div>
    `;
  }

  function inventoryMovementSelect(label,field,options){
    const value=state.inventoryMovements.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select class="mw-select" data-mw-inventory-movement-setting="${esc(field)}">
          ${options.map(([id,name])=>`
            <option value="${esc(id)}" ${String(value)===String(id)?"selected":""}>
              ${esc(name)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function inventoryMovementMigrationView(){
    const datasets=state.inventoryMovements.datasets||[];
    const settings=state.inventoryMovements.settings;

    if(!datasets.length)return "";
    if(!settings)return `<div class="mw-empty">Loading inventory movement history…</div>`;

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "Inventory Movement History",
          "Reconstruct historical receipts, issues, adjustments, transfers and returns before migration commit.",
          `
            <button class="mw-btn"
              data-mw-action="save-inventory-movement-settings"
              ${state.inventoryMovementsSaving?"disabled":""}>
              ${state.inventoryMovementsSaving?"Saving…":"Save settings"}
            </button>

            <button class="mw-btn"
              data-mw-action="save-inventory-movement-types"
              ${state.inventoryMovementTypesSaving?"disabled":""}>
              ${state.inventoryMovementTypesSaving?"Saving…":"Save movement types"}
            </button>

            <button class="mw-btn"
              data-mw-action="preview-inventory-movements"
              ${state.inventoryMovementPreviewLoading?"disabled":""}>
              ${state.inventoryMovementPreviewLoading?"Validating…":"Validate movements"}
            </button>

            <button class="mw-btn primary"
              data-mw-action="reconcile-inventory-movements"
              ${state.inventoryMovementReconciling?"disabled":""}>
              ${state.inventoryMovementReconciling?"Reconciling…":"Reconcile history"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Movement Dataset</label>

            <select id="mwInventoryMovementDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.inventoryMovements.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          ${inventoryMovementInput("History From","history_from","date")}
          ${inventoryMovementInput("History To","history_to","date")}
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${inventoryMovementSelect(
            "Source Layout",
            "source_layout",
            [
              ["movement_rows","Movement Rows"],
              ["transaction_lines","Transaction + Line Rows"],
            ]
          )}

          ${inventoryMovementSelect(
            "Reference Scope",
            "movement_reference_scope",
            [
              ["transaction","One Reference Per Transaction"],
              ["line","Reference Per Line"],
            ]
          )}

          <div class="mw-field">
            <label>Validation</label>

            <div class="mw-list">
              ${inventoryMovementCheck("Require item resolution","require_item_resolution")}
              ${inventoryMovementCheck("Require location resolution","require_location_resolution")}
              ${inventoryMovementCheck("Validate movement value","validate_movement_value")}
            </div>
          </div>
        </div>

        ${inventoryMovementTypeMappingView()}
        ${inventoryMovementPreviewView()}
        ${inventoryMovementReconciliationView()}
      </div>
    `;
  }

  function inventoryMovementTypeMappingView(){
    const rows=state.inventoryMovements.typeMapping?.items||[];
    if(!rows.length)return "";

    const types=[
      ["opening","Opening"],
      ["purchase","Purchase / Receipt"],
      ["sale","Sale"],
      ["issue","Issue / Consumption"],
      ["adjustment_in","Positive Adjustment"],
      ["adjustment_out","Negative Adjustment"],
      ["transfer","Transfer"],
      ["stocktake","Stocktake Adjustment"],
      ["purchase_return","Purchase Return"],
      ["sales_return","Sales Return"],
    ];

    return `
      <div style="margin-top:20px">
        <h3>Movement Type Mapping</h3>

        ${table(
          ["Source Type","Records","FinSage Movement","Status"],
          rows.map((row,index)=>[
            `<strong>${esc(row.source_value)}</strong>`,

            Number(row.sample_count||0).toLocaleString(),

            `
              <select class="mw-select" data-mw-inventory-movement-type="${index}">
                <option value="">Select movement</option>

                ${types.map(([value,label])=>`
                  <option value="${value}" ${row.target_movement_type===value?"selected":""}>
                    ${label}
                  </option>
                `).join("")}
              </select>
            `,

            row.is_approved
              ?`<span class="mw-badge ok">Mapped</span>`
              :row.target_movement_type
                ?`<span class="mw-badge info">Review</span>`
                :`<span class="mw-badge warn">Unmapped</span>`,
          ]),
          "No inventory movement types detected."
        )}
      </div>
    `;
  }

  function inventoryMovementPreviewView(){
    const preview=state.inventoryMovements.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:20px">
        <h3>Movement Preview</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Transactions</span>
            <strong>${preview.transaction_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Lines</span>
            <strong>${preview.line_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Quantity In</span>
            <strong>${Number(preview.quantity_in||0).toLocaleString()}</strong>
          </div>

          <div class="mw-stat">
            <span>Quantity Out</span>
            <strong>${Number(preview.quantity_out||0).toLocaleString()}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>
        </div>

        ${inventoryMovementPreviewTable(preview.items||[])}
      </div>
    `;
  }

  function inventoryMovementPreviewTable(rows){
    return `
      <div style="margin-top:14px">
        ${table(
          [
            "Date",
            "Reference",
            "Type",
            "Item",
            "From",
            "To",
            "Quantity",
            "Value",
            "Status",
          ],

          rows.map(row=>[
            esc(row.movement_date||"—"),

            `<strong>${esc(row.reference||"—")}</strong>`,

            esc(titleCase(row.movement_type||"unmapped")),

            `
              <strong>${esc(row.item?.code||"—")}</strong>
              <div class="mw-muted mw-small">${esc(row.item?.name||"")}</div>
            `,

            esc(row.location?.name||row.location?.code||"—"),

            esc(row.destination_location?.name||row.destination_location?.code||"—"),

            Number(row.quantity||0).toLocaleString(),

            money(row.movement_value||0),

            row.valid
              ?`<span class="mw-badge ok">Ready</span>`
              :`<span class="mw-badge error" title="${esc((row.issues||[]).join(" • "))}">
                  ${row.issues?.length||1} issue(s)
                </span>`,
          ]),

          "No inventory movement rows available."
        )}
      </div>
    `;
  }

  function inventoryMovementReconciliationView(){
    const recon=state.inventoryMovements.reconciliation;
    if(!recon)return "";

    const summary=recon.summary_json||{};

    return `
      <div style="margin-top:20px">
        <h3>Inventory History Reconciliation</h3>

        <div class="mw-alert ${recon.is_ready?"ok":"error"}">
          <strong>
            ${recon.is_ready
              ?"Inventory movement history is reconciled"
              :"Inventory movement history requires attention"
            }
          </strong>
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-card">
            <div class="mw-muted mw-small">Opening Quantity</div>
            <strong>${Number(summary.opening_quantity||0).toLocaleString()}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Net Movement</div>
            <strong>${Number(summary.net_movement_quantity||0).toLocaleString()}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Derived Quantity</div>
            <strong>${Number(summary.derived_quantity_after_movements||0).toLocaleString()}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Opening Value</div>
            <strong>${money(summary.opening_value||0)}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Net Movement Value</div>
            <strong>${money(summary.net_movement_value||0)}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Derived Inventory Value</div>
            <strong>${money(summary.derived_value_after_movements||0)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  async function loadPosMigration(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.posMigration={
        datasets:[],
        datasetId:null,
        settings:null,
        terminals:null,
        paymentMethods:null,
        catalogue:null,
        preview:null,
        reconciliation:null,
      };
      state.posMigrationLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posConfiguration(companyId(),projectId)
      );

      state.posMigration.datasets=response?.datasets||[];
      state.posMigration.settings=response?.settings||null;
      state.posMigration.reconciliation=response?.reconciliation||null;

      if(!state.posMigration.datasets.some(
        row=>Number(row.dataset_id)===Number(state.posMigration.datasetId)
      )){
        state.posMigration.datasetId=
          state.posMigration.datasets[0]?.dataset_id||null;
      }

      if(state.posMigration.datasetId){
        await loadPosDataset(
          state.posMigration.datasetId,
          {renderAfter:false}
        );
      }

      state.posMigrationLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadPosMigration failed",error);
    }

    if(renderAfter)render();
  }

  async function loadPosDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [terminalResponse,paymentResponse,catalogueResponse]=await Promise.all([
      apiFetch(ENDPOINTS.migrations.posTerminals(companyId(),state.project.id,id)),
      apiFetch(ENDPOINTS.migrations.posPaymentMethods(companyId(),state.project.id,id)),
      apiFetch(ENDPOINTS.migrations.posCatalogue(companyId(),state.project.id,id)),
    ]);

    state.posMigration.datasetId=id;
    state.posMigration.terminals=terminalResponse?.mapping||null;
    state.posMigration.paymentMethods=paymentResponse?.mapping||null;
    state.posMigration.catalogue=catalogueResponse?.mapping||null;
    state.posMigration.preview=null;

    if(renderAfter)render();
  }

  async function savePosSettings(){
    if(!state.posMigration.settings)return;

    state.posMigrationSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posConfiguration(
          companyId(),state.project.id
        ),
        {
          method:"PUT",
          body:JSON.stringify(state.posMigration.settings),
        }
      );

      state.posMigration.settings=
        response?.settings||state.posMigration.settings;

      notify("POS migration configuration saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posMigrationSaving=false;
      render();
    }
  }

  async function savePosTerminals(){
    const rows=state.posMigration.terminals?.items||[];
    if(!rows.length)return;

    const invalid=rows.find(row=>
      row.mapping_action==="map"&&!row.target_terminal_id
    );

    if(invalid)return notify(`Select a terminal for "${invalid.source_name}".`);

    state.posMappingSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posTerminals(
          companyId(),state.project.id,state.posMigration.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings:rows}),
        }
      );

      state.posMigration.terminals=
        response?.mapping||state.posMigration.terminals;

      notify("POS terminal mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posMappingSaving=false;
      render();
    }
  }

  async function savePosPaymentMethods(){
    const rows=state.posMigration.paymentMethods?.items||[];
    if(!rows.length)return;

    const invalid=rows.find(row=>!row.target_payment_method);
    if(invalid)return notify(`Select a payment method for "${invalid.source_value}".`);

    state.posMappingSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posPaymentMethods(
          companyId(),state.project.id,state.posMigration.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings:rows}),
        }
      );

      state.posMigration.paymentMethods=
        response?.mapping||state.posMigration.paymentMethods;

      notify("POS payment methods saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posMappingSaving=false;
      render();
    }
  }

  async function savePosCatalogue(){
    const rows=state.posMigration.catalogue?.items||[];
    if(!rows.length)return;

    const invalid=rows.find(row=>!row.target_kind);
    if(invalid)return notify(`Resolve product type for "${invalid.source_name}".`);

    state.posMappingSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posCatalogue(
          companyId(),state.project.id,state.posMigration.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings:rows}),
        }
      );

      state.posMigration.catalogue=
        response?.mapping||state.posMigration.catalogue;

      notify("POS catalogue mappings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posMappingSaving=false;
      render();
    }
  }

  async function previewPosMigration(){
    if(!state.posMigration.datasetId)return;

    state.posPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posPreview(
          companyId(),state.project.id,state.posMigration.datasetId
        )
      );

      state.posMigration.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posPreviewLoading=false;
      render();
    }
  }

  async function reconcilePosMigration(){
    state.posReconciling=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posReconcile(
          companyId(),state.project.id
        ),
        {
          method:"POST",
          body:JSON.stringify({}),
        }
      );

      state.posMigration.reconciliation=
        response?.reconciliation||null;

      if(state.posMigration.reconciliation?.is_ready){
        notify("POS configuration is ready.");
      }else{
        notify(
          `${state.posMigration.reconciliation?.blocking_error_count||0} POS issue(s) require attention.`
        );
      }

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posReconciling=false;
      render();
    }
  }

  function posMigrationCheck(label,field){
    const checked=Boolean(state.posMigration.settings?.[field]);

    return `
      <label class="mw-check">
        <input type="checkbox"
          ${checked?"checked":""}
          data-mw-pos-setting="${esc(field)}">
        <span>${esc(label)}</span>
      </label>
    `;
  }

  function posMigrationView(){
    const datasets=state.posMigration.datasets||[];
    const settings=state.posMigration.settings;

    if(!datasets.length)return "";
    if(!settings)return `<div class="mw-empty">Loading POS migration…</div>`;

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "POS Configuration & Catalogue",
          "Map tills, payment methods and saleable products before importing POS transaction history.",
          `
            <button class="mw-btn"
              data-mw-action="save-pos-settings"
              ${state.posMigrationSaving?"disabled":""}>
              ${state.posMigrationSaving?"Saving…":"Save configuration"}
            </button>

            <button class="mw-btn"
              data-mw-action="preview-pos"
              ${state.posPreviewLoading?"disabled":""}>
              ${state.posPreviewLoading?"Validating…":"Validate POS"}
            </button>

            <button class="mw-btn primary"
              data-mw-action="reconcile-pos"
              ${state.posReconciling?"disabled":""}>
              ${state.posReconciling?"Reconciling…":"Reconcile POS"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>POS Dataset</label>

            <select id="mwPosDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.posMigration.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="mw-field">
            <label>Migration Content</label>

            <div class="mw-list">
              ${posMigrationCheck("Migrate terminals","migrate_terminals")}
              ${posMigrationCheck("Migrate payment methods","migrate_payment_methods")}
              ${posMigrationCheck("Migrate POS catalogue","migrate_catalogue")}
            </div>
          </div>

          <div class="mw-field">
            <label>Allowed Item Types</label>

            <div class="mw-list">
              ${posMigrationCheck("Services","allow_services")}
              ${posMigrationCheck("Non-stock products","allow_non_stock")}
              ${posMigrationCheck("Menu items","allow_menu_items")}
            </div>
          </div>
        </div>

        ${posTerminalMappingView()}
        ${posPaymentMethodMappingView()}
        ${posCatalogueMappingView()}
        ${posPreviewView()}
        ${posReconciliationView()}
      </div>
    `;
  }

  function posTerminalMappingView(){
    const rows=state.posMigration.terminals?.items||[];
    if(!rows.length)return "";

    return `
      <div style="margin-top:20px">
        ${heading(
          "POS Terminals",
          "Map source tills/registers or mark them for creation.",
          `
            <button class="mw-btn"
              data-mw-action="save-pos-terminals"
              ${state.posMappingSaving?"disabled":""}>
              Save terminals
            </button>
          `
        )}

        ${table(
          ["Code","Terminal","Location","Action","FinSage Terminal","Status"],
          rows.map((row,index)=>[
            esc(row.source_code||"—"),
            `<strong>${esc(row.source_name)}</strong>`,
            esc(row.source_location_name||row.source_location_code||"—"),

            `
              <select class="mw-select" data-mw-pos-terminal-action="${index}">
                ${[
                  ["map","Map Existing"],
                  ["create","Create New"],
                  ["ignore","Ignore"],
                ].map(([value,label])=>`
                  <option value="${value}" ${row.mapping_action===value?"selected":""}>
                    ${label}
                  </option>
                `).join("")}
              </select>
            `,

            row.mapping_action==="map"
              ?`
                <select class="mw-select" data-mw-pos-terminal-target="${index}">
                  <option value="">Select terminal</option>

                  ${(state.posMigration.terminals?.targets||[]).map(target=>`
                    <option value="${target.id}"
                      ${Number(row.target_terminal_id)===Number(target.id)?"selected":""}>
                      ${esc(`${target.code||""} — ${target.name}`)}
                    </option>
                  `).join("")}
                </select>
              `
              :`<span class="mw-muted">${row.mapping_action==="create"?"New terminal":"Ignored"}</span>`,

            row.is_approved
              ?`<span class="mw-badge ok">Approved</span>`
              :`<span class="mw-badge info">Review</span>`,
          ]),
          "No POS terminals detected."
        )}
      </div>
    `;
  }

  function posPaymentMethodMappingView(){
    const rows=state.posMigration.paymentMethods?.items||[];
    if(!rows.length)return "";

    const methods=[
      ["cash","Cash"],
      ["card","Card"],
      ["eft","EFT / Bank Transfer"],
      ["mobile_money","Mobile Money"],
      ["voucher","Voucher"],
      ["credit","Customer Credit"],
      ["other","Other"],
    ];

    return `
      <div style="margin-top:20px">
        ${heading(
          "POS Payment Methods",
          "Map source tender types to FinSage payment methods.",
          `
            <button class="mw-btn"
              data-mw-action="save-pos-payment-methods"
              ${state.posMappingSaving?"disabled":""}>
              Save payment methods
            </button>
          `
        )}

        ${table(
          ["Source Payment","Records","FinSage Method","Status"],
          rows.map((row,index)=>[
            `<strong>${esc(row.source_value)}</strong>`,

            Number(row.sample_count||0).toLocaleString(),

            `
              <select class="mw-select" data-mw-pos-payment="${index}">
                ${methods.map(([value,label])=>`
                  <option value="${value}"
                    ${row.target_payment_method===value?"selected":""}>
                    ${label}
                  </option>
                `).join("")}
              </select>
            `,

            row.is_approved
              ?`<span class="mw-badge ok">Mapped</span>`
              :`<span class="mw-badge info">Review</span>`,
          ]),
          "No POS payment methods detected."
        )}
      </div>
    `;
  }

  function posCatalogueMappingView(){
    const rows=state.posMigration.catalogue?.items||[];
    if(!rows.length)return "";

    return `
      <div style="margin-top:20px">
        ${heading(
          "Saleable Catalogue",
          "Confirm the inventory items, services and menu items available through POS.",
          `
            <button class="mw-btn"
              data-mw-action="save-pos-catalogue"
              ${state.posMappingSaving?"disabled":""}>
              Save catalogue
            </button>
          `
        )}

        ${table(
          ["Code","Item","Type","Barcode","Price","Target","Status"],
          rows.map(row=>[
            `<strong>${esc(row.source_code||"—")}</strong>`,

            esc(row.source_name||"—"),

            productKindBadge(row.target_kind),

            esc(row.source_barcode||"—"),

            money(row.sale_price||0),

            esc(row.target_item_name||row.target_item_code||(
              row.mapping_action==="create"?"Create at commit":"—"
            )),

            row.is_approved
              ?`<span class="mw-badge ok">Approved</span>`
              :row.target_kind
                ?`<span class="mw-badge info">Review</span>`
                :`<span class="mw-badge warn">Unresolved</span>`,
          ]),
          "No POS catalogue items detected."
        )}
      </div>
    `;
  }

  function posPreviewView(){
    const preview=state.posMigration.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:20px">
        <h3>POS Validation</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Terminals</span>
            <strong>${preview.terminal_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Payment Methods</span>
            <strong>${preview.payment_method_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Saleable Items</span>
            <strong>${preview.catalogue_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Warnings</span>
            <strong>${preview.warning_count||0}</strong>
          </div>
        </div>

        ${preview.error_count
          ?`
            <div class="mw-alert error" style="margin-top:14px">
              ${(preview.issues||[]).map(issue=>`<div>${esc(issue)}</div>`).join("")}
            </div>
          `
          :`
            <div class="mw-alert ok" style="margin-top:14px">
              POS configuration passed validation.
            </div>
          `
        }
      </div>
    `;
  }

  function posReconciliationView(){
    const recon=state.posMigration.reconciliation;
    if(!recon)return "";

    return `
      <div style="margin-top:20px">
        <h3>POS Migration Readiness</h3>

        <div class="mw-alert ${recon.is_ready?"ok":"error"}">
          <strong>
            ${recon.is_ready
              ?"POS configuration is ready"
              :"POS configuration is blocked"
            }
          </strong>

          ${!recon.is_ready
            ?`<div class="mw-muted mw-small" style="margin-top:4px">
                ${recon.blocking_error_count||0} blocking issue(s) remain.
              </div>`
            :""
          }
        </div>
      </div>
    `;
  }

  async function loadPosMenuMigration(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.posMenuMigration={
        datasets:[],
        datasetId:null,
        settings:null,
        menuItems:null,
        components:null,
        addons:null,
        preview:null,
        reconciliation:null,
      };
      state.posMenuMigrationLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posMenu(companyId(),projectId)
      );

      state.posMenuMigration.datasets=response?.datasets||[];

      if(!state.posMenuMigration.datasets.some(
        row=>Number(row.dataset_id)===Number(state.posMenuMigration.datasetId)
      )){
        state.posMenuMigration.datasetId=
          state.posMenuMigration.datasets[0]?.dataset_id||null;
      }

      if(state.posMenuMigration.datasetId){
        await loadPosMenuDataset(
          state.posMenuMigration.datasetId,
          {renderAfter:false}
        );
      }

      state.posMenuMigrationLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadPosMenuMigration failed",error);
    }

    if(renderAfter)render();
  }

  async function loadPosMenuDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [
      settingsResponse,
      menuResponse,
      componentResponse,
      addonResponse,
      reconResponse
    ]=await Promise.all([
      apiFetch(ENDPOINTS.migrations.posMenuSettings(companyId(),state.project.id,id)),
      apiFetch(ENDPOINTS.migrations.posMenuItems(companyId(),state.project.id,id)),
      apiFetch(ENDPOINTS.migrations.posMenuComponents(companyId(),state.project.id,id)),
      apiFetch(ENDPOINTS.migrations.posMenuAddons(companyId(),state.project.id,id)),
      apiFetch(ENDPOINTS.migrations.posMenuReconcile(companyId(),state.project.id,id)),
    ]);

    state.posMenuMigration.datasetId=id;
    state.posMenuMigration.settings=settingsResponse?.settings||null;
    state.posMenuMigration.menuItems=menuResponse?.mapping||null;
    state.posMenuMigration.components=componentResponse?.mapping||null;
    state.posMenuMigration.addons=addonResponse?.mapping||null;
    state.posMenuMigration.reconciliation=reconResponse?.reconciliation||null;
    state.posMenuMigration.preview=null;

    if(renderAfter)render();
  }

  async function savePosMenuSettings(){
    if(!state.posMenuMigration.settings)return;

    state.posMenuMigrationSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posMenuSettings(
          companyId(),state.project.id,state.posMenuMigration.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(state.posMenuMigration.settings),
        }
      );

      state.posMenuMigration.settings=
        response?.settings||state.posMenuMigration.settings;

      state.posMenuMigration.preview=null;
      state.posMenuMigration.reconciliation=null;

      notify("POS menu settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posMenuMigrationSaving=false;
      render();
    }
  }

  async function savePosMenuItems(){
    const rows=state.posMenuMigration.menuItems?.items||[];
    if(!rows.length)return;

    const invalid=rows.find(row=>
      row.mapping_action==="map"&&!row.target_menu_item_id
    );

    if(invalid)return notify(`Select a FinSage menu item for "${invalid.source_menu_name}".`);

    state.posMenuMappingSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posMenuItems(
          companyId(),state.project.id,state.posMenuMigration.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings:rows}),
        }
      );

      state.posMenuMigration.menuItems=
        response?.mapping||state.posMenuMigration.menuItems;

      notify("POS menu items saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posMenuMappingSaving=false;
      render();
    }
  }

  async function savePosMenuComponents(){
    const rows=state.posMenuMigration.components?.items||[];
    if(!rows.length)return;

    const invalid=rows.find(row=>
      row.mapping_action==="map"&&!row.target_item_id&&!row.target_item_code
    );

    if(invalid)return notify(`Resolve component "${invalid.source_component_name}".`);

    state.posMenuMappingSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posMenuComponents(
          companyId(),state.project.id,state.posMenuMigration.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings:rows}),
        }
      );

      state.posMenuMigration.components=
        response?.mapping||state.posMenuMigration.components;

      notify("POS recipe components saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posMenuMappingSaving=false;
      render();
    }
  }

  async function savePosMenuAddons(){
    const rows=state.posMenuMigration.addons?.items||[];
    if(!rows.length)return;

    state.posMenuMappingSaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posMenuAddons(
          companyId(),state.project.id,state.posMenuMigration.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify({mappings:rows}),
        }
      );

      state.posMenuMigration.addons=
        response?.mapping||state.posMenuMigration.addons;

      notify("POS menu add-ons saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posMenuMappingSaving=false;
      render();
    }
  }

  async function previewPosMenu(){
    if(!state.posMenuMigration.datasetId)return;

    state.posMenuPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posMenuPreview(
          companyId(),state.project.id,state.posMenuMigration.datasetId
        )
      );

      state.posMenuMigration.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posMenuPreviewLoading=false;
      render();
    }
  }

  async function reconcilePosMenu(){
    if(!state.posMenuMigration.datasetId)return;

    state.posMenuReconciling=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posMenuReconcile(
          companyId(),state.project.id,state.posMenuMigration.datasetId
        ),
        {
          method:"POST",
          body:JSON.stringify({}),
        }
      );

      state.posMenuMigration.reconciliation=
        response?.reconciliation||null;

      state.posMenuMigration.preview=
        response?.reconciliation?.preview||
        state.posMenuMigration.preview;

      if(state.posMenuMigration.reconciliation?.is_ready){
        notify("POS menu and recipe migration is ready.");
      }else{
        notify(
          `${state.posMenuMigration.reconciliation?.blocking_error_count||0} POS menu issue(s) require attention.`
        );
      }

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posMenuReconciling=false;
      render();
    }
  }

  function posMenuCheck(label,field){
    const checked=Boolean(state.posMenuMigration.settings?.[field]);

    return `
      <label class="mw-check">
        <input type="checkbox"
          ${checked?"checked":""}
          data-mw-pos-menu-setting="${esc(field)}">
        <span>${esc(label)}</span>
      </label>
    `;
  }

  function posMenuMigrationView(){
    const datasets=state.posMenuMigration.datasets||[];
    const settings=state.posMenuMigration.settings;

    if(!datasets.length)return "";
    if(!settings)return `<div class="mw-empty">Loading POS menu migration…</div>`;

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "POS Menu, Recipes & Components",
          "Map menu items to their inventory ingredients, recipe quantities and optional add-ons before importing POS sales history.",
          `
            <button class="mw-btn"
              data-mw-action="save-pos-menu-settings"
              ${state.posMenuMigrationSaving?"disabled":""}>
              ${state.posMenuMigrationSaving?"Saving…":"Save settings"}
            </button>

            <button class="mw-btn"
              data-mw-action="preview-pos-menu"
              ${state.posMenuPreviewLoading?"disabled":""}>
              ${state.posMenuPreviewLoading?"Validating…":"Validate menu"}
            </button>

            <button class="mw-btn primary"
              data-mw-action="reconcile-pos-menu"
              ${state.posMenuReconciling?"disabled":""}>
              ${state.posMenuReconciling?"Reconciling…":"Reconcile menu"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>Menu Dataset</label>

            <select id="mwPosMenuDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.posMenuMigration.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="mw-field">
            <label>Recipe Controls</label>

            <div class="mw-list">
              ${posMenuCheck("Require menu code","require_menu_code")}
              ${posMenuCheck("Require component resolution","require_component_resolution")}
              ${posMenuCheck("Validate recipe cost","validate_recipe_cost")}
            </div>
          </div>

          <div class="mw-field">
            <label>Component Types</label>

            <div class="mw-list">
              ${posMenuCheck("Allow service components","allow_service_components")}
              ${posMenuCheck("Allow non-stock components","allow_non_stock_components")}
            </div>
          </div>
        </div>

        ${posMenuItemMappingView()}
        ${posMenuComponentMappingView()}
        ${posMenuAddonMappingView()}
        ${posMenuPreviewView()}
        ${posMenuReconciliationView()}
      </div>
    `;
  }

  function posMenuItemMappingView(){
    const rows=state.posMenuMigration.menuItems?.items||[];
    if(!rows.length)return "";

    return `
      <div style="margin-top:20px">
        ${heading(
          "Menu Items",
          "Match existing FinSage menu items or mark legacy menu items for creation.",
          `
            <button class="mw-btn"
              data-mw-action="save-pos-menu-items"
              ${state.posMenuMappingSaving?"disabled":""}>
              Save menu items
            </button>
          `
        )}

        ${table(
          ["Code","Menu Item","Category","Price","Recipe Cost","Action","Status"],
          rows.map((row,index)=>[
            esc(row.source_menu_code||"—"),

            `<strong>${esc(row.source_menu_name)}</strong>`,

            esc(row.source_category||"—"),

            money(row.sale_price||0),

            money(row.source_recipe_cost||0),

            `
              <select class="mw-select" data-mw-pos-menu-action="${index}">
                ${[
                  ["map","Map Existing"],
                  ["create","Create New"],
                  ["ignore","Ignore"],
                ].map(([value,label])=>`
                  <option value="${value}" ${row.mapping_action===value?"selected":""}>
                    ${label}
                  </option>
                `).join("")}
              </select>
            `,

            row.is_approved
              ?`<span class="mw-badge ok">Approved</span>`
              :`<span class="mw-badge info">Review</span>`,
          ]),
          "No menu items detected."
        )}
      </div>
    `;
  }

  function posMenuComponentMappingView(){
    const rows=state.posMenuMigration.components?.items||[];
    if(!rows.length)return "";

    return `
      <div style="margin-top:20px">
        ${heading(
          "Recipe Components",
          "Confirm which inventory items are consumed when each POS menu item is sold.",
          `
            <button class="mw-btn"
              data-mw-action="save-pos-menu-components"
              ${state.posMenuMappingSaving?"disabled":""}>
              Save components
            </button>
          `
        )}

        ${table(
          [
            "Menu",
            "Component",
            "Type",
            "Quantity",
            "UOM",
            "Unit Cost",
            "Component Cost",
            "Target",
            "Status",
          ],

          rows.map(row=>[
            `<strong>${esc(row.source_menu_name)}</strong>`,

            `
              ${esc(row.source_component_code||"—")}
              <div class="mw-muted mw-small">${esc(row.source_component_name)}</div>
            `,

            productKindBadge(row.component_kind),

            Number(row.quantity||0).toLocaleString(),

            esc(row.uom||"—"),

            money(row.source_unit_cost||0),

            money(row.calculated_component_cost||0),

            esc(
              row.target_item_name||
              row.target_item_code||
              (row.mapping_action==="create"?"Create at commit":"—")
            ),

            row.is_approved
              ?`<span class="mw-badge ok">Approved</span>`
              :row.target_item_code
                ?`<span class="mw-badge info">Review</span>`
                :`<span class="mw-badge warn">Unresolved</span>`,
          ]),

          "No recipe components detected."
        )}
      </div>
    `;
  }

  function posMenuAddonMappingView(){
    const rows=state.posMenuMigration.addons?.items||[];
    if(!rows.length)return "";

    return `
      <div style="margin-top:20px">
        ${heading(
          "Menu Add-ons",
          "Map optional extras and modifiers offered with menu items.",
          `
            <button class="mw-btn"
              data-mw-action="save-pos-menu-addons"
              ${state.posMenuMappingSaving?"disabled":""}>
              Save add-ons
            </button>
          `
        )}

        ${table(
          ["Menu","Add-on","Price","Cost","Target","Default","Status"],
          rows.map(row=>[
            `<strong>${esc(row.source_menu_name)}</strong>`,

            esc(row.addon_name||"—"),

            money(row.additional_price||0),

            money(row.additional_cost||0),

            esc(
              row.target_item_name||
              row.target_item_code||
              (row.mapping_action==="create"?"Create at commit":"—")
            ),

            row.is_default
              ?`<span class="mw-badge info">Default</span>`
              :"—",

            row.is_approved
              ?`<span class="mw-badge ok">Approved</span>`
              :`<span class="mw-badge info">Review</span>`,
          ]),
          "No menu add-ons detected."
        )}
      </div>
    `;
  }

  function posMenuPreviewView(){
    const preview=state.posMenuMigration.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:20px">
        <h3>Menu & Recipe Validation</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Menu Items</span>
            <strong>${preview.menu_item_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Components</span>
            <strong>${preview.component_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Add-ons</span>
            <strong>${preview.addon_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Recipe Cost</span>
            <strong>${money(preview.total_recipe_cost||0)}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>
        </div>

        ${table(
          ["Menu Item","Components","Selling Price","Recipe Cost","Gross Margin","Status"],
          (preview.menu_items||[]).map(row=>{
            const price=Number(row.sale_price||0);
            const cost=Number(row.calculated_recipe_cost||0);

            return [
              `
                <strong>${esc(row.source_menu_code||"—")}</strong>
                <div class="mw-muted mw-small">${esc(row.source_menu_name)}</div>
              `,

              Number(row.component_count||0).toLocaleString(),

              money(price),

              money(cost),

              money(price-cost),

              Math.abs(Number(row.recipe_cost_difference||0))<=Number(
                state.posMenuMigration.settings?.cost_tolerance||0
              )
                ?`<span class="mw-badge ok">Ready</span>`
                :`<span class="mw-badge warn">Review cost</span>`,
            ];
          }),
          "No menu preview available."
        )}

        ${preview.error_count
          ?`
            <div class="mw-alert error" style="margin-top:14px">
              ${(preview.issues||[]).map(issue=>`<div>${esc(issue)}</div>`).join("")}
            </div>
          `
          :""
        }
      </div>
    `;
  }

  function posMenuReconciliationView(){
    const recon=state.posMenuMigration.reconciliation;
    if(!recon)return "";

    return `
      <div style="margin-top:20px">
        <h3>Menu Migration Readiness</h3>

        <div class="mw-alert ${recon.is_ready?"ok":"error"}">
          <strong>
            ${recon.is_ready
              ?"POS menu and recipes are ready"
              :"POS menu migration is blocked"
            }
          </strong>

          ${!recon.is_ready
            ?`<div class="mw-muted mw-small" style="margin-top:4px">
                ${recon.blocking_error_count||0} blocking issue(s) remain.
              </div>`
            :""
          }
        </div>
      </div>
    `;
  }

  async function loadPosHistoryMigration(projectId,{renderAfter=true}={}){
    if(!projectId){
      state.posHistoryMigration={
        datasets:[],
        datasetId:null,
        settings:null,
        preview:null,
        reconciliation:null,
      };
      state.posHistoryMigrationLoaded=false;

      if(renderAfter)render();
      return;
    }

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posHistory(companyId(),projectId)
      );

      state.posHistoryMigration.datasets=response?.datasets||[];

      if(!state.posHistoryMigration.datasets.some(
        row=>Number(row.dataset_id)===Number(state.posHistoryMigration.datasetId)
      )){
        state.posHistoryMigration.datasetId=
          state.posHistoryMigration.datasets[0]?.dataset_id||null;
      }

      if(state.posHistoryMigration.datasetId){
        await loadPosHistoryDataset(
          state.posHistoryMigration.datasetId,
          {renderAfter:false}
        );
      }

      state.posHistoryMigrationLoaded=true;

    }catch(error){
      state.error=errorMessage(error);
      console.error("[DataMigration] loadPosHistoryMigration failed",error);
    }

    if(renderAfter)render();
  }

  async function loadPosHistoryDataset(datasetId,{renderAfter=true}={}){
    const id=Number(datasetId);
    if(!id)return;

    const [settingsResponse,reconResponse]=await Promise.all([
      apiFetch(
        ENDPOINTS.migrations.posHistorySettings(
          companyId(),state.project.id,id
        )
      ),
      apiFetch(
        ENDPOINTS.migrations.posHistoryReconcile(
          companyId(),state.project.id,id
        )
      ),
    ]);

    state.posHistoryMigration.datasetId=id;
    state.posHistoryMigration.settings=settingsResponse?.settings||null;
    state.posHistoryMigration.reconciliation=reconResponse?.reconciliation||null;
    state.posHistoryMigration.preview=null;

    if(renderAfter)render();
  }

  async function savePosHistorySettings(){
    const settings=state.posHistoryMigration.settings;
    if(!settings)return;

    state.posHistorySaving=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posHistorySettings(
          companyId(),
          state.project.id,
          state.posHistoryMigration.datasetId
        ),
        {
          method:"PUT",
          body:JSON.stringify(settings),
        }
      );

      state.posHistoryMigration.settings=response?.settings||settings;
      state.posHistoryMigration.preview=null;
      state.posHistoryMigration.reconciliation=null;

      notify("POS history settings saved.");

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posHistorySaving=false;
      render();
    }
  }

  async function previewPosHistory(){
    if(!state.posHistoryMigration.datasetId)return;

    state.posHistoryPreviewLoading=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posHistoryPreview(
          companyId(),
          state.project.id,
          state.posHistoryMigration.datasetId
        )
      );

      state.posHistoryMigration.preview=response?.preview||null;

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posHistoryPreviewLoading=false;
      render();
    }
  }

  async function reconcilePosHistory(){
    if(!state.posHistoryMigration.datasetId)return;

    state.posHistoryReconciling=true;
    render();

    try{
      const response=await apiFetch(
        ENDPOINTS.migrations.posHistoryReconcile(
          companyId(),
          state.project.id,
          state.posHistoryMigration.datasetId
        ),
        {
          method:"POST",
          body:JSON.stringify({}),
        }
      );

      state.posHistoryMigration.reconciliation=response?.reconciliation||null;
      state.posHistoryMigration.preview=
        response?.reconciliation?.preview||
        state.posHistoryMigration.preview;

      if(state.posHistoryMigration.reconciliation?.is_ready){
        notify("POS sales and payment history is reconciled.");
      }else{
        notify(
          `${state.posHistoryMigration.reconciliation?.blocking_error_count||0} POS history issue(s) require attention.`
        );
      }

    }catch(error){
      state.error=errorMessage(error);
      notify(state.error);

    }finally{
      state.posHistoryReconciling=false;
      render();
    }
  }

  function posHistoryCheck(label,field){
    const checked=Boolean(state.posHistoryMigration.settings?.[field]);

    return `
      <label class="mw-check">
        <input type="checkbox"
          ${checked?"checked":""}
          data-mw-pos-history-setting="${esc(field)}">
        <span>${esc(label)}</span>
      </label>
    `;
  }

  function posHistoryInput(label,field,type="text"){
    const value=state.posHistoryMigration.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>
        <input class="mw-input"
          type="${esc(type)}"
          value="${esc(value)}"
          data-mw-pos-history-setting="${esc(field)}">
      </div>
    `;
  }

  function posHistoryInput(label,field,type="text"){
    const value=state.posHistoryMigration.settings?.[field]??"";

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>
        <input class="mw-input"
          type="${esc(type)}"
          value="${esc(value)}"
          data-mw-pos-history-setting="${esc(field)}">
      </div>
    `;
  }

  function posHistoryMigrationView(){
    const datasets=state.posHistoryMigration.datasets||[];
    const settings=state.posHistoryMigration.settings;

    if(!datasets.length)return "";
    if(!settings)return `<div class="mw-empty">Loading POS history…</div>`;

    return `
      <div class="mw-card" style="margin-top:18px">
        ${heading(
          "POS Sales & Payment History",
          "Validate historical POS receipts, item lines, discounts, VAT, payments, refunds and voids.",
          `
            <button class="mw-btn"
              data-mw-action="save-pos-history-settings"
              ${state.posHistorySaving?"disabled":""}>
              ${state.posHistorySaving?"Saving…":"Save settings"}
            </button>

            <button class="mw-btn"
              data-mw-action="preview-pos-history"
              ${state.posHistoryPreviewLoading?"disabled":""}>
              ${state.posHistoryPreviewLoading?"Validating…":"Validate POS history"}
            </button>

            <button class="mw-btn primary"
              data-mw-action="reconcile-pos-history"
              ${state.posHistoryReconciling?"disabled":""}>
              ${state.posHistoryReconciling?"Reconciling…":"Reconcile POS history"}
            </button>
          `
        )}

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-field">
            <label>POS History Dataset</label>

            <select id="mwPosHistoryDataset" class="mw-select">
              ${datasets.map(dataset=>`
                <option value="${dataset.dataset_id}"
                  ${Number(dataset.dataset_id)===Number(state.posHistoryMigration.datasetId)?"selected":""}>
                  ${esc(dataset.dataset_name)}
                </option>
              `).join("")}
            </select>
          </div>

          ${posHistoryInput("History From","history_from","date")}
          ${posHistoryInput("History To","history_to","date")}
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          ${posHistorySelect(
            "Source Layout",
            "source_layout",
            [
              ["combined","Combined Sales + Lines + Payments"],
              ["sales_only","Sales Headers Only"],
              ["lines_only","Sale Lines Only"],
              ["payments_only","Payments Only"],
            ]
          )}

          <div class="mw-field">
            <label>Resolution</label>

            <div class="mw-list">
              ${posHistoryCheck("Require POS terminal","require_terminal")}
              ${posHistoryCheck("Require product resolution","require_product_resolution")}
              ${posHistoryCheck("Require payment resolution","require_payment_resolution")}
            </div>
          </div>

          <div class="mw-field">
            <label>Validation</label>

            <div class="mw-list">
              ${posHistoryCheck("Validate sale totals","validate_sale_totals")}
              ${posHistoryCheck("Validate payment totals","validate_payment_totals")}
              ${posHistoryCheck("Allow unpaid sales","allow_unpaid_sales")}
            </div>
          </div>
        </div>

        ${posHistoryPreviewView()}
        ${posHistoryReconciliationView()}
      </div>
    `;
  }

  function posHistoryPreviewView(){
    const preview=state.posHistoryMigration.preview;
    if(!preview)return "";

    return `
      <div style="margin-top:20px">
        <h3>POS History Preview</h3>

        <div class="mw-summary" style="margin-top:12px">
          <div class="mw-stat">
            <span>Sales</span>
            <strong>${preview.sale_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Lines</span>
            <strong>${preview.sale_line_count||0}</strong>
          </div>

          <div class="mw-stat">
            <span>Net Sales</span>
            <strong>${money(preview.net_sales||0)}</strong>
          </div>

          <div class="mw-stat">
            <span>Payments</span>
            <strong>${money(preview.payment_total||0)}</strong>
          </div>

          <div class="mw-stat">
            <span>Errors</span>
            <strong>${preview.error_count||0}</strong>
          </div>
        </div>

        ${posHistorySalesTable(preview.sales||[])}
      </div>
    `;
  }

  function posHistorySalesTable(rows){
    return `
      <div style="margin-top:14px">
        ${table(
          [
            "Date",
            "Receipt",
            "Terminal",
            "Lines",
            "Gross",
            "Discount",
            "VAT",
            "Total",
            "Payments",
            "Status",
          ],

          rows.map(row=>[
            esc(row.sale_date||"—"),

            `<strong>${esc(row.reference||"—")}</strong>`,

            esc(
              row.terminal?.name||
              row.terminal?.code||
              "—"
            ),

            Number(row.lines?.length||0).toLocaleString(),

            money(row.calculated_subtotal||0),

            money(row.calculated_discount||0),

            money(row.calculated_tax||0),

            money(row.calculated_total||0),

            money(row.payment_total||0),

            row.valid
              ?`<span class="mw-badge ok">${esc(titleCase(row.status||"completed"))}</span>`
              :`<span class="mw-badge error" title="${esc((row.issues||[]).join(" • "))}">
                  ${row.issues?.length||1} issue(s)
                </span>`,
          ]),

          "No POS sales available."
        )}
      </div>
    `;
  }

  function posHistoryReconciliationView(){
    const recon=state.posHistoryMigration.reconciliation;
    if(!recon)return "";

    return `
      <div style="margin-top:20px">
        <h3>POS History Reconciliation</h3>

        <div class="mw-alert ${recon.is_ready?"ok":"error"}">
          <strong>
            ${recon.is_ready
              ?"POS sales and payments are reconciled"
              :"POS sales history is blocked"
            }
          </strong>

          ${!recon.is_ready
            ?`<div class="mw-muted mw-small" style="margin-top:4px">
                ${recon.blocking_error_count||0} blocking issue(s) remain.
              </div>`
            :""
          }
        </div>

        <div class="mw-grid-3" style="margin-top:14px">
          <div class="mw-card">
            <div class="mw-muted mw-small">Gross Sales</div>
            <strong>${money(recon.gross_sales||0)}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Net Sales</div>
            <strong>${money(recon.net_sales||0)}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Payments</div>
            <strong>${money(recon.payment_total||0)}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Refunds</div>
            <strong>${money(recon.refund_total||0)}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">VAT</div>
            <strong>${money(recon.tax_total||0)}</strong>
          </div>

          <div class="mw-card">
            <div class="mw-muted mw-small">Payment Difference</div>
            <strong>${money(recon.payment_difference||0)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  function toggleScopeEntity(
    code,
    selected
  ) {
    const entity = scopeEntity(code);

    if (!entity) return;

    if (
      !selected &&
      entity.is_required
    ) {
      notify(
        `${entity.label} is required and cannot be removed.`
      );

      render();
      return;
    }

    entity.is_selected = selected;
    entity.selection_source = "manual";

    if (selected) {
      const closure = dependencyClosure([
        code,
      ]);

      closure.forEach(dependencyCode => {
        const dependency =
          scopeEntity(dependencyCode);

        if (
          dependency &&
          !dependency.is_selected
        ) {
          dependency.is_selected = true;
          dependency.selection_source =
            dependency.is_required
              ? "system"
              : "dependency";
        }
      });
    } else {
      const dependent = state.scope.entities.find(
        candidate =>
          candidate.is_selected &&
          requiredDependencies(
            candidate.code
          ).includes(code)
      );

      if (dependent) {
        entity.is_selected = true;

        notify(
          `${entity.label} is required by ${dependent.label}.`
        );

        render();
        return;
      }
    }

    recalculateScope();
  }


  function updateScopeEntity(
    code,
    field,
    value
  ) {
    const entity = scopeEntity(code);

    if (!entity) return;

    entity[field] = value;
    entity.selection_source =
      entity.selection_source || "manual";

    recalculateScope();
  }


  function recalculateScope() {
    state.scope.selected_count =
      state.scope.entities.filter(
        entity => entity.is_selected
      ).length;

    state.scopeDirty = true;
    render();
  }


  function selectRecommendedScope() {
    const recommended = new Set([
      "currencies",
      "tax_codes",
      "chart_of_accounts",
      "payment_terms",
      "bank_accounts",
      "customers",
      "sales_invoices",
      "customer_receipts",
      "customer_allocations",
      "vendors",
      "supplier_bills",
      "supplier_payments",
      "supplier_allocations",
      "opening_trial_balance",
      "products",
      "inventory_opening",
      "asset_classes",
      "fixed_assets",
    ]);

    const closure = dependencyClosure(
      recommended
    );

    state.scope.entities.forEach(entity => {
      entity.is_selected =
        closure.has(entity.code) ||
        entity.is_required;

      entity.selection_source =
        entity.is_required
          ? "system"
          : entity.is_selected
            ? "default"
            : "manual";
    });

    recalculateScope();
  }


  function clearOptionalScope() {
    state.scope.entities.forEach(entity => {
      entity.is_selected =
        Boolean(entity.is_required);

      entity.selection_source =
        entity.is_required
          ? "system"
          : "manual";
    });

    const closure = dependencyClosure(
      state.scope.entities
        .filter(entity => entity.is_selected)
        .map(entity => entity.code)
    );

    state.scope.entities.forEach(entity => {
      if (closure.has(entity.code)) {
        entity.is_selected = true;

        if (!entity.is_required) {
          entity.selection_source =
            "dependency";
        }
      }
    });

    recalculateScope();
  }

  async function saveScope() {
    if (
      state.scopeSaving ||
      !state.project?.id
    ) {
      if (!state.project?.id) {
        notify(
          "Save the migration project before saving its scope."
        );
      }

      return;
    }

    const selected = state.scope.entities.filter(
      entity => entity.is_selected
    );

    if (!selected.length) {
      notify(
        "Select at least one migration entity."
      );
      return;
    }

    state.scopeSaving = true;
    state.error = "";
    render();

    try {
      const response = await apiFetch(
        ENDPOINTS.migrations.projectScope(
          companyId(),
          state.project.id
        ),
        {
          method: "PUT",
          body: JSON.stringify({
            entities:
              state.scope.entities.map(
                entity => ({
                  code: entity.code,
                  is_selected:
                    Boolean(
                      entity.is_selected
                    ),
                  history_mode:
                    entity.history_mode,
                  import_mode:
                    entity.import_mode,
                  source_dataset_name:
                    entity.source_dataset_name ||
                    null,
                  settings_json:
                    entity.settings_json || {},
                  metadata_json:
                    entity.metadata_json || {},
                })
              ),
          }),
        }
      );

      state.scope = response?.scope || state.scope;
      state.scopeDirty = false;

      if (
        state.project.status === "draft"
      ) {
        state.project.status =
          "configured";
      }

      await refreshProjects(
        state.project.id
      );

      log(
        `Saved migration scope with ${state.scope.selected_count} selected entities`
      );

      notify(
        "Migration scope saved."
      );

    } catch (error) {
      state.error = errorMessage(error);

      console.error(
        "[DataMigration] saveScope failed",
        error
      );

      notify(state.error);

    } finally {
      state.scopeSaving = false;
      render();
    }
  }

  function scopeView() {
    if (!state.project?.id) {
      return `
        <h2>Migration scope</h2>

        <div class="mw-alert warn">
          <strong>Project required:</strong>
          Save the migration project before selecting
          migration entities.
        </div>
      `;
    }

    if (!state.scopeLoaded) {
      return `
        <div class="mw-empty">
          Loading migration scope…
        </div>
      `;
    }

    const groups = {};

    state.scope.entities.forEach(entity => {
      const key = entity.group_code;

      if (!groups[key]) {
        groups[key] = {
          name: entity.group_name,
          entities: [],
        };
      }

      groups[key].entities.push(entity);
    });

    return `
      <div
        class="mw-inline"
        style="justify-content:space-between"
      >
        <div>
          <h2>Migration scope</h2>

          <p class="mw-muted">
            Select the records to migrate.
            Required dependencies are selected automatically.
          </p>
        </div>

        <div class="mw-inline">
          <button
            type="button"
            class="mw-btn"
            data-mw-action="clear-optional-scope"
          >
            Clear optional
          </button>

          <button
            type="button"
            class="mw-btn"
            data-mw-action="select-recommended-scope"
          >
            Select recommended
          </button>

          <button
            type="button"
            class="mw-btn primary"
            data-mw-action="save-scope"
            ${
              state.scopeSaving
                ? "disabled"
                : ""
            }
          >
            ${
              state.scopeSaving
                ? "Saving…"
                : state.scopeDirty
                  ? "Save scope"
                  : "Scope saved"
            }
          </button>
        </div>
      </div>

      <div
        class="mw-alert ${
          state.scope.selected_count
            ? "ok"
            : "warn"
        }"
        style="margin-top:14px"
      >
        <strong>
          ${state.scope.selected_count}
          migration entities selected.
        </strong>

        Required dependencies will be included
        automatically when the scope is saved.
      </div>

      ${Object.values(groups).map(group => `
        <div style="margin-top:20px">
          <h3>${esc(group.name)}</h3>

          <div class="mw-grid-2">
            ${group.entities.map(
              entity =>
                scopeEntityCard(entity)
            ).join("")}
          </div>
        </div>
      `).join("")}
    `;
  }

  function scopeEntityCard(entity) {
    const requiredDependenciesList =
      (entity.dependencies || []).filter(
        dependency =>
          dependency.type === "required"
      );

    const recommendedDependenciesList =
      (entity.dependencies || []).filter(
        dependency =>
          dependency.type === "recommended"
      );

    const disabled =
      entity.is_required ||
      entity.selection_source === "system";

    return `
      <div class="mw-card">
        <div
          class="mw-inline"
          style="justify-content:space-between"
        >
          <label class="mw-check">
            <input
              type="checkbox"
              data-mw-scope-entity="${esc(entity.code)}"
              ${
                entity.is_selected
                  ? "checked"
                  : ""
              }
              ${disabled ? "disabled" : ""}
            >

            <span>
              <strong>${esc(entity.label)}</strong>

              ${
                entity.is_required
                  ? `
                    <span class="mw-badge info">
                      Required
                    </span>
                  `
                  : entity.selection_source === "dependency"
                    ? `
                      <span class="mw-badge warn">
                        Dependency
                      </span>
                    `
                    : ""
              }
            </span>
          </label>
        </div>

        <p class="mw-muted mw-small">
          ${esc(entity.description || "")}
        </p>

        <div class="mw-grid-2">
          <div class="mw-field">
            <label>History</label>

            <select
              class="mw-select"
              data-mw-scope-history="${esc(entity.code)}"
              ${
                entity.is_selected
                  ? ""
                  : "disabled"
              }
            >
              ${scopeHistoryOptions(entity)}
            </select>
          </div>

          <div class="mw-field">
            <label>Import mode</label>

            <select
              class="mw-select"
              data-mw-scope-import="${esc(entity.code)}"
              ${
                entity.is_selected
                  ? ""
                  : "disabled"
              }
            >
              ${[
                [
                  "create_only",
                  "Create only",
                ],
                [
                  "update_only",
                  "Update only",
                ],
                [
                  "create_or_update",
                  "Create or update",
                ],
                [
                  "replace_batch",
                  "Replace batch",
                ],
              ].map(([value, label]) => `
                <option
                  value="${value}"
                  ${
                    entity.import_mode === value
                      ? "selected"
                      : ""
                  }
                >
                  ${label}
                </option>
              `).join("")}
            </select>
          </div>
        </div>

        ${
          requiredDependenciesList.length
            ? `
              <div
                class="mw-alert warn"
                style="margin-top:12px"
              >
                <strong>Requires:</strong>
                ${requiredDependenciesList.map(
                  dependency => {
                    const target =
                      scopeEntity(
                        dependency.code
                      );

                    return esc(
                      target?.label ||
                      dependency.code
                    );
                  }
                ).join(", ")}
              </div>
            `
            : ""
        }

        ${
          recommendedDependenciesList.length
            ? `
              <p
                class="mw-muted mw-small"
                style="margin-top:10px"
              >
                Recommended:
                ${recommendedDependenciesList.map(
                  dependency => {
                    const target =
                      scopeEntity(
                        dependency.code
                      );

                    return esc(
                      target?.label ||
                      dependency.code
                    );
                  }
                ).join(", ")}
              </p>
            `
            : ""
        }
      </div>
    `;
  }

  function scopeHistoryOptions(entity) {
    const options = [
      [
        "opening",
        "Opening balances",
        entity.supports_opening,
      ],
      [
        "current_year",
        "Current financial year",
        entity.supports_current_year,
      ],
      [
        "two_years",
        "Two years",
        entity.supports_two_years,
      ],
      [
        "full_history",
        "Full history",
        entity.supports_full_history,
      ],
    ];

    return options
      .filter(([, , supported]) =>
        Boolean(supported)
      )
      .map(([value, label]) => `
        <option
          value="${value}"
          ${
            entity.history_mode === value
              ? "selected"
              : ""
          }
        >
          ${label}
        </option>
      `)
      .join("");
  }

  async function saveProject() {
    if (
      state.saving ||
      state.loading
    ) {
      return;
    }

    const project = state.project;

    if (!project) return;

    const name = String(
      project.name || ""
    ).trim();

    const description = String(
      project.description || ""
    ).trim();

    const financialYearStart = String(
      project.financial_year_start || ""
    ).trim();

    const cutoverDate = String(
      project.cutover_date || ""
    ).trim();

    const currency = String(
      project.default_currency || ""
    ).trim();

    const sourceSystem = String(
      project.source_system_code || ""
    ).trim();

    const sourceFormat = String(
      project.source_format || ""
    ).trim();

    const dateFormat = String(
      project.date_format || ""
    ).trim();

    const missing = [];

    if (!name) {
      missing.push("Project name");
    }

    if (!description) {
      missing.push("Description");
    }

    if (!financialYearStart) {
      missing.push("Financial year start");
    }

    if (!cutoverDate) {
      missing.push("Cutover date");
    }

    if (!currency) {
      missing.push("Default currency");
    }

    if (!sourceSystem) {
      missing.push("Source system");
    }

    if (!sourceFormat) {
      missing.push("Source format");
    }

    if (!dateFormat) {
      missing.push("Date format");
    }

    if (missing.length) {
      notify(
        `Complete the following required fields: ${missing.join(", ")}.`
      );

      state.activeStep = missing.some(field =>
        [
          "Source system",
          "Source format",
          "Date format",
        ].includes(field)
      )
        ? "source"
        : "project";

      render();
      return;
    }

    if (
      financialYearStart &&
      cutoverDate &&
      financialYearStart > cutoverDate
    ) {
      notify(
        "The cutover date cannot be before the financial year start."
      );

      state.activeStep = "project";
      render();
      return;
    }

    state.saving = true;
    state.error = "";
    render();

    const payload = buildProjectPayload();

    try {
      let response;

      if (project.id) {
        response = await apiFetch(
          ENDPOINTS.migrations.project(
            companyId(),
            project.id
          ),
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
      } else {
        response = await apiFetch(
          ENDPOINTS.migrations.projects(
            companyId()
          ),
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );
      }

      state.project = normalizeProject(
        response?.project
      );

      await loadScope(
        state.project.id,
        {
          renderAfter: false,
        }
      );

      await refreshProjects(
        state.project.id
      );

      state.dirty = false;

      log(
        `Saved ${state.project.name}`
      );

      notify(
        "Migration project saved."
      );

    } catch (error) {
      state.error = errorMessage(error);

      console.error(
        "[DataMigration] saveProject failed",
        error
      );

      notify(state.error);

    } finally {
      state.saving = false;
      render();
    }
  }

  function buildProjectPayload() {
    const project = state.project;
    const source =
      project.source || {};

    return {
      reference:
        project.reference || undefined,

      name: String(
        project.name || ""
      ).trim(),

      description: String(
        project.description || ""
      ).trim(),

      description:
        project.description || "",

      migration_mode:
        project.migration_mode,

      import_mode:
        project.import_mode,

      financial_year_start:
        project.financial_year_start || null,

      cutover_date:
        project.cutover_date,

      default_currency: window.resolveCurrency?.(
        project.default_currency
      ) || "USD",

      source_timezone:
        project.source_timezone || null,

      source_country_code:
        project.source_country_code || null,

      source_tax_regime:
        project.source_tax_regime || null,

      source_system_code: String(
        project.source_system_code || ""
      ).trim(),

      source_system_name: String(
        project.source_system_name || ""
      ).trim(),

      source_system_version:
        project.source_system_version || null,

      source_format: String(
        project.source_format || ""
      ).trim(),

      date_format: String(
        project.date_format || ""
      ).trim(),

      decimal_separator:
        project.decimal_separator,

      thousands_separator:
        project.thousands_separator,

      debit_credit_convention:
        project.debit_credit_convention,

      configuration_json:
        project.configuration_json || {},

      metadata_json:
        project.metadata_json || {},

      source: {
        source_profile_id:
          source.source_profile_id || null,

        source_system_code:
          source.source_system_code ||
          project.source_system_code,

        source_system_name:
          source.source_system_name ||
          project.source_system_name,

        source_system_version:
          source.source_system_version ||
          project.source_system_version ||
          null,

        source_format:
          source.source_format ||
          project.source_format,

        country_code:
          source.country_code ||
          project.source_country_code ||
          null,

        tax_regime:
          source.tax_regime ||
          project.source_tax_regime ||
          null,

        default_currency: window.resolveCurrency?.(
          source.default_currency ||
          project.default_currency
        ) || "USD",

        source_timezone:
          source.source_timezone ||
          project.source_timezone ||
          null,

        date_format:
          source.date_format ||
          project.date_format,

        decimal_separator:
          source.decimal_separator ||
          project.decimal_separator,

        thousands_separator:
          source.thousands_separator ||
          project.thousands_separator,

        debit_credit_convention:
          source.debit_credit_convention ||
          project.debit_credit_convention,

        connection_type:
          source.connection_type ||
          "file_upload",

        connection_name:
          source.connection_name ||
          "Primary migration source",

        settings_json:
          source.settings_json || {},

        metadata_json:
          source.metadata_json || {},
      },
    };
  }

  async function reloadCurrentProject() {
    if (!state.project?.id) {
      state.project = defaultProject();
      state.dirty = false;
      render();
      return;
    }

    if (
      state.dirty &&
      !confirm(
        "Discard unsaved changes and reload the project?"
      )
    ) {
      return;
    }

    await loadProject(
      state.project.id
    );
  }

  async function cancelProject() {
    const project = state.project;

    if (!project?.id) {
      state.project = defaultProject();
      state.dirty = false;
      render();
      return;
    }

    if (
      !confirm(
        `Cancel migration project "${project.name}"?`
      )
    ) {
      return;
    }

    try {
      const response = await apiFetch(
        ENDPOINTS.migrations.project(
          companyId(),
          project.id
        ),
        {
          method: "DELETE",
          body: JSON.stringify({
            reason:
              "Cancelled from migration workspace",
          }),
        }
      );

      state.project = normalizeProject(
        response?.project
      );

      await refreshProjects(
        state.project.id
      );

      state.dirty = false;

      log(
        `Cancelled ${state.project.name}`
      );

      render();

    } catch (error) {
      state.error = errorMessage(error);
      notify(state.error);
      render();
    }
  }

  function render() {
    const root = $("#migrationWorkspace");

    if (!root) return;

    renderSelectors();
    renderSummary();
    renderStepper();
    renderMain();
    renderSide();
    renderFooter();
    renderSaveState();
  }

  function renderSelectors() {
    const projectSelect =
      $("#mwProjectSelect");

    if (projectSelect) {
      const currentId =
        Number(state.project?.id || 0);

      const temporaryOption =
        !currentId
          ? `
            <option value="" selected>
              Unsaved migration project
            </option>
          `
          : "";

      projectSelect.innerHTML = `
        ${temporaryOption}

        ${state.projects.map(project => `
          <option
            value="${esc(project.id)}"
            ${
              Number(project.id) === currentId
                ? "selected"
                : ""
            }
          >
            ${esc(project.reference || "")}
            ${project.reference ? " — " : ""}
            ${esc(project.name)}
          </option>
        `).join("")}
      `;

      projectSelect.disabled =
        state.loading ||
        state.saving;
    }

    const sourceSystem =
      $("#mwSourceSystem");

    if (sourceSystem) {
      sourceSystem.value =
        state.project?.source_system_code ||
        "excel_csv";
    }

    const cutover =
      $("#mwCutoverDate");

    if (cutover) {
      cutover.value =
        state.project?.cutover_date || "";
    }

    const depth =
      $("#mwMigrationDepth");

    if (depth) {
      depth.value =
        state.project?.migration_mode ||
        "opening";
    }
  }

  function renderSummary(){
    const project=state.project||defaultProject();

    setText("mwStatus",titleCase(project.status||"draft"));
    setText("mwFileCount",String(state.files.length));
    setText("mwRecordCount",Number(state.detection.record_count||0).toLocaleString());
    setText("mwErrorCount","0");
    setText("mwReconStatus","Not run");
  }

  function renderStepper() {
    const container =
      $("#mwStepper");

    if (!container) return;

    const activeIndex =
      steps.findIndex(
        ([id]) =>
          id === state.activeStep
      );

    container.innerHTML =
      steps.map(([id, label], index) => `
        <button
          type="button"
          class="
            mw-step
            ${
              id === state.activeStep
                ? "active"
                : ""
            }
            ${
              index < activeIndex
                ? "done"
                : ""
            }
          "
          data-mw-step="${id}"
        >
          <small>Phase ${index + 1}</small>
          <strong>${esc(label)}</strong>
        </button>
      `).join("");
  }

  function renderMain() {
    const main = $("#mwMain");

    if (!main) return;

    if (state.loading && !state.project) {
      main.innerHTML = `
        <div class="mw-empty">
          Loading migration workspace…
        </div>
      `;
      return;
    }

    if (state.error) {
      main.innerHTML = `
        <div class="mw-alert error">
          <strong>Migration workspace error</strong>
          <div style="margin-top:6px">
            ${esc(state.error)}
          </div>
        </div>

        <div style="margin-top:14px">
          <button
            type="button"
            class="mw-btn"
            data-mw-action="reload-project"
          >
            Try again
          </button>
        </div>
      `;
      return;
    }

    const views = {
      project: projectView,
      source: sourceView,
      scope: scopeView,
      files: filesView,
      detect: detectionView,
      mapping:fieldMappingView,
      accounts:moduleMappingView,
      validate: futureView,
      preview: futureView,
      stage: futureView,
      reconcile: futureView,
      commit: futureView,
    };

    main.innerHTML =
      views[state.activeStep]?.() || "";
  }

  function projectView() {
    const project =
      state.project || defaultProject();

    return `
      <div
        class="mw-inline"
        style="justify-content:space-between"
      >
        <div>
          <h2>Migration project</h2>
          <p class="mw-muted">
            Create and maintain the controlled migration project.
          </p>
        </div>

        <span class="mw-badge ${
          project.status === "cancelled"
            ? "error"
            : project.status === "committed"
              ? "ok"
              : "info"
        }">
          ${esc(titleCase(project.status))}
        </span>
      </div>

      <div class="mw-grid-2">
        ${inputField({
          label: "Project name",
          field: "name",
          value: project.name,
          placeholder: "e.g. ABC Trading migration",
          required: true,
        })}

        ${inputField({
          label: "Migration reference",
          field: "reference",
          value:
            project.reference ||
            "Generated when saved",
          readonly: true,
        })}

        ${inputField({
          label: "Description",
          field: "description",
          value: project.description,
          placeholder: "Describe the source, scope and purpose of this migration",
          required: true,
        })}

        ${selectField({
          label: "Import mode",
          field: "import_mode",
          value: project.import_mode,
          options: [
            ["create_only", "Create new records only"],
            ["update_only", "Update matching records only"],
            ["create_or_update", "Create or update"],
            ["replace_batch", "Replace previous migration batch"],
          ],
        })}

        ${inputField({
          label: "Cutover date",
          field: "cutover_date",
          value: project.cutover_date,
          type: "date",
          required: true,
        })}

        ${inputField({
          label: "Cutover date",
          field: "cutover_date",
          value: project.cutover_date,
          type: "date",
          required: true,
        })}

        ${inputField({
          label: "Default currency",
          field: "default_currency",
          value:
            project.default_currency,
        })}

        ${inputField({
          label: "Source timezone",
          field: "source_timezone",
          value:
            project.source_timezone,
        })}
      </div>

      <div
        class="mw-alert warn"
        style="margin-top:16px"
      >
        <strong>Control:</strong>
        Imported records will pass through validation,
        staging and reconciliation before live accounting
        records are created.
      </div>

      <div
        class="mw-inline"
        style="margin-top:16px"
      >
        <button
          type="button"
          class="mw-btn"
          data-mw-action="reload-project"
          ${
            state.loading || state.saving
              ? "disabled"
              : ""
          }
        >
          Reload
        </button>

        <button
          type="button"
          class="mw-btn danger"
          data-mw-action="cancel-project"
          ${
            !project.id ||
            ["cancelled", "committed"].includes(
              project.status
            )
              ? "disabled"
              : ""
          }
        >
          Cancel project
        </button>
      </div>
    `;
  }

  function sourceView() {
    const project =
      state.project || defaultProject();

    const source =
      project.source ||
      defaultProject().source;

    return `
      <h2>Source configuration</h2>

      <p class="mw-muted">
        Configure how FinSage should interpret data
        exported from the source system.
      </p>

      <div class="mw-grid-2">
        ${selectField({
          label: "Source system",
          sourceField:
            "source_system_code",
          value:
            source.source_system_code,
          options:
            sourceSystems.map(item => [
              item.code,
              item.name,
            ]),
        })}

        ${inputField({
          label: "Source version",
          sourceField:
            "source_system_version",
          value:
            source.source_system_version,
        })}

        ${selectField({
          label: "Source format",
          sourceField: "source_format",
          value: source.source_format,
          options: [
            ["excel_csv", "Excel / CSV"],
            [
              "accounting_export",
              "Accounting software export",
            ],
            ["json", "JSON"],
            ["xml", "XML"],
            ["sql_extract", "SQL extract"],
            [
              "opening_balances",
              "Opening balance export",
            ],
            [
              "manual_template",
              "FinSage migration template",
            ],
            ["other", "Other"],
          ],
        })}

        ${selectField({
          label: "Connection type",
          sourceField:
            "connection_type",
          value:
            source.connection_type,
          options: [
            ["file_upload", "File upload"],
            [
              "database_extract",
              "Database extract",
            ],
            ["api_export", "API export"],
            [
              "manual_template",
              "FinSage template",
            ],
            ["other", "Other"],
          ],
        })}

        ${inputField({
          label: "Country code",
          sourceField: "country_code",
          value: source.country_code,
          placeholder: "ZA, LS, BW",
        })}

        ${inputField({
          label: "Tax regime",
          sourceField: "tax_regime",
          value: source.tax_regime,
          placeholder: "SARS, RSL",
        })}

        ${inputField({
          label: "Currency",
          sourceField:
            "default_currency",
          value:
            source.default_currency,
        })}

        ${inputField({
          label: "Timezone",
          sourceField:
            "source_timezone",
          value:
            source.source_timezone,
        })}

        ${selectField({
          label: "Date format",
          sourceField: "date_format",
          value: source.date_format,
          options: [
            ["YYYY-MM-DD", "YYYY-MM-DD"],
            ["DD/MM/YYYY", "DD/MM/YYYY"],
            ["MM/DD/YYYY", "MM/DD/YYYY"],
            ["DD-MM-YYYY", "DD-MM-YYYY"],
            ["YYYY/MM/DD", "YYYY/MM/DD"],
          ],
        })}

        ${selectField({
          label: "Debit and credit convention",
          sourceField:
            "debit_credit_convention",
          value:
            source.debit_credit_convention,
          options: [
            [
              "separate_columns",
              "Separate debit and credit columns",
            ],
            [
              "signed_amount",
              "Signed amount",
            ],
            [
              "transaction_type_amount",
              "Transaction type and amount",
            ],
            [
              "account_normal_balance",
              "Account normal balance",
            ],
          ],
        })}

        ${selectField({
          label: "Decimal separator",
          sourceField:
            "decimal_separator",
          value:
            source.decimal_separator,
          options: [
            [".", "Period (.)"],
            [",", "Comma (,)"],
          ],
        })}

        ${selectField({
          label: "Thousands separator",
          sourceField:
            "thousands_separator",
          value:
            source.thousands_separator,
          options: [
            [",", "Comma (,)"],
            [".", "Period (.)"],
            [" ", "Space"],
            ["", "None"],
          ],
        })}
      </div>

      <div
        class="mw-alert ok"
        style="margin-top:16px"
      >
        <strong>Normalisation:</strong>
        Every source will later be converted into the
        same FinSage migration staging model.
      </div>
    `;
  }

  function futureView() {
    const step = steps.find(
      ([id]) =>
        id === state.activeStep
    );

    return `
      <h2>${esc(step?.[1] || "Migration phase")}</h2>

      <div class="mw-empty">
        This phase will be completed as the next
        vertical slice after Project and Source
        configuration are operational.
      </div>
    `;
  }

  function renderSide() {
    const project =
      state.project || defaultProject();

    const projectSaved =
      Boolean(project.id);

    const sourceConfigured = Boolean(
      String(project.source_system_code || "").trim() &&
      String(project.source_system_name || "").trim() &&
      String(project.source_format || "").trim() &&
      String(project.date_format || "").trim() &&
      String(project.debit_credit_convention || "").trim()
    );

    const projectConfigured = Boolean(
      String(project.name || "").trim() &&
      String(project.description || "").trim() &&
      project.financial_year_start &&
      project.cutover_date &&
      project.migration_mode &&
      project.import_mode &&
      String(project.default_currency || "").trim()
    );

    const scopeConfigured = Boolean(
      state.project?.id &&
      state.scopeLoaded &&
      state.scope.selected_count > 0 &&
      !state.scopeDirty
    );

    const filesUploaded = Boolean(
      state.filesLoaded &&
      state.files.length > 0
    );

    const datasetsConfigured = Boolean(
      state.datasets.length > 0 &&
      state.datasets
        .filter(dataset => dataset.is_selected !== false)
        .every(dataset => Boolean(dataset.entity_code) && !dataset._dirty)
    );

    const detectionComplete=Boolean(
      state.detectionLoaded &&
      state.detection.detected_count>0 &&
      (state.detection.datasets||[])
        .filter(dataset=>dataset.is_selected!==false)
        .every(dataset=>dataset.entity_code&&!dataset._dirty)
    );

    const fieldMappingComplete=Boolean(
      state.fieldMappingsLoaded &&
      state.fieldMappings.dataset_count>0 &&
      state.fieldMappings.complete_count===state.fieldMappings.dataset_count &&
      state.fieldMappings.required_unmapped_count===0 &&
      state.fieldMappings.duplicate_count===0
    );

    const referenceMappingComplete=Boolean(
      state.referenceMappingsLoaded &&
      state.referenceMappings.reference_count>0 &&
      state.referenceMappings.unresolved_count===0 &&
      state.referenceMappings.pending_count===0 &&
      !state.referenceMappingDirty
    );

    const payrollSelected=Boolean(
      state.payroll.datasets?.length||
      state.payrollItems.datasets?.length||
      state.payrollLeave.datasets?.length||
      state.payrollEmployeeLoans.datasets?.length||
      state.payrollHistory.datasets?.length
    );

    const payrollReady=
      !payrollSelected||
      Boolean(state.payrollReconciliation?.is_ready);

    const productsSelected=Boolean(
      state.products.datasets?.length
    );

    const productsReady=
      !productsSelected||
      Boolean(
        state.products.mapping?.is_complete &&
        state.products.preview &&
        Number(state.products.preview.error_count||0)===0
      );


    const productCatalogueReady=Boolean(
      state.products.mapping?.is_complete &&
      state.products.preview &&
      Number(state.products.preview.error_count||0)===0
    );

    const productAccountingReady=Boolean(
      state.products.accounting?.is_complete &&
      state.products.accountingPreview &&
      Number(state.products.accountingPreview.error_count||0)===0
    );

    const inventorySelected=Boolean(
      state.scope.entities?.some(entity=>
        entity.is_selected&&[
          "warehouses",
          "inventory_opening",
          "inventory_movements"
        ].includes(entity.code)
      )
    );

    const warehouseDatasetSelected=Boolean(
      state.inventoryMigration.datasets?.length
    );

    const inventoryLocationReady=!warehouseDatasetSelected||Boolean(
      state.inventoryMigration.mapping?.items?.length&&
      state.inventoryMigration.mapping.items.every(row=>
        row.is_approved&&(
          row.mapping_action!=="map"||
          row.target_location_id
        )
      )&&
      state.inventoryMigration.preview&&
      Number(state.inventoryMigration.preview.error_count||0)===0
    );

    const inventoryConfigurationReady=!inventorySelected||Boolean(
      state.inventoryMigration.settings&&
      (!state.inventoryMigration.settings.require_location||
        state.inventoryMigration.settings.default_location_id||
        warehouseDatasetSelected
      )
    );

    const inventoryReady=
      !inventorySelected||
      (inventoryConfigurationReady&&inventoryLocationReady); 

    const inventoryOpeningSelected=Boolean(state.inventoryOpening.datasets?.length);

    const inventoryOpeningReady=!inventoryOpeningSelected||Boolean(
      state.inventoryOpening.reconciliation?.is_ready
    );
    const inventoryMovementsSelected=Boolean(state.inventoryMovements.datasets?.length);
    const inventoryMovementsReady=!inventoryMovementsSelected||Boolean(state.inventoryMovements.reconciliation?.is_ready);
    const posSelected=Boolean(state.posMigration.datasets?.length);
    const posReady=!posSelected||Boolean(state.posMigration.reconciliation?.is_ready);
    const posMenuSelected=Boolean(state.posMenuMigration.datasets?.length);
    const posMenuReady=!posMenuSelected||Boolean(state.posMenuMigration.reconciliation?.is_ready);
    const posHistorySelected=Boolean(state.posHistoryMigration.datasets?.length);
    const posHistoryReady=!posHistorySelected||Boolean(state.posHistoryMigration.reconciliation?.is_ready);

    const checks=[
      projectSaved,
      projectConfigured,
      sourceConfigured,
      scopeConfigured,
      filesUploaded,
      datasetsConfigured,
      detectionComplete,
      fieldMappingComplete,
      referenceMappingComplete,
      ...(payrollSelected?[payrollReady]:[]),
      ...(productsSelected?[productsReady]:[]),
      ...(inventorySelected?[inventoryReady]:[]),
      ...(inventoryOpeningSelected?[inventoryOpeningReady]:[]),
      ...(inventoryMovementsSelected?[inventoryMovementsReady]:[]),
      ...(posSelected?[posReady]:[]),
      ...(posMenuSelected?[posMenuReady]:[]),
      ...(posHistorySelected?[posHistoryReady]:[]),
    ];

    const percentage = Math.round(
      checks.filter(Boolean).length /
      checks.length *
      100
    );

    const readinessBar =
      $("#mwReadinessBar");

    if (readinessBar) {
      readinessBar.style.width =
        `${percentage}%`;
    }

    setText(
      "mwReadinessText",
      `${percentage}% of project setup complete`
    );


    const controls =
      $("#mwControls");

    if(controls){
      controls.innerHTML=[
        control("Project saved",projectSaved),
        control("Project configured",projectConfigured),
        control("Source configured",sourceConfigured),
        control("Migration scope saved",scopeConfigured),
        control("Source files uploaded",filesUploaded),
        control("Datasets configured",datasetsConfigured),
        control("Source detection completed",detectionComplete),
        control("Field mapping completed",fieldMappingComplete),
        control("Account and reference mapping completed",referenceMappingComplete),
        control("Payroll migration reconciled",payrollReady),
        ...(productsSelected?[control("Product catalogue validated",productsReady)]:[]),
        ...(productsSelected?[control("Product accounting & VAT validated",productAccountingReady)]:[]),
        ...(inventorySelected?[control("Inventory configuration completed",inventoryConfigurationReady)]:[]),
        ...(warehouseDatasetSelected?[control("Warehouses and locations validated",inventoryLocationReady)]:[]),
        ...(inventoryOpeningSelected?[control("Opening inventory reconciled",inventoryOpeningReady)]:[]),
        ...(inventoryMovementsSelected?[control("Inventory movement history reconciled",inventoryMovementsReady)]:[]),
        ...(posSelected?[control("POS configuration reconciled",posReady)]:[]),
        ...(posMenuSelected?[control("POS menu and recipes reconciled",posMenuReady)]:[]),
        ...(posHistorySelected?[control("POS sales history reconciled",posHistoryReady)]:[]),
      ].join("");
    }

    const activity =
      $("#mwActivity");

    if (activity) {
      activity.innerHTML =
        state.activity.length
          ? state.activity
              .slice()
              .reverse()
              .map(item => `
                <div>${esc(item)}</div>
              `)
              .join("")
          : `
            <div>
              No migration activity yet.
            </div>
          `;
    }
  }

  function renderFooter() {
    const currentStep =
      steps.find(
        ([id]) =>
          id === state.activeStep
      );

    setText(
      "mwFooterHint",
      state.dirty
        ? `Current phase: ${currentStep?.[1] || ""} — unsaved changes`
        : `Current phase: ${currentStep?.[1] || ""}`
    );

    const previousButton = $(
      '[data-mw-action="previous"]'
    );

    const nextButton = $(
      '[data-mw-action="next"]'
    );

    const index =
      steps.findIndex(
        ([id]) =>
          id === state.activeStep
      );

    if (previousButton) {
      previousButton.disabled =
        index <= 0 ||
        state.loading ||
        state.saving;
    }

    if (nextButton) {
      nextButton.disabled =
        index >= steps.length - 1 ||
        state.loading ||
        state.saving;
    }
  }

    function renderSaveState() {
    const saveButton = document.querySelector(
        '[data-mw-action="save-project"]'
    );

    if (!saveButton) return;

    const hasSavedProject = Boolean(state.project?.id);

    saveButton.disabled =
        state.loading ||
        state.saving ||
        !state.project;

    if (state.saving) {
        saveButton.textContent = "Saving…";
        return;
    }

    if (!hasSavedProject) {
        saveButton.textContent = "Save project";
        return;
    }

    saveButton.textContent = state.dirty
        ? "Save changes"
        : "Saved";
    }

  function go(stepId) {
    if (
      !steps.some(
        ([id]) => id === stepId
      )
    ) {
      return;
    }

    state.activeStep = stepId;
    render();
  }

  function previous() {
    const index =
      steps.findIndex(
        ([id]) =>
          id === state.activeStep
      );

    if (index > 0) {
      go(
        steps[index - 1][0]
      );
    }
  }

  function next(){
    const index=steps.findIndex(([id])=>id===state.activeStep);
    if(index<0||index>=steps.length-1)return;

    if(state.activeStep==="project"&&(!state.project?.id||state.dirty)){
      notify("Save the migration project before continuing.");
      return;
    }

    if(state.activeStep==="source"&&(!state.project?.id||state.dirty)){
      notify("Save the source configuration before continuing.");
      return;
    }

    if(state.activeStep==="scope"&&(
      !state.scopeLoaded||
      !state.scope.selected_count||
      state.scopeDirty
    )){
      notify("Select and save the migration scope before continuing.");
      return;
    }

    if(state.activeStep==="files"){
      if(!state.files.length){
        notify("Upload at least one migration source file before continuing.");
        return;
      }

      const incomplete=state.datasets
        .filter(dataset=>dataset.is_selected!==false)
        .find(dataset=>!dataset.entity_code||dataset._dirty);

      if(incomplete){
        notify(`Configure and save the dataset "${incomplete.dataset_name}" before continuing.`);
        return;
      }
    }

    if(state.activeStep==="detect"){
      if(!state.detection.detected_count){
        notify("Run source detection before continuing.");
        return;
      }

      const unresolved=(state.detection.datasets||[])
        .filter(dataset=>dataset.is_selected!==false)
        .find(dataset=>!dataset.entity_code||dataset._dirty);

      if(unresolved){
        notify(`Select and save an entity for "${unresolved.dataset_name}" before continuing.`);
        return;
      }
    }

    if(state.activeStep==="mapping"){
      if(!state.fieldMappingsLoaded||!state.fieldMappings.dataset_count){
        notify("Load field mappings before continuing.");
        return;
      }

      const dirty=(state.fieldMappings.datasets||[]).find(dataset=>
        (dataset.rows||[]).some(row=>row._dirty)
      );
      if(dirty){
        notify(`Save field mapping changes for "${dirty.dataset_name}" before continuing.`);
        return;
      }

      const invalid=(state.fieldMappings.datasets||[]).find(dataset=>
        dataset.required_unmapped_count>0||dataset.duplicate_targets?.length
      );
      if(invalid){
        notify(`Complete the required field mapping for "${invalid.dataset_name}" before continuing.`);
        return;
      }
    }

    if(state.activeStep==="accounts"){
      if(!state.referenceMappings.reference_count){
        notify("Scan account and reference values before continuing.");
        return;
      }

      if(state.referenceMappingDirty){
        notify("Save account and reference mappings before continuing.");
        return;
      }

      const unresolved=(state.referenceMappings.groups||[]).find(
        group=>group.unresolved_count>0||group.pending_count>0
      );

      if(unresolved){
        notify(`Complete ${referenceTypeLabel(unresolved.reference_type)} mapping before continuing.`);
        return;
      }
    }
    go(steps[index+1][0]);
  }

  function inputField({
    label,
    field,
    sourceField,
    value,
    type = "text",
    placeholder = "",
    readonly = false,
    required = false,
  }) {
    const attribute = sourceField
      ? `data-mw-source-field="${esc(sourceField)}"`
      : `data-mw-project-field="${esc(field)}"`;

    return `
      <div class="mw-field">
        <label>
          ${esc(label)}
          ${required ? " *" : ""}
        </label>

        <input
          class="mw-input"
          type="${esc(type)}"
          value="${esc(value || "")}"
          placeholder="${esc(placeholder)}"
          ${attribute}
          ${readonly ? "readonly" : ""}
          ${required ? "required" : ""}
        >
      </div>
    `;
  }

  function selectField({
    label,
    field,
    sourceField,
    value,
    options,
  }) {
    const attribute = sourceField
      ? `data-mw-source-field="${esc(sourceField)}"`
      : `data-mw-project-field="${esc(field)}"`;

    return `
      <div class="mw-field">
        <label>${esc(label)}</label>

        <select
          class="mw-select"
          ${attribute}
        >
          ${options.map(([optionValue, optionLabel]) => `
            <option
              value="${esc(optionValue)}"
              ${
                String(optionValue) ===
                String(value ?? "")
                  ? "selected"
                  : ""
              }
            >
              ${esc(optionLabel)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function control(label, ready) {
    return `
      <div class="mw-list-item">
        <span
          class="mw-badge ${
            ready ? "ok" : "warn"
          }"
        >
          ${ready ? "Ready" : "Pending"}
        </span>

        <strong>${esc(label)}</strong>
      </div>
    `;
  }

  function setText(id, value) {
    const element =
      document.getElementById(id);

    if (element) {
      element.textContent =
        value ?? "";
    }
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(
        /\b\w/g,
        character =>
          character.toUpperCase()
      );
  }

  
  window.bindDataMigrationScreen =
    bindDataMigrationScreen;

  window.FS_MIGRATION_WORKSPACE = {
    bind: bindDataMigrationScreen,

    open: async () => {
      window.switchScreen?.(
        "data-migration"
      );

      await bindDataMigrationScreen();
    },

    refresh: initialise,

    save: saveProject,

    newProject,

    getState: () => ({
      ...state,
      projects: [
        ...state.projects,
      ],
      sourceProfiles: [
        ...state.sourceProfiles,
      ],
      project: state.project
        ? structuredClone(
            state.project
          )
        : null,
    }),
  };
})();