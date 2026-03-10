// static/js/screens/cust-approvals.js
(function () {
  "use strict";

  // Called by switchScreen("cust-approvals") in dashboard.js
  window.bindCustomerApprovals = function () {
    const container = document.getElementById("custApprovalContainer");
    if (!container) return;

    container.innerHTML = `
      <h2 class="font-bold text-lg mb-2">Customer Credit Approvals</h2>
      <p class="text-sm text-slate-600 mb-4">
        Review pending customers, complete KYC, bank & bureau checks, and approve or decline.
      </p>

      <div class="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
        <!-- Left: Pending approvals list -->
        <aside class="card p-3 shadow-sage h-[60vh] overflow-auto">
          <div class="flex items-center gap-2 mb-2">
            <h3 class="font-semibold text-sm">Pending Approvals</h3>
          </div>
          <input
            id="approvalsSearch"
            class="w-full border rounded px-3 py-2 text-sm mb-2"
            placeholder="Search customers"
          >
          <div id="approvalList" class="space-y-2 text-sm">
            <!-- pending approvals list goes here -->
          </div>
        </aside>

        <!-- Right: Credit profile detail -->
        <section class="card p-3 shadow-sage h-[60vh] overflow-auto">
          <h3 class="font-semibold text-sm mb-2">Credit Profile</h3>
          <div id="approvalDetails" class="text-sm text-slate-700">
            <p>Select a customer from the list to review their credit profile.</p>
          </div>
        </section>
      </div>
    `;

    loadPendingApprovals();
  };

  /**
   * Later you'll hook this to /api/credit/pending
   */
  /**
   * Load pending approvals from backend
   * GET /api/credit/pending
   */
  function loadPendingApprovals() {
    const list = document.getElementById("approvalList");
    if (!list) return;

    list.innerHTML = `
      <div class="text-xs text-slate-600">Loading pending approvals...</div>
    `;

    fetch("/api/credit/pending", {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load pending approvals");
        return res.json();
      })
      .then((data) => {
        const items = Array.isArray(data) ? data : (data.items || []);
        renderPendingList(items);
      })
      .catch((err) => {
        console.error(err);
        list.innerHTML = `
          <div class="border rounded p-2 bg-red-50 text-xs text-red-700">
            Could not load pending approvals from server.
          </div>
        `;
      });
  }

    function renderPendingList(items) {
    const list = document.getElementById("approvalList");
    const search = document.getElementById("approvalsSearch");
    if (!list) return;

    if (!items.length) {
      list.innerHTML = `
        <div class="border rounded p-2 bg-slate-50 text-xs text-slate-600">
          No customers waiting for credit approval.
        </div>
      `;
      return;
    }

    // Render all items
    list.innerHTML = items
      .map((p) => {
        const risk = (p.riskBand || "").toLowerCase();
        const badgeClass =
          risk === "high"
            ? "bg-red-100 text-red-700"
            : risk === "medium"
            ? "bg-amber-100 text-amber-700"
            : "bg-emerald-100 text-emerald-700";

        const cur = p.currency || (window.COMPANY_PROFILE && window.COMPANY_PROFILE.currency) || "";
        const limit = (p.requestedLimit != null)
          ? (cur ? cur + " " : "") + Number(p.requestedLimit).toLocaleString()
          : "—";

        return `
          <button
            type="button"
            class="w-full text-left border rounded px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
            data-approval-id="${p.id}"
          >
            <div>
              <div class="font-semibold">${p.customerName || "Customer"}</div>
              <div class="text-xs text-slate-500">
                Requested limit: ${limit}
                • Terms: ${formatTerms(p.requestedTerms)}
              </div>
            </div>
            <span class="pill text-xs ${badgeClass}">
              ${(p.riskBand || "—").toUpperCase()}
            </span>
          </button>
        `;
      })
      .join("");

    // Click handler (event delegation)
    list.onclick = function (e) {
      const btn = e.target.closest("button[data-approval-id]");
      if (!btn) return;
      const id = btn.getAttribute("data-approval-id");
      if (!id) return;
      fetchAndShowProfile(id);
    };

    // Simple search (client-side filter)
    if (search && !search.dataset.bound) {
      search.dataset.bound = "1";
      search.addEventListener("input", function () {
        const q = search.value.toLowerCase();
        const buttons = list.querySelectorAll("button[data-approval-id]");
        buttons.forEach((b) => {
          const text = b.textContent.toLowerCase();
          b.style.display = text.includes(q) ? "" : "none";
        });
      });
    }
  }

    function fetchAndShowProfile(profileId) {
    const details = document.getElementById("approvalDetails");
    if (details) {
      details.innerHTML = `
        <p class="text-xs text-slate-600">Loading credit profile...</p>
      `;
    }

    fetch("/api/credit/profile/" + encodeURIComponent(profileId), {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load credit profile");
        return res.json();
      })
      .then((profile) => {
        // uses the big renderer we already wrote
        window.showApprovalDetails(profile);
      })
      .catch((err) => {
        console.error(err);
        if (details) {
          details.innerHTML = `
            <div class="border rounded p-2 bg-red-50 text-xs text-red-700">
              Could not load credit profile from server.
            </div>
          `;
        }
      });
  }

  /**
   * Reusable renderer for a full CustomerCreditProfile object.
   * Call this from anywhere once you have real data:
   *
   *   showApprovalDetails(profileFromBackend);
   */
  window.showApprovalDetails = function (profile) {
    const details = document.getElementById("approvalDetails");
    if (!details) return;
    if (!profile) {
      details.innerHTML = `<p class="text-sm text-slate-600">No profile selected.</p>`;
      return;
    }

    const cur = getProfileCurrency(profile);

    details.innerHTML = `
      <!-- Header -->
      <div class="flex items-start justify-between mb-3">
        <div>
          <h3 class="font-semibold text-base">${profile.customerName || "Customer"}</h3>
          <div class="text-xs text-slate-500">
            Credit Profile ID: ${profile.id || "—"}
            • Created: ${formatDate(profile.createdAt)}
          </div>
        </div>
        <div class="text-right text-xs space-y-1">
          <div>Status: <span class="pill">${profile.status || "pending"}</span></div>
          <div>Requested Limit:
            <span class="font-semibold">
              ${amount(profile.requestedLimit, cur)}
            </span>
          </div>
          <div>Requested Terms: ${formatTerms(profile.requestedTerms)}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <!-- Left column: KYC, Bank, Bureau -->
        <div class="space-y-3">
          <!-- Application & KYC -->
          <section class="border rounded p-3">
            <h4 class="font-semibold text-sm mb-2">1. Application & KYC</h4>
            <div class="text-xs space-y-1">
              <div>Application form received:
                <strong>${boolYesNo(profile.application?.applicationFormReceived)}</strong>
              </div>
              <div>KYC complete:
                <strong>${boolYesNo(profile.application?.kycComplete)}</strong>
              </div>
              <div>Company Reg No: ${profile.application?.companyRegNumber || "—"}</div>
              <div>Tax No: ${profile.application?.taxNumber || "—"}</div>
              <div>VAT No: ${profile.application?.vatNumber || "—"}</div>
              <div>POPIA consent:
                <strong>${boolYesNo(profile.application?.hasPOPIAConsent)}</strong>
              </div>
              <div>Bureau consent:
                <strong>${boolYesNo(profile.application?.hasBureauConsent)}</strong>
              </div>
              <div>Personal guarantee required:
                <strong>${boolYesNo(profile.application?.personalGuaranteeRequired)}</strong>
              </div>
              <div>Personal guarantee received:
                <strong>${boolYesNo(profile.application?.personalGuaranteeReceived)}</strong>
              </div>
              <div class="mt-1">
                Notes: <span class="text-slate-600">
                  ${profile.application?.notes || "—"}
                </span>
              </div>
            </div>
          </section>

          <!-- Bank check -->
          <section class="border rounded p-3">
            <h4 class="font-semibold text-sm mb-2">2. Bank Check</h4>
            <div class="text-xs space-y-1">
              <div>Bank: ${profile.bankCheck?.bankName || "—"}</div>
              <div>Account: ${profile.bankCheck?.accountNumberMasked || "—"}</div>
              <div>Account verified:
                <strong>${boolYesNo(profile.bankCheck?.accountVerified)}</strong>
              </div>
              <div>Account name matches:
                <strong>${boolYesNo(profile.bankCheck?.accountNameMatches)}</strong>
              </div>
              <div>Bank code obtained:
                <strong>${boolYesNo(profile.bankCheck?.bankCodeObtained)}</strong>
              </div>
              <div>Bank code result:
                <strong>${profile.bankCheck?.bankCodeResult || "—"}</strong>
              </div>
              <div>Months analysed: ${profile.bankCheck?.monthsAnalyzed ?? "—"}</div>
              <div>Returned items (6m): ${profile.bankCheck?.returnedItemsLast6m ?? "—"}</div>
              <div>Persistent overdraft:
                <strong>${boolYesNo(profile.bankCheck?.persistentOverdraft)}</strong>
              </div>
              <div>Avg month-end balance:
                ${amount(profile.bankCheck?.avgMonthEndBalance, cur)}
              </div>
              <div class="mt-1">
                Comments: <span class="text-slate-600">
                  ${profile.bankCheck?.comments || "—"}
                </span>
              </div>
            </div>
          </section>

          <!-- Bureau check -->
          <section class="border rounded p-3">
            <h4 class="font-semibold text-sm mb-2">3. Credit Bureau Check</h4>
            <div class="text-xs space-y-1">
              <div>Provider: ${profile.bureauCheck?.provider || "—"}</div>
              <div>Reference ID: ${profile.bureauCheck?.referenceId || "—"}</div>
              <div>Score: ${profile.bureauCheck?.score ?? "—"}
                ${profile.bureauCheck?.riskGrade
                  ? "(Grade " + profile.bureauCheck.riskGrade + ")"
                  : ""
                }
              </div>
              <div>Enquiry date: ${formatDate(profile.bureauCheck?.enquiryDate)}</div>
              <div>Judgments:
                <strong>${boolYesNo(profile.bureauCheck?.hasJudgments)}</strong>
              </div>
              <div>Defaults:
                <strong>${boolYesNo(profile.bureauCheck?.hasDefaults)}</strong>
              </div>
              <div>Liquidation / BR:
                <strong>${boolYesNo(profile.bureauCheck?.hasLiquidationOrBR)}</strong>
              </div>
              <div>Recent enquiries:
                ${profile.bureauCheck?.recentEnquiriesCount ?? "—"}
              </div>
              <div>External exposure approx:
                ${amount(profile.bureauCheck?.externalExposureApprox, cur)}
              </div>
              <div class="mt-1">
                Comments: <span class="text-slate-600">
                  ${profile.bureauCheck?.overallComment || "—"}
                </span>
              </div>
            </div>
          </section>
        </div>

        <!-- Right column: Trade refs, Financials, Internal, Decision -->
        <div class="space-y-3">
          <!-- Trade references -->
          <section class="border rounded p-3">
            <h4 class="font-semibold text-sm mb-2">4. Trade References</h4>
            <div class="text-xs space-y-1">
              <div>Required:
                <strong>${boolYesNo(profile.tradeReferences?.required)}</strong>
              </div>
              <div>References collected:
                ${profile.tradeReferences?.referencesCollected ?? 0}
              </div>
              <div>Average days to pay elsewhere:
                ${profile.tradeReferences?.avgDaysToPayElsewhere ?? "—"}
              </div>
              <div>Negative feedback:
                <strong>${boolYesNo(profile.tradeReferences?.anyNegativeFeedback)}</strong>
              </div>
              <div class="mt-1">
                Comments: <span class="text-slate-600">
                  ${profile.tradeReferences?.comments || "—"}
                </span>
              </div>
            </div>
          </section>

          <!-- Financials -->
          <section class="border rounded p-3">
            <h4 class="font-semibold text-sm mb-2">5. Financials (larger limits)</h4>
            <div class="text-xs space-y-1">
              <div>Financials required:
                <strong>${boolYesNo(profile.financials?.financialsRequired)}</strong>
              </div>
              <div>Year end: ${profile.financials?.yearEnd || "—"}</div>
              <div>Annual turnover:
                ${amount(profile.financials?.annualTurnover, cur)}
              </div>
              <div>Net profit:
                ${amount(profile.financials?.netProfit, cur)}
              </div>
              <div>Current ratio: ${profile.financials?.currentRatio ?? "—"}</div>
              <div>Debt-to-equity: ${profile.financials?.debtToEquity ?? "—"}</div>
              <div>Trend: ${profile.financials?.trend || "unknown"}</div>
              <div class="mt-1">
                Comments: <span class="text-slate-600">
                  ${profile.financials?.comments || "—"}
                </span>
              </div>
            </div>
          </section>

          <!-- Internal behaviour & decision -->
          <section class="border rounded p-3">
            <h4 class="font-semibold text-sm mb-2">6. Internal Behaviour & Decision</h4>
            <div class="text-xs space-y-1 mb-2">
              <div>Existing customer:
                <strong>${boolYesNo(profile.internalHistory?.isExistingCustomer)}</strong>
              </div>
              <div>Internal avg days to pay:
                ${profile.internalHistory?.internalDaysToPayAvg ?? "—"}
              </div>
              <div>Invoices last 12 months:
                ${profile.internalHistory?.invoicesLast12m ?? "—"}
              </div>
              <div>Broken promises (12m):
                ${profile.internalHistory?.brokenPromisesLast12m ?? "—"}
              </div>
              <div>Dispute flag:
                ${profile.internalHistory?.disputeFlag || "none"}
              </div>
              <div>Write-offs:
                ${amount(profile.internalHistory?.writeOffsPast, cur)}
              </div>
              <div class="mt-1">
                Internal comments: <span class="text-slate-600">
                  ${profile.internalHistory?.comments || "—"}
                </span>
              </div>
            </div>

            <div class="border-t pt-2 mt-2 text-xs space-y-2">
              <div class="font-semibold">Decision (Senior / CFO)</div>
              <div>Senior recommendation:
                <span>${profile.decision?.seniorRecommendation || "—"}</span>
              </div>
              <div>Senior comment:
                <span>${profile.decision?.seniorComment || "—"}</span>
              </div>
              <div>CFO decision:
                <span>${profile.decision?.cfoDecision || "—"}</span>
              </div>
              <div>CFO comment:
                <span>${profile.decision?.cfoComment || "—"}</span>
              </div>
              <div class="mt-1">
                Conditions:
                <span class="text-slate-600">
                  ${renderConditions(profile.decision?.conditions, cur)}
                </span>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap gap-2">
              <button class="btn text-xs">Save Draft</button>
              <button class="btn text-xs">Recommend (Senior)</button>
              <button class="btn-highlight text-xs">Approve (CFO)</button>
              <button class="btn text-xs">COD Only</button>
              <button class="btn text-xs bg-red-50 text-red-700 border-red-200">Decline</button>
            </div>
          </section>
        </div>
      </div>
    `;
  };

  // ===== Helper functions (reused, no dummy data) =====

  // Decide which currency to use:
  // 1) profile.currency (if backend sends it)
  // 2) COMPANY_PROFILE.currency (from your existing frontend)
  // 3) nothing (just show the number)
  function getProfileCurrency(profile) {
    if (profile && profile.currency) return profile.currency;
    if (window.COMPANY_PROFILE && window.COMPANY_PROFILE.currency) {
      return window.COMPANY_PROFILE.currency;
    }
    return ""; // no prefix
  }

  function boolYesNo(v) {
    return v ? "Yes" : "No";
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  }

  function amount(value, currency) {
    if (value == null || isNaN(value)) return "—";
    const prefix = currency ? currency + " " : "";
    return prefix + Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function formatTerms(t) {
    if (!t) return "—";
    const map = {
      cod: "Cash on Delivery",
      "7_days": "7 days",
      "15_days": "15 days",
      "30_days": "30 days",
      "45_days": "45 days",
      "60_days": "60 days",
    };
    return map[t] || t;
  }

  function renderConditions(c, cur) {
    if (!c) return "None";
    const parts = [];
    if (c.requireDeposit) {
      parts.push(`Deposit ${c.depositPercent || 0}%`);
    }
    if (c.requireGuarantee) {
      parts.push("Personal guarantee required");
    }
    if (c.maxSingleOrderAmount != null) {
      parts.push("Max order " + amount(c.maxSingleOrderAmount, cur));
    }
    if (c.reviewDate) {
      parts.push("Review on " + formatDate(c.reviewDate));
    }
    return parts.length ? parts.join(" • ") : "None";
  }
})();
