/**
 * Marketplace — Create Order Modal
 * =================================
 * Drop-in companion to makro_screen.js.
 *
 * Wires the unused backend endpoint
 *   POST /api/companies/<cid>/marketplace/orders
 * (routes.py: create_marketplace_orders -> order_svc.create_order)
 * into the UI so users can actually create marketplace orders.
 *
 * Business flow supported (per owner scenario):
 *   - Pick marketplace counterparty (MAKRO / TAKEALOT / custom).
 *     Each marketplace_account row carries its own receivable_account_code,
 *     so Dr goes to "Marketplace Receivable" for that marketplace.
 *   - Capture lines. For Takealot (stock-on-hand model), pick from existing
 *     inventory_items via autocomplete — unit_cost autofills so COGS preview
 *     is real. For Makro (JIT model), type a new SKU + description + unit_cost
 *     manually; register the inventory purchase separately to create the
 *     FIFO layer before clicking "Post GL".
 *   - fulfilment_date = "Dispatch / Delivery date" = revenue recognition
 *     trigger. post_order_to_gl uses recognition_date, else fulfilment_date,
 *     else order_date.
 *   - Optional "Post to GL immediately" checkbox (default OFF) — only tick
 *     when the order has actually left the warehouse.
 *
 * No build step required. Just include after makro_screen.js:
 *   <script src="/static/js/marketplace_create_order.js"></script>
 *
 * Style matches makro_screen.js: IIFE, var/function, window.apiFetch,
 * slate/teal palette, cc-btn / ckp-pill classes.
 */
(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────── helpers
  function $(id) { return document.getElementById(id); }

  function fmtR(v) {
    if (v === null || v === undefined || isNaN(Number(v))) return "—";
    var n = Number(v);
    var sign = n < 0 ? "-" : "";
    return sign + "R " + Math.abs(n).toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function getCompanyId() {
    return (typeof getActiveCompanyId === "function" ? getActiveCompanyId() : null) ||
      window.CURRENT_COMPANY_ID ||
      1;
  }

  function todayISO() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function qMoney(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }
  function qQty(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : Math.round(n * 10000) / 10000;
  }
  function qRate(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : Math.round(n * 10000) / 10000;
  }

  // ─────────────────────────────────────────────────────────── state
  var MODAL_ID = "mktCreateOrderModal";
  var BACKDROP_ID = "mktCreateOrderBackdrop";
  var state = {
    open: false,
    inventoryItems: [],          // cached inventory_items rows
    inventoryLoaded: false,
    lines: [makeEmptyLine()],
    postImmediately: false,
  };

  function makeEmptyLine() {
    return {
      inventory_item_id: null,
      sku: "",
      product_description: "",
      quantity: 1,
      unit_price: 0,            // VAT-inclusive (matches calculate_line)
      unit_cost: 0,
      discount: 0,
      vat_rate: 0.15,
      is_taxable: true,
    };
  }

  // ─────────────────────────────────────────────────────────── styling
  function injectStyles() {
    if ($(MODAL_ID + "Styles")) return;
    var css = document.createElement("style");
    css.id = MODAL_ID + "Styles";
    css.textContent = [
      "#" + BACKDROP_ID + " {",
      "  position: fixed; inset: 0; background: rgba(15,23,42,0.55);",
      "  z-index: 9000; display: none;",
      "}",
      "#" + BACKDROP_ID + ".is-open { display: block; }",
      "#" + MODAL_ID + " {",
      "  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);",
      "  width: min(1100px, 94vw); max-height: 92vh; overflow: auto;",
      "  background: #ffffff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);",
      "  z-index: 9001; display: none; font-family: inherit;",
      "}",
      "#" + MODAL_ID + ".is-open { display: block; }",
      "#" + MODAL_ID + " .mkt-modal-header {",
      "  padding: 16px 24px; border-bottom: 1px solid #e2e8f0;",
      "  display: flex; justify-content: space-between; align-items: center;",
      "  background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-radius: 12px 12px 0 0;",
      "}",
      "#" + MODAL_ID + " .mkt-modal-title { font-size: 18px; font-weight: 700; color: #0f172a; }",
      "#" + MODAL_ID + " .mkt-modal-sub { font-size: 12px; color: #0369a1; margin-top: 2px; }",
      "#" + MODAL_ID + " .mkt-close {",
      "  background: transparent; border: 0; font-size: 22px; color: #64748b;",
      "  cursor: pointer; padding: 4px 8px; border-radius: 6px;",
      "}",
      "#" + MODAL_ID + " .mkt-close:hover { background: #f1f5f9; color: #0f172a; }",
      "#" + MODAL_ID + " .mkt-modal-body { padding: 20px 24px; }",
      "#" + MODAL_ID + " .mkt-grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 24px; }",
      "#" + MODAL_ID + " @media (max-width: 860px) { .mkt-grid { grid-template-columns: 1fr; } }",
      "#" + MODAL_ID + " .mkt-section {",
      "  border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;",
      "  background: #f8fafc;",
      "}",
      "#" + MODAL_ID + " .mkt-section-title {",
      "  font-size: 11px; font-weight: 700; color: #475569;",
      "  text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 10px;",
      "}",
      "#" + MODAL_ID + " .mkt-field { margin-bottom: 10px; }",
      "#" + MODAL_ID + " .mkt-label {",
      "  display: block; font-size: 11px; font-weight: 600; color: #334155;",
      "  margin-bottom: 3px;",
      "}",
      "#" + MODAL_ID + " .mkt-hint { font-size: 10px; color: #64748b; margin-top: 2px; }",
      "#" + MODAL_ID + " input.mkt-input, select.mkt-input, textarea.mkt-input {",
      "  width: 100%; padding: 7px 9px; font-size: 13px;",
      "  border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;",
      "  box-sizing: border-box; color: #0f172a;",
      "}",
      "#" + MODAL_ID + " input.mkt-input:focus, select.mkt-input:focus, textarea.mkt-input:focus {",
      "  outline: none; border-color: #0284c7; box-shadow: 0 0 0 2px rgba(2,132,199,0.15);",
      "}",
      "#" + MODAL_ID + " .mkt-lines-table { width: 100%; border-collapse: collapse; font-size: 12px; }",
      "#" + MODAL_ID + " .mkt-lines-table th {",
      "  text-align: left; padding: 6px 4px; color: #475569;",
      "  font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;",
      "  border-bottom: 1px solid #e2e8f0;",
      "}",
      "#" + MODAL_ID + " .mkt-lines-table td { padding: 4px; border-bottom: 1px solid #f1f5f9; }",
      "#" + MODAL_ID + " .mkt-lines-table input, .mkt-lines-table select {",
      "  width: 100%; padding: 5px 6px; font-size: 12px;",
      "  border: 1px solid #e2e8f0; border-radius: 4px; background: #fff; box-sizing: border-box;",
      "}",
      "#" + MODAL_ID + " .mkt-lines-table input:focus { outline: none; border-color: #0284c7; }",
      "#" + MODAL_ID + " .mkt-line-gross { text-align: right; font-weight: 600; color: #0f172a; }",
      "#" + MODAL_ID + " .mkt-line-cost { text-align: right; color: #64748b; font-size: 11px; }",
      "#" + MODAL_ID + " .mkt-remove-btn {",
      "  background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;",
      "  padding: 4px 7px; border-radius: 4px; cursor: pointer; font-size: 11px;",
      "}",
      "#" + MODAL_ID + " .mkt-remove-btn:hover { background: #fee2e2; }",
      "#" + MODAL_ID + " .mkt-add-line {",
      "  margin-top: 8px; padding: 6px 12px; font-size: 12px;",
      "  background: #f0f9ff; color: #0369a1; border: 1px dashed #bae6fd;",
      "  border-radius: 6px; cursor: pointer;",
      "}",
      "#" + MODAL_ID + " .mkt-add-line:hover { background: #e0f2fe; }",
      "#" + MODAL_ID + " .mkt-totals {",
      "  margin-top: 12px; padding: 10px 12px; background: #f0fdf4;",
      "  border-radius: 6px; border: 1px solid #bbf7d0;",
      "}",
      "#" + MODAL_ID + " .mkt-totals-row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }",
      "#" + MODAL_ID + " .mkt-totals-row.total { font-weight: 700; color: #047857; border-top: 1px solid #bbf7d0; padding-top: 6px; margin-top: 4px; }",
      "#" + MODAL_ID + " .mkt-preview {",
      "  margin-top: 10px; padding: 10px 12px; background: #fffbeb;",
      "  border-radius: 6px; border: 1px solid #fde68a; font-size: 11px; color: #78350f;",
      "}",
      "#" + MODAL_ID + " .mkt-preview-title { font-weight: 700; margin-bottom: 4px; }",
      "#" + MODAL_ID + " .mkt-preview-row { display: flex; justify-content: space-between; padding: 1px 0; }",
      "#" + MODAL_ID + " .mkt-checkbox-row { display: flex; align-items: flex-start; gap: 8px; margin-top: 10px; }",
      "#" + MODAL_ID + " .mkt-modal-footer {",
      "  padding: 14px 24px; border-top: 1px solid #e2e8f0;",
      "  display: flex; justify-content: space-between; align-items: center; background: #f8fafc;",
      "  border-radius: 0 0 12px 12px;",
      "}",
      "#" + MODAL_ID + " .mkt-error {",
      "  margin-top: 10px; padding: 8px 12px; background: #fef2f2;",
      "  border-radius: 6px; border: 1px solid #fecaca; color: #b91c1c; font-size: 12px;",
      "  display: none;",
      "}",
      "#" + MODAL_ID + " .mkt-error.is-visible { display: block; }",
      "#" + MODAL_ID + " .mkt-new-order-btn {",
      "  padding: 6px 14px; background: #0284c7; color: #fff;",
      "  border: 1px solid #0369a1; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;",
      "}",
      "#" + MODAL_ID + " .mkt-new-order-btn:hover { background: #0369a1; }",
      "#" + MODAL_ID + " .mkt-btn-primary {",
      "  padding: 8px 18px; background: #0f766e; color: #fff; border: 0;",
      "  border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;",
      "}",
      "#" + MODAL_ID + " .mkt-btn-primary:hover { background: #115e59; }",
      "#" + MODAL_ID + " .mkt-btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }",
      "#" + MODAL_ID + " .mkt-btn-secondary {",
      "  padding: 8px 18px; background: #fff; color: #475569;",
      "  border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; font-size: 13px;",
      "}",
      "#" + MODAL_ID + " .mkt-stock-badge {",
      "  display: inline-block; padding: 1px 6px; border-radius: 8px;",
      "  font-size: 10px; font-weight: 700; margin-left: 4px;",
      "}",
      "#" + MODAL_ID + " .mkt-stock-badge.in-stock { background: #ecfdf5; color: #047857; }",
      "#" + MODAL_ID + " .mkt-stock-badge.low { background: #fffbeb; color: #b45309; }",
      "#" + MODAL_ID + " .mkt-stock-badge.none { background: #fef2f2; color: #b91c1c; }",
    ].join("\n");
    document.head.appendChild(css);
  }

  // ─────────────────────────────────────────────────────────── modal DOM
  function buildModal() {
    injectStyles();

    var backdrop = document.createElement("div");
    backdrop.id = BACKDROP_ID;
    backdrop.addEventListener("click", closeModal);

    var modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.innerHTML = renderModalHTML();

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    wireEvents();
  }

  function renderModalHTML() {
    return [
      '<div class="mkt-modal-header">',
      '  <div>',
      '    <div class="mkt-modal-title">New Marketplace Order</div>',
      '    <div class="mkt-modal-sub">Capture a sales order against a marketplace counterparty. Revenue is recognised on the dispatch / delivery date.</div>',
      '  </div>',
      '  <button type="button" class="mkt-close" id="mktCreateOrderClose" title="Close">&times;</button>',
      '</div>',

      '<div class="mkt-modal-body">',
      '  <div class="mkt-grid">',

      // ───── left: order header
      '    <div>',
      '      <div class="mkt-section">',
      '        <div class="mkt-section-title">Order header</div>',
      '        <div class="mkt-field">',
      '          <label class="mkt-label" for="mktMarketplace">Marketplace counterparty</label>',
      '          <select id="mktMarketplace" class="mkt-input">',
      '            <option value="MAKRO">Makro Marketplace (JIT inventory)</option>',
      '            <option value="TAKEALOT">Takealot Marketplace (stock on hand)</option>',
      '            <option value="OTHER">Other / custom</option>',
      '          </select>',
      '          <div class="mkt-hint" id="mktMarketplaceHint">Dr goes to this marketplace\'s receivable_account_code.</div>',
      '        </div>',
      '        <div class="mkt-field">',
      '          <label class="mkt-label" for="mktExtOrder">External order number *</label>',
      '          <input type="text" id="mktExtOrder" class="mkt-input" placeholder="e.g. MK-2025-000123" autocomplete="off">',
      '        </div>',
      '        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">',
      '          <div class="mkt-field">',
      '            <label class="mkt-label" for="mktOrderDate">Order date</label>',
      '            <input type="date" id="mktOrderDate" class="mkt-input">',
      '          </div>',
      '          <div class="mkt-field">',
      '            <label class="mkt-label" for="mktFulfilmentDate">Dispatch / delivery date</label>',
      '            <input type="date" id="mktFulfilmentDate" class="mkt-input">',
      '            <div class="mkt-hint">Revenue recognition trigger</div>',
      '          </div>',
      '        </div>',
      '        <div class="mkt-field">',
      '          <label class="mkt-label" for="mktCustomer">Customer name</label>',
      '          <input type="text" id="mktCustomer" class="mkt-input" autocomplete="off">',
      '        </div>',
      '        <div class="mkt-field">',
      '          <label class="mkt-label" for="mktShipping">Shipping address</label>',
      '          <textarea id="mktShipping" class="mkt-input" rows="2"></textarea>',
      '        </div>',
      '        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">',
      '          <div class="mkt-field">',
      '            <label class="mkt-label" for="mktCurrency">Currency</label>',
      '            <input type="text" id="mktCurrency" class="mkt-input" value="ZAR">',
      '          </div>',
      '          <div class="mkt-field">',
      '            <label class="mkt-label" for="mktNotes">Notes</label>',
      '            <input type="text" id="mktNotes" class="mkt-input" autocomplete="off">',
      '          </div>',
      '        </div>',
      '      </div>',

      '      <div class="mkt-section" style="margin-top:12px;">',
      '        <div class="mkt-section-title">What will be posted when you click Post GL</div>',
      '        <div class="mkt-preview" id="mktPostingPreview"></div>',
      '      </div>',
      '    </div>',

      // ───── right: order lines
      '    <div>',
      '      <div class="mkt-section">',
      '        <div class="mkt-section-title">Order lines</div>',
      '        <div class="mkt-hint" style="margin-bottom:8px;">Selling prices are <strong>VAT-inclusive</strong>. Pick an existing SKU to autofill cost (Takealot) or type a new SKU + cost for JIT purchases (Makro).</div>',
      '        <table class="mkt-lines-table">',
      '          <thead>',
      '            <tr>',
      '              <th style="width:18%;">SKU</th>',
      '              <th style="width:26%;">Description</th>',
      '              <th style="width:9%;">Qty</th>',
      '              <th style="width:12%;">Unit price</th>',
      '              <th style="width:11%;">Unit cost</th>',
      '              <th style="width:8%;">VAT %</th>',
      '              <th style="width:10%;">Gross</th>',
      '              <th style="width:4%;"></th>',
      '            </tr>',
      '          </thead>',
      '          <tbody id="mktLinesBody"></tbody>',
      '        </table>',
      '        <button type="button" class="mkt-add-line" id="mktAddLineBtn">+ Add line</button>',

      '        <datalist id="mktSkuDatalist"></datalist>',

      '        <div class="mkt-totals" id="mktTotals"></div>',
      '      </div>',

      '      <div class="mkt-checkbox-row">',
      '        <input type="checkbox" id="mktPostImmediately" style="margin-top:2px;">',
      '        <div>',
      '          <label for="mktPostImmediately" style="font-size:12px; font-weight:600; color:#0f172a;">Post to GL immediately after create</label>',
      '          <div class="mkt-hint">Tick only if the order has already left the warehouse. Recognises revenue on the dispatch date above. For Makro JIT, register the inventory purchase first.</div>',
      '        </div>',
      '      </div>',
      '    </div>',

      '  </div>',

      '  <div class="mkt-error" id="mktCreateOrderError"></div>',
      '</div>',

      '<div class="mkt-modal-footer">',
      '  <div class="mkt-hint" id="mktFooterHint">Submits to POST /api/companies/&lt;cid&gt;/marketplace/orders</div>',
      '  <div>',
      '    <button type="button" class="mkt-btn-secondary" id="mktCancelBtn">Cancel</button>',
      '    <button type="button" class="mkt-btn-primary" id="mktSaveBtn" style="margin-left:8px;">Create order</button>',
      '  </div>',
      '</div>',
    ].join("\n");
  }

  // ─────────────────────────────────────────────────────────── events
  function wireEvents() {
    var closeBtn = $("mktCreateOrderClose");
    var cancelBtn = $("mktCancelBtn");
    var saveBtn = $("mktSaveBtn");
    var addLineBtn = $("mktAddLineBtn");
    var marketplaceSel = $("mktMarketplace");

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    if (saveBtn) saveBtn.addEventListener("click", submitOrder);
    if (addLineBtn) addLineBtn.addEventListener("click", function () {
      state.lines.push(makeEmptyLine());
      renderLines();
    });
    if (marketplaceSel) marketplaceSel.addEventListener("change", updateMarketplaceHint);
  }

  function updateMarketplaceHint() {
    var sel = $("mktMarketplace");
    var hint = $("mktMarketplaceHint");
    if (!sel || !hint) return;
    var code = sel.value;
    var msg = "";
    if (code === "MAKRO") {
      msg = "JIT model: buy inventory against this order. Dr Makro Marketplace Receivable on revenue recognition.";
    } else if (code === "TAKEALOT") {
      msg = "Stock-on-hand model: pick existing inventory. Dr Takealot Marketplace Receivable on revenue recognition.";
    } else {
      msg = "Dr goes to this marketplace's receivable_account_code.";
    }
    hint.textContent = msg;
  }

  // ─────────────────────────────────────────────────────────── open/close
  function openModal() {
    if (!$(MODAL_ID)) buildModal();

    // Reset state
    state.lines = [makeEmptyLine()];
    state.postImmediately = false;
    state.inventoryLoaded = false;

    // Default dates
    $("mktOrderDate").value = todayISO();
    $("mktFulfilmentDate").value = "";
    $("mktExtOrder").value = "";
    $("mktCustomer").value = "";
    $("mktShipping").value = "";
    $("mktNotes").value = "";
    $("mktCurrency").value = "ZAR";
    $("mktPostImmediately").checked = false;
    showError(null);

    updateMarketplaceHint();
    renderLines();

    // Show
    $(BACKDROP_ID).classList.add("is-open");
    $(MODAL_ID).classList.add("is-open");
    state.open = true;

    // Load inventory items in background (Takealot autocomplete)
    loadInventoryItems();
  }

  function closeModal() {
    if (!$(MODAL_ID)) return;
    $(BACKDROP_ID).classList.remove("is-open");
    $(MODAL_ID).classList.remove("is-open");
    state.open = false;
  }

  // ─────────────────────────────────────────────────────────── inventory
  //
  // Backend endpoint (api_server.py:14894):
  //   GET /api/companies/<cid>/inventory/items?q=&active=&limit=&offset=
  //   -> { "rows": [...], "limit": N, "offset": N }
  //
  // The list endpoint returns a SUBSET of fields:
  //   id, sku, name, unit, barcode, sales_price, vat_code,
  //   reorder_level, track_stock, valuation_method,
  //   is_taxable, is_active, updated_at
  //
  // Notably it does NOT return `purchase_cost` (needed for COGS preview)
  // or stock_on_hand. So when the user picks a SKU, we do a follow-up
  // GET to /inventory/items/{id} (which is `SELECT *`) to enrich the
  // cached row with purchase_cost. Stock-on-hand can be fetched from
  // /inventory/on_hand if needed — not done here to keep the modal snappy.

  async function loadInventoryItems() {
    if (state.inventoryLoaded) {
      refreshDatalist();
      return;
    }
    var cid = getCompanyId();
    if (!cid) return;

    // Primary endpoint confirmed in api_server.py
    var primaryUrl = "/api/companies/" + cid + "/inventory/items?limit=500&active=1";

    // Fallbacks in case the route is registered under a different prefix.
    var fallbacks = [
      "/api/companies/" + cid + "/inventory/items?limit=500&is_active=true",
      "/api/companies/" + cid + "/inventory?limit=500",
    ];

    function normalizeList(rows) {
      return (rows || []).map(function (it) {
        return {
          id: it.id,
          sku: it.sku || it.barcode || "",
          barcode: it.barcode || "",
          name: it.name || it.description || "",
          unit: it.unit || "",
          sales_price: parseFloat(it.sales_price || it.selling_price || 0),
          // purchase_cost is NOT in the list response — fetched lazily on SKU match.
          purchase_cost: parseFloat(it.purchase_cost || it.unit_cost || it.cost || 0),
          vat_code: it.vat_code || null,
          is_taxable: it.is_taxable !== false,
          track_stock: it.track_stock !== false,
          valuation_method: it.valuation_method || "FIFO",
          // marker so we know to fetch full row when picked
          _enriched: false,
        };
      });
    }

    try {
      var data = await window.apiFetch(primaryUrl, { method: "GET", credentials: "include" });
      // Accept {rows:[...]} (actual shape), or {items:[...]}, or [...] directly
      var rows = (data && (data.rows || data.items || data.inventory)) || [];
      if (!Array.isArray(rows) && Array.isArray(data)) rows = data;
      if (Array.isArray(rows) && rows.length >= 0) {
        state.inventoryItems = normalizeList(rows);
        state.inventoryLoaded = true;
        refreshDatalist();
        return;
      }
    } catch (err) {
      console.warn("[MKT CREATE] primary inventory endpoint failed:", err);
    }

    // Fallbacks
    for (var i = 0; i < fallbacks.length; i++) {
      try {
        var data2 = await window.apiFetch(fallbacks[i], { method: "GET", credentials: "include" });
        var rows2 = (data2 && (data2.rows || data2.items || data2.inventory)) || [];
        if (!Array.isArray(rows2) && Array.isArray(data2)) rows2 = data2;
        if (Array.isArray(rows2) && rows2.length > 0) {
          state.inventoryItems = normalizeList(rows2);
          state.inventoryLoaded = true;
          refreshDatalist();
          return;
        }
      } catch (err) {
        continue;
      }
    }

    // No endpoint worked — that's OK, modal still works in JIT/manual mode.
    state.inventoryItems = [];
    state.inventoryLoaded = true;
    refreshDatalist();
  }

  // Fetch the full item row (SELECT *) to enrich with purchase_cost.
  // Idempotent: only fetches once per item.
  async function enrichInventoryItem(item) {
    if (!item || item._enriched) return item;
    var cid = getCompanyId();
    if (!cid || !item.id) {
      item._enriched = true;
      return item;
    }
    try {
      var full = await window.apiFetch(
        "/api/companies/" + cid + "/inventory/items/" + item.id,
        { method: "GET", credentials: "include" }
      );
      if (full && typeof full === "object") {
        item.purchase_cost = parseFloat(full.purchase_cost || full.unit_cost || full.cost || 0);
        if (!item.sales_price) item.sales_price = parseFloat(full.sales_price || 0);
        if (!item.unit) item.unit = full.unit || "";
        if (!item.barcode) item.barcode = full.barcode || "";
        if (!item.vat_code) item.vat_code = full.vat_code || null;
        item.is_taxable = full.is_taxable !== false;
        item.track_stock = full.track_stock !== false;
        if (!item.valuation_method) item.valuation_method = full.valuation_method || "FIFO";
      }
    } catch (err) {
      console.warn("[MKT CREATE] could not enrich inventory item", item.id, err);
    }
    item._enriched = true;
    return item;
  }

  function refreshDatalist() {
    var dl = $("mktSkuDatalist");
    if (!dl) return;
    var html = "";
    for (var i = 0; i < state.inventoryItems.length; i++) {
      var it = state.inventoryItems[i];
      var label = (it.sku || "(no sku)") + " — " + (it.name || "");
      html += '<option value="' + escapeAttr(it.sku) + '" data-item-id="' + it.id + '">' + escapeText(label) + '</option>';
    }
    dl.innerHTML = html;
  }

  function findInventoryBySku(sku) {
    if (!sku) return null;
    var clean = sku.trim().toLowerCase();
    for (var i = 0; i < state.inventoryItems.length; i++) {
      if ((state.inventoryItems[i].sku || "").toLowerCase() === clean) {
        return state.inventoryItems[i];
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────── lines render
  function renderLines() {
    var tbody = $("mktLinesBody");
    if (!tbody) return;

    var html = "";
    for (var i = 0; i < state.lines.length; i++) {
      html += renderLineRow(i, state.lines[i]);
    }
    tbody.innerHTML = html;

    // Wire per-line inputs
    for (var j = 0; j < state.lines.length; j++) {
      wireLine(j);
    }

    renderTotals();
    renderPostingPreview();
  }

  function renderLineRow(idx, line) {
    var calc = calcLine(line);
    return [
      '<tr data-line-idx="' + idx + '">',
      '  <td><input type="text" list="mktSkuDatalist" data-field="sku" value="' + escapeAttr(line.sku) + '" placeholder="SKU"></td>',
      '  <td><input type="text" data-field="product_description" value="' + escapeAttr(line.product_description) + '" placeholder="Item description"></td>',
      '  <td><input type="number" min="0" step="0.0001" data-field="quantity" value="' + line.quantity + '"></td>',
      '  <td><input type="number" min="0" step="0.01" data-field="unit_price" value="' + line.unit_price + '" placeholder="VAT incl."></td>',
      '  <td><input type="number" min="0" step="0.01" data-field="unit_cost" value="' + line.unit_cost + '"></td>',
      '  <td><input type="number" min="0" max="1" step="0.0001" data-field="vat_rate" value="' + line.vat_rate + '"></td>',
      '  <td class="mkt-line-gross">' + fmtR(calc.gross) + '<div class="mkt-line-cost">cost: ' + fmtR(calc.total_cost) + '</div></td>',
      '  <td><button type="button" class="mkt-remove-btn" data-action="remove">x</button></td>',
      '</tr>',
    ].join("");
  }

  function wireLine(idx) {
    var tbody = $("mktLinesBody");
    if (!tbody) return;
    var row = tbody.querySelector('tr[data-line-idx="' + idx + '"]');
    if (!row) return;

    var inputs = row.querySelectorAll("input[data-field]");
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener("input", function (ev) {
        var field = ev.target.getAttribute("data-field");
        var val = ev.target.value;
        state.lines[idx][field] = val;
        // SKU special handling — if it matches an inventory item, autofill.
        // The list endpoint doesn't return purchase_cost, so we enrich
        // the item lazily (one GET /inventory/items/{id}) before
        // populating unit_cost so the COGS preview is accurate.
        if (field === "sku") {
          var item = findInventoryBySku(val);
          if (item) {
            state.lines[idx].inventory_item_id = item.id;
            if (!state.lines[idx].product_description) state.lines[idx].product_description = item.name;
            if (!state.lines[idx].unit_price) state.lines[idx].unit_price = item.sales_price || 0;
            // optimistic: use whatever we already know
            state.lines[idx].unit_cost = item.purchase_cost || 0;
            rerenderRow(idx);
            updateLineTotals(idx);
            renderTotals();
            renderPostingPreview();
            // then enrich async (fetch full row to get purchase_cost)
            if (!item._enriched) {
              enrichInventoryItem(item).then(function (enriched) {
                // only overwrite if user hasn't typed something else in the meantime
                if (state.lines[idx].inventory_item_id === enriched.id) {
                  state.lines[idx].unit_cost = enriched.purchase_cost || state.lines[idx].unit_cost || 0;
                  rerenderRow(idx);
                  updateLineTotals(idx);
                  renderTotals();
                  renderPostingPreview();
                }
              });
            }
          } else {
            state.lines[idx].inventory_item_id = null;
          }
        }
        // Quantity / unit_price / unit_cost / discount / vat_rate updates
        if (["quantity", "unit_price", "unit_cost", "discount", "vat_rate"].indexOf(field) >= 0) {
          state.lines[idx][field] = parseFloat(val) || 0;
        }
        updateLineTotals(idx);
        renderTotals();
        renderPostingPreview();
      });
    }

    var removeBtn = row.querySelector('button[data-action="remove"]');
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        if (state.lines.length <= 1) {
          showError("An order must have at least one line.");
          return;
        }
        state.lines.splice(idx, 1);
        renderLines();
      });
    }
  }

  function rerenderRow(idx) {
    var tbody = $("mktLinesBody");
    if (!tbody) return;
    var row = tbody.querySelector('tr[data-line-idx="' + idx + '"]');
    if (!row) return;
    var newHtml = renderLineRow(idx, state.lines[idx]);
    var tmp = document.createElement("tbody");
    tmp.innerHTML = newHtml;
    var newRow = tmp.firstChild;
    row.parentNode.replaceChild(newRow, row);
    wireLine(idx);
  }

  function updateLineTotals(idx) {
    var tbody = $("mktLinesBody");
    if (!tbody) return;
    var row = tbody.querySelector('tr[data-line-idx="' + idx + '"]');
    if (!row) return;
    var calc = calcLine(state.lines[idx]);
    var grossCell = row.querySelector(".mkt-line-gross");
    if (grossCell) {
      grossCell.innerHTML = fmtR(calc.gross) + '<div class="mkt-line-cost">cost: ' + fmtR(calc.total_cost) + '</div>';
    }
  }

  // Mirrors order_service.calculate_line exactly
  function calcLine(line) {
    var qty = qQty(line.quantity || 1);
    if (qty <= 0) qty = 0;
    var unit_price = qMoney(line.unit_price || 0);
    var discount = qMoney(line.discount || 0);
    var vat_rate = qRate(line.vat_rate);
    var unit_cost = qMoney(line.unit_cost || 0);

    var gross = qMoney((qty * unit_price) - discount);
    if (gross < 0) gross = 0;

    var net, vat;
    if (line.is_taxable !== false && vat_rate > 0) {
      var divisor = 1 + vat_rate;
      net = qMoney(gross / divisor);
      vat = qMoney(gross - net);
    } else {
      net = gross;
      vat = 0;
    }

    return {
      gross: gross,
      net: net,
      vat: vat,
      total_cost: qMoney(qty * unit_cost),
    };
  }

  function renderTotals() {
    var el = $("mktTotals");
    if (!el) return;
    var tot = { gross: 0, net: 0, vat: 0, cost: 0 };
    for (var i = 0; i < state.lines.length; i++) {
      var c = calcLine(state.lines[i]);
      tot.gross += c.gross;
      tot.net += c.net;
      tot.vat += c.vat;
      tot.cost += c.total_cost;
    }
    el.innerHTML = [
      '<div class="mkt-totals-row"><span>Net revenue</span><span>' + fmtR(tot.net) + '</span></div>',
      '<div class="mkt-totals-row"><span>Output VAT</span><span>' + fmtR(tot.vat) + '</span></div>',
      '<div class="mkt-totals-row"><span>Gross (VAT-inclusive)</span><span>' + fmtR(tot.gross) + '</span></div>',
      '<div class="mkt-totals-row"><span>Total COGS preview</span><span>' + fmtR(tot.cost) + '</span></div>',
      '<div class="mkt-totals-row total"><span>Expected gross margin</span><span>' + fmtR(tot.net - tot.cost) + '</span></div>',
    ].join("");
  }

  function renderPostingPreview() {
    var el = $("mktPostingPreview");
    if (!el) return;
    var sel = $("mktMarketplace");
    var mpCode = (sel && sel.value) || "MP";

    var tot = { gross: 0, net: 0, vat: 0, cost: 0 };
    for (var i = 0; i < state.lines.length; i++) {
      var c = calcLine(state.lines[i]);
      tot.gross += c.gross;
      tot.net += c.net;
      tot.vat += c.vat;
      tot.cost += c.total_cost;
    }

    var recAcct = "Marketplace Receivable (" + mpCode + ")";
    var fulfilmentDate = $("mktFulfilmentDate").value;
    var when = fulfilmentDate ? "on " + fulfilmentDate : "on fulfilment date";

    el.innerHTML = [
      '<div class="mkt-preview-title">Sales journal — recognised ' + when + ':</div>',
      '<div class="mkt-preview-row"><span>Dr ' + recAcct + '</span><span>' + fmtR(tot.gross) + '</span></div>',
      '<div class="mkt-preview-row"><span>Cr Sales Revenue</span><span>' + fmtR(tot.net) + '</span></div>',
      tot.vat > 0 ? '<div class="mkt-preview-row"><span>Cr Output VAT</span><span>' + fmtR(tot.vat) + '</span></div>' : '',
      tot.cost > 0 ? '<div class="mkt-preview-title" style="margin-top:6px;">COGS journal (on fulfilment):</div>' : '',
      tot.cost > 0 ? '<div class="mkt-preview-row"><span>Dr Cost of Sales</span><span>' + fmtR(tot.cost) + '</span></div>' : '',
      tot.cost > 0 ? '<div class="mkt-preview-row"><span>Cr Inventory (FIFO consume)</span><span>' + fmtR(tot.cost) + '</span></div>' : '',
      '<div class="mkt-preview-row" style="margin-top:6px; color:#92400e;"><span>Remittance clears: Dr Bank / Cr ' + recAcct + '</span><span>' + fmtR(tot.gross) + '</span></div>',
    ].join("");
  }

  // ─────────────────────────────────────────────────────────── submit
  async function submitOrder() {
    showError(null);

    var cid = getCompanyId();
    if (!cid) {
      showError("No active company selected.");
      return;
    }

    var mpCode = $("mktMarketplace").value;
    var extOrderNum = $("mktExtOrder").value.trim();
    var orderDate = $("mktOrderDate").value || todayISO();
    var fulfilmentDate = $("mktFulfilmentDate").value || null;
    var customerName = $("mktCustomer").value.trim();
    var shippingAddress = $("mktShipping").value.trim();
    var currency = $("mktCurrency").value.trim().toUpperCase() || "ZAR";
    var notes = $("mktNotes").value.trim();
    state.postImmediately = $("mktPostImmediately").checked;

    if (!extOrderNum) {
      showError("External order number is required.");
      return;
    }
    if (state.lines.length === 0) {
      showError("At least one order line is required.");
      return;
    }
    for (var i = 0; i < state.lines.length; i++) {
      var ln = state.lines[i];
      var qty = parseFloat(ln.quantity);
      if (!qty || qty <= 0) {
        showError("Line " + (i + 1) + ": quantity must be greater than zero.");
        return;
      }
      var price = parseFloat(ln.unit_price);
      if (isNaN(price) || price < 0) {
        showError("Line " + (i + 1) + ": unit price cannot be negative.");
        return;
      }
    }

    var payload = {
      marketplace_code: mpCode,
      external_order_number: extOrderNum,
      order_date: orderDate,
      fulfilment_date: fulfilmentDate,
      currency: currency,
      order_status: "imported",
      customer_name: customerName || null,
      shipping_address: shippingAddress || null,
      notes: notes || null,
      lines: state.lines.map(function (ln) {
        return {
          inventory_item_id: ln.inventory_item_id || null,
          sku: ln.sku || null,
          product_description: ln.product_description || "Marketplace Item",
          quantity: parseFloat(ln.quantity),
          unit_price: parseFloat(ln.unit_price),
          discount: parseFloat(ln.discount || 0),
          vat_rate: parseFloat(ln.vat_rate),
          unit_cost: parseFloat(ln.unit_cost || 0),
          is_taxable: ln.is_taxable !== false,
        };
      }),
    };

    var saveBtn = $("mktSaveBtn");
    if (saveBtn) saveBtn.disabled = true;

    try {
      if (typeof window.apiFetch !== "function") {
        throw new Error("FinSage API client (window.apiFetch) is unavailable.");
      }

      var url = "/api/companies/" + cid + "/marketplace/orders";
      var resp = await window.apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      var orderId = resp && (resp.order_id || (resp.order && resp.order.id));
      if (!orderId) {
        throw new Error("Server did not return an order_id.");
      }

      // Optional: post to GL immediately
      if (state.postImmediately) {
        try {
          await window.apiFetch(
            "/api/companies/" + cid + "/marketplace/orders/" + orderId + "/post",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
              credentials: "include",
            }
          );
        } catch (postErr) {
          // Order was created; posting failed — let user retry from the table.
          console.warn("[MKT CREATE] post immediately failed:", postErr);
          showError("Order " + orderId + " created, but posting to GL failed: " +
            ((postErr && postErr.message) || postErr) +
            ". You can click Post GL from the orders table.");
          // Still refresh the table
          if (typeof loadMarketplaceOrders === "function") loadMarketplaceOrders();
          return;
        }
      }

      closeModal();
      if (typeof loadMarketplaceOrders === "function") loadMarketplaceOrders();

      // Friendly confirmation
      var msg = state.postImmediately
        ? "Order created and posted to GL (order #" + orderId + ")."
        : "Order created (order #" + orderId + "). Click Post GL when the order is dispatched.";
      if (typeof window !== "undefined" && window.alert) {
        // Avoid alert() if there's a toast system in the host app
        var toasted = false;
        try {
          if (typeof window.showToast === "function") {
            window.showToast(msg, { type: "success" });
            toasted = true;
          }
        } catch (e) {}
        if (!toasted) {
          console.log("[MKT CREATE] " + msg);
        }
      }

    } catch (err) {
      console.error("[MKT CREATE] error:", err);
      showError(((err && err.message) || err || "Failed to create order."));
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function showError(msg) {
    var el = $("mktCreateOrderError");
    if (!el) return;
    if (msg === null || msg === undefined) {
      el.classList.remove("is-visible");
      el.textContent = "";
    } else {
      el.textContent = msg;
      el.classList.add("is-visible");
    }
  }

  // ─────────────────────────────────────────────────────────── escape
  function escapeAttr(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeText(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ─────────────────────────────────────────────────────────── installer
  // Injects a "New Order" button into the Orders tab toolbar
  // next to #mktOrdersRefreshBtn, with a MutationObserver fallback
  // because the screen is lazy-loaded.
  function tryInstallButton() {
    var refreshBtn = $("mktOrdersRefreshBtn");
    if (!refreshBtn) return false;
    if ($("mktNewOrderBtn")) return true; // already installed

    var btn = document.createElement("button");
    btn.id = "mktNewOrderBtn";
    btn.type = "button";
    btn.className = "mkt-new-order-btn";
    btn.textContent = "+ New Order";
    btn.addEventListener("click", openModal);

    refreshBtn.parentNode.insertBefore(btn, refreshBtn.nextSibling);
    return true;
  }

  // Periodically try to install — the Orders tab may be lazily mounted.
  function ensureButtonInstalled() {
    var installed = false;
    function attempt() {
      if (tryInstallButton()) {
        installed = true;
        return;
      }
      // Retry until the screen exists in DOM.
      setTimeout(attempt, 500);
    }
    attempt();
  }

  // Expose openModal for programmatic use / dev console.
  window.openMarketplaceCreateOrderModal = openModal;

  // Boot
  if (document.readyState !== "loading") {
    ensureButtonInstalled();
  } else {
    document.addEventListener("DOMContentLoaded", ensureButtonInstalled);
  }

  // Re-check on screen activation (matches makro_screen.js's pattern).
  if (typeof MutationObserver !== "undefined") {
    var observer = new MutationObserver(function () {
      var screen = document.getElementById("screen-marketplace");
      if (screen && screen.classList.contains("active")) {
        tryInstallButton();
      }
    });
    var host = document.getElementById("screensHost") || document.body;
    if (host) {
      observer.observe(host, {
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    }
  }
})();
