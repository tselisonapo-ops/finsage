(function () {
  "use strict";

  const FS = window.FinSage || {};
  const ENDPOINTS = FS.ENDPOINTS || window.ENDPOINTS;
  const apiFetch = FS.apiFetch || window.apiFetch;
  const getActiveCompanyId = FS.getActiveCompanyId || window.getActiveCompanyId;

  const state = {
    runs: [],
    selectedRun: null,
    tbSummary: null,
    mapping: null,
    groupCoa: [],
    precon: null,
    adjustments: [],
    intercompany: null,
    eliminations: [],
    adjustedTb: null,
    acquisition: null,
    equityMethod: null,
  };

  function companyId() {
    return getActiveCompanyId?.() ||
      window.CURRENT_COMPANY_ID ||
      window.CURRENT_COMPANY?.id ||
      null;
  }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function statusLabel(status) {
    return String(status || "draft")
      .replaceAll("_", " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

    function money(v) {
    const n = Number(v || 0);

    return Number.isFinite(n)
        ? n.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
        : "0.00";
    }

  function openRunModal() {
    const modal = document.getElementById("groupRunModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeRunModal() {
    const modal = document.getElementById("groupRunModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.getElementById("groupRunForm")?.reset();
  }

  function renderSummary() {
    const runs = state.runs;

    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    };

    set("grTotalRuns", runs.length);
    set("grDraftRuns", runs.filter(r => r.status === "draft").length);
    set("grPreparedRuns", runs.filter(r => r.status === "prepared").length);
    set(
      "grFinalRuns",
      runs.filter(r => ["approved", "locked"].includes(r.status)).length
    );
  }

  function renderRuns() {
    const host = document.getElementById("groupConsolidationRunsList");
    if (!host) return;

    if (!state.runs.length) {
      host.innerHTML = `
        <div class="px-4 py-10 text-center text-sm text-slate-500">
          No consolidation runs yet.
        </div>
      `;
      renderSummary();
      return;
    }

    host.innerHTML = state.runs.map(run => `
      <div class="px-4 py-4 flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <div class="text-sm font-semibold text-slate-800">
              ${esc(run.run_name)}
            </div>

            <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-600">
              ${esc(statusLabel(run.status))}
            </span>
          </div>

          <div class="mt-1 text-xs text-slate-500">
            ${esc(run.period_start)} → ${esc(run.period_end)}
            · Reporting date: ${esc(run.reporting_date)}
            · ${esc(run.reporting_currency)}
          </div>

          <div class="mt-2 flex gap-4 text-xs text-slate-500">
            <span>
              Entities:
              <strong class="text-slate-700">${Number(run.entity_count || 0)}</strong>
            </span>

            <span>
              Included:
              <strong class="text-slate-700">${Number(run.included_entity_count || 0)}</strong>
            </span>

            <span>
              Ready:
              <strong class="text-slate-700">${Number(run.ready_entity_count || 0)}</strong>
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          ${run.status === "draft" ? `
            <button
              type="button"
              data-gr-prepare="${esc(run.id)}"
              class="border rounded px-3 py-1.5 text-xs bg-white hover:bg-slate-50"
            >
              Prepare
            </button>
          ` : ""}

          <button
            type="button"
            data-gr-open="${esc(run.id)}"
            class="rounded bg-slate-900 text-white px-3 py-1.5 text-xs"
          >
            Open
          </button>
        </div>
      </div>
    `).join("");

    renderSummary();
    bindRunActions();
  }

  async function loadRuns() {
    const cid = companyId();
    if (!cid) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.runs(cid),
        { method: "GET" }
      );

      state.runs = res?.items || [];
      renderRuns();
    } catch (e) {
      console.error("[Consolidation] run load failed:", e);
      state.runs = [];
      renderRuns();
    }
  }

  async function createRun(form) {
    const cid = companyId();
    if (!cid) return;

    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());

    for (const key of Object.keys(payload)) {
      if (typeof payload[key] === "string")
        payload[key] = payload[key].trim();
    }

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.runs(cid),
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      closeRunModal();
      alert(res?.message || "Consolidation run created.");
      await loadRuns();
    } catch (e) {
      console.error("[Consolidation] create failed:", e);
      alert(e?.message || "Failed to create consolidation run.");
    }
  }

  async function prepareRun(runId) {
    const cid = companyId();
    if (!cid || !runId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.prepare(cid, runId),
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      alert(res?.message || "Consolidation run prepared.");
      await loadRuns();
    } catch (e) {
      console.error("[Consolidation] prepare failed:", e);
      alert(e?.message || "Failed to prepare consolidation run.");
    }
  }

  async function openRun(runId) {
    const cid = companyId();
    if (!cid || !runId) return;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.run(cid, runId),
        { method: "GET" }
      );

      state.selectedRun = data;

      const mapTab =
        document.getElementById("grAccountMappingTab");

      if (mapTab)
        mapTab.disabled = false;

      const preconTab =
        document.getElementById("grPreconsolidationTab");

      if (preconTab)
        preconTab.disabled = false;

      const adjustmentsTab =
        document.getElementById("grAdjustmentsTab");

      if (adjustmentsTab)
        adjustmentsTab.disabled = false;

      const icTab = document.getElementById("grIntercompanyTab");
      if (icTab) icTab.disabled = false;

      const elimTab = document.getElementById("grEliminationsTab");
      if (elimTab) elimTab.disabled = false;

      const adjustedTab = document.getElementById("grAdjustedTbTab");
      if (adjustedTab) adjustedTab.disabled = false;

      const acqTab = document.getElementById("grAcquisitionTab");
      if (acqTab) acqTab.disabled = false;

      const eqTab = document.getElementById("grEquityMethodTab");
      if (eqTab) eqTab.disabled = false;

      document
        .querySelector('[data-group-panel="runs"]')
        ?.classList.add("hidden");

      document
        .getElementById("groupRunWorkspace")
        ?.classList.remove("hidden");

      document
        .getElementById("groupMappingWorkspace")
        ?.classList.add("hidden");

      renderRunWorkspaceHeader();
      await loadGroupTbSummary();

    } catch (e) {
      console.error("[Consolidation] open failed:", e);
      alert(e?.message || "Failed to open consolidation run.");
    }
  }

  function bindRunActions() {
    document.querySelectorAll("[data-gr-prepare]").forEach(btn => {
      btn.addEventListener("click", () => {
        prepareRun(Number(btn.dataset.grPrepare || 0));
      });
    });

    document.querySelectorAll("[data-gr-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        openRun(Number(btn.dataset.grOpen || 0));
      });
    });
  }

  function renderRunWorkspaceHeader() {
    const run = state.selectedRun?.run || {};

    const title =
      document.getElementById("groupRunWorkspaceTitle");

    const status =
      document.getElementById("groupRunWorkspaceStatus");

    const period =
      document.getElementById("groupRunWorkspacePeriod");

    if (title)
      title.textContent =
        run.run_name || "Consolidation run";

    if (status)
      status.textContent =
        statusLabel(run.status);

    if (period) {
      period.textContent =
        `${run.period_start || "—"} → ${run.period_end || "—"} · ` +
        `Reporting date ${run.reporting_date || "—"} · ` +
        `${run.reporting_currency || ""}`;
    }
  }

  async function loadGroupTbSummary() {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId) return;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.trialBalances(cid, runId),
        { method: "GET" }
      );

      state.tbSummary = data;
      renderGroupTbSummary();
    } catch (e) {
      console.error("[Consolidation] TB summary failed:", e);
      state.tbSummary = {
        entities: [],
        summary: {},
      };

      renderGroupTbSummary();
    }
  }

  function renderGroupTbSummary() {
    const data = state.tbSummary || {};
    const summary = data.summary || {};
    const entities = data.entities || [];

    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value ?? 0);
    };

    set("grTbTotal", summary.total || 0);
    set("grTbReady", summary.ready || 0);
    set("grTbWarnings", summary.warnings || 0);
    set(
      "grTbBlocked",
      Number(summary.blocked || 0) +
      Number(summary.pending || 0)
    );

    const body = document.getElementById("groupTbEntitiesBody");
    if (!body) return;

    if (!entities.length) {
      body.innerHTML = `
        <tr>
          <td colspan="8" class="px-4 py-8 text-center text-slate-500">
            No entities found in this consolidation run.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = entities.map(e => `
      <tr class="border-t">
        <td class="px-4 py-3">
          <div class="font-medium text-slate-800">
            ${esc(e.entity_name)}
          </div>

          <div class="text-[11px] text-slate-500">
            ${esc(e.system_company_code || "")}
          </div>
        </td>

        <td class="px-4 py-3 text-slate-600">
          ${esc(
            String(e.relationship_type || "")
              .replaceAll("_", " ")
          )}
        </td>

        <td class="px-4 py-3 text-slate-600">
          ${esc(e.consolidation_method || "—")}
        </td>

        <td class="px-4 py-3 text-right tabular-nums">
          ${money(e.total_debit)}
        </td>

        <td class="px-4 py-3 text-right tabular-nums">
          ${money(e.total_credit)}
        </td>

        <td class="px-4 py-3 text-right tabular-nums">
          ${money(e.difference)}
        </td>

        <td class="px-4 py-3">
          <span class="rounded bg-slate-100 px-2 py-1 text-[10px] uppercase">
            ${esc(e.readiness_status || "pending")}
          </span>

          ${e.error_message ? `
            <div class="mt-1 text-[11px] text-red-600">
              ${esc(e.error_message)}
            </div>
          ` : ""}
        </td>

        <td class="px-4 py-3">
          <div class="flex justify-end gap-2">
            ${e.import_id ? `
              <button
                type="button"
                data-gr-view-tb="${e.run_entity_id}"
                class="border rounded px-2 py-1 text-xs bg-white"
              >
                View
              </button>
            ` : ""}

            <button
              type="button"
              data-gr-load-tb="${e.run_entity_id}"
              class="rounded px-2 py-1 text-xs bg-slate-900 text-white"
            >
              ${e.import_id ? "Reload" : "Load"}
            </button>
          </div>
        </td>
      </tr>
    `).join("");

    bindGroupTbActions();
  }

  async function loadEntityTb(runEntityId) {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId || !runEntityId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.loadEntityTrialBalance(
          cid,
          runId,
          runEntityId
        ),
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      alert(res?.message || "Trial balance loaded.");
      await loadGroupTbSummary();
    } catch (e) {
      console.error("[Consolidation] entity TB load failed:", e);
      alert(e?.message || "Failed to load trial balance.");
      await loadGroupTbSummary();
    }
  }

  async function loadAllEntityTbs() {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.loadAllTrialBalances(
          cid,
          runId
        ),
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      alert(res?.message || "Trial balances loaded.");
      await loadGroupTbSummary();
      await loadRuns();
    } catch (e) {
      console.error("[Consolidation] load-all failed:", e);
      alert(e?.message || "Failed to load trial balances.");
    }
  }

  async function viewEntityTb(runEntityId) {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId || !runEntityId) return;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.entityTrialBalance(
          cid,
          runId,
          runEntityId
        ),
        { method: "GET" }
      );

      renderEntityTbModal(data);
    } catch (e) {
      console.error("[Consolidation] TB view failed:", e);
      alert(e?.message || "Failed to load entity trial balance.");
    }
  }
  function renderEntityTbModal(data) {
    const entity = data?.entity || {};
    const lines = data?.lines || [];

    const modal = document.getElementById("groupTbModal");
    const title = document.getElementById("groupTbModalTitle");
    const meta = document.getElementById("groupTbModalMeta");
    const body = document.getElementById("groupTbModalBody");

    if (!modal || !body) return;

    if (title)
      title.textContent =
        `${entity.entity_name || "Entity"} Trial Balance`;

    if (meta) {
      meta.textContent =
        `${lines.length} account(s) · Debit ${money(entity.total_debit)} · ` +
        `Credit ${money(entity.total_credit)} · Difference ${money(entity.difference)}`;
    }

    body.innerHTML = lines.length
      ? lines.map(r => `
          <tr class="border-t">
            <td class="px-4 py-2 font-medium">
              ${esc(r.source_account_code)}
            </td>

            <td class="px-4 py-2">
              ${esc(r.source_account_name || "")}
            </td>

            <td class="px-4 py-2 text-right tabular-nums">
              ${money(r.debit)}
            </td>

            <td class="px-4 py-2 text-right tabular-nums">
              ${money(r.credit)}
            </td>

            <td class="px-4 py-2 text-right tabular-nums">
              ${money(r.balance)}
            </td>
          </tr>
        `).join("")
      : `
          <tr>
            <td colspan="5" class="px-4 py-8 text-center text-slate-500">
              No trial balance lines.
            </td>
          </tr>
        `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeEntityTbModal() {
    const modal = document.getElementById("groupTbModal");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
  }

  function bindGroupTbActions() {
    document.querySelectorAll("[data-gr-load-tb]").forEach(btn => {
      btn.addEventListener("click", () =>
        loadEntityTb(
          Number(btn.dataset.grLoadTb || 0)
        )
      );
    });

    document.querySelectorAll("[data-gr-view-tb]").forEach(btn => {
      btn.addEventListener("click", () =>
        viewEntityTb(
          Number(btn.dataset.grViewTb || 0)
        )
      );
    });
  }

  function showGroupTab(tab) {
    const mapping =
      document.getElementById("groupMappingWorkspace");

    const runs =
      document.querySelector('[data-group-panel="runs"]');

    const runWorkspace =
      document.getElementById("groupRunWorkspace");

    const precon =
      document.getElementById("groupPreconWorkspace");

    const adjustments =
      document.getElementById("groupAdjustmentsWorkspace");

    const intercompany = 
      document.getElementById("groupIntercompanyWorkspace");

    const eliminations = 
      document.getElementById("groupEliminationsWorkspace");

    const adjustedTb = 
      document.getElementById("groupAdjustedTbWorkspace");

    const acquisition = 
      document.getElementById("groupAcquisitionWorkspace");

    const equityMethod = 
      document.getElementById("groupEquityMethodWorkspace");

      document.querySelectorAll(".group-reporting-tab").forEach(btn => {
        const active = btn.dataset.groupTab === tab;

        btn.classList.toggle("active", active);
        btn.classList.toggle("border-b-2", active);
        btn.classList.toggle("border-slate-900", active);
        btn.classList.toggle("font-medium", active);
        btn.classList.toggle("text-slate-500", !active);
      });

    if (tab === "preconsolidation") {
      runs?.classList.add("hidden");
      runWorkspace?.classList.add("hidden");
      mapping?.classList.add("hidden");
      adjustments?.classList.add("hidden");
      precon?.classList.remove("hidden");
      loadPreconsolidation();
      return;
    }

    if (tab === "mapping") {
      runs?.classList.add("hidden");
      runWorkspace?.classList.add("hidden");
      precon?.classList.add("hidden");
      adjustments?.classList.add("hidden");
      mapping?.classList.remove("hidden");
      loadGroupMapping();
      return;
    }

    if (tab === "adjustments") {
      runs?.classList.add("hidden");
      runWorkspace?.classList.add("hidden");
      mapping?.classList.add("hidden");
      precon?.classList.add("hidden");
      adjustments?.classList.remove("hidden");

      loadGroupAdjustments();
      return;
    }

    if (tab === "intercompany") {
      runs?.classList.add("hidden");
      runWorkspace?.classList.add("hidden");
      mapping?.classList.add("hidden");
      precon?.classList.add("hidden");
      adjustments?.classList.add("hidden");
      intercompany?.classList.remove("hidden");
      loadIntercompany();
      return;
    }

    if (tab === "eliminations") {
      runs?.classList.add("hidden");
      runWorkspace?.classList.add("hidden");
      mapping?.classList.add("hidden");
      precon?.classList.add("hidden");
      adjustments?.classList.add("hidden");
      intercompany?.classList.add("hidden");
      eliminations?.classList.remove("hidden");
      loadGroupEliminations();
      return;
    }

    if (tab === "adjusted-tb") {
      runs?.classList.add("hidden");
      runWorkspace?.classList.add("hidden");
      mapping?.classList.add("hidden");
      precon?.classList.add("hidden");
      adjustments?.classList.add("hidden");
      intercompany?.classList.add("hidden");
      eliminations?.classList.add("hidden");
      adjustedTb?.classList.remove("hidden");
      loadAdjustedTb();
      return;
    }

    if (tab === "acquisition") {
      runs?.classList.add("hidden");
      runWorkspace?.classList.add("hidden");
      mapping?.classList.add("hidden");
      precon?.classList.add("hidden");
      adjustments?.classList.add("hidden");
      intercompany?.classList.add("hidden");
      eliminations?.classList.add("hidden");
      adjustedTb?.classList.add("hidden");
      acquisition?.classList.remove("hidden");
      loadAcquisitionWorkspace();
      return;
    }

    if (tab === "equity-method") {
      runs?.classList.add("hidden");
      runWorkspace?.classList.add("hidden");
      mapping?.classList.add("hidden");
      precon?.classList.add("hidden");
      adjustments?.classList.add("hidden");
      intercompany?.classList.add("hidden");
      eliminations?.classList.add("hidden");
      adjustedTb?.classList.add("hidden");
      acquisition?.classList.add("hidden");
      equityMethod?.classList.remove("hidden");
      loadEquityMethodWorkspace();
      return;
    }

    mapping?.classList.add("hidden");
    precon?.classList.add("hidden");
    adjustments?.classList.add("hidden");
    intercompany?.classList.add("hidden");
    eliminations?.classList.add("hidden");
    adjustedTb?.classList.add("hidden");
    acquisition?.classList.add("hidden");
    equityMethod?.classList.add("hidden");
    

    if (state.selectedRun) {
      runs?.classList.add("hidden");
      runWorkspace?.classList.remove("hidden");
    } else {
      runWorkspace?.classList.add("hidden");
      runs?.classList.remove("hidden");
    }
  }

  async function loadGroupMapping() {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId) return;

    const entityCompanyId =
      document.getElementById("grMappingEntityFilter")?.value || "";

    const unmappedOnly =
      document.getElementById("grMappingUnmappedOnly")?.checked || false;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.accountMapping(
          cid,
          runId,
          {
            entityCompanyId,
            unmappedOnly,
          }
        ),
        { method: "GET" }
      );

      state.mapping = data;
      state.groupCoa = data?.group_coa || [];

      renderGroupMapping();
    } catch (e) {
      console.error("[Consolidation] mapping load failed:", e);

      state.mapping = {
        rows: [],
        entities: [],
        group_coa: [],
        summary: {},
      };

      renderGroupMapping();
    }
  }

  function renderGroupMapping() {
    const data = state.mapping || {};
    const rows = data.rows || [];
    const summary = data.summary || {};
    const entities = data.entities || [];
    const groupCoa = data.group_coa || [];

    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    };

    set("grMapTotal", summary.total || 0);
    set("grMapMapped", summary.mapped || 0);
    set("grMapUnmapped", summary.unmapped || 0);
    set("grMapPercent", `${Number(summary.percent || 0).toFixed(1)}%`);

    const meta = document.getElementById("grMappingRunMeta");
    const run = state.selectedRun?.run || {};

    if (meta) {
      meta.textContent =
        `${run.run_name || "Consolidation run"} · ` +
        `${run.reporting_date || ""}`;
    }

    const filter =
      document.getElementById("grMappingEntityFilter");

    if (filter && filter.dataset.loadedRun !== String(run.id || "")) {
      const current = filter.value;

      filter.innerHTML = `
        <option value="">All entities</option>
        ${entities.map(e => `
          <option value="${esc(e.entity_company_id)}">
            ${esc(e.entity_name)}
          </option>
        `).join("")}
      `;

      filter.value = current;
      filter.dataset.loadedRun = String(run.id || "");
    }

    const body = document.getElementById("grMappingBody");
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-8 text-center text-slate-500">
            No trial-balance accounts match the current filters.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = rows.map(r => `
      <tr class="border-t">
        <td class="px-4 py-3">
          <div class="font-medium text-slate-800">
            ${esc(r.entity_name)}
          </div>
          <div class="text-[11px] text-slate-500">
            ${esc(r.relationship_type || "")}
          </div>
        </td>

        <td class="px-4 py-3">
          <div class="font-medium text-slate-800">
            ${esc(r.source_account_code)}
          </div>
          <div class="text-xs text-slate-500">
            ${esc(r.source_account_name || "")}
          </div>
        </td>

        <td class="px-4 py-3 text-xs text-slate-600">
          ${esc(r.role || "—")}
        </td>

        <td class="px-4 py-3 text-right tabular-nums">
          ${money(r.balance)}
        </td>

        <td class="px-4 py-3 min-w-[300px]">
          ${r.group_account_id ? `
            <div class="flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <div class="text-xs font-medium text-slate-800">
                  ${esc(r.group_account_code || "")} · ${esc(r.group_account_name || "")}
                </div>
                <div class="text-[11px] text-slate-500">
                  ${esc((r.mapping_source || "").replaceAll("_", " "))}
                </div>
              </div>

              <button
                type="button"
                data-gr-resolve-map="${esc(r.tb_line_id)}"
                class="border rounded px-2 py-1 text-xs bg-white hover:bg-slate-50"
              >
                Change
              </button>
            </div>
          ` : `
            <button
              type="button"
              data-gr-resolve-map="${esc(r.tb_line_id)}"
              class="rounded px-3 py-1.5 text-xs bg-slate-900 text-white"
            >
              Resolve Mapping
            </button>
          `}
        </td>

        <td class="px-4 py-3">
          ${r.mapping_source ? `
            <div class="text-xs text-slate-700">
              ${esc(r.mapping_source.replaceAll("_", " "))}
            </div>

            <div class="text-[11px] text-slate-500">
              ${r.confidence != null
                ? `${Number(r.confidence).toFixed(0)}% confidence`
                : ""}
            </div>
          ` : `
            <span class="text-xs text-amber-600">
              Unmapped
            </span>
          `}
        </td>
      </tr>

      <tr
        id="grMappingEditor-${esc(r.tb_line_id)}"
        class="hidden bg-slate-50"
      >
        <td colspan="6" class="px-4 py-4">
          <div
            data-gr-mapping-editor="${esc(r.tb_line_id)}"
            class="rounded-xl border bg-white p-4"
          ></div>
        </td>
      </tr>
    `).join("");

    bindMappingRows();
  }

  async function saveMapping(tbLineId, groupAccountId) {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId || !tbLineId || !groupAccountId)
      return;

    try {
      await apiFetch(
        ENDPOINTS.consolidation.accountMappingLine(
          cid,
          runId,
          tbLineId
        ),
        {
          method: "PATCH",
          body: JSON.stringify({
            group_account_id: Number(groupAccountId),
          }),
        }
      );

      await loadGroupMapping();
    } catch (e) {
      console.error("[Consolidation] mapping save failed:", e);
      alert(e?.message || "Failed to save account mapping.");
    }
  }

  function groupMappingRow(tbLineId) {
    return (state.mapping?.rows || []).find(
      r => Number(r.tb_line_id) === Number(tbLineId)
    ) || null;
  }

  function renderMappingEditor(tbLineId) {
    const row = groupMappingRow(tbLineId);
    const host = document.querySelector(
      `[data-gr-mapping-editor="${tbLineId}"]`
    );

    if (!row || !host) return;

    const groupCoa = state.groupCoa || [];

    host.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-slate-800">
            Resolve Account Mapping
          </div>

          <div class="mt-1 text-xs text-slate-500">
            ${esc(row.entity_name)} ·
            ${esc(row.source_account_code)} ·
            ${esc(row.source_account_name || "")}
          </div>
        </div>

        <button
          type="button"
          data-gr-close-map="${esc(tbLineId)}"
          class="border rounded px-2 py-1 text-xs bg-white"
        >
          Close
        </button>
      </div>

      <div class="mt-4">
        <label class="block text-[11px] text-slate-500 mb-1">
          Existing Group Account
        </label>

        <div class="flex gap-2">
          <select
            id="grExistingAccount-${esc(tbLineId)}"
            class="flex-1 border rounded px-3 py-2 text-sm bg-white"
          >
            <option value="">Select group account...</option>

            ${groupCoa.map(g => `
              <option
                value="${esc(g.id)}"
                ${Number(row.group_account_id) === Number(g.id) ? "selected" : ""}
              >
                ${esc(g.code)} · ${esc(g.name)}
              </option>
            `).join("")}
          </select>

          <button
            type="button"
            data-gr-save-existing="${esc(tbLineId)}"
            class="rounded px-3 py-2 text-sm bg-slate-900 text-white"
          >
            Map
          </button>
        </div>
      </div>

      <div class="relative my-5">
        <div class="border-t"></div>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="bg-white px-3 text-[11px] uppercase tracking-wide text-slate-400">
            Or create a group account
          </span>
        </div>
      </div>

      <form
        data-gr-create-map-form="${esc(tbLineId)}"
        class="mt-4"
      >
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-[11px] text-slate-500 mb-1">
              Section
            </label>

            <select
              name="section"
              data-gr-new-section
              class="w-full border rounded px-3 py-2 text-sm bg-white"
              required
            >
              <option value="">Select...</option>
              <option value="Asset">Assets</option>
              <option value="Liability">Liabilities</option>
              <option value="Equity">Equity</option>
              <option value="Income">Income</option>
              <option value="Expense">Expenses</option>
              <option value="Adjustment">Adjustments</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] text-slate-500 mb-1">
              Category
            </label>

            <input
              name="category"
              value="${esc(row.category || "")}"
              class="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label class="block text-[11px] text-slate-500 mb-1">
              Subcategory
            </label>

            <input
              name="subcategory"
              value="${esc(row.subcategory || "")}"
              class="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div class="md:col-span-2">
            <label class="block text-[11px] text-slate-500 mb-1">
              Group Account Name
            </label>

            <input
              name="name"
              value="${esc(row.source_account_name || "")}"
              class="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label class="block text-[11px] text-slate-500 mb-1">
              IFRS / Standard
            </label>

            <input
              name="standard"
              value="${esc(row.standard || "")}"
              placeholder="e.g. IAS 1"
              class="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div class="md:col-span-3">
            <label class="block text-[11px] text-slate-500 mb-1">
              Reporting Description
            </label>

            <textarea
              name="reporting_description"
              class="w-full border rounded px-3 py-2 text-sm min-h-[70px]"
            ></textarea>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between gap-3">
          <div class="text-xs text-slate-500">
            FinSage will assign the reporting code automatically.
          </div>

          <button
            type="submit"
            class="rounded px-3 py-2 text-sm bg-slate-900 text-white"
          >
            Create & Map
          </button>
        </div>
      </form>
    `;

    const section =
      host.querySelector("[data-gr-new-section]");

    if (section && row.section) {
      const current = String(row.section).toLowerCase();

      if (current.includes("asset"))
        section.value = "Asset";
      else if (current.includes("liabil"))
        section.value = "Liability";
      else if (current.includes("equity"))
        section.value = "Equity";
      else if (current.includes("income") || current.includes("revenue"))
        section.value = "Income";
      else if (current.includes("adjust"))
        section.value = "Adjustment";
      else if (current.includes("expense"))
        section.value = "Expense";
    }

    bindMappingEditor(tbLineId);
  }

  function bindMappingEditor(tbLineId) {
    const host = document.querySelector(
      `[data-gr-mapping-editor="${tbLineId}"]`
    );

    if (!host) return;

    host
      .querySelector(`[data-gr-close-map="${tbLineId}"]`)
      ?.addEventListener("click", () => {
        document
          .getElementById(`grMappingEditor-${tbLineId}`)
          ?.classList.add("hidden");
      });

    host
      .querySelector(`[data-gr-save-existing="${tbLineId}"]`)
      ?.addEventListener("click", async () => {
        const select =
          document.getElementById(`grExistingAccount-${tbLineId}`);

        const accountId =
          Number(select?.value || 0);

        if (!accountId) {
          alert("Select a Group Account.");
          return;
        }

        await saveMapping(
          tbLineId,
          accountId
        );
      });

    host
      .querySelector(`[data-gr-create-map-form="${tbLineId}"]`)
      ?.addEventListener("submit", async e => {
        e.preventDefault();

        await createAndMapGroupAccount(
          tbLineId,
          e.currentTarget
        );
      });
  }

  async function createAndMapGroupAccount(
    tbLineId,
    form
  ) {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId || !tbLineId) return;

    const fd = new FormData(form);

    const payload = {
      name: String(fd.get("name") || "").trim(),
      section: String(fd.get("section") || "").trim(),
      category: String(fd.get("category") || "").trim(),
      subcategory:
        String(fd.get("subcategory") || "").trim() || null,

      standard:
        String(fd.get("standard") || "").trim() || null,

      reporting_description:
        String(fd.get("reporting_description") || "").trim() || null,

      template_code: null,
      template_code_scoped: null,
    };

    if (!payload.name) {
      alert("Group account name is required.");
      return;
    }

    if (!payload.section) {
      alert("Section is required.");
      return;
    }

    if (!payload.category) {
      alert("Category is required.");
      return;
    }

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.createMappingAccount(
          cid,
          runId,
          tbLineId
        ),
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      alert(
        res?.message ||
        "Group account created and mapped."
      );

      await loadGroupMapping();

    } catch (e) {
      console.error(
        "[Consolidation] create + map failed:",
        e
      );

      alert(
        e?.message ||
        "Failed to create and map group account."
      );
    }
  }

  function bindMappingRows() {
    document.querySelectorAll("[data-gr-resolve-map]").forEach(btn => {
      btn.addEventListener("click", () => {
        const tbLineId =
          Number(btn.dataset.grResolveMap || 0);

        const row =
          document.getElementById(`grMappingEditor-${tbLineId}`);

        if (!row || !tbLineId) return;

        const opening = row.classList.contains("hidden");

        document
          .querySelectorAll('[id^="grMappingEditor-"]')
          .forEach(el => el.classList.add("hidden"));

        if (!opening) return;

        row.classList.remove("hidden");
        renderMappingEditor(tbLineId);
      });
    });
  }


  async function bootstrapGroupCoa() {
    const cid = companyId();
    if (!cid) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.bootstrapGroupCoa(cid),
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      alert(res?.message || "Group COA prepared.");
      await loadGroupMapping();
    } catch (e) {
      console.error("[Consolidation] COA bootstrap failed:", e);
      alert(e?.message || "Failed to bootstrap Group COA.");
    }
  }

  async function autoMapGroupAccounts() {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.autoMapAccounts(
          cid,
          runId
        ),
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      alert(res?.message || "Account mapping completed.");
      await loadGroupMapping();
    } catch (e) {
      console.error("[Consolidation] auto-map failed:", e);
      alert(e?.message || "Failed to auto-map accounts.");
    }
  }

  async function validatePreconsolidation() {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId) return null;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.validatePreconsolidation(
          cid,
          runId
        ),
        { method: "GET" }
      );

      renderPreconValidation(data);
      return data;

    } catch (e) {
      console.error("[Consolidation] precon validation failed:", e);
      alert(e?.message || "Pre-consolidation validation failed.");
      return null;
    }
  }

  function renderPreconValidation(data) {
    const host =
      document.getElementById("grPreconValidation");

    if (!host) return;

    host.classList.remove("hidden");

    if (data?.ready) {
      host.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-slate-800">
              Ready to generate
            </div>
            <div class="mt-1 text-xs text-slate-500">
              All included entity trial balances are loaded, balanced and fully mapped.
            </div>
          </div>

          <span class="rounded bg-emerald-50 text-emerald-700 px-2 py-1 text-xs">
            Ready
          </span>
        </div>
      `;
      return;
    }

    const issues = data?.issues || [];

    host.innerHTML = `
      <div class="text-sm font-semibold text-slate-800">
        ${issues.length} issue${issues.length === 1 ? "" : "s"} must be resolved
      </div>

      <div class="mt-3 space-y-2">
        ${issues.map(i => `
          <div class="rounded bg-slate-50 px-3 py-2">
            <div class="text-xs font-medium text-slate-700">
              ${esc(i.entity_name || "")}
            </div>
            <div class="text-xs text-slate-500">
              ${esc(i.message || "")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  async function generatePreconsolidation() {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId) return;

    const validation =
      await validatePreconsolidation();

    if (!validation?.ready) {
      alert(
        "Resolve the outstanding trial-balance and mapping issues first."
      );
      return;
    }

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.generatePreconsolidation(
          cid,
          runId
        ),
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      state.precon = res?.data || null;

      alert(
        res?.message ||
        "Pre-consolidation trial balance generated."
      );

      renderPreconsolidation();

    } catch (e) {
      console.error("[Consolidation] precon generation failed:", e);
      alert(
        e?.message ||
        "Failed to generate pre-consolidation trial balance."
      );
    }
  }

  async function loadPreconsolidation() {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId) return;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.preconsolidation(
          cid,
          runId
        ),
        { method: "GET" }
      );

      state.precon = data;
      renderPreconsolidation();

    } catch (e) {
      console.error("[Consolidation] precon load failed:", e);

      state.precon = {
        header: null,
        entities: [],
        rows: [],
        summary: {},
      };

      renderPreconsolidation();
    }
  }

  function renderPreconsolidation() {
    const data = state.precon || {};
    const summary = data.summary || {};
    const entities = data.entities || [];
    const rows = data.rows || [];

    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    };

    set("grPreconAccounts", summary.account_count || 0);
    set("grPreconDebit", money(summary.total_debit));
    set("grPreconCredit", money(summary.total_credit));
    set("grPreconDifference", money(summary.difference));

    const head =
      document.getElementById("grPreconHead");

    const body =
      document.getElementById("grPreconBody");

    if (!head || !body) return;

    head.innerHTML = `
      <tr>
        <th class="text-left px-4 py-3 sticky left-0 bg-slate-50">
          Group Account
        </th>

        ${entities.map(e => `
          <th class="text-right px-4 py-3">
            ${esc(e.entity_name)}
          </th>
        `).join("")}

        <th class="text-right px-4 py-3">
          Group Total
        </th>
      </tr>
    `;

    if (!data.header) {
      body.innerHTML = `
        <tr>
          <td
            colspan="${entities.length + 2}"
            class="px-4 py-10 text-center text-slate-500"
          >
            Pre-consolidation trial balance has not been generated yet.
          </td>
        </tr>
      `;
      return;
    }

    renderPreconRows(rows, entities);
  }

  function renderPreconRows(
    rows = state.precon?.rows || [],
    entities = state.precon?.entities || []
  ) {
    const body =
      document.getElementById("grPreconBody");

    if (!body) return;

    const q =
      String(
        document.getElementById("grPreconSearch")?.value || ""
      )
      .trim()
      .toLowerCase();

    const filtered = !q
      ? rows
      : rows.filter(r =>
          String(r.code || "").toLowerCase().includes(q) ||
          String(r.name || "").toLowerCase().includes(q) ||
          String(r.category || "").toLowerCase().includes(q)
        );

    if (!filtered.length) {
      body.innerHTML = `
        <tr>
          <td
            colspan="${entities.length + 2}"
            class="px-4 py-8 text-center text-slate-500"
          >
            No accounts found.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = filtered.map(r => `
      <tr class="border-t">
        <td class="px-4 py-3 sticky left-0 bg-white">
          <div class="font-medium text-slate-800">
            ${esc(r.code)} · ${esc(r.name)}
          </div>

          <div class="text-[11px] text-slate-500">
            ${esc(r.section || "")}
            ${r.category ? ` · ${esc(r.category)}` : ""}
          </div>
        </td>

        ${entities.map(e => {
          const value =
            r.entities?.[String(e.run_entity_id)]?.balance || 0;

          return `
            <td class="px-4 py-3 text-right tabular-nums">
              ${money(value)}
            </td>
          `;
        }).join("")}

        <td class="px-4 py-3 text-right tabular-nums font-semibold">
          ${money(r.balance)}
        </td>
      </tr>
    `).join("");
  }

  async function loadGroupAdjustments() {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.adjustments(cid, runId),
        { method: "GET" }
      );

      state.adjustments = res?.items || [];
      renderGroupAdjustments();

    } catch (e) {
      console.error("[Consolidation] adjustments load failed:", e);
      state.adjustments = [];
      renderGroupAdjustments();
    }
  }

  function renderGroupAdjustments() {
    const rows = state.adjustments || [];
    const host = document.getElementById("groupAdjustmentsList");

    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    };

    set("grAdjTotal", rows.length);
    set("grAdjDraft", rows.filter(r => r.status === "draft").length);
    set("grAdjReviewed", rows.filter(r => r.status === "reviewed").length);
    set("grAdjApproved", rows.filter(r => r.status === "approved").length);

    if (!host) return;

    if (!rows.length) {
      host.innerHTML = `
        <div class="px-4 py-10 text-center text-sm text-slate-500">
          No consolidation adjustments yet.
        </div>
      `;
      return;
    }

    host.innerHTML = rows.map(r => `
      <div class="px-4 py-4 flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-800">
              ${esc(r.adjustment_no)}
            </span>

            <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase">
              ${esc(r.status)}
            </span>
          </div>

          <div class="mt-1 text-sm text-slate-700">
            ${esc(r.description)}
          </div>

          <div class="mt-1 text-xs text-slate-500">
            ${esc(r.adjustment_date)}
            · ${esc((r.adjustment_type || "").replaceAll("_", " "))}
            · ${Number(r.line_count || 0)} lines
          </div>

          <div class="mt-2 text-xs text-slate-600">
            Debit ${money(r.total_debit)}
            · Credit ${money(r.total_credit)}
          </div>
        </div>

        <div class="flex gap-2">
          ${r.status === "draft" ? `
            <button
              type="button"
              data-gr-adj-review="${r.id}"
              class="border rounded px-2 py-1 text-xs"
            >
              Review
            </button>

            <button
              type="button"
              data-gr-adj-delete="${r.id}"
              class="border rounded px-2 py-1 text-xs"
            >
              Delete
            </button>
          ` : ""}

          ${r.status === "reviewed" ? `
            <button
              type="button"
              data-gr-adj-approve="${r.id}"
              class="rounded bg-slate-900 text-white px-2 py-1 text-xs"
            >
              Approve
            </button>

            <button
              type="button"
              data-gr-adj-draft="${r.id}"
              class="border rounded px-2 py-1 text-xs"
            >
              Return Draft
            </button>
          ` : ""}

          ${r.status === "approved" ? `
            <button
              type="button"
              data-gr-adj-draft="${r.id}"
              class="border rounded px-2 py-1 text-xs"
            >
              Return Draft
            </button>
          ` : ""}
        </div>
      </div>
    `).join("");

    bindGroupAdjustmentActions();
  }

  function adjustmentLineRow(line = {}) {
    const entities = state.precon?.entities ||
      state.selectedRun?.entities || [];

    return `
      <tr data-gr-adj-line>
        <td class="px-2 py-2">
          <select
            name="run_entity_id"
            class="w-full border rounded px-2 py-1.5 text-xs bg-white"
          >
            <option value="">Group level</option>

            ${entities.map(e => `
              <option value="${esc(e.run_entity_id || e.id)}">
                ${esc(e.entity_name)}
              </option>
            `).join("")}
          </select>
        </td>

        <td class="px-2 py-2">
          <select
            name="group_account_id"
            class="w-full border rounded px-2 py-1.5 text-xs bg-white"
            required
          >
            <option value="">Select account...</option>

            ${(state.groupCoa || []).map(g => `
              <option value="${esc(g.id)}">
                ${esc(g.code)} · ${esc(g.name)}
              </option>
            `).join("")}
          </select>
        </td>

        <td class="px-2 py-2">
          <input
            name="line_description"
            class="w-full border rounded px-2 py-1.5 text-xs"
          />
        </td>

        <td class="px-2 py-2">
          <input
            name="debit"
            type="number"
            min="0"
            step="0.01"
            class="w-full border rounded px-2 py-1.5 text-xs text-right"
          />
        </td>

        <td class="px-2 py-2">
          <input
            name="credit"
            type="number"
            min="0"
            step="0.01"
            class="w-full border rounded px-2 py-1.5 text-xs text-right"
          />
        </td>

        <td class="px-2 py-2">
          <button
            type="button"
            data-gr-remove-adj-line
            class="text-xs"
          >
            ×
          </button>
        </td>
      </tr>
    `;
  }

  function openGroupAdjustmentModal() {
    const modal = document.getElementById("groupAdjustmentModal");
    const body = document.getElementById("groupAdjustmentLines");
    const form = document.getElementById("groupAdjustmentForm");

    if (!modal || !body || !form) return;

    form.reset();

    const run = state.selectedRun?.run || {};

    if (form.elements.adjustment_date)
      form.elements.adjustment_date.value =
        run.reporting_date || "";

    body.innerHTML =
      adjustmentLineRow() +
      adjustmentLineRow();

    bindAdjustmentLineEvents();
    recalcAdjustmentTotals();

    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeGroupAdjustmentModal() {
    const modal =
      document.getElementById("groupAdjustmentModal");

    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
  }

  function recalcAdjustmentTotals() {
    let debit = 0;
    let credit = 0;

    document
      .querySelectorAll("#groupAdjustmentLines [data-gr-adj-line]")
      .forEach(row => {
        debit += Number(
          row.querySelector('[name="debit"]')?.value || 0
        );

        credit += Number(
          row.querySelector('[name="credit"]')?.value || 0
        );
      });

    const diff = debit - credit;

    const d = document.getElementById("grAdjDebitTotal");
    const c = document.getElementById("grAdjCreditTotal");
    const x = document.getElementById("grAdjDifference");

    if (d) d.textContent = money(debit);
    if (c) c.textContent = money(credit);
    if (x) x.textContent = money(diff);
  }

  function bindAdjustmentLineEvents() {
    document
      .querySelectorAll("#groupAdjustmentLines [data-gr-adj-line]")
      .forEach(row => {
        row.querySelectorAll(
          '[name="debit"], [name="credit"]'
        ).forEach(input => {
          input.oninput = recalcAdjustmentTotals;
        });

        row
          .querySelector("[data-gr-remove-adj-line]")
          ?.addEventListener("click", () => {
            if (
              document.querySelectorAll(
                "#groupAdjustmentLines [data-gr-adj-line]"
              ).length <= 2
            ) {
              alert("Adjustment requires at least two lines.");
              return;
            }

            row.remove();
            recalcAdjustmentTotals();
          });
      });
  }

  async function saveGroupAdjustment(form) {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId) return;

    const lines = Array
      .from(
        document.querySelectorAll(
          "#groupAdjustmentLines [data-gr-adj-line]"
        )
      )
      .map(row => ({
        run_entity_id:
          Number(
            row.querySelector('[name="run_entity_id"]')?.value || 0
          ) || null,

        group_account_id:
          Number(
            row.querySelector('[name="group_account_id"]')?.value || 0
          ),

        description:
          String(
            row.querySelector('[name="line_description"]')?.value || ""
          ).trim() || null,

        debit:
          Number(
            row.querySelector('[name="debit"]')?.value || 0
          ),

        credit:
          Number(
            row.querySelector('[name="credit"]')?.value || 0
          ),
      }));

    const fd = new FormData(form);

    const payload = {
      adjustment_date:
        String(fd.get("adjustment_date") || "").trim(),

      adjustment_type:
        String(fd.get("adjustment_type") || "").trim(),

      reference:
        String(fd.get("reference") || "").trim() || null,

      description:
        String(fd.get("description") || "").trim(),

      lines,
    };

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.adjustments(cid, runId),
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      closeGroupAdjustmentModal();

      alert(
        res?.message ||
        "Consolidation adjustment created."
      );

      await loadGroupAdjustments();

    } catch (e) {
      console.error(
        "[Consolidation] adjustment save failed:",
        e
      );

      alert(
        e?.message ||
        "Failed to save consolidation adjustment."
      );
    }
  }

  async function setAdjustmentStatus(
    adjustmentId,
    status
  ) {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!cid || !runId || !adjustmentId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.adjustmentStatus(
          cid,
          runId,
          adjustmentId
        ),
        {
          method: "POST",
          body: JSON.stringify({ status }),
        }
      );

      alert(res?.message || "Adjustment updated.");
      await loadGroupAdjustments();

    } catch (e) {
      console.error(
        "[Consolidation] adjustment status failed:",
        e
      );

      alert(e?.message || "Failed to update adjustment.");
    }
  }

  async function deleteAdjustment(adjustmentId) {
    const cid = companyId();
    const runId = state.selectedRun?.run?.id;

    if (!confirm("Delete this draft adjustment?"))
      return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.adjustment(
          cid,
          runId,
          adjustmentId
        ),
        { method: "DELETE" }
      );

      alert(res?.message || "Adjustment deleted.");
      await loadGroupAdjustments();

    } catch (e) {
      console.error("[Consolidation] delete adjustment failed:", e);
      alert(e?.message || "Failed to delete adjustment.");
    }
  }

  function bindGroupAdjustmentActions() {
    document.querySelectorAll("[data-gr-adj-review]").forEach(btn => {
      btn.onclick = () =>
        setAdjustmentStatus(
          Number(btn.dataset.grAdjReview),
          "reviewed"
        );
    });

    document.querySelectorAll("[data-gr-adj-approve]").forEach(btn => {
      btn.onclick = () =>
        setAdjustmentStatus(
          Number(btn.dataset.grAdjApprove),
          "approved"
        );
    });

    document.querySelectorAll("[data-gr-adj-draft]").forEach(btn => {
      btn.onclick = () =>
        setAdjustmentStatus(
          Number(btn.dataset.grAdjDraft),
          "draft"
        );
    });

    document.querySelectorAll("[data-gr-adj-delete]").forEach(btn => {
      btn.onclick = () =>
        deleteAdjustment(
          Number(btn.dataset.grAdjDelete)
        );
    });
  }

  async function loadIntercompany() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return;

    try {
      state.intercompany = await apiFetch(
        ENDPOINTS.consolidation.intercompany(cid, runId),
        { method: "GET" }
      );
    } catch (e) {
      console.error("[Consolidation] IC load failed:", e);
      state.intercompany = { entities: [], accounts: [], balances: [], matches: [], summary: {} };
    }
    renderIntercompany();
  }

  function renderIntercompany() {
    const d = state.intercompany || {}, s = d.summary || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v || 0); };

    set("grIcBalances", s.balances);
    set("grIcMatched", s.matched);
    set("grIcUnmatched", s.unmatched);
    set("grIcVariance", s.variance);

    const body = document.getElementById("grIcBalancesBody");
    if (body) body.innerHTML = (d.balances || []).length ? d.balances.map(b => `
      <tr class="border-t">
        <td class="px-4 py-3">${esc(b.entity_name)}</td>
        <td class="px-4 py-3">${esc(b.counterparty_name)}</td>
        <td class="px-4 py-3"><div class="font-medium">${esc(b.group_account_code)}</div><div class="text-xs text-slate-500">${esc(b.group_account_name)}</div></td>
        <td class="px-4 py-3">${esc((b.nature || "").replaceAll("_", " "))}</td>
        <td class="px-4 py-3 text-right tabular-nums">${money(b.amount)}</td>
        <td class="px-4 py-3"><span class="rounded bg-slate-100 px-2 py-1 text-[10px] uppercase">${esc(b.status)}</span></td>
        <td class="px-4 py-3 text-right"><button type="button" data-gr-ic-delete="${b.id}" class="border rounded px-2 py-1 text-xs">Remove</button></td>
      </tr>
    `).join("") : `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-500">No intercompany balances identified yet.</td></tr>`;

    const matches = document.getElementById("grIcMatchesList");
    if (matches) matches.innerHTML = (d.matches || []).length ? d.matches.map(m => `
      <div class="px-4 py-4 flex items-start justify-between gap-4">
        <div>
          <div class="text-sm font-semibold">${esc(m.left_entity_name)} ↔ ${esc(m.right_entity_name)}</div>
          <div class="mt-1 text-xs text-slate-500">${esc(m.left_account_code)} ${esc(m.left_account_name)} ↔ ${esc(m.right_account_code)} ${esc(m.right_account_name)}</div>
        </div>
        <div class="text-right">
          <div class="text-sm font-medium">${money(m.matched_amount)}</div>
          <div class="text-xs ${Math.abs(Number(m.variance || 0)) > 0.01 ? "text-amber-600" : "text-slate-500"}">Variance ${money(m.variance)}</div>
        </div>
      </div>
    `).join("") : `<div class="px-4 py-8 text-center text-sm text-slate-500">No matches yet.</div>`;

    bindIntercompanyRows();
  }

  function openIcModal() {
    const d = state.intercompany || {}, modal = document.getElementById("groupIcModal");
    const entity = document.getElementById("grIcEntity"), cp = document.getElementById("grIcCounterparty");

    const opts = (d.entities || []).map(e =>
      `<option value="${esc(e.run_entity_id)}">${esc(e.entity_name)}</option>`
    ).join("");

    if (entity) entity.innerHTML = `<option value="">Select...</option>${opts}`;
    if (cp) cp.innerHTML = `<option value="">Select...</option>${opts}`;
    refreshIcAccounts();

    modal?.classList.remove("hidden");
    modal?.classList.add("flex");
  }

  function closeIcModal() {
    const modal = document.getElementById("groupIcModal");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
    document.getElementById("groupIcForm")?.reset();
  }

  function refreshIcAccounts() {
    const runEntityId = Number(document.getElementById("grIcEntity")?.value || 0);
    const select = document.getElementById("grIcAccount");
    if (!select) return;

    const accounts = (state.intercompany?.accounts || []).filter(a =>
      !runEntityId || Number(a.run_entity_id) === runEntityId
    );

    select.innerHTML = `<option value="">Select account...</option>${accounts.map(a =>
      `<option value="${esc(a.group_account_id)}">${esc(a.code)} · ${esc(a.name)} · ${money(a.balance)}</option>`
    ).join("")}`;
  }

  async function saveIcBalance(form) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return;

    const fd = new FormData(form);
    const runEntityId = Number(fd.get("run_entity_id") || 0);
    const counterpartyRunEntityId = Number(fd.get("counterparty_run_entity_id") || 0);

    const payload = {
      run_entity_id: runEntityId,
      counterparty_run_entity_id: counterpartyRunEntityId,
      group_account_id: Number(fd.get("group_account_id") || 0),
      nature: String(fd.get("nature") || "").trim(),
      amount: Number(fd.get("amount") || 0),
      reference: String(fd.get("reference") || "").trim() || null,
      notes: String(fd.get("notes") || "").trim() || null,
    };

    try {
      await apiFetch(ENDPOINTS.consolidation.intercompanyBalances(cid, runId), {
        method: "POST", body: JSON.stringify(payload),
      });

      if (form.elements.save_rule.checked) {
        const entity = (state.intercompany?.entities || []).find(e => Number(e.run_entity_id) === runEntityId);
        const cp = (state.intercompany?.entities || []).find(e => Number(e.run_entity_id) === counterpartyRunEntityId);

        await apiFetch(ENDPOINTS.consolidation.intercompanyRules(cid), {
          method: "POST",
          body: JSON.stringify({
            entity_company_id: entity?.entity_company_id,
            counterparty_company_id: cp?.entity_company_id,
            group_account_id: payload.group_account_id,
            nature: payload.nature,
            use_full_balance: true,
          }),
        });
      }

      closeIcModal();
      await loadIntercompany();
    } catch (e) {
      console.error("[Consolidation] IC save failed:", e);
      alert(e?.message || "Failed to save intercompany balance.");
    }
  }

  async function applyIcRules() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    try {
      const res = await apiFetch(ENDPOINTS.consolidation.applyIntercompanyRules(cid, runId), {
        method: "POST", body: JSON.stringify({}),
      });
      alert(res?.message || "Intercompany rules applied.");
      await loadIntercompany();
    } catch (e) { alert(e?.message || "Failed to apply intercompany rules."); }
  }

  async function autoMatchIc() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    try {
      const res = await apiFetch(ENDPOINTS.consolidation.autoMatchIntercompany(cid, runId), {
        method: "POST", body: JSON.stringify({}),
      });
      alert(res?.message || "Intercompany balances matched.");
      await loadIntercompany();
    } catch (e) { alert(e?.message || "Failed to match intercompany balances."); }
  }

  async function deleteIcBalance(id) {
    if (!confirm("Remove this intercompany declaration?")) return;
    const cid = companyId(), runId = state.selectedRun?.run?.id;

    try {
      await apiFetch(ENDPOINTS.consolidation.intercompanyBalance(cid, runId, id), { method: "DELETE" });
      await loadIntercompany();
    } catch (e) { alert(e?.message || "Failed to remove intercompany balance."); }
  }

  function bindIntercompanyRows() {
    document.querySelectorAll("[data-gr-ic-delete]").forEach(btn =>
      btn.onclick = () => deleteIcBalance(Number(btn.dataset.grIcDelete))
    );
  }

  function renderGroupEliminations() {
    const rows = state.eliminations || [];
    const host = document.getElementById("grEliminationsList");
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(v || 0);
    };

    set("grElimTotal", rows.filter(r => r.status !== "void").length);
    set("grElimDraft", rows.filter(r => r.status === "draft").length);
    set("grElimReviewed", rows.filter(r => r.status === "reviewed").length);
    set("grElimApproved", rows.filter(r => r.status === "approved").length);

    if (!host) return;

    const active = rows.filter(r => r.status !== "void");

    if (!active.length) {
      host.innerHTML = `<div class="px-4 py-10 text-center text-sm text-slate-500">No elimination journals generated yet.</div>`;
      return;
    }

    host.innerHTML = active.map(r => `
      <div class="px-4 py-4 flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-800">${esc(r.elimination_no)}</span>
            <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase">${esc(r.status)}</span>
          </div>

          <div class="mt-1 text-sm text-slate-700">${esc(r.description)}</div>

          <div class="mt-1 text-xs text-slate-500">
            ${esc((r.elimination_type || "").replaceAll("_", " "))}
            · ${Number(r.line_count || 0)} lines
            ${r.source_match_id ? ` · Match #${esc(r.source_match_id)}` : ""}
          </div>

          <div class="mt-2 text-xs text-slate-600">
            Debit ${money(r.total_debit)} · Credit ${money(r.total_credit)}
          </div>
        </div>

        <div class="flex gap-2">
          <button type="button" data-gr-elim-view="${r.id}" class="border rounded px-2 py-1 text-xs">View</button>

          ${r.status === "draft" ? `
            <button type="button" data-gr-elim-review="${r.id}" class="border rounded px-2 py-1 text-xs">Review</button>
            <button type="button" data-gr-elim-void="${r.id}" class="border rounded px-2 py-1 text-xs">Void</button>
          ` : ""}

          ${r.status === "reviewed" ? `
            <button type="button" data-gr-elim-approve="${r.id}" class="rounded bg-slate-900 text-white px-2 py-1 text-xs">Approve</button>
            <button type="button" data-gr-elim-draft="${r.id}" class="border rounded px-2 py-1 text-xs">Return Draft</button>
          ` : ""}

          ${r.status === "approved" ? `
            <button type="button" data-gr-elim-draft="${r.id}" class="border rounded px-2 py-1 text-xs">Return Draft</button>
          ` : ""}
        </div>
      </div>
    `).join("");

    bindEliminationActions();
  }

  async function generateEliminations() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.generateEliminations(cid, runId),
        { method: "POST", body: JSON.stringify({}) }
      );

      const manual = res?.data?.manual_required || [];
      const warning = document.getElementById("grEliminationWarning");

      if (warning) {
        if (manual.length) {
          warning.classList.remove("hidden");
          warning.innerHTML = `
            <div class="text-sm font-semibold text-slate-800">
              ${manual.length} match${manual.length === 1 ? "" : "es"} require manual treatment
            </div>
            <div class="mt-1 text-xs text-slate-500">
              FinSage did not auto-generate entries where the accounting direction could not be determined safely.
            </div>
          `;
        } else {
          warning.classList.add("hidden");
          warning.innerHTML = "";
        }
      }

      alert(res?.message || "Eliminations generated.");
      await loadGroupEliminations();
    } catch (e) {
      console.error("[Consolidation] elimination generation failed:", e);
      alert(e?.message || "Failed to generate eliminations.");
    }
  }

  async function viewElimination(id) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId || !id) return;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.elimination(cid, runId, id),
        { method: "GET" }
      );

      const journal = data?.journal || {}, lines = data?.lines || [];
      const modal = document.getElementById("groupEliminationModal");

      const title = document.getElementById("grElimModalTitle");
      const meta = document.getElementById("grElimModalMeta");
      const body = document.getElementById("grElimModalBody");

      if (title) title.textContent = `${journal.elimination_no || ""} · ${journal.description || ""}`;
      if (meta) meta.textContent = `${statusLabel(journal.status)} · Debit ${money(journal.total_debit)} · Credit ${money(journal.total_credit)}`;

      if (body) body.innerHTML = lines.map(l => `
        <tr class="border-t">
          <td class="px-4 py-3">${esc(l.entity_name || "Group")}</td>
          <td class="px-4 py-3"><div class="font-medium">${esc(l.group_account_code)}</div><div class="text-xs text-slate-500">${esc(l.group_account_name)}</div></td>
          <td class="px-4 py-3">${esc(l.description || "")}</td>
          <td class="px-4 py-3 text-right tabular-nums">${money(l.debit)}</td>
          <td class="px-4 py-3 text-right tabular-nums">${money(l.credit)}</td>
        </tr>
      `).join("");

      modal?.classList.remove("hidden");
      modal?.classList.add("flex");
    } catch (e) {
      alert(e?.message || "Failed to load elimination.");
    }
  }

  function closeEliminationModal() {
    const modal = document.getElementById("groupEliminationModal");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
  }

  async function setEliminationStatus(id, status) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.eliminationStatus(cid, runId, id),
        { method: "POST", body: JSON.stringify({ status }) }
      );
      alert(res?.message || "Elimination updated.");
      await loadGroupEliminations();
    } catch (e) {
      alert(e?.message || "Failed to update elimination.");
    }
  }

  async function voidElimination(id) {
    if (!confirm("Void this draft elimination?")) return;

    const cid = companyId(), runId = state.selectedRun?.run?.id;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.elimination(cid, runId, id),
        { method: "DELETE" }
      );
      alert(res?.message || "Elimination voided.");
      await loadGroupEliminations();
    } catch (e) {
      alert(e?.message || "Failed to void elimination.");
    }
  }

  function bindEliminationActions() {
    document.querySelectorAll("[data-gr-elim-view]").forEach(btn =>
      btn.onclick = () => viewElimination(Number(btn.dataset.grElimView))
    );

    document.querySelectorAll("[data-gr-elim-review]").forEach(btn =>
      btn.onclick = () => setEliminationStatus(Number(btn.dataset.grElimReview), "reviewed")
    );

    document.querySelectorAll("[data-gr-elim-approve]").forEach(btn =>
      btn.onclick = () => setEliminationStatus(Number(btn.dataset.grElimApprove), "approved")
    );

    document.querySelectorAll("[data-gr-elim-draft]").forEach(btn =>
      btn.onclick = () => setEliminationStatus(Number(btn.dataset.grElimDraft), "draft")
    );

    document.querySelectorAll("[data-gr-elim-void]").forEach(btn =>
      btn.onclick = () => voidElimination(Number(btn.dataset.grElimVoid))
    );
  }

  async function validateAdjustedTb() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return null;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.validateAdjustedTb(cid, runId),
        { method: "GET" }
      );
      renderAdjustedTbValidation(data);
      return data;
    } catch (e) {
      console.error("[Consolidation] adjusted TB validation failed:", e);
      alert(e?.message || "Adjusted TB validation failed.");
      return null;
    }
  }

  function renderAdjustedTbValidation(data) {
    const host = document.getElementById("grAdjustedTbValidation");
    if (!host) return;

    host.classList.remove("hidden");

    if (data?.ready) {
      host.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-slate-800">Ready to generate</div>
            <div class="mt-1 text-xs text-slate-500">Pre-consolidation TB is ready and all active adjustments and eliminations are approved.</div>
          </div>
          <span class="rounded bg-emerald-50 text-emerald-700 px-2 py-1 text-xs">Ready</span>
        </div>
      `;
      return;
    }

    const issues = data?.issues || [];

    host.innerHTML = `
      <div class="text-sm font-semibold text-slate-800">${issues.length} issue${issues.length === 1 ? "" : "s"} must be resolved</div>
      <div class="mt-3 space-y-2">
        ${issues.map(i => `
          <div class="rounded bg-slate-50 px-3 py-2">
            <div class="text-xs font-medium text-slate-700">${esc((i.code || "").replaceAll("_", " "))}</div>
            <div class="text-xs text-slate-500">${esc(i.message || "")}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  async function generateAdjustedTb() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return;

    const validation = await validateAdjustedTb();
    if (!validation?.ready) {
      alert("Resolve outstanding consolidation items first.");
      return;
    }

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.generateAdjustedTb(cid, runId),
        { method: "POST", body: JSON.stringify({}) }
      );

      state.adjustedTb = res?.data || null;
      alert(res?.message || "Adjusted Group Trial Balance generated.");
      renderAdjustedTb();
      await loadRuns();
    } catch (e) {
      console.error("[Consolidation] adjusted TB generation failed:", e);
      alert(e?.message || "Failed to generate Adjusted Group Trial Balance.");
    }
  }

  async function loadAdjustedTb() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return;

    try {
      state.adjustedTb = await apiFetch(
        ENDPOINTS.consolidation.adjustedTb(cid, runId),
        { method: "GET" }
      );
    } catch (e) {
      console.error("[Consolidation] adjusted TB load failed:", e);
      state.adjustedTb = { header: null, rows: [], summary: {} };
    }

    renderAdjustedTb();
  }
  function renderAdjustedTb() {
    const data = state.adjustedTb || {}, s = data.summary || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };

    set("grAdjustedAccounts", s.account_count || 0);
    set("grAdjustedDebit", money(s.final_debit));
    set("grAdjustedCredit", money(s.final_credit));
    set("grAdjustedDifference", money(s.difference));

    const run = state.selectedRun?.run || {};
    const meta = document.getElementById("grAdjustedTbMeta");
    if (meta) meta.textContent = `${run.run_name || "Consolidation run"} · ${run.reporting_date || ""}`;

    renderAdjustedTbRows();
  }
  function renderAdjustedTbRows() {
    const rows = state.adjustedTb?.rows || [];
    const body = document.getElementById("grAdjustedTbBody");
    if (!body) return;

    if (!state.adjustedTb?.header) {
      body.innerHTML = `<tr><td colspan="5" class="px-4 py-10 text-center text-slate-500">Adjusted Group Trial Balance has not been generated yet.</td></tr>`;
      return;
    }

    const q = String(document.getElementById("grAdjustedTbSearch")?.value || "").trim().toLowerCase();
    const filtered = !q ? rows : rows.filter(r =>
      String(r.code || "").toLowerCase().includes(q) ||
      String(r.name || "").toLowerCase().includes(q) ||
      String(r.category || "").toLowerCase().includes(q)
    );

    body.innerHTML = filtered.length ? filtered.map(r => `
      <tr class="border-t cursor-pointer hover:bg-slate-50" data-gr-adjusted-account="${r.group_account_id}">
        <td class="px-4 py-3">
          <div class="font-medium text-slate-800">${esc(r.code)} · ${esc(r.name)}</div>
          <div class="text-[11px] text-slate-500">${esc(r.section || "")}${r.category ? ` · ${esc(r.category)}` : ""}</div>
        </td>
        <td class="px-4 py-3 text-right tabular-nums">${money(r.precon_balance)}</td>
        <td class="px-4 py-3 text-right tabular-nums">${money(r.adjustment_balance)}</td>
        <td class="px-4 py-3 text-right tabular-nums">${money(r.elimination_balance)}</td>
        <td class="px-4 py-3 text-right tabular-nums font-semibold">${money(r.final_balance)}</td>
      </tr>
    `).join("") : `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">No accounts found.</td></tr>`;

    bindAdjustedTbRows();
  }

  function bindAdjustedTbRows() {
    document.querySelectorAll("[data-gr-adjusted-account]").forEach(row =>
      row.onclick = () => viewAdjustedTbAccount(Number(row.dataset.grAdjustedAccount))
    );
  }
  async function viewAdjustedTbAccount(accountId) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId || !accountId) return;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.adjustedTbAccount(cid, runId, accountId),
        { method: "GET" }
      );

      const a = data?.account || {}, entities = data?.entities || [];
      const adjustments = data?.adjustments || [], eliminations = data?.eliminations || [];

      const title = document.getElementById("grAdjustedDetailTitle");
      const meta = document.getElementById("grAdjustedDetailMeta");
      const body = document.getElementById("grAdjustedDetailBody");

      if (title) title.textContent = `${a.code || ""} · ${a.name || ""}`;
      if (meta) meta.textContent = `${a.section || ""}${a.category ? ` · ${a.category}` : ""}`;

      if (body) body.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="rounded-xl border p-4">
            <h4 class="text-sm font-semibold text-slate-800">Entity balances</h4>
            <div class="mt-3 space-y-2">
              ${entities.length ? entities.map(e => `
                <div class="flex justify-between gap-3 text-xs">
                  <span class="text-slate-600">${esc(e.entity_name)}</span>
                  <span class="font-medium tabular-nums">${money(e.balance)}</span>
                </div>
              `).join("") : `<div class="text-xs text-slate-500">None</div>`}
            </div>
          </div>

          <div class="rounded-xl border p-4">
            <h4 class="text-sm font-semibold text-slate-800">Approved adjustments</h4>
            <div class="mt-3 space-y-2">
              ${adjustments.length ? adjustments.map(j => `
                <div class="rounded bg-slate-50 p-2">
                  <div class="text-xs font-medium">${esc(j.adjustment_no)}</div>
                  <div class="text-[11px] text-slate-500">${esc(j.journal_description || "")}</div>
                  <div class="mt-1 text-xs">Dr ${money(j.debit)} · Cr ${money(j.credit)}</div>
                </div>
              `).join("") : `<div class="text-xs text-slate-500">None</div>`}
            </div>
          </div>

          <div class="rounded-xl border p-4">
            <h4 class="text-sm font-semibold text-slate-800">Approved eliminations</h4>
            <div class="mt-3 space-y-2">
              ${eliminations.length ? eliminations.map(j => `
                <div class="rounded bg-slate-50 p-2">
                  <div class="text-xs font-medium">${esc(j.elimination_no)}</div>
                  <div class="text-[11px] text-slate-500">${esc(j.journal_description || "")}</div>
                  <div class="mt-1 text-xs">Dr ${money(j.debit)} · Cr ${money(j.credit)}</div>
                </div>
              `).join("") : `<div class="text-xs text-slate-500">None</div>`}
            </div>
          </div>
        </div>
      `;

      const modal = document.getElementById("groupAdjustedTbModal");
      modal?.classList.remove("hidden");
      modal?.classList.add("flex");
    } catch (e) {
      alert(e?.message || "Failed to load account detail.");
    }
  }
  function closeAdjustedTbModal() {
    const modal = document.getElementById("groupAdjustedTbModal");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
  }

  async function loadAcquisitionWorkspace() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return;

    try {
      state.acquisition = await apiFetch(
        ENDPOINTS.consolidation.acquisition(cid, runId),
        { method: "GET" }
      );
    } catch (e) {
      console.error("[Consolidation] acquisition load failed:", e);
      state.acquisition = { items: [], summary: {} };
    }

    renderAcquisitionWorkspace();
  }
  function renderAcquisitionWorkspace() {
    const d = state.acquisition || {}, s = d.summary || {}, rows = d.items || [];
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };

    set("grAcqTotal", s.total || 0);
    set("grAcqApproved", s.approved || 0);
    set("grAcqGoodwill", money(s.goodwill));
    set("grAcqNci", money(s.closing_nci));

    const host = document.getElementById("grAcquisitionList");
    if (!host) return;

    if (!rows.length) {
      host.innerHTML = `<div class="px-4 py-10 text-center text-sm text-slate-500">No acquisition workpapers prepared yet.</div>`;
      return;
    }

    host.innerHTML = rows.map(w => `
      <div class="px-4 py-4 flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-800">${esc(w.entity_name)}</span>
            <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase">${esc(w.status)}</span>
          </div>

          <div class="mt-1 text-xs text-slate-500">
            Acquired ${esc(w.acquisition_date)} · Ownership ${Number(w.ownership_percent || 0).toFixed(2)}%
            · NCI ${Number(w.nci_percent || 0).toFixed(2)}%
          </div>

          <div class="mt-2 flex gap-4 text-xs text-slate-600">
            <span>Goodwill <strong>${money(w.goodwill)}</strong></span>
            <span>Post-acq <strong>${money(w.post_acquisition_movement)}</strong></span>
            <span>Closing NCI <strong>${money(w.closing_nci)}</strong></span>
          </div>
        </div>

        <div class="flex gap-2">
          <button type="button" data-gr-acq-open="${w.id}" class="border rounded px-2 py-1 text-xs">Open</button>

          ${w.status === "calculated" ? `
            <button type="button" data-gr-acq-review="${w.id}" class="border rounded px-2 py-1 text-xs">Review</button>
          ` : ""}

          ${w.status === "reviewed" ? `
            <button type="button" data-gr-acq-approve="${w.id}" class="rounded bg-slate-900 text-white px-2 py-1 text-xs">Approve</button>
            <button type="button" data-gr-acq-calc="${w.id}" class="border rounded px-2 py-1 text-xs">Return</button>
          ` : ""}

          ${w.status === "approved" ? `
            <button type="button" data-gr-acq-calc="${w.id}" class="border rounded px-2 py-1 text-xs">Return</button>
          ` : ""}
        </div>
      </div>
    `).join("");

    bindAcquisitionActions();
  }

  async function prepareAcquisitionWorkpapers() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.prepareAcquisition(cid, runId),
        { method: "POST", body: JSON.stringify({}) }
      );

      alert(res?.message || "Acquisition workpapers prepared.");
      await loadAcquisitionWorkspace();
    } catch (e) {
      console.error("[Consolidation] acquisition prepare failed:", e);
      alert(e?.message || "Failed to prepare acquisition workpapers.");
    }
  }

  async function openAcquisitionWorkpaper(id) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId || !id) return;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.acquisitionWorkpaper(cid, runId, id),
        { method: "GET" }
      );

      renderAcquisitionModal(data);
    } catch (e) {
      alert(e?.message || "Failed to load acquisition workpaper.");
    }
  }


  function renderAcquisitionModal(data) {
    const w = data?.workpaper || {};
    const consideration = data?.consideration || [];
    const netAssets = data?.net_assets || [];

    const title = document.getElementById("grAcqModalTitle");
    const meta = document.getElementById("grAcqModalMeta");
    const body = document.getElementById("grAcqModalBody");

    if (title) title.textContent = `${w.entity_name || ""} Acquisition Workpaper`;
    if (meta) meta.textContent = `${w.acquisition_date || ""} · ${Number(w.ownership_percent || 0).toFixed(2)}% ownership`;

    if (!body) return;

    body.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="rounded border p-3">
          <div class="text-xs text-slate-500">Consideration</div>
          <div class="mt-1 font-semibold">${money(w.consideration_transferred)}</div>
        </div>
        <div class="rounded border p-3">
          <div class="text-xs text-slate-500">Identifiable Net Assets</div>
          <div class="mt-1 font-semibold">${money(w.identifiable_net_assets_fv)}</div>
        </div>
        <div class="rounded border p-3">
          <div class="text-xs text-slate-500">Goodwill</div>
          <div class="mt-1 font-semibold">${money(w.goodwill)}</div>
        </div>
        <div class="rounded border p-3">
          <div class="text-xs text-slate-500">Closing NCI</div>
          <div class="mt-1 font-semibold">${money(w.closing_nci)}</div>
        </div>
      </div>

      <form id="grAcqWorkpaperForm" class="mt-5">
        <input type="hidden" name="workpaper_id" value="${esc(w.id)}" />

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-[11px] text-slate-500 mb-1">NCI measurement</label>
            <select name="nci_measurement_method" class="w-full border rounded px-3 py-2 text-sm">
              <option value="proportionate" ${w.nci_measurement_method === "proportionate" ? "selected" : ""}>Proportionate share</option>
              <option value="fair_value" ${w.nci_measurement_method === "fair_value" ? "selected" : ""}>Fair value / full goodwill</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] text-slate-500 mb-1">Previously held interest FV</label>
            <input name="previously_held_interest_fv" type="number" step="0.01"
              value="${esc(w.previously_held_interest_fv || 0)}"
              class="w-full border rounded px-3 py-2 text-sm text-right" />
          </div>

          <div>
            <label class="block text-[11px] text-slate-500 mb-1">NCI fair value</label>
            <input name="nci_fair_value" type="number" step="0.01"
              value="${esc(w.nci_fair_value || 0)}"
              class="w-full border rounded px-3 py-2 text-sm text-right" />
          </div>
        </div>

        <div class="mt-5">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold">Consideration</h4>
            <button type="button" id="btnAddAcqConsideration" class="border rounded px-2 py-1 text-xs">+ Component</button>
          </div>

          <div id="grAcqConsiderationLines" class="mt-2 space-y-2"></div>
        </div>

        <div class="mt-5">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold">Acquisition-date identifiable net assets</h4>
            <button type="button" id="btnAddAcqNetAsset" class="border rounded px-2 py-1 text-xs">+ Line</button>
          </div>

          <div id="grAcqNetAssetLines" class="mt-2 space-y-2"></div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button type="submit" class="border rounded px-4 py-2 text-sm">Save</button>
          <button type="button" id="btnCalculateAcquisition" class="rounded bg-slate-900 text-white px-4 py-2 text-sm">Calculate</button>
        </div>
      </form>
    `;

    renderAcquisitionInputLines(consideration, netAssets);
    bindAcquisitionModal(w.id);

    const modal = document.getElementById("groupAcquisitionModal");
    modal?.classList.remove("hidden");
    modal?.classList.add("flex");
  }

  function renderAcquisitionInputLines(consideration = [], netAssets = []) {
    const c = document.getElementById("grAcqConsiderationLines");
    const n = document.getElementById("grAcqNetAssetLines");

    if (c) c.innerHTML = (consideration.length ? consideration : [{}]).map(x => `
      <div class="grid grid-cols-1 md:grid-cols-[160px_1fr_180px_40px] gap-2" data-acq-consideration>
        <select name="component_type" class="border rounded px-2 py-1.5 text-xs">
          ${["cash","shares","deferred","contingent","other"].map(v =>
            `<option value="${v}" ${x.component_type === v ? "selected" : ""}>${v.replaceAll("_"," ")}</option>`
          ).join("")}
        </select>
        <input name="description" value="${esc(x.description || "")}" placeholder="Description" class="border rounded px-2 py-1.5 text-xs" />
        <input name="amount" type="number" step="0.01" value="${esc(x.amount || "")}" placeholder="Amount" class="border rounded px-2 py-1.5 text-xs text-right" />
        <button type="button" data-acq-remove class="text-xs">×</button>
      </div>
    `).join("");

    if (n) n.innerHTML = (netAssets.length ? netAssets : [{}]).map(x => `
      <div class="grid grid-cols-1 md:grid-cols-[1fr_150px_150px_150px_40px] gap-2" data-acq-net-asset>
        <input name="description" value="${esc(x.description || "")}" placeholder="Net asset / FV adjustment" class="border rounded px-2 py-1.5 text-xs" />
        <input name="book_value" type="number" step="0.01" value="${esc(x.book_value || "")}" placeholder="Book value" class="border rounded px-2 py-1.5 text-xs text-right" />
        <input name="fair_value_adjustment" type="number" step="0.01" value="${esc(x.fair_value_adjustment || "")}" placeholder="FV adjustment" class="border rounded px-2 py-1.5 text-xs text-right" />
        <input name="deferred_tax_adjustment" type="number" step="0.01" value="${esc(x.deferred_tax_adjustment || "")}" placeholder="Deferred tax" class="border rounded px-2 py-1.5 text-xs text-right" />
        <button type="button" data-acq-remove class="text-xs">×</button>
      </div>
    `).join("");
  }

  function collectAcquisitionPayload(form) {
    return {
      nci_measurement_method: form.elements.nci_measurement_method.value,
      previously_held_interest_fv: Number(form.elements.previously_held_interest_fv.value || 0),
      nci_fair_value: Number(form.elements.nci_fair_value.value || 0),

      consideration: Array.from(document.querySelectorAll("[data-acq-consideration]")).map(row => ({
        component_type: row.querySelector('[name="component_type"]')?.value,
        description: row.querySelector('[name="description"]')?.value?.trim(),
        amount: Number(row.querySelector('[name="amount"]')?.value || 0),
      })),

      net_assets: Array.from(document.querySelectorAll("[data-acq-net-asset]")).map(row => ({
        description: row.querySelector('[name="description"]')?.value?.trim(),
        book_value: Number(row.querySelector('[name="book_value"]')?.value || 0),
        fair_value_adjustment: Number(row.querySelector('[name="fair_value_adjustment"]')?.value || 0),
        deferred_tax_adjustment: Number(row.querySelector('[name="deferred_tax_adjustment"]')?.value || 0),
      })),
    };
  }
  async function saveAcquisitionWorkpaper(id, form) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;

    await apiFetch(
      ENDPOINTS.consolidation.acquisitionWorkpaper(cid, runId, id),
      { method: "PATCH", body: JSON.stringify(collectAcquisitionPayload(form)) }
    );
  }
  async function calculateAcquisitionWorkpaper(id, form) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;

    try {
      await saveAcquisitionWorkpaper(id, form);

      const res = await apiFetch(
        ENDPOINTS.consolidation.calculateAcquisition(cid, runId, id),
        { method: "POST", body: JSON.stringify({}) }
      );

      alert(res?.message || "Acquisition workpaper calculated.");
      document.getElementById("groupAcquisitionModal")?.classList.add("hidden");
      document.getElementById("groupAcquisitionModal")?.classList.remove("flex");
      await loadAcquisitionWorkspace();
    } catch (e) {
      alert(e?.message || "Failed to calculate acquisition workpaper.");
    }
  }

  function bindAcquisitionModal(id) {
    const form = document.getElementById("grAcqWorkpaperForm");
    const cHost = document.getElementById("grAcqConsiderationLines");
    const nHost = document.getElementById("grAcqNetAssetLines");

    document.getElementById("btnAddAcqConsideration")?.addEventListener("click", () => {
      cHost?.insertAdjacentHTML("beforeend", `
        <div class="grid grid-cols-1 md:grid-cols-[160px_1fr_180px_40px] gap-2" data-acq-consideration>
          <select name="component_type" class="border rounded px-2 py-1.5 text-xs">
            <option value="cash">cash</option><option value="shares">shares</option>
            <option value="deferred">deferred</option><option value="contingent">contingent</option>
            <option value="other">other</option>
          </select>
          <input name="description" placeholder="Description" class="border rounded px-2 py-1.5 text-xs" />
          <input name="amount" type="number" step="0.01" placeholder="Amount" class="border rounded px-2 py-1.5 text-xs text-right" />
          <button type="button" data-acq-remove class="text-xs">×</button>
        </div>
      `);
    });

    document.getElementById("btnAddAcqNetAsset")?.addEventListener("click", () => {
      nHost?.insertAdjacentHTML("beforeend", `
        <div class="grid grid-cols-1 md:grid-cols-[1fr_150px_150px_150px_40px] gap-2" data-acq-net-asset>
          <input name="description" placeholder="Net asset / FV adjustment" class="border rounded px-2 py-1.5 text-xs" />
          <input name="book_value" type="number" step="0.01" placeholder="Book value" class="border rounded px-2 py-1.5 text-xs text-right" />
          <input name="fair_value_adjustment" type="number" step="0.01" placeholder="FV adjustment" class="border rounded px-2 py-1.5 text-xs text-right" />
          <input name="deferred_tax_adjustment" type="number" step="0.01" placeholder="Deferred tax" class="border rounded px-2 py-1.5 text-xs text-right" />
          <button type="button" data-acq-remove class="text-xs">×</button>
        </div>
      `);
    });

    document.getElementById("grAcqModalBody")?.addEventListener("click", e => {
      e.target.closest("[data-acq-remove]")?.parentElement?.remove();
    });

    form?.addEventListener("submit", async e => {
      e.preventDefault();
      try {
        await saveAcquisitionWorkpaper(id, form);
        alert("Acquisition workpaper saved.");
      } catch (err) {
        alert(err?.message || "Failed to save workpaper.");
      }
    });

    document.getElementById("btnCalculateAcquisition")?.addEventListener(
      "click", () => calculateAcquisitionWorkpaper(id, form)
    );
  }

  async function setAcquisitionStatus(id, status) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.acquisitionStatus(cid, runId, id),
        { method: "POST", body: JSON.stringify({ status }) }
      );
      alert(res?.message || "Workpaper updated.");
      await loadAcquisitionWorkspace();
    } catch (e) {
      alert(e?.message || "Failed to update acquisition workpaper.");
    }
  }

  function bindAcquisitionActions() {
    document.querySelectorAll("[data-gr-acq-open]").forEach(btn =>
      btn.onclick = () => openAcquisitionWorkpaper(Number(btn.dataset.grAcqOpen))
    );

    document.querySelectorAll("[data-gr-acq-review]").forEach(btn =>
      btn.onclick = () => setAcquisitionStatus(Number(btn.dataset.grAcqReview), "reviewed")
    );

    document.querySelectorAll("[data-gr-acq-approve]").forEach(btn =>
      btn.onclick = () => setAcquisitionStatus(Number(btn.dataset.grAcqApprove), "approved")
    );

    document.querySelectorAll("[data-gr-acq-calc]").forEach(btn =>
      btn.onclick = () => setAcquisitionStatus(Number(btn.dataset.grAcqCalc), "calculated")
    );
  }

  async function loadEquityMethodWorkspace() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return;

    try {
      state.equityMethod = await apiFetch(
        ENDPOINTS.consolidation.equityMethod(cid,runId),
        { method: "GET" }
      );
    } catch (e) {
      console.error("[Consolidation] equity method load failed:",e);
      state.equityMethod = {
        items: [], summary: {}, configuration_issues: [],
      };
    }

    renderEquityMethodWorkspace();
  }

  function renderEquityMethodWorkspace() {
    const d = state.equityMethod || {}, s = d.summary || {};
    const rows = d.items || [], issues = d.configuration_issues || [];
    const set = (id,v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };

    set("grEqTotal",s.total || 0);
    set("grEqAssociates",s.associates || 0);
    set("grEqJvs",s.joint_ventures || 0);
    set("grEqProfit",money(s.share_profit_loss));
    set("grEqInvestment",money(s.closing_investment));

    const issueHost = document.getElementById("grEquityMethodIssues");
    if (issueHost) {
      issueHost.classList.toggle("hidden",!issues.length);
      issueHost.innerHTML = issues.length ? `
        <div class="text-sm font-semibold text-amber-900">Structure configuration needs attention</div>
        <div class="mt-2 space-y-1 text-xs text-amber-800">
          ${issues.map(x => `
            <div>
              ${esc(x.entity_name)} is classified as
              <strong>${esc(x.relationship_type)}</strong> but uses
              <strong>${esc(x.consolidation_method)}</strong>.
              Controlled subsidiaries should not normally enter the associate/JV equity-method flow.
            </div>
          `).join("")}
        </div>
      ` : "";
    }

    const host = document.getElementById("grEquityMethodList");
    if (!host) return;

    if (!rows.length) {
      host.innerHTML = `
        <div class="px-4 py-10 text-center text-sm text-slate-500">
          No associate or joint-venture workpapers prepared yet.
        </div>
      `;
      return;
    }

    host.innerHTML = rows.map(w => `
      <div class="px-4 py-4 flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-semibold text-slate-800">${esc(w.entity_name)}</span>
            <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase">
              ${esc((w.relationship_type || "").replaceAll("_"," "))}
            </span>
            <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase">
              ${esc(w.status)}
            </span>
          </div>

          <div class="mt-1 text-xs text-slate-500">
            Ownership ${Number(w.ownership_percent || 0).toFixed(2)}%
            · Effective interest ${Number(w.effective_interest_percent || 0).toFixed(2)}%
          </div>

          <div class="mt-2 flex gap-4 flex-wrap text-xs text-slate-600">
            <span>Entity P/L <strong>${money(w.entity_profit_loss)}</strong></span>
            <span>Group share <strong>${money(w.share_profit_loss)}</strong></span>
            <span>Dividends <strong>${money(w.dividends_received)}</strong></span>
            <span>Impairment <strong>${money(w.impairment_loss)}</strong></span>
            <span>Closing investment <strong>${money(w.closing_investment)}</strong></span>
          </div>
        </div>

        <div class="flex gap-2 shrink-0">
          <button type="button" data-gr-eq-open="${w.id}"
            class="border rounded px-2 py-1 text-xs">Open</button>

          ${w.status === "calculated" ? `
            <button type="button" data-gr-eq-review="${w.id}"
              class="border rounded px-2 py-1 text-xs">Review</button>
          ` : ""}

          ${w.status === "reviewed" ? `
            <button type="button" data-gr-eq-approve="${w.id}"
              class="rounded bg-slate-900 text-white px-2 py-1 text-xs">Approve</button>
            <button type="button" data-gr-eq-calc="${w.id}"
              class="border rounded px-2 py-1 text-xs">Return</button>
          ` : ""}

          ${w.status === "approved" ? `
            <button type="button" data-gr-eq-calc="${w.id}"
              class="border rounded px-2 py-1 text-xs">Return</button>
          ` : ""}
        </div>
      </div>
    `).join("");

    bindEquityMethodActions();
  }

  async function prepareEquityMethodWorkpapers() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.prepareEquityMethod(cid,runId),
        { method: "POST", body: JSON.stringify({}) }
      );

      const issues = res?.data?.configuration_issues || [];

      alert(
        issues.length
          ? `${res?.message || "Workpapers prepared."}\n\n${issues.length} structure configuration issue(s) require attention.`
          : res?.message || "Equity-method workpapers prepared."
      );

      await loadEquityMethodWorkspace();
    } catch (e) {
      alert(e?.message || "Failed to prepare equity-method workpapers.");
    }
  }

  async function openEquityMethodWorkpaper(id) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId || !id) return;

    try {
      const data = await apiFetch(
        ENDPOINTS.consolidation.equityMethodWorkpaper(cid,runId,id),
        { method: "GET" }
      );
      renderEquityMethodModal(data);
    } catch (e) {
      alert(e?.message || "Failed to load equity-method workpaper.");
    }
  }

  function renderEquityMethodModal(data) {
    const w = data?.workpaper || {}, adjustments = data?.adjustments || [];
    const title = document.getElementById("grEqModalTitle");
    const meta = document.getElementById("grEqModalMeta");
    const body = document.getElementById("grEqModalBody");

    if (title) title.textContent = `${w.entity_name || ""} Equity Method Workpaper`;
    if (meta) meta.textContent =
      `${(w.relationship_type || "").replaceAll("_"," ")} · ${Number(w.effective_interest_percent || 0).toFixed(2)}% effective interest`;

    if (!body) return;

    body.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        ${[
          ["Opening investment",w.opening_investment],
          ["Entity profit/(loss)",w.entity_profit_loss],
          ["Group share P/L",w.share_profit_loss],
          ["Group share OCI",w.share_oci],
          ["Closing investment",w.closing_investment],
        ].map(([label,value]) => `
          <div class="rounded border p-3">
            <div class="text-xs text-slate-500">${esc(label)}</div>
            <div class="mt-1 font-semibold">${money(value)}</div>
          </div>
        `).join("")}
      </div>

      <form id="grEqWorkpaperForm" class="mt-5">
        <input type="hidden" name="workpaper_id" value="${esc(w.id)}" />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] text-slate-500 mb-1">Opening investment carrying amount</label>
            <input name="opening_investment" type="number" step="0.01"
              value="${esc(w.opening_investment || 0)}"
              class="w-full border rounded px-3 py-2 text-sm text-right" />
          </div>

          <div>
            <label class="block text-[11px] text-slate-500 mb-1">Notes</label>
            <input name="notes" value="${esc(w.notes || "")}"
              class="w-full border rounded px-3 py-2 text-sm" />
          </div>
        </div>

        <div class="mt-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h4 class="text-sm font-semibold">Equity-method adjustments</h4>
              <p class="mt-1 text-[11px] text-slate-500">
                Add dividends, impairment, FX and other movements affecting the investment.
              </p>
            </div>

            <button type="button" id="btnAddEquityMethodAdjustment"
              class="border rounded px-2 py-1 text-xs">
              + Adjustment
            </button>
          </div>

          <div id="grEqAdjustmentLines" class="mt-3 space-y-2"></div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button type="submit"
            class="border rounded px-4 py-2 text-sm">
            Save
          </button>

          <button type="button" id="btnCalculateEquityMethod"
            class="rounded bg-slate-900 text-white px-4 py-2 text-sm">
            Calculate
          </button>
        </div>
      </form>
    `;

    renderEquityMethodAdjustmentLines(adjustments);
    bindEquityMethodModal(w.id);

    const modal = document.getElementById("groupEquityMethodModal");
    modal?.classList.remove("hidden");
    modal?.classList.add("flex");
  }

  function equityMethodAdjustmentRow(x = {}) {
    return `
      <div class="grid grid-cols-1 md:grid-cols-[150px_1fr_160px_40px] gap-2"
        data-eq-adjustment>

        <select name="adjustment_type"
          class="border rounded px-2 py-1.5 text-xs">
          ${["dividend","impairment","fx","other_equity","other"].map(v => `
            <option value="${v}" ${x.adjustment_type === v ? "selected" : ""}>
              ${v.replaceAll("_"," ")}
            </option>
          `).join("")}
        </select>

        <input name="description"
          value="${esc(x.description || "")}"
          placeholder="Description"
          class="border rounded px-2 py-1.5 text-xs" />

        <input name="amount" type="number" step="0.01"
          value="${esc(x.amount ?? "")}"
          placeholder="Amount"
          class="border rounded px-2 py-1.5 text-xs text-right" />

        <button type="button" data-eq-remove
          class="text-xs text-slate-500">×</button>
      </div>
    `;
  }

  function renderEquityMethodAdjustmentLines(items = []) {
    const host = document.getElementById("grEqAdjustmentLines");
    if (!host) return;
    host.innerHTML = (items.length ? items : [{}])
      .map(equityMethodAdjustmentRow).join("");
  }

  function collectEquityMethodPayload(form) {
    return {
      opening_investment: Number(form.elements.opening_investment.value || 0),
      notes: form.elements.notes.value?.trim() || "",
      adjustments: Array.from(
        document.querySelectorAll("[data-eq-adjustment]")
      ).map(row => ({
        adjustment_type: row.querySelector('[name="adjustment_type"]')?.value,
        description: row.querySelector('[name="description"]')?.value?.trim(),
        amount: Number(row.querySelector('[name="amount"]')?.value || 0),
      })),
    };
  }

  async function saveEquityMethodWorkpaper(id,form) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;

    return apiFetch(
      ENDPOINTS.consolidation.equityMethodWorkpaper(cid,runId,id),
      {
        method: "PATCH",
        body: JSON.stringify(collectEquityMethodPayload(form)),
      }
    );
  }

  async function calculateEquityMethodWorkpaper(id,form) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;

    try {
      await saveEquityMethodWorkpaper(id,form);

      const res = await apiFetch(
        ENDPOINTS.consolidation.calculateEquityMethod(cid,runId,id),
        { method: "POST", body: JSON.stringify({}) }
      );

      alert(res?.message || "Equity-method workpaper calculated.");

      const modal = document.getElementById("groupEquityMethodModal");
      modal?.classList.add("hidden");
      modal?.classList.remove("flex");

      await loadEquityMethodWorkspace();
    } catch (e) {
      alert(e?.message || "Failed to calculate equity-method workpaper.");
    }
  }

  function bindEquityMethodModal(id) {
    const form = document.getElementById("grEqWorkpaperForm");
    const host = document.getElementById("grEqAdjustmentLines");

    document.getElementById("btnAddEquityMethodAdjustment")?.addEventListener("click",() => {
      host?.insertAdjacentHTML("beforeend",equityMethodAdjustmentRow());
    });

    host?.addEventListener("click",e => {
      e.target.closest("[data-eq-remove]")?.closest("[data-eq-adjustment]")?.remove();
    });

    form?.addEventListener("submit",async e => {
      e.preventDefault();
      try {
        await saveEquityMethodWorkpaper(id,form);
        alert("Equity-method workpaper saved.");
      } catch (err) {
        alert(err?.message || "Failed to save workpaper.");
      }
    });

    document.getElementById("btnCalculateEquityMethod")?.addEventListener(
      "click",() => calculateEquityMethodWorkpaper(id,form)
    );
  }

  async function setEquityMethodStatus(id,status) {
    const cid = companyId(), runId = state.selectedRun?.run?.id;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.equityMethodStatus(cid,runId,id),
        {
          method: "POST",
          body: JSON.stringify({ status }),
        }
      );

      alert(res?.message || "Workpaper updated.");
      await loadEquityMethodWorkspace();
    } catch (e) {
      alert(e?.message || "Failed to update workpaper.");
    }
  }

  function bindEquityMethodActions() {
    document.querySelectorAll("[data-gr-eq-open]").forEach(btn =>
      btn.onclick = () =>
        openEquityMethodWorkpaper(Number(btn.dataset.grEqOpen))
    );

    document.querySelectorAll("[data-gr-eq-review]").forEach(btn =>
      btn.onclick = () =>
        setEquityMethodStatus(Number(btn.dataset.grEqReview),"reviewed")
    );

    document.querySelectorAll("[data-gr-eq-approve]").forEach(btn =>
      btn.onclick = () =>
        setEquityMethodStatus(Number(btn.dataset.grEqApprove),"approved")
    );

    document.querySelectorAll("[data-gr-eq-calc]").forEach(btn =>
      btn.onclick = () =>
        setEquityMethodStatus(Number(btn.dataset.grEqCalc),"calculated")
    );
  }

  async function generateEquityMethodJournals() {
    const cid = companyId(), runId = state.selectedRun?.run?.id;
    if (!cid || !runId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.consolidation.generateEquityMethodJournals(cid,runId),
        { method: "POST", body: JSON.stringify({}) }
      );

      const missing = res?.data?.missing_accounts || [];

      alert(
        missing.length
          ? `${res?.message || "Journals generated."}\n\nMissing Group COA mappings:\n${missing.join("\n")}`
          : res?.message || "Equity-method journals generated."
      );

      await loadEquityMethodWorkspace();
    } catch (e) {
      alert(e?.message || "Failed to generate equity-method journals.");
    }
  }

  function bindConsolidationScreen() {
    const newBtn = document.getElementById("btnNewConsolidationRun");
    const closeBtn = document.getElementById("btnCloseGroupRunModal");
    const cancelBtn = document.getElementById("btnCancelGroupRun");
    const form = document.getElementById("groupRunForm");
    const backBtn =
      document.getElementById("btnBackToConsolidationRuns");

    const loadAllBtn =
      document.getElementById("btnLoadAllGroupTB");

    const refreshTbBtn =
      document.getElementById("btnRefreshGroupTB");

    const closeTbBtn =
      document.getElementById("btnCloseGroupTbModal");

    const mappingTab =
      document.getElementById("grAccountMappingTab");

    const bootstrapBtn =
      document.getElementById("btnBootstrapGroupCoa");

    const autoMapBtn =
      document.getElementById("btnAutoMapGroupAccounts");

    const mappingRefreshBtn =
      document.getElementById("btnRefreshGroupMapping");

    const mappingEntityFilter =
      document.getElementById("grMappingEntityFilter");

    const mappingUnmappedOnly =
      document.getElementById("grMappingUnmappedOnly");

    const preconTab =
      document.getElementById("grPreconsolidationTab");

    const validatePreconBtn =
      document.getElementById("btnValidatePrecon");

    const generatePreconBtn =
      document.getElementById("btnGeneratePrecon");

    const preconSearch =
      document.getElementById("grPreconSearch");

    const newAdjustmentBtn =
      document.getElementById("btnNewGroupAdjustment");

    const closeAdjustmentBtn =
      document.getElementById("btnCloseGroupAdjustmentModal");

    const addAdjustmentLineBtn =
      document.getElementById("btnAddGroupAdjustmentLine");

    const adjustmentForm =
      document.getElementById("groupAdjustmentForm");

    const newIcBtn = document.getElementById("btnNewIcBalance");
    const closeIcBtn = document.getElementById("btnCloseIcModal");
    const applyIcBtn = document.getElementById("btnApplyIcRules");
    const autoMatchIcBtn = document.getElementById("btnAutoMatchIc");
    const icForm = document.getElementById("groupIcForm");
    const icEntity = document.getElementById("grIcEntity");
    const generateElimBtn = document.getElementById("btnGenerateEliminations");
    const closeElimBtn = document.getElementById("btnCloseEliminationModal");
    
    const validateAdjustedBtn = document.getElementById("btnValidateAdjustedTb");
    const generateAdjustedBtn = document.getElementById("btnGenerateAdjustedTb");
    const adjustedSearch = document.getElementById("grAdjustedTbSearch");
    const closeAdjustedBtn = document.getElementById("btnCloseAdjustedTbModal");
    const prepareAcqBtn = document.getElementById("btnPrepareAcquisition");
    const closeAcqBtn = document.getElementById("btnCloseAcquisitionModal");
    const prepareEqBtn = document.getElementById("btnPrepareEquityMethod");
    const generateEqBtn = document.getElementById("btnGenerateEquityMethodJournals");
    const closeEqBtn = document.getElementById("btnCloseEquityMethodModal");

    if (newBtn && newBtn.dataset.bound !== "1") {
      newBtn.dataset.bound = "1";
      newBtn.addEventListener("click", openRunModal);
    }

    if (closeBtn && closeBtn.dataset.bound !== "1") {
      closeBtn.dataset.bound = "1";
      closeBtn.addEventListener("click", closeRunModal);
    }

    if (cancelBtn && cancelBtn.dataset.bound !== "1") {
      cancelBtn.dataset.bound = "1";
      cancelBtn.addEventListener("click", closeRunModal);
    }

    if (form && form.dataset.bound !== "1") {
      form.dataset.bound = "1";
      form.addEventListener("submit", async e => {
        e.preventDefault();
        await createRun(form);
      });
    }

    if (backBtn && backBtn.dataset.bound !== "1") {
      backBtn.dataset.bound = "1";
      backBtn.addEventListener("click", () => {
        state.selectedRun = null;
        state.tbSummary = null;
        state.mapping = null;
        state.groupCoa = [];
        state.precon = null;
        state.adjustments = [];
        state.intercompany = null;
        state.adjustedTb = null;
        state.acquisition = null;
        state.equityMethod = null;

        [
          "grAccountMappingTab", 
          "grPreconsolidationTab", 
          "grAdjustmentsTab", 
          "grIntercompanyTab",
          "grEliminationsTab", 
          "grAdjustedTbTab",
          "grAcquisitionTab",
          "grEquityMethodTab",
        ].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.disabled = true;
        });

        ["groupRunWorkspace", 
          "groupMappingWorkspace", 
          "groupPreconWorkspace", 
          "groupAdjustmentsWorkspace", 
          "groupIntercompanyWorkspace", 
          "groupEliminationsWorkspace", 
          "groupAdjustedTbWorkspace",
          "groupAcquisitionWorkspace",
          "groupEquityMethodWorkspace",
        ].forEach(id =>
          document.getElementById(id)?.classList.add("hidden")
        );

        document.querySelector('[data-group-panel="runs"]')?.classList.remove("hidden");
        showGroupTab("runs");
      });
    }

    if (loadAllBtn && loadAllBtn.dataset.bound !== "1") {
      loadAllBtn.dataset.bound = "1";
      loadAllBtn.addEventListener("click", loadAllEntityTbs);
    }

    if (refreshTbBtn && refreshTbBtn.dataset.bound !== "1") {
      refreshTbBtn.dataset.bound = "1";
      refreshTbBtn.addEventListener("click", loadGroupTbSummary);
    }

    if (closeTbBtn && closeTbBtn.dataset.bound !== "1") {
      closeTbBtn.dataset.bound = "1";
      closeTbBtn.addEventListener("click", closeEntityTbModal);
    }

    document.querySelectorAll(".group-reporting-tab").forEach(btn => {
      if (btn.dataset.bound === "1") return;

      btn.dataset.bound = "1";

      btn.addEventListener("click", () => {
        const tab = btn.dataset.groupTab;

        if (tab === "mapping" && !state.selectedRun) {
          alert("Open a consolidation run first.");
          return;
        }

        if (btn.disabled) return;

        showGroupTab(tab);
      });
    });

    if (bootstrapBtn && bootstrapBtn.dataset.bound !== "1") {
      bootstrapBtn.dataset.bound = "1";
      bootstrapBtn.addEventListener("click", bootstrapGroupCoa);
    }

    if (autoMapBtn && autoMapBtn.dataset.bound !== "1") {
      autoMapBtn.dataset.bound = "1";
      autoMapBtn.addEventListener("click", autoMapGroupAccounts);
    }

    if (mappingRefreshBtn && mappingRefreshBtn.dataset.bound !== "1") {
      mappingRefreshBtn.dataset.bound = "1";
      mappingRefreshBtn.addEventListener("click", loadGroupMapping);
    }

    if (mappingEntityFilter && mappingEntityFilter.dataset.bound !== "1") {
      mappingEntityFilter.dataset.bound = "1";
      mappingEntityFilter.addEventListener("change", loadGroupMapping);
    }

    if (mappingUnmappedOnly && mappingUnmappedOnly.dataset.bound !== "1") {
      mappingUnmappedOnly.dataset.bound = "1";
      mappingUnmappedOnly.addEventListener("change", loadGroupMapping);
    }

    if (
      validatePreconBtn &&
      validatePreconBtn.dataset.bound !== "1"
    ) {
      validatePreconBtn.dataset.bound = "1";
      validatePreconBtn.addEventListener(
        "click",
        validatePreconsolidation
      );
    }

    if (
      generatePreconBtn &&
      generatePreconBtn.dataset.bound !== "1"
    ) {
      generatePreconBtn.dataset.bound = "1";
      generatePreconBtn.addEventListener(
        "click",
        generatePreconsolidation
      );
    }

    if (
      newAdjustmentBtn &&
      newAdjustmentBtn.dataset.bound !== "1"
    ) {
      newAdjustmentBtn.dataset.bound = "1";
      newAdjustmentBtn.addEventListener(
        "click",
        openGroupAdjustmentModal
      );
    }

    if (
      closeAdjustmentBtn &&
      closeAdjustmentBtn.dataset.bound !== "1"
    ) {
      closeAdjustmentBtn.dataset.bound = "1";
      closeAdjustmentBtn.addEventListener(
        "click",
        closeGroupAdjustmentModal
      );
    }

    if (
      addAdjustmentLineBtn &&
      addAdjustmentLineBtn.dataset.bound !== "1"
    ) {
      addAdjustmentLineBtn.dataset.bound = "1";

      addAdjustmentLineBtn.addEventListener("click", () => {
        document
          .getElementById("groupAdjustmentLines")
          ?.insertAdjacentHTML(
            "beforeend",
            adjustmentLineRow()
          );

        bindAdjustmentLineEvents();
      });
    }

    if (
      adjustmentForm &&
      adjustmentForm.dataset.bound !== "1"
    ) {
      adjustmentForm.dataset.bound = "1";

      adjustmentForm.addEventListener("submit", async e => {
        e.preventDefault();
        await saveGroupAdjustment(adjustmentForm);
      });
    }

    if (
      preconSearch &&
      preconSearch.dataset.bound !== "1"
    ) {
      preconSearch.dataset.bound = "1";

      preconSearch.addEventListener("input", () => {
        renderPreconRows();
      });
    }

    if (newIcBtn && newIcBtn.dataset.bound !== "1") {
      newIcBtn.dataset.bound = "1";
      newIcBtn.addEventListener("click", openIcModal);
    }

    if (closeIcBtn && closeIcBtn.dataset.bound !== "1") {
      closeIcBtn.dataset.bound = "1";
      closeIcBtn.addEventListener("click", closeIcModal);
    }

    if (applyIcBtn && applyIcBtn.dataset.bound !== "1") {
      applyIcBtn.dataset.bound = "1";
      applyIcBtn.addEventListener("click", applyIcRules);
    }

    if (autoMatchIcBtn && autoMatchIcBtn.dataset.bound !== "1") {
      autoMatchIcBtn.dataset.bound = "1";
      autoMatchIcBtn.addEventListener("click", autoMatchIc);
    }

    if (icEntity && icEntity.dataset.bound !== "1") {
      icEntity.dataset.bound = "1";
      icEntity.addEventListener("change", refreshIcAccounts);
    }

    if (icForm && icForm.dataset.bound !== "1") {
      icForm.dataset.bound = "1";
      icForm.addEventListener("submit", async e => {
        e.preventDefault();
        await saveIcBalance(icForm);
      });
    }

    if (generateElimBtn && generateElimBtn.dataset.bound !== "1") {
      generateElimBtn.dataset.bound = "1";
      generateElimBtn.addEventListener("click", generateEliminations);
    }

    if (closeElimBtn && closeElimBtn.dataset.bound !== "1") {
      closeElimBtn.dataset.bound = "1";
      closeElimBtn.addEventListener("click", closeEliminationModal);
    }

    if (validateAdjustedBtn && validateAdjustedBtn.dataset.bound !== "1") {
      validateAdjustedBtn.dataset.bound = "1";
      validateAdjustedBtn.addEventListener("click", validateAdjustedTb);
    }

    if (generateAdjustedBtn && generateAdjustedBtn.dataset.bound !== "1") {
      generateAdjustedBtn.dataset.bound = "1";
      generateAdjustedBtn.addEventListener("click", generateAdjustedTb);
    }

    if (adjustedSearch && adjustedSearch.dataset.bound !== "1") {
      adjustedSearch.dataset.bound = "1";
      adjustedSearch.addEventListener("input", renderAdjustedTbRows);
    }

    if (closeAdjustedBtn && closeAdjustedBtn.dataset.bound !== "1") {
      closeAdjustedBtn.dataset.bound = "1";
      closeAdjustedBtn.addEventListener("click", closeAdjustedTbModal);
    }

    if (prepareAcqBtn && prepareAcqBtn.dataset.bound !== "1") {
      prepareAcqBtn.dataset.bound = "1";
      prepareAcqBtn.addEventListener("click", prepareAcquisitionWorkpapers);
    }

    if (closeAcqBtn && closeAcqBtn.dataset.bound !== "1") {
      closeAcqBtn.dataset.bound = "1";
      closeAcqBtn.addEventListener("click", () => {
        const modal = document.getElementById("groupAcquisitionModal");
        modal?.classList.add("hidden");
        modal?.classList.remove("flex");
      });
    }

    if (prepareEqBtn && prepareEqBtn.dataset.bound !== "1") {
      prepareEqBtn.dataset.bound = "1";
      prepareEqBtn.addEventListener("click",prepareEquityMethodWorkpapers);
    }

    if (generateEqBtn && generateEqBtn.dataset.bound !== "1") {
      generateEqBtn.dataset.bound = "1";
      generateEqBtn.addEventListener("click",generateEquityMethodJournals);
    }

    if (closeEqBtn && closeEqBtn.dataset.bound !== "1") {
      closeEqBtn.dataset.bound = "1";
      closeEqBtn.addEventListener("click",() => {
        const modal = document.getElementById("groupEquityMethodModal");
        modal?.classList.add("hidden");
        modal?.classList.remove("flex");
      });
    }
  }

  window.bindConsolidationScreen = bindConsolidationScreen;
  window.loadConsolidationRuns = loadRuns;
})();