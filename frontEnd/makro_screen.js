/**
 * Remittance Import Panel — Frontend Logic
 * =========================================
 *
 * Lives INSIDE the Journal screen. A checkbox labelled
 * "Remittance Import" toggles the panel visible/hidden.
 *
 * Include via a <script> tag at the bottom of dashboard.html:
 *
 *     <script src="/static/js/makro_screen.js?v=20261116"></script>
 *
 * The script is self-initialising. It waits for the checkbox
 * element to appear in the DOM, then binds all event listeners.
 * No new screen, no new nav item — everything lives inside
 * #screen-journal.
 */

(function () {
  "use strict";

  // ----------------------------------------------------------------- state

  let uploadedFile = null;
  let bound = false;

  // ----------------------------------------------------------------- helpers

  function $(id) {
    return document.getElementById(id);
  }

  function fmtR(v) {
    if (v === null || v === undefined) return "—";
    var n = Math.abs(Number(v) || 0);
    return "R " + n.toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function show(el) { if (el) el.classList.remove("hidden"); }
  function hide(el) { if (el) el.classList.add("hidden"); }

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
        // Highlight the label when active
        var label = $("remittanceImportToggleLabel");
        if (label) {
          label.style.borderColor = "rgba(0,200,200,0.5)";
          label.style.background = "rgba(0,200,200,0.06)";
          label.style.color = "var(--fs-navy)";
        }
      } else {
        hide(panel);
        // Reset label
        var label2 = $("remittanceImportToggleLabel");
        if (label2) {
          label2.style.borderColor = "rgba(15,23,42,.12)";
          label2.style.background = "#fff";
          label2.style.color = "#334155";
        }
        // Reset state
        resetPanel();
      }
    });

    // ── Drop zone ──
    var dropZone = $("remitDropZone");
    var fileInput = $("remitFileInput");

    if (dropZone && fileInput) {
      // Click to browse
      dropZone.addEventListener("click", function () {
        fileInput.click();
      });

      // File selected via picker
      fileInput.addEventListener("change", function (e) {
        if (e.target.files && e.target.files.length > 0) {
          onFileSelected(e.target.files[0]);
        }
      });

      // Drag & drop
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
        if (confirm(
          "Post all journals for this remittance to the General Ledger?\n" +
          "This action is irreversible (journals can be reversed but not deleted)."
        )) {
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

    var cid =
      (typeof getActiveCompanyId === "function" ? getActiveCompanyId() : null) ||
      window.CURRENT_COMPANY_ID;

    if (!cid) {
      showError("No active company selected.");
      return;
    }

    setLoading(dryRun
      ? "Parsing remittance and generating journals..."
      : "Posting journals to the General Ledger...");

    var formData = new FormData();
    formData.append("file", uploadedFile);
    formData.append("dry_run", dryRun ? "true" : "false");

    try {
      var url = "/api/companies/" + cid + "/makro/remittance/upload";

      if (typeof window.apiFetch !== "function") {
        throw new Error("FinSage API client (window.apiFetch) is unavailable.");
      }

      var data = await window.apiFetch(url, {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      renderPreview(data);

      if (!dryRun) {
        renderResults(data);
      } else {
        var postBtn = $("remitPostBtn");
        if (postBtn && data.ok) postBtn.disabled = false;
      }

    } catch (err) {
      console.error("[MAKRO REMITTANCE ERROR]", err);
      showError(
        (err && err.message) ||
        "Network error while contacting the server."
      );
    } finally {
      setLoading(null);
    }
  }

  // ----------------------------------------------------------------- render

  function renderPreview(data) {
    var card = $("remitPreviewCard");
    if (!card) return;
    show(card);

    var h = data.header_info || {};

    // Header info grid
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

    // Totals
    setText("remitTotalSales", fmtR(h.total_sales));
    setText("remitTotalCommission", fmtR(h.total_commission));
    setText("remitTotalTransport", fmtR(h.total_transport));
    setText("remitTotalNet", fmtR(h.total_net_payment));

    // Line breakdown
    setText("remitSalesCount", data.sales_count || 0);
    setText("remitReturnCount", data.return_count || 0);
    setText("remitJournalCount", data.journal_count || 0);

    // Cross-check drift
    var driftEl = $("remitDrift");
    var cross = data.totals_cross_check || {};
    var drift = Math.abs((cross.gross_drift || 0) + (cross.net_drift || 0));
    if (driftEl) {
      driftEl.textContent = drift < 0.01 ? "R 0.00 ✓" : "R " + drift.toFixed(2);
      driftEl.style.color = drift < 0.01 ? "#047857" : "#b91c1c";
    }

    // Reconciliation badge
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

    // Subtitle
    setText("remitPreviewSubtitle",
      data.parsed_line_count + " lines parsed (" +
      data.sales_count + " sales, " +
      data.return_count + " returns) → " +
      data.journal_count + " journals generated.");

    // Sample journals
    renderSampleJournals(data.posted_journals || []);
  }

  function renderSampleJournals(journals) {
    var host = $("remitSampleJournals");
    if (!host) return;

    var firstSale = journals.find(function (j) {
      return j.reference && j.reference.indexOf("MAKRO-SALE-") !== -1;
    });
    var firstReturn = journals.find(function (j) {
      return j.reference && j.reference.indexOf("MAKRO-RETURN-") !== -1;
    });
    var bankReceipt = journals.find(function (j) {
      return j.reference && j.reference.indexOf("MAKRO-BANK-") !== -1;
    });

    var samples = [
      ["FIRST SALE JOURNAL", firstSale],
      ["FIRST RETURN JOURNAL", firstReturn],
      ["BANK RECEIPT JOURNAL", bankReceipt],
    ].filter(function (s) { return s[1]; });

    host.innerHTML = samples.map(function (s) {
      var title = s[0];
      var j = s[1];
      var lines = (j.entry && j.entry.lines) || [];

      var lineRows = lines.map(function (ln) {
        var dr = ln.debit ? fmtR(ln.debit) : "";
        var cr = ln.credit ? fmtR(ln.credit) : "";
        return '<tr>' +
          '<td style="font-size:11px;padding:2px 8px;">' +
          (ln.account_name || "Account name unavailable") + '</td>' +
          '<td style="text:right;padding:2px 8px;font-variant-numeric:tabular-nums;">' +
          dr + '</td>' +
          '<td style="text:right;padding:2px 8px;font-variant-numeric:tabular-nums;">' +
          cr + '</td>' +
          '<td style="font-size:11px;color:#64748b;padding:2px 8px;">' +
          (ln.description || "") + '</td>' +
          '</tr>';
      }).join("");

      return '<div class="cc-mini">' +
        '<div class="cc-mini-head" style="font-size:10px;">' + title + '</div>' +
        '<div class="cc-mini-body" style="padding:6px;">' +
        '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">' +
        (j.reference || "") + ' — ' + (j.journal_date || "") + '</div>' +
        '<table style="width:100%;font-size:11px;border-collapse:collapse;">' +
        '<thead><tr style="border-bottom:1px solid #e2e8f0;">' +
        '<th style="text:left;padding:2px 8px;">Account</th>' +
        '<th style="text:right;padding:2px 8px;">Debit</th>' +
        '<th style="text:right;padding:2px 8px;">Credit</th>' +
        '<th style="text:left;padding:2px 8px;">Description</th>' +
        '</tr></thead>' +
        '<tbody>' + lineRows + '</tbody>' +
        '</table>' +
        '</div>' +
        '</div>';
    }).join("");
  }

  function renderResults(data) {
    var card = $("remitResultsCard");
    if (!card) return;
    show(card);

    var recon = data.reconciliation || {};

    setText("remitPostedCount", data.posted_count || 0);
    setText("remitFailedCount", data.failed_count || 0);
    setText("remitArBalance", fmtR(recon.net_balance || 0));
    setText("remitNetPayment", fmtR(
      (data.header_info || {}).total_net_payment
    ));

    setText("remitResultsSubtitle",
      "Remittance " + data.payment_reference_no + " — " + data.summary);

    // Failed details
    var failedDetails = $("remitFailedDetails");
    var failedList = $("remitFailedList");
    if (data.failed_count > 0 && failedDetails && failedList) {
      show(failedDetails);
      failedList.innerHTML = (data.failed_journals || []).map(function (j) {
        return '<div class="rounded-lg p-3" style="background:#fef2f2;border:1px solid #fecaca;">' +
          '<div style="font-weight:600;color:#b91c1c;font-size:12px;">' +
          (j.reference || "") + '</div>' +
          '<div style="font-size:11px;color:#991b1b;">' +
          (j.error || "Unknown error") + '</div>' +
          '</div>';
      }).join("");
    } else if (failedDetails) {
      hide(failedDetails);
    }

    // Success message
    var successMsg = $("remitSuccessMsg");
    var successSummary = $("remitSuccessSummary");
    if (data.ok && recon.is_balanced && successMsg) {
      show(successMsg);
      if (successSummary) {
        successSummary.textContent =
          data.posted_count + " journals posted to the General Ledger. " +
          "AR control debits R " + (recon.total_debits || 0).toFixed(2) +
          " = credits R " + (recon.total_credits || 0).toFixed(2) +
          " → net R 0.00.";
      }
    } else {
      hide(successMsg);
    }
  }

  function setText(id, val) {
    var el = $(id);
    if (el) el.textContent = val;
  }

  // ----------------------------------------------------------------- boot

  // Try to init immediately.
  if (document.readyState !== "loading") {
    tryInit();
  } else {
    document.addEventListener("DOMContentLoaded", tryInit);
  }

  // Also re-try when the journal screen becomes active (the checkbox
  // only exists in the DOM when #screen-journal is rendered).
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
