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

    if (!dataset.dataset_name?.trim()) {
      notify(
        "Dataset name is required."
      );
      return;
    }

    if (
      Number(dataset.header_row) < 0
    ) {
      notify(
        "Header row cannot be negative."
      );
      return;
    }

    if (
      Number(dataset.data_start_row) < 1
    ) {
      notify(
        "Data start row must be at least 1."
      );
      return;
    }

    state.datasetSavingId =
      datasetId;

    render();

    try {
      const response = await apiFetch(
        ENDPOINTS.migrations.projectDataset(
          companyId(),
          state.project.id,
          datasetId
        ),
        {
          method: "PATCH",
          body: JSON.stringify({
            dataset_name:
              dataset.dataset_name.trim(),

            entity_code:
              dataset.entity_code || null,

            header_row:
              Number(
                dataset.header_row || 0
              ),

            data_start_row:
              Number(
                dataset.data_start_row || 1
              ),

            data_end_row:
              dataset.data_end_row
                ? Number(
                    dataset.data_end_row
                  )
                : null,

            delimiter:
              dataset.delimiter ?? null,

            encoding:
              dataset.encoding ?? null,

            date_format:
              dataset.date_format || null,

            decimal_separator:
              dataset.decimal_separator ?? null,

            thousands_separator:
              dataset.thousands_separator ?? null,

            is_selected:
              dataset.is_selected !== false,

            settings_json:
              dataset.settings_json || {},

            metadata_json:
              dataset.metadata_json || {},
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

      log(
        `Configured dataset ${dataset.dataset_name}`
      );

      notify(
        "Dataset configuration saved."
      );

    } catch (error) {
      state.error =
        errorMessage(error);

      notify(state.error);

    } finally {
      state.datasetSavingId =
        null;

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
      state.project.status="detected";
      log(`Detection completed for ${state.detection.detected_count} dataset(s)`);
    }catch(error){state.error=errorMessage(error);notify(state.error)}
    finally{state.detecting=false;render()}
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
      mapping: futureView,
      accounts: futureView,
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

    const checks=[
      projectSaved,
      projectConfigured,
      sourceConfigured,
      scopeConfigured,
      filesUploaded,
      datasetsConfigured,
      detectionComplete,
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