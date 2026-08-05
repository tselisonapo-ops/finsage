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
    };

  function defaultProject() {
    const today = new Date()
      .toISOString()
      .slice(0, 10);

    const currency =
      window.CURRENT_COMPANY?.currency ||
      "ZAR";

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

      state.dirty = false;

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

  function handleClick(event) {
    const stepButton = event.target.closest(
      "[data-mw-step]"
    );

    if (stepButton) {
      return go(
        stepButton.dataset.mwStep
      );
    }

    const actionButton = event.target.closest(
      "[data-mw-action]"
    );

    if (!actionButton) return;

    const action =
      actionButton.dataset.mwAction;

    const actions = {
      "new-project": newProject,
      "save-project": saveProject,
      "cancel-project": cancelProject,
      "reload-project": reloadCurrentProject,
      previous,
      next,
    };

    actions[action]?.();
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

    log("New migration project prepared");
    render();
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

      default_currency: String(
        project.default_currency || ""
      ).trim().toUpperCase() || null,

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

        default_currency:
          source.default_currency ||
          project.default_currency ||
          null,

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

  function renderSummary() {
    const project =
      state.project || defaultProject();

    setText(
      "mwStatus",
      titleCase(project.status || "draft")
    );

    setText(
      "mwFileCount",
      "0"
    );

    setText(
      "mwRecordCount",
      "0"
    );

    setText(
      "mwErrorCount",
      "0"
    );

    setText(
      "mwReconStatus",
      "Not run"
    );
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
      scope: futureView,
      files: futureView,
      detect: futureView,
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

    const checks = [
      projectSaved,
      projectConfigured,
      sourceConfigured,
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
      `${percentage}% of Phase 1 complete`
    );

    const controls =
      $("#mwControls");

    if (controls) {
      controls.innerHTML = [
        control(
          "Project saved",
          projectSaved
        ),

        control(
          "Project configured",
          projectConfigured
        ),

        control(
          "Source configured",
          sourceConfigured
        ),
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

  function next() {
    const index =
      steps.findIndex(
        ([id]) =>
          id === state.activeStep
      );

    if (
      index >= 0 &&
      index < steps.length - 1
    ) {
      if (
        index < 2 &&
        !state.project?.id
      ) {
        notify(
          "Save the migration project before continuing."
        );
        return;
      }

      go(
        steps[index + 1][0]
      );
    }
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