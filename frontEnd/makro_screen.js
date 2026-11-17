/**
 * Marketplace Manager — Frontend Logic
 * =====================================
 *
 * Drives the dedicated Marketplace screen (#screen-marketplace).
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
    var screen = $("screen-marketplace");
    if (!screen) return; // Screen not yet in DOM

    if (bound) return;
    bound = true;

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

    // Reset preview/results
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

    var workflowMode = $("remitWorkflowMode") ? $("remitWorkflowMode").value : "matching";
    var vatMode = $("remitVatMode") ? $("remitVatMode").value : "standard";

    setLoading(dryRun
      ? "Parsing remittance and calculating reconciliation preview..."
      : "Posting settlements and fee deductions to the General Ledger...");

    var formData = new FormData();
    formData.append("file", uploadedFile);
    formData.append("dry_run", dryRun ? "true" : "false");
    formData.append("vat_mode", vatMode);

    try {
      if (typeof window.apiFetch !== "function") {
        throw new Error("FinSage API client (window.apiFetch) is unavailable.");
      }

      if (workflowMode === "matching") {
        // Phase 5 Matching flow
        var url = "/api/companies/" + cid + "/marketplace/remittances/process";
        var resp = await window.apiFetch(url, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        renderMatchingPreview(resp, dryRun);
        if (!dryRun) {
          renderMatchingResults(resp);
        } else {
          var postBtn = $("remitPostBtn");
          if (postBtn && resp.ok) postBtn.disabled = false;
        }

      } else {
        // Legacy Direct Remittance posting flow
        var legacyUrl = "/api/companies/" + cid + "/makro/remittance/upload";
        var data = await window.apiFetch(legacyUrl, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

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
      showError(
        (err && err.message) ||
        "Network error while contacting the server."
      );
    } finally {
      setLoading(null);
    }
  }

  // ----------------------------------------------------------------- render: matching flow

  function renderMatchingPreview(resp, dryRun) {
    var card = $("remitPreviewCard");
    if (!card) return;
    show(card);

    var sub = $("remitPreviewSubtitle");
    if (sub) {
      sub.textContent = "Remittance Advice " + (resp.remittance_advice_number || "") +
        " (Period " + (resp.period_start || "") + " to " + (resp.period_end || "") + ") — VAT Mode: " +
        (resp.vat_mode || "standard").toUpperCase();
    }

    var rec = resp.reconciliation || {};
    var rem = resp.remittance || {};

    setText("remitTotalSales", fmtR(rem.gross_sales));
    setText("remitTotalReturns", fmtR(rem.gross_returns));
    setText("remitTotalFees", fmtR(rem.total_deductions));
    setText("remitTotalNet", fmtR(rem.net_payment));

    setText("remitSalesCount", String(rem.total_orders || 0));
    setText("remitReturnCount", String(rem.total_credit_notes || 0));
    setText("remitJournalCount", String((resp.settlement_journal_id ? 1 : 0) + (resp.fee_journal_id ? 1 : 0) + (resp.cogs_journal_id ? 1 : 0)));
    setText("remitDrift", fmtR(rec.variance || 0));

    // Summary container
    var container = $("remitSampleJournals");
    if (container) {
      var matchedCount = (resp.matched_orders && resp.matched_orders.length) || 0;
      var unmatchedCount = (resp.unmatched_orders && resp.unmatched_orders.length) || 0;

      var html = '<div class="space-y-2">';
      html += '<div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">';
      html += '<div style="font-weight:700; color:#0f172a; margin-bottom:6px;">Matching & Reconciliation Analysis</div>';
      html += '<div style="display:flex; gap:16px; font-size:12px;">';
      html += '<span>Matched Orders: <strong style="color:#047857;">' + matchedCount + '</strong></span>';
      html += '<span>Unmatched: <strong style="color:#b91c1c;">' + unmatchedCount + '</strong></span>';
      html += '<span>Settlement Variance: <strong>' + fmtR(rec.variance) + '</strong></span>';
      html += '</div>';
      html += '</div>';

      if (resp.settlement_journal_id) {
        html += '<div style="font-size:12px; color:#0369a1; background:#e0f2fe; padding:8px 12px; border-radius:6px;">';
        html += 'Settlement Journal Generated: <strong>#' + (resp.settlement_journal_ref || resp.settlement_journal_id) + '</strong>';
        html += '</div>';
      }
      if (resp.fee_journal_id) {
        html += '<div style="font-size:12px; color:#7c3aed; background:#ede9fe; padding:8px 12px; border-radius:6px;">';
        html += 'Fee Deduction Journal Generated: <strong>#' + (resp.fee_journal_ref || resp.fee_journal_id) + '</strong>';
        html += '</div>';
      }
      html += '</div>';

      container.innerHTML = html;
    }
  }

  function renderMatchingResults(resp) {
    var card = $("remitResultsCard");
    if (!card) return;
    show(card);

    var rec = resp.reconciliation || {};
    var rem = resp.remittance || {};

    setText("remitPostedCount", String((resp.matched_orders && resp.matched_orders.length) || 0) + " orders");
    setText("remitFailedCount", String((resp.unmatched_orders && resp.unmatched_orders.length) || 0) + " unmatched");
    setText("remitArBalance", fmtR(rec.outstanding_receivable || 0));
    setText("remitNetPayment", fmtR(rem.net_payment || 0));

    var successMsg = $("remitSuccessMsg");
    var summary = $("remitSuccessSummary");

    if (successMsg) {
      show(successMsg);
      if (summary) {
        summary.innerHTML =
          "Remittance advice <strong>" + (resp.remittance_advice_number || "") + "</strong> processed successfully.<br>" +
          "Settlement Journal: <strong>" + (resp.settlement_journal_ref || resp.settlement_journal_id || "None") + "</strong> | " +
          "Fee Journal: <strong>" + (resp.fee_journal_ref || resp.fee_journal_id || "None") + "</strong> | " +
          "VAT Mode applied: <strong>" + (resp.vat_mode || "standard").toUpperCase() + "</strong>.";
      }
    }
  }

  // ----------------------------------------------------------------- render: legacy flow

  function renderLegacyPreview(data) {
    var card = $("remitPreviewCard");
    if (!card) return;
    show(card);

    var h = data.header_info || {};

    var sub = $("remitPreviewSubtitle");
    if (sub) {
      sub.textContent =
        "Remittance " + (h.advice_number || "—") +
        " · " + (h.settlement_date || "—") +
        " · Vendor " + (h.vendor_code || "—");
    }

    var s = data.summary || {};
    setText("remitTotalSales", fmtR(s.total_sales));
    setText("remitTotalReturns", fmtR(s.total_returns));
    setText("remitTotalFees", fmtR(s.total_commission));
    setText("remitTotalNet", fmtR(s.total_net));

    var c = data.counts || {};
    setText("remitSalesCount", c.sales_count ?? "—");
    setText("remitReturnCount", c.returns_count ?? "—");
    setText("remitJournalCount", c.journals_count ?? "—");

    var drift = data.drift_analysis || {};
    var dVal = drift.drift;
    var dEl = $("remitDrift");
    if (dEl) {
      dEl.textContent = fmtR(dVal);
      dEl.style.color = (dVal === 0 || dVal === "0.00" || dVal === null) ? "#047857" : "#b91c1c";
    }

    var sampleContainer = $("remitSampleJournals");
    if (sampleContainer) {
      var samples = data.sample_journals || [];
      if (samples.length === 0) {
        sampleContainer.innerHTML =
          '<p class="text-xs text-slate-400">No journals generated.</p>';
      } else {
        var html = '<div class="space-y-2">';
        html += '<p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sample generated journals</p>';
        for (var i = 0; i < samples.length; i++) {
          var j = samples[i];
          var totalDr = 0;
          for (var k = 0; k < (j.lines || []).length; k++) {
            totalDr += Number(j.lines[k].debit) || 0;
          }
          html +=
            '<div class="p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs">' +
              '<div class="flex items-center justify-between font-mono font-semibold text-slate-700">' +
                '<span>' + (j.reference || "—") + '</span>' +
                '<span class="text-teal-700">R ' + totalDr.toFixed(2) + '</span>' +
              '</div>' +
              '<p class="text-slate-500 mt-0.5">' + (j.narration || "—") + '</p>' +
              '<div class="text-slate-400 mt-1">' + (j.lines ? j.lines.length : 0) + ' lines</div>' +
            '</div>';
        }
        html += '</div>';
        sampleContainer.innerHTML = html;
      }
    }
  }

  function renderLegacyResults(data) {
    var card = $("remitResultsCard");
    if (!card) return;
    show(card);

    setText("remitResultsSubtitle", data.advice_number ? ("Advice " + data.advice_number) : "—");
    setText("remitPostedCount", data.posted ?? 0);
    setText("remitFailedCount", data.failed ?? 0);

    var arVal = data.ar_balance;
    var arEl = $("remitArBalance");
    if (arEl) {
      arEl.textContent = fmtR(arVal);
      arEl.style.color = (arVal === 0 || arVal === "0.00") ? "#047857" : "#b91c1c";
    }

    setText("remitNetPayment", fmtR(data.net_payment));

    var successMsg = $("remitSuccessMsg");
    if (data.ok && data.failed === 0) {
      show(successMsg);
      var summary = $("remitSuccessSummary");
      if (summary) {
        summary.textContent =
          "Advice " + (data.advice_number || "") +
          ": " + (data.posted || 0) + " journals posted to GL." +
          " AR control cleared to R " + (arVal || "0.00") + ".";
      }
    } else {
      hide(successMsg);
    }
  }

  // ----------------------------------------------------------------- Marketplace Orders

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
      var screen = document.getElementById("screen-marketplace");
      if (screen && screen.classList.contains("active")) {
        tryInit();
        if (currentActiveTab === "orders") {
          loadMarketplaceOrders();
        } else if (currentActiveTab === "recon") {
          loadMarketplaceDashboard();
        }
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
