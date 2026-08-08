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

    document.querySelectorAll(".group-reporting-tab").forEach(btn => {
      const active = btn.dataset.groupTab === tab;

    document.querySelectorAll(".group-reporting-tab").forEach(btn=>{
      const active=btn.dataset.groupTab===tab;
      btn.classList.toggle("active",active);
    });
    });

    if (tab === "preconsolidation") {
      runs?.classList.add("hidden");
      runWorkspace?.classList.add("hidden");
      mapping?.classList.add("hidden");
      precon?.classList.remove("hidden");

      loadPreconsolidation();
      return;
    }

    if (tab === "mapping") {
      runs?.classList.add("hidden");
      runWorkspace?.classList.add("hidden");
      mapping?.classList.remove("hidden");

      loadGroupMapping();
      return;
    }

    mapping?.classList.add("hidden");
    precon?.classList.add("hidden");

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

    const groupCoaForm =
      document.getElementById("groupCoaForm");

    const preconTab =
      document.getElementById("grPreconsolidationTab");

    const validatePreconBtn =
      document.getElementById("btnValidatePrecon");

    const generatePreconBtn =
      document.getElementById("btnGeneratePrecon");

    const preconSearch =
      document.getElementById("grPreconSearch");

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

        const mapTab =
          document.getElementById("grAccountMappingTab");

        if (mapTab)
          mapTab.disabled = true;

        document
          .getElementById("groupRunWorkspace")
          ?.classList.add("hidden");

        document
          .getElementById("groupMappingWorkspace")
          ?.classList.add("hidden");

        document
          .querySelector('[data-group-panel="runs"]')
          ?.classList.remove("hidden");

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
      preconSearch &&
      preconSearch.dataset.bound !== "1"
    ) {
      preconSearch.dataset.bound = "1";

      preconSearch.addEventListener("input", () => {
        renderPreconRows();
      });
    }
  }

  window.bindConsolidationScreen = bindConsolidationScreen;
  window.loadConsolidationRuns = loadRuns;
})();