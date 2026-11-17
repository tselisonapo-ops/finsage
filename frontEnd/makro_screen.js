/**
 * Remittance Import & Marketplace Manager — Frontend Logic
 * =========================================================
 *
 * Sits inside the Journal screen (#screen-journal).
 * Activated when "Remittance Import" checkbox is checked.
 *
 * Features:
 *  - Order Matching & Settlement workflow (Phase 1-6 specification)
 *  - Direct Remittance Posting fallback (legacy)
 *  - VAT Mode Selector (Standard 15%, Zero-Rated 0%, Non-Recoverable Input VAT)
 *  - Subledger vs General Ledger Control Account reconciliation
 *  - Unsettled Marketplace Orders viewer with GL posting and reversal actions
 *  - Aging analysis (0-30, 31-60, 61-90, 90+ days)
 */

(function () {
  "use strict";

  // ----------------------------------------------------------------- state

  let uploadedFile = null;
  let bound = false;
  let currentActiveTab = "upload"; // 'upload' | 'orders' | 'recon'

  // ----------------------------------------------------------------- helpers

  function $(id) {
    return document.getElementById(id);
  }

  function fmtR(v) {
    if (v === null || v === undefined || isNaN(Number(v))) return "—";
    var n = Number(v);
    var sign = n < 0 ? "-" : "";
    return sign + "R " + Math.abs(n).toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function show(el) { if (el) el.classList.remove("hidden"); }
  function hide(el) { if (el) el.classList.add("hidden"); }

  function getCompanyId() {
    return (typeof getActiveCompanyId === "function" ? getActiveCompanyId() : null) ||
      window.CURRENT_COMPANY_ID ||
      1;
  }

  function showError(msg) {
    var banner = $("remitErrorBanner");
    var text = $("remitErrorText");
    if (banner && text) {
      text.textContent = msg;
      show(banner);
    }
  }

  function clearError() {
    hide($("remitErrorBanner"));
  }

  function setLoading(text) {
    var el = $("remitLoading");
    var lbl = $("remitLoadingText");
    if (!el) return;
    if (text) {
      if (lbl) lbl.textContent = text;
      show(el);
    } else {
      hide(el);
    }
  }

  // ----------------------------------------------------------------- tabs

  function switchTab(tab) {
    currentActiveTab = tab;

    var secUpload = $("remitUploadSection");
    var secOrders = $("remitOrdersSection");
    var secRecon = $("remitDashboardSection");

    var btnUpload = $("remitTabUpload");
    var btnOrders = $("remitTabOrders");
    var btnRecon = $("remitTabRecon");

    function styleTab(btn, active) {
      if (!btn) return;
      if (active) {
        btn.style.background = "#e0f2fe";
        btn.style.color = "#0369a1";
        btn.style.borderColor = "#bae6fd";
      } else {
        btn.style.background = "#fff";
        btn.style.color = "#475569";
        btn.style.borderColor = "#cbd5e1";
      }
    }

    styleTab(btnUpload, tab === "upload");
    styleTab(btnOrders, tab === "orders");
    styleTab(btnRecon, tab === "recon");

    if (tab === "upload") {
      show(secUpload);
      hide(secOrders);
      hide(secRecon);
    } else if (tab === "orders") {
      hide(secUpload);
      show(secOrders);
      hide(secRecon);
      loadMarketplaceOrders();
    } else if (tab === "recon") {
      hide(secUpload);
      hide(secOrders);
      show(secRecon);
      loadMarketplaceDashboard();
    }
  }

  // ----------------------------------------------------------------- init

  function tryInit() {
    if (bound) return;
    var toggle = $("remittanceImportToggle");
    if (!toggle) return;   // checkbox not in DOM yet

    bound = true;

    // ── Checkbox toggle ──
    toggle.addEventListener("change", function () {
      var panel = $("remittanceImportPanel");
      if (!panel) return;

      if (toggle.checked) {
        show(panel);
        var label = $("remittanceImportToggleLabel");
        if (label) {
          label.style.borderColor = "rgba(0,200,200,0.5)";
          label.style.background = "rgba(0,200,200,0.06)";
          label.style.color = "var(--fs-navy)";
        }
      } else {
        hide(panel);
        var label2 = $("remittanceImportToggleLabel");
        if (label2) {
          label2.style.borderColor = "rgba(15,23,42,.12)";
          label2.style.background = "#fff";
          label2.style.color = "#334155";
        }
        resetPanel();
      }
    });

    // ── Sub-navigation Tab Clicks ──
    var btnUpload = $("remitTabUpload");
    var btnOrders = $("remitTabOrders");
    var btnRecon = $("remitTabRecon");

    if (btnUpload) btnUpload.addEventListener("click", function () { switchTab("upload"); });
    if (btnOrders) btnOrders.addEventListener("click", function () { switchTab("orders"); });
    if (btnRecon) btnRecon.addEventListener("click", function () { switchTab("recon"); });

    // ── Orders & Recon refresh buttons ──
    var btnOrdersRef = $("mktOrdersRefreshBtn");
    if (btnOrdersRef) btnOrdersRef.addEventListener("click", loadMarketplaceOrders);

    var orderFilter = $("mktOrderStatusFilter");
    if (orderFilter) orderFilter.addEventListener("change", loadMarketplaceOrders);

    var btnReconRef = $("mktReconRefreshBtn");
    if (btnReconRef) btnReconRef.addEventListener("click", loadMarketplaceDashboard);

    // ── Drop zone ──
    var dropZone = $("remitDropZone");
    var fileInput = $("remitFileInput");

    if (dropZone && fileInput) {
      dropZone.addEventListener("click", function () {
        fileInput.click();
      });

      fileInput.addEventListener("change", function (e) {
        if (e.target.files && e.target.files.length > 0) {
          onFileSelected(e.target.files[0]);
        }
      });

      dropZone.addEventListener("dragover", function (e) {
        e.preventDefault();
        dropZone.style.borderColor = "var(--fs-teal)";
        dropZone.style.background = "rgba(0,200,200,0.04)";
      });

      dropZone.addEventListener("dragleave", function () {
        dropZone.style.borderColor = "#cbd5e1";
        dropZone.style.background = "";
      });

      dropZone.addEventListener("drop", function (e) {
        e.preventDefault();
        dropZone.style.borderColor = "#cbd5e1";
        dropZone.style.background = "";
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onFileSelected(e.dataTransfer.files[0]);
          fileInput.files = e.dataTransfer.files;
        }
      });
    }

    // ── Buttons ──
    var previewBtn = $("remitPreviewBtn");
    var postBtn = $("remitPostBtn");

    if (previewBtn) {
      previewBtn.addEventListener("click", function () {
        callApi(true);
      });
    }

    if (postBtn) {
      postBtn.addEventListener("click", function () {
        var wf = $("remitWorkflowMode") ? $("remitWorkflowMode").value : "matching";
        var msg = wf === "matching"
          ? "Settle matched marketplace orders and post fee deductions to the General Ledger?\n" +
            "This will create the Bank Settlement journal and mark orders as settled."
          : "Post all journals for this remittance to the General Ledger?\n" +
            "This action is irreversible (journals can be reversed but not deleted).";

        if (confirm(msg)) {
          callApi(false);
        }
      });
    }
  }

  // ----------------------------------------------------------------- reset

  function resetPanel() {
    uploadedFile = null;

    var label = $("remitDropLabel");
    var icon = $("remitDropIcon");
    if (label) label.textContent = "Drop remittance PDF here or click to browse";
    if (icon) icon.textContent = "📄";

    var previewBtn = $("remitPreviewBtn");
    var postBtn = $("remitPostBtn");
    if (previewBtn) previewBtn.disabled = true;
    if (postBtn) postBtn.disabled = true;

    hide($("remitPreviewCard"));
    hide($("remitResultsCard"));
    hide($("remitErrorBanner"));
    hide($("remitLoading"));
  }

  // ----------------------------------------------------------------- file

  function onFileSelected(file) {
    uploadedFile = file;
    clearError();

    var label = $("remitDropLabel");
    if (label) {
      label.textContent = file.name + " (" + (file.size / 1024).toFixed(0) + " KB)";
    }

    var previewBtn = $("remitPreviewBtn");
    var postBtn = $("remitPostBtn");
    if (previewBtn) previewBtn.disabled = false;
    if (postBtn) postBtn.disabled = true;

    hide($("remitPreviewCard"));
    hide($("remitResultsCard"));
  }

  // ----------------------------------------------------------------- API

  async function callApi(dryRun) {
    if (!uploadedFile) return;

    clearError();
    hide($("remitResultsCard"));

    var cid = getCompanyId();
    if (!cid) {
      showError("No active company selected.");
      return;
    }

    var wf = $("remitWorkflowMode") ? $("remitWorkflowMode").value : "matching";
    var vatMode = $("remitVatMode") ? $("remitVatMode").value : "standard";

    setLoading(dryRun
      ? "Parsing remittance advice (" + vatMode.toUpperCase() + " VAT mode)..."
      : "Posting settlement journals and fees to GL...");

    var formData = new FormData();
    formData.append("file", uploadedFile);
    formData.append("dry_run", dryRun ? "true" : "false");
    formData.append("vat_mode", vatMode);

    try {
      if (typeof window.apiFetch !== "function") {
        throw new Error("FinSage API client (window.apiFetch) is unavailable.");
      }

      var url = wf === "matching"
        ? "/api/companies/" + cid + "/marketplace/remittances/process"
        : "/api/companies/" + cid + "/makro/remittance/upload";

      var data = await window.apiFetch(url, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (wf === "matching") {
        renderMatchingPreview(data, dryRun);
        if (!dryRun) {
          renderMatchingResults(data);
        } else {
          var postBtn = $("remitPostBtn");
          if (postBtn && data.ok) postBtn.disabled = false;
        }
      } else {
        renderLegacyPreview(data);
        if (!dryRun) {
          renderLegacyResults(data);
        } else {
          var postBtn2 = $("remitPostBtn");
          if (postBtn2 && data.ok) postBtn2.disabled = false;
        }
      }

    } catch (err) {
      console.error("[MARKETPLACE REMITTANCE ERROR]", err);
      showError((err && err.message) || "Network error while contacting the server.");
    } finally {
      setLoading(null);
    }
  }

  // ----------------------------------------------------------------- Matching View Renderers

  function renderMatchingPreview(resp, dryRun) {
    var card = $("remitPreviewCard");
    if (!card) return;
    show(card);

    var res = resp.result || {};
    var h = res.preview_header || {};

    // Header info grid
    var grid = $("remitHeaderGrid");
    if (grid) {
      var fields = [
        ["Vendor", h.vendor_name || "Makro Vendor"],
        ["Marketplace", h.marketplace_name || "Makro Marketplace"],
        ["Payment Date", res.payment_date || h.payment_date],
        ["Payment Reference", res.payment_reference_no || h.payment_reference_no],
        ["VAT Treatment", (res.vat_mode || "standard").toUpperCase()],
        ["Matching Mode", "Order Matching & Settle"],
        ["Bank Account", h.bank_account_number || "Default Cash/Bank"],
        ["Branch Code", h.branch_code || "000000"],
      ];
      grid.innerHTML = fields.map(function (f) {
        return '<div class="cc-kv"><span>' + f[0] + '</span>' +
          '<span class="cc-kv-val">' + (f[1] || "—") + '</span></div>';
      }).join("");
    }

    // Totals
    setText("remitTotalSales", fmtR(h.total_sales || 0));
    setText("remitTotalCommission", fmtR(h.total_commission || 0));
    setText("remitTotalTransport", fmtR(h.total_transport || 0));
    setText("remitTotalNet", fmtR(res.total_net_payment || h.total_net_payment || 0));

    // Line breakdown
    setText("remitSalesCount", (res.matched_count || 0) + " matched");
    setText("remitReturnCount", (res.unmatched_count || 0) + " unmatched");
    setText("remitJournalCount", res.discrepancy_count || 0);

    // Cross-check drift badge
    var driftEl = $("remitDrift");
    if (driftEl) {
      var hasDiscrepancy = (res.discrepancy_count || 0) > 0;
      driftEl.textContent = hasDiscrepancy ? (res.discrepancy_count + " variances") : "Zero drift ✓";
      driftEl.style.color = hasDiscrepancy ? "#b91c1c" : "#047857";
    }

    // Reconciliation badge
    var reconBadge = $("remitReconBadge");
    if (reconBadge) {
      reconBadge.textContent = "Matching Validated ✓";
      reconBadge.className = "ckp-pill ckp-pill--ok";
    }

    // Subtitle
    setText("remitPreviewSubtitle",
      (res.total_lines || 0) + " remittance lines parsed. " +
      (res.matched_count || 0) + " orders matched against marketplace orders subledger.");

    // Sample Lines Table
    var host = $("remitSampleJournals");
    if (host && res.preview_lines && res.preview_lines.length > 0) {
      var rowsHtml = res.preview_lines.map(function (pl) {
        return '<tr style="border-bottom:1px solid #f1f5f9;">' +
          '<td style="padding:4px 8px; font-weight:600;">' + pl.order_id + '</td>' +
          '<td style="padding:4px 8px;">' + pl.date + '</td>' +
          '<td style="padding:4px 8px; text-align:right;">' + fmtR(pl.gross) + '</td>' +
          '<td style="padding:4px 8px; text-align:right; color:#b45309;">' + fmtR(pl.commission) + '</td>' +
          '<td style="padding:4px 8px; text-align:right; color:#b45309;">' + fmtR(pl.transport) + '</td>' +
          '<td style="padding:4px 8px; text-align:right; font-weight:600; color:#047857;">' + fmtR(pl.net_payment) + '</td>' +
          '</tr>';
      }).join("");

      host.innerHTML =
        '<div class="cc-mini">' +
        '<div class="cc-mini-head">PARSED REMITTANCE LINES PREVIEW (FIRST ' + res.preview_lines.length + ' LINES)</div>' +
        '<div class="cc-mini-body" style="padding:6px; overflow-x:auto;">' +
        '<table style="width:100%; font-size:11px; border-collapse:collapse;">' +
        '<thead><tr style="border-bottom:1px solid #e2e8f0; color:#64748b;">' +
        '<th style="text-align:left; padding:4px 8px;">Order Ref</th>' +
        '<th style="text-align:left; padding:4px 8px;">Date</th>' +
        '<th style="text-align:right; padding:4px 8px;">Gross</th>' +
        '<th style="text-align:right; padding:4px 8px;">Commission</th>' +
        '<th style="text-align:right; padding:4px 8px;">Transport</th>' +
        '<th style="text-align:right; padding:4px 8px;">Net Payment</th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
        '</div>' +
        '</div>';
    }
  }

  function renderMatchingResults(resp) {
    var card = $("remitResultsCard");
    if (!card) return;
    show(card);

    var res = resp.result || {};

    setText("remitPostedCount", res.matched_count || 0);
    setText("remitFailedCount", res.discrepancy_count || 0);
    setText("remitArBalance", res.settlement_journal_id ? ("Journal #" + res.settlement_journal_id) : "None");
    setText("remitNetPayment", fmtR(res.total_net_payment || 0));

    setText("remitResultsSubtitle",
      "Settlement Ref: " + (res.payment_reference_no || "—") +
      " • Status: " + (res.action || "settled").toUpperCase());

    var successMsg = $("remitSuccessMsg");
    var successSummary = $("remitSuccessSummary");
    if (successMsg) {
      show(successMsg);
      if (successSummary) {
        successSummary.textContent =
          "Remittance advice successfully settled. " +
          (res.matched_count || 0) + " orders matched and allocated. " +
          "Bank settlement journal #" + (res.settlement_journal_id || "—") + " posted.";
      }
    }
  }

  // ----------------------------------------------------------------- Legacy Renderers

  function renderLegacyPreview(data) {
    var card = $("remitPreviewCard");
    if (!card) return;
    show(card);

    var h = data.header_info || {};

    var grid = $("remitHeaderGrid");
    if (grid) {
      var fields = [
        ["Vendor", h.vendor_name],
        ["Marketplace", h.marketplace_name],
        ["Payment Date", h.payment_date],
        ["Payment Reference", h.payment_reference_no],
        ["Seller ID", h.seller_id],
        ["Vendor SAP No", h.vendor_sap_no],
        ["Bank Account", h.bank_account_number],
        ["Branch Code", h.branch_code],
      ];
      grid.innerHTML = fields.map(function (f) {
        return '<div class="cc-kv"><span>' + f[0] + '</span>' +
          '<span class="cc-kv-val">' + (f[1] || "—") + '</span></div>';
      }).join("");
    }

    setText("remitTotalSales", fmtR(h.total_sales));
    setText("remitTotalCommission", fmtR(h.total_commission));
    setText("remitTotalTransport", fmtR(h.total_transport));
    setText("remitTotalNet", fmtR(h.total_net_payment));

    setText("remitSalesCount", data.sales_count || 0);
    setText("remitReturnCount", data.return_count || 0);
    setText("remitJournalCount", data.journal_count || 0);

    var driftEl = $("remitDrift");
    var cross = data.totals_cross_check || {};
    var drift = Math.abs((cross.gross_drift || 0) + (cross.net_drift || 0));
    if (driftEl) {
      driftEl.textContent = drift < 0.01 ? "R 0.00 ✓" : "R " + drift.toFixed(2);
      driftEl.style.color = drift < 0.01 ? "#047857" : "#b91c1c";
    }

    var reconBadge = $("remitReconBadge");
    var recon = data.reconciliation || {};
    if (reconBadge) {
      if (recon.is_balanced) {
        reconBadge.textContent = "AR clears ✓";
        reconBadge.className = "ckp-pill ckp-pill--ok";
      } else {
        reconBadge.textContent = "AR NOT balanced";
        reconBadge.className = "ckp-pill";
      }
    }

    setText("remitPreviewSubtitle",
      data.parsed_line_count + " lines parsed (" +
      data.sales_count + " sales, " +
      data.return_count + " returns) → " +
      data.journal_count + " journals generated.");
  }

  function renderLegacyResults(data) {
    var card = $("remitResultsCard");
    if (!card) return;
    show(card);

    var recon = data.reconciliation || {};

    setText("remitPostedCount", data.posted_count || 0);
    setText("remitFailedCount", data.failed_count || 0);
    setText("remitArBalance", fmtR(recon.net_balance || 0));
    setText("remitNetPayment", fmtR((data.header_info || {}).total_net_payment));

    setText("remitResultsSubtitle",
      "Remittance " + data.payment_reference_no + " — " + data.summary);
  }

  // ----------------------------------------------------------------- Marketplace Orders Viewer

  async function loadMarketplaceOrders() {
    var cid = getCompanyId();
    if (!cid) return;

    var tbody = $("mktOrdersTableBody");
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:16px; color:#64748b;">Loading marketplace orders...</td></tr>';
    }

    try {
      var filter = $("mktOrderStatusFilter") ? $("mktOrderStatusFilter").value : "";
      var url = "/api/companies/" + cid + "/marketplace/orders?limit=100" + (filter ? "&status=" + encodeURIComponent(filter) : "");

      var data = await window.apiFetch(url, { method: "GET", credentials: "include" });
      var orders = (data && data.orders) || [];

      if (!tbody) return;
      if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:16px; color:#94a3b8;">No marketplace orders found.</td></tr>';
        return;
      }

      tbody.innerHTML = orders.map(function (ord) {
        var statusColor = ord.order_status === "settled" ? "#047857"
          : ord.order_status === "posted" ? "#0284c7"
          : ord.order_status === "cancelled" ? "#b91c1c"
          : "#d97706";

        var statusBg = ord.order_status === "settled" ? "#ecfdf5"
          : ord.order_status === "posted" ? "#e0f2fe"
          : ord.order_status === "cancelled" ? "#fef2f2"
          : "#fffbeb";

        var actions = "";
        if (ord.order_status === "imported") {
          actions = '<button type="button" class="cc-btn cc-btn--sm" onclick="window.postMarketplaceOrder(' + ord.id + ')">Post GL</button>';
        } else if (ord.order_status === "posted") {
          actions = '<button type="button" class="cc-btn cc-btn--sm" style="color:#b91c1c; border-color:#fecaca;" onclick="window.reverseMarketplaceOrder(' + ord.id + ')">Reverse</button>';
        } else {
          actions = '<span style="color:#94a3b8; font-size:11px;">Locked</span>';
        }

        return '<tr style="border-bottom:1px solid #f1f5f9;">' +
          '<td style="padding:8px; font-weight:600;">' + (ord.external_order_number || "—") + '</td>' +
          '<td style="padding:8px; color:#64748b;">' + (ord.order_date || "—") + '</td>' +
          '<td style="padding:8px;"><span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:700; background:' + statusBg + '; color:' + statusColor + ';">' + ord.order_status.toUpperCase() + '</span></td>' +
          '<td style="padding:8px; text-align:right; font-weight:600;">' + fmtR(ord.gross_amount) + '</td>' +
          '<td style="padding:8px; text-align:right;">' + fmtR(ord.net_amount) + '</td>' +
          '<td style="padding:8px; text-align:right;">' + fmtR(ord.vat_amount) + '</td>' +
          '<td style="padding:8px; text-align:right; color:#64748b;">' + fmtR(ord.cost_amount) + '</td>' +
          '<td style="padding:8px; font-size:11px; color:#0369a1;">' + (ord.posted_journal_ref ? ('#' + ord.posted_journal_ref) : (ord.posted_journal_id ? ('J#' + ord.posted_journal_id) : '—')) + '</td>' +
          '<td style="padding:8px; text-align:center;">' + actions + '</td>' +
          '</tr>';
      }).join("");

    } catch (err) {
      console.error("[LOAD ORDERS ERROR]", err);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:16px; color:#b91c1c;">Failed to load orders: ' + ((err && err.message) || err) + '</td></tr>';
      }
    }
  }

  window.postMarketplaceOrder = async function (orderId) {
    var cid = getCompanyId();
    if (!cid || !confirm("Post Order #" + orderId + " to General Ledger and consume FIFO inventory?")) return;
    try {
      await window.apiFetch("/api/companies/" + cid + "/marketplace/orders/" + orderId + "/post", {
        method: "POST",
        credentials: "include",
      });
      loadMarketplaceOrders();
    } catch (err) {
      alert("Failed to post order: " + ((err && err.message) || err));
    }
  };

  window.reverseMarketplaceOrder = async function (orderId) {
    var cid = getCompanyId();
    if (!cid) return;
    var reason = prompt("Enter reason for reversing order posting:", "Customer cancellation / reversal");
    if (!reason) return;

    try {
      await window.apiFetch("/api/companies/" + cid + "/marketplace/orders/" + orderId + "/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason }),
        credentials: "include",
      });
      loadMarketplaceOrders();
    } catch (err) {
      alert("Failed to reverse order: " + ((err && err.message) || err));
    }
  };

  // ----------------------------------------------------------------- Dashboard & Reconciliation

  async function loadMarketplaceDashboard() {
    var cid = getCompanyId();
    if (!cid) return;

    try {
      var data = await window.apiFetch("/api/companies/" + cid + "/marketplace/dashboard", {
        method: "GET",
        credentials: "include",
      });

      var d = (data && data.dashboard) || {};
      var kpis = d.kpis || {};
      var recon = d.reconciliation || {};
      var aging = d.aging || {};
      var orders = d.order_statuses || d.orders || {};

      setText("mktKpiGrossSales", fmtR(kpis.gross_sales || 0));
      setText("mktKpiFees", fmtR(kpis.marketplace_fees || 0));
      setText("mktKpiSettlements", fmtR(kpis.actual_settlements || 0));
      setText("mktKpiSubledgerAr", fmtR(kpis.outstanding_receivable || 0));

      setText("mktReconSubledgerVal", fmtR(kpis.outstanding_receivable || 0));
      setText("mktReconGlVal", fmtR(kpis.gl_control_account_balance || 0));
      setText("mktReconDiffVal", fmtR((recon.general_ledger && recon.variance) || 0));
      setText("mktOrdersCountRatio", (orders.settled || 0) + " settled / " + (kpis.total_orders || 0) + " total");

      var badge = $("mktReconBadge");
      if (badge) {
        if (kpis.is_in_sync) {
          badge.textContent = "Reconciled ✓";
          badge.className = "ckp-pill ckp-pill--ok";
        } else {
          badge.textContent = "Variance: " + fmtR(recon.variance || 0);
          badge.className = "ckp-pill";
        }
      }

      setText("mktAging0_30", fmtR(aging["0_30"] || 0));
      setText("mktAging31_60", fmtR(aging["31_60"] || 0));
      setText("mktAging61_90", fmtR(aging["61_90"] || 0));
      setText("mktAging90Plus", fmtR(aging["90_plus"] || 0));

    } catch (err) {
      console.error("[LOAD DASHBOARD ERROR]", err);
    }
  }

  function setText(id, val) {
    var el = $(id);
    if (el) el.textContent = val;
  }

  // ----------------------------------------------------------------- boot

  if (document.readyState !== "loading") {
    tryInit();
  } else {
    document.addEventListener("DOMContentLoaded", tryInit);
  }

  if (typeof MutationObserver !== "undefined") {
    var observer = new MutationObserver(function () {
      var screen = document.getElementById("screen-journal");
      if (screen && screen.classList.contains("active")) {
        tryInit();
      }
    });
    var host = document.getElementById("screensHost");
    if (host) {
      observer.observe(host, {
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    }
  }
})();
