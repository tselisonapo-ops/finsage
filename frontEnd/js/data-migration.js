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
      await loadPpeMapping(state.project.id,{renderAfter:false});
      await loadLeaseMapping(state.project.id,{renderAfter:false});
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

  function moduleMappingView(){
    const hasPpe=state.ppe.datasets?.length;

    return `
      <div>
        <div class="mw-inline" style="margin-bottom:14px">
          ${hasPpe?`<span class="mw-badge info">PPE</span>`:""}
        </div>

        ${hasPpe
          ?ppeMappingView()
          :`<div class="mw-empty">No module-specific mappings are required yet.</div>`
        }
      </div>
    `;
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

  function moduleMappingView(){
    const hasPpe=Boolean(state.ppe.datasets?.length);
    const hasLeases=Boolean(state.leases.datasets?.length);

    return `
      <div>
        <div class="mw-inline" style="margin-bottom:14px">
          ${hasPpe?`<button class="mw-btn" data-mw-module-tab="ppe">PPE</button>`:""}
          ${hasLeases?`<button class="mw-btn" data-mw-module-tab="leases">IFRS 16 Leases</button>`:""}
        </div>

        ${hasPpe?ppeMappingView():""}
        ${hasLeases?leaseMigrationView():""}

        ${!hasPpe&&!hasLeases
          ?`<div class="mw-empty">No module-specific mappings are required yet.</div>`
          :""
        }
      </div>
    `;
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

    if (controls) {
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