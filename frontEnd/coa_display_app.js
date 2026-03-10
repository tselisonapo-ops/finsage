// coa_display_app.js — FastAPI-compatible (port 8000) + new field names

const API_HOST = 'http://127.0.0.1:8000';
const API_BASE = API_HOST + '/api';                  // -> /api/companies/:id/coa
const TEST_COMPANY_ID = 1001;                        // change or pass via URL

let currentCOAData = [];
let sortDirection = 'asc';
let sortColumn = 'code';

document.addEventListener('DOMContentLoaded', () => {
  const cid = getCompanyIdFromQuery() || TEST_COMPANY_ID;
  safeSetText('#company-id-display', cid);

  // table sorting
  document.querySelectorAll('#coa-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => sortData(th.getAttribute('data-sort')));
  });

  // legacy search + select filters
  on('#search-input', 'keyup', filterAndRender);
  on('#category-filter', 'change', filterAndRender);
  on('#group-filter', 'change', filterAndRender);

  // 🔥 new vertical filter buttons
  bindCoaFilters();

  // initial fetch
  fetchCOAData(cid);
});

/* ------------------------------ API ------------------------------ */

async function fetchCOAData(companyId, opts) {
  showLoading(true);

  const url = new URL(`${API_BASE}/companies/${companyId}/coa`);
  if (opts && opts.fallbackIndustry) {
    url.searchParams.set('fallback_industry', opts.fallbackIndustry);
    if (opts.fallbackSubindustry) {
      url.searchParams.set('fallback_subindustry', opts.fallbackSubindustry);
    }
  }

  try {
    const res = await fetch(url.toString());
    const payload = await res.json();

    if (!res.ok) {
      showError(payload && (payload.detail || payload.message) || 'Failed to fetch COA.');
      return;
    }

    // FastAPI returns a list of dicts already shaped by row_to_dict
    // Expected keys: group, code, name, type, posting, description, standard
    currentCOAData = Array.isArray(payload) ? payload : (payload.coa || []);
    populateFilters(currentCOAData);
    renderTable(currentCOAData);
    showLoading(false);
    showTable(true);

  } catch (err) {
    console.error('Network Error:', err);
    showError('Network error. Ensure FastAPI is running on port 8000.');
  }
}

/* ------------------------------ UI helpers ------------------------------ */

function renderTable(rows) {
  const tbody = byId('coa-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!rows || rows.length === 0) {
    const tr = tbody.insertRow();
    const td = tr.insertCell();
    td.colSpan = 6;
    td.textContent = 'No accounts found.';
    return;
  }

  rows.forEach(acc => {
    const tr = tbody.insertRow();
    tr.insertCell().textContent = str(acc.code);
    tr.insertCell().textContent = str(acc.name);
    tr.insertCell().textContent = str(acc.group);       // reporting group
    tr.insertCell().textContent = str(acc.type);        // section (Asset, Liability…)
    tr.insertCell().textContent = str(acc.standard) || 'N/A';
    tr.insertCell().textContent = str(acc.description);
  });
}

function populateFilters(data) {
  // category-filter is now “type/section” (Asset, Liability, Income, Expense, Equity, Adjustment)
  const typeSel = byId('category-filter');
  if (typeSel) {
    fillSelect(typeSel, uniqueSorted(data.map(x => str(x.type)).filter(Boolean)), 'All sections');
  }

  // optional extra filter (add <select id="group-filter"> in HTML to enable)
  const groupSel = byId('group-filter');
  if (groupSel) {
    fillSelect(groupSel, uniqueSorted(data.map(x => str(x.group)).filter(Boolean)), 'All groups');
  }
}

function filterAndRender() {
  const q = (byId('search-input')?.value || '').toLowerCase();
  const typeVal  = byId('category-filter')?.value || '';  // section filter
  const groupVal = byId('group-filter')?.value || '';     // optional

  const filtered = currentCOAData.filter(a => {
    const inSearch = q
      ? (str(a.name).toLowerCase().includes(q) ||
         str(a.code).toLowerCase().includes(q) ||
         str(a.group).toLowerCase().includes(q) ||
         str(a.type).toLowerCase().includes(q) ||
         str(a.description).toLowerCase().includes(q))
      : true;

    const inType  = typeVal ? (str(a.type) === typeVal) : true;
    const inGroup = groupVal ? (str(a.group) === groupVal) : true;

    return inSearch && inType && inGroup;
  });

  renderTable(filtered);
}

/* ------------------------------ Sorting ------------------------------ */

function sortData(column) {
  // toggle direction if same column
  if (sortColumn === column) {
    sortDirection = (sortDirection === 'asc') ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = 'asc';
  }

  const dir = sortDirection === 'asc' ? 1 : -1;

  // create a new array so we sort the view, not the original reference
  const sorted = [...currentCOAData].sort((a, b) => {
    let A = a[column];
    let B = b[column];

    // numeric for code if it looks numeric
    if (column === 'code') {
      const nA = parseInt(A, 10);
      const nB = parseInt(B, 10);
      if (!isNaN(nA) && !isNaN(nB)) return (nA - nB) * dir;
    }

    // generic string compare
    A = str(A).toLowerCase();
    B = str(B).toLowerCase();
    if (A < B) return -1 * dir;
    if (A > B) return  1 * dir;
    return 0;
  });

  renderTable(sorted);
}

/* ------------------------------ DOM utils ------------------------------ */

/* ------------------------------ Journal Posting ------------------------------ */

async function postJournalEntry({ companyId, debitAcc, creditAcc, grossAmount, vatRate, description, date }) {
  // 1. Split gross into net + VAT
  const netAmount = +(grossAmount / (1 + vatRate)).toFixed(2);
  const vatAmount = +(grossAmount - netAmount).toFixed(2);

  // 2. Check IFRS tags for notes requirement
  if (debitAcc.requiresNotes || creditAcc.requiresNotes) {
    console.warn("IFRS disclosure required for this journal entry.");
    // You could call an API to persist a note here
    // await fetch(`${API_BASE}/companies/${companyId}/notes`, { ... })
  }

  // 3. Build journal payload (3 lines: DR, CR, VAT)
  const journalPayload = {
    date,
    description,
    gross_amount: grossAmount,
    net_amount: netAmount,
    vat_amount: vatAmount,
    lines: [
      {
        account_code: debitAcc.code,
        debit: netAmount,
        credit: 0,
        description
      },
      {
        account_code: creditAcc.code,
        debit: 0,
        credit: netAmount,
        description
      },
      {
        account_code: debitAcc.isExpense ? "VAT_INPUT" : "VAT_OUTPUT",
        debit: debitAcc.isExpense ? vatAmount : 0,
        credit: debitAcc.isExpense ? 0 : vatAmount,
        description: "VAT posting"
      }
    ]
  };

  // 4. Post to FastAPI backend
  try {
    const res = await fetch(`${API_BASE}/companies/${companyId}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(journalPayload)
    });
    const result = await res.json();

    if (!res.ok) {
      showError(result.detail || "Failed to post journal entry.");
      return;
    }

    console.log("Journal posted:", result);
    // Optionally refresh ledger / TB views here
    // await fetchLedger(companyId);
    // await fetchTrialBalance(companyId);

  } catch (err) {
    console.error("Network Error:", err);
    showError("Network error posting journal. Ensure FastAPI is running.");
  }
}

function bindCoaFilters() {
  const filters = document.querySelectorAll("#coaFilters .coa-filter");
  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      // remove active class from all
      filters.forEach((b) => b.classList.remove("active"));
      // mark this one active
      btn.classList.add("active");

      // get filter value
      const filter = btn.dataset.coaFilter || "all";
      applyCoaFilter(filter);
    });
  });
}

function applyCoaFilter(filter) {
  const rawFilter = (filter || "all").toLowerCase();

  // normalize: Assets / Liabilities → asset / liability
  const normalize = (val) =>
    (val || "")
      .toLowerCase()
      .replace(/ies$/i, "y") // liabilities -> liability
      .replace(/s$/i, "");   // assets -> asset

  const target = normalize(rawFilter);

  // filter currentCOAData and re-render
  const filtered = currentCOAData.filter(a => {
    const rowType = normalize(str(a.type));
    return target === "all" || rowType === target;
  });

  renderTable(filtered);
}

function byId(id) { return document.getElementById(id); }
function on(sel, evt, fn) {
  const el = document.querySelector(sel);
  if (el) el.addEventListener(evt, fn);
}
function safeSetText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}
function showLoading(on) {
  const el = document.querySelector('.loading');
  if (el) el.style.display = on ? 'block' : 'none';
}
function showTable(on) {
  const el = byId('coa-table');
  if (el) el.style.display = on ? 'table' : 'none';
}
function showError(msg) {
  const host = byId('coa-output');
  if (host) host.innerHTML = `<p style="color: red;">${msg}</p>`;
  showLoading(false);
  showTable(false);
}
function fillSelect(selectEl, items, firstLabel) {
  if (!selectEl) return;
  const placeholder = firstLabel || 'All';
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    selectEl.appendChild(opt);
  });
}
function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((a,b) => a.localeCompare(b));
}
function str(v) { return (v == null ? '' : String(v)); }
function getCompanyIdFromQuery() {
  try { return new URLSearchParams(location.search).get('company_id'); }
  catch { return null; }
}
