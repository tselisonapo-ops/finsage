// frontEnd/bank_feeds_ui.js
// FinSage - Live Bank Feeds & Customer Banking Management
(function () {
  "use strict";

  function getCid() {
    return (
      (typeof window.getActiveCompanyId === "function" && window.getActiveCompanyId()) ||
      window.CURRENT_COMPANY_ID ||
      localStorage.getItem("CURRENT_COMPANY_ID") ||
      localStorage.getItem("company_id") ||
      "1"
    );
  }

  function esc(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(amt, curr = "USD") {
    const val = Number(amt || 0);
    return `${curr} ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  let feedsState = [];
  let recentTxns = [];

  async function fetchFeeds() {
    const cid = getCid();
    try {
      const res = await window.apiFetch(`/api/companies/${cid}/bank-feeds`);
      if (res && res.bank_feeds) {
        feedsState = res.bank_feeds;
      }
    } catch (err) {
      console.warn("[BankFeeds] Fetch failed:", err);
    }
  }

  function renderFeedsCards() {
    const host = document.getElementById("bfCardsHost");
    if (!host) return;

    if (!feedsState.length) {
      host.innerHTML = `
        <div class="col-span-full p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300">
          <div class="w-12 h-12 mx-auto rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xl mb-3">🏦</div>
          <h4 class="font-bold text-slate-800 text-base">No Bank Accounts Connected</h4>
          <p class="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Connect your business bank account to stream live bank transactions directly into FinSage and automate reconciliation.
          </p>
          <button type="button" id="bfEmptyConnectBtn" class="px-4 py-2 bg-[var(--fs-navy,#0F2A3D)] text-white rounded-xl text-sm font-semibold hover:opacity-90 shadow-sm">
            ⚡ Connect Bank Account
          </button>
        </div>
      `;
      document.getElementById("bfEmptyConnectBtn")?.addEventListener("click", openConnectModal);
      return;
    }

    host.innerHTML = feedsState
      .map((feed) => {
        const isLive = feed.status === "connected";
        const bal = Number(feed.balance || 0);
        const curr = feed.currency || "USD";
        const lastSync = feed.last_synced_at ? new Date(feed.last_synced_at).toLocaleString() : "Never";

        return `
        <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between gap-4">
          <div>
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex items-center gap-2.5">
                <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-lg font-bold text-slate-700">
                  ${feed.provider === "stitch" ? "🇿🇦" : feed.provider === "plaid" ? "🌐" : "🏦"}
                </div>
                <div>
                  <h4 class="font-extrabold text-slate-900 text-sm leading-tight">${esc(feed.bank_name)}</h4>
                  <span class="text-xs text-slate-500">${esc(feed.account_name)} (${esc(feed.account_number_masked)})</span>
                </div>
              </div>

              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                isLive ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-slate-100 text-slate-600 border border-slate-300"
              }">
                ${isLive ? "● LIVE FEED" : "DISCONNECTED"}
              </span>
            </div>

            <div class="my-3 p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-baseline justify-between">
              <span class="text-xs text-slate-500 font-medium">Available Balance</span>
              <strong class="text-lg font-extrabold text-slate-900">${money(bal, curr)}</strong>
            </div>

            <div class="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Provider: <b class="uppercase text-slate-600">${esc(feed.provider)}</b></span>
              <span>Synced: ${lastSync}</span>
            </div>
          </div>

          <div class="flex items-center gap-2 pt-3 border-t border-slate-100">
            <button type="button" class="bf-sync-single-btn flex-1 py-1.5 px-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5" data-id="${feed.id}">
              🔄 Sync Now
            </button>
            <button type="button" class="bf-recon-btn py-1.5 px-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-all text-center" data-id="${feed.id}">
              🔍 Reconcile
            </button>
            <button type="button" class="bf-disconnect-btn py-1.5 px-2 text-slate-400 hover:text-red-600 rounded-lg text-xs font-medium transition-all" data-id="${feed.id}" title="Disconnect Feed">
              Disconnect
            </button>
          </div>
        </div>
      `;
      })
      .join("");

    // Bind card action buttons
    host.querySelectorAll(".bf-sync-single-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        await syncFeed(id, e.currentTarget);
      });
    });

    host.querySelectorAll(".bf-recon-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.switchScreen?.("bank-recon");
      });
    });

    host.querySelectorAll(".bf-disconnect-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        if (confirm("Disconnect this bank feed? Existing imported transactions will remain preserved.")) {
          await disconnectFeed(id);
        }
      });
    });

    updateSummaryKPIs();
  }

  function updateSummaryKPIs() {
    const countEl = document.getElementById("bfKpiAccountsCount");
    const balEl = document.getElementById("bfKpiTotalBalance");
    const syncEl = document.getElementById("bfKpiLastSync");

    if (countEl) countEl.textContent = String(feedsState.length);

    if (balEl) {
      const total = feedsState.reduce((sum, f) => sum + Number(f.balance || 0), 0);
      balEl.textContent = money(total, feedsState[0]?.currency || "USD");
    }

    if (syncEl) {
      const latest = feedsState
        .map((f) => f.last_synced_at)
        .filter(Boolean)
        .sort()
        .pop();
      syncEl.textContent = latest ? new Date(latest).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
    }
  }

  async function syncFeed(feedId, btnEl) {
    const cid = getCid();
    const origText = btnEl ? btnEl.innerHTML : "";
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = `⏳ Syncing...`;
    }

    try {
      const res = await window.apiFetch(`/api/companies/${cid}/bank-feeds/${feedId}/sync`, {
        method: "POST",
      });

      const count = res?.imported || 0;
      alert(`Sync completed! ${count} new bank transactions imported.`);
      await fetchFeeds();
      renderFeedsCards();
      await fetchRecentTransactions();
    } catch (err) {
      alert("Bank sync error: " + (err?.message || "Failed to sync."));
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = origText;
      }
    }
  }

  async function syncAllFeeds() {
    if (!feedsState.length) {
      alert("No connected bank accounts to sync.");
      return;
    }
    const syncAllBtn = document.getElementById("bfSyncAllBtn");
    if (syncAllBtn) {
      syncAllBtn.disabled = true;
      syncAllBtn.innerHTML = `⏳ Syncing Feeds...`;
    }

    try {
      for (const feed of feedsState) {
        await window.apiFetch(`/api/companies/${getCid()}/bank-feeds/${feed.id}/sync`, {
          method: "POST",
        });
      }
      alert("All bank feeds synced successfully!");
      await fetchFeeds();
      renderFeedsCards();
      await fetchRecentTransactions();
    } catch (err) {
      alert("Sync failed: " + (err?.message || "Error"));
    } finally {
      if (syncAllBtn) {
        syncAllBtn.disabled = false;
        syncAllBtn.innerHTML = `🔄 Sync All Feeds`;
      }
    }
  }

  async function disconnectFeed(feedId) {
    const cid = getCid();
    try {
      await window.apiFetch(`/api/companies/${cid}/bank-feeds/${feedId}/disconnect`, {
        method: "POST",
      });
      await fetchFeeds();
      renderFeedsCards();
    } catch (err) {
      alert("Failed to disconnect: " + (err?.message || "Error"));
    }
  }

  async function fetchRecentTransactions() {
    const cid = getCid();
    const host = document.getElementById("bfRecentTxnsHost");
    if (!host) return;

    try {
      const res = await window.apiFetch(`/api/companies/${cid}/bank_statements`);
      const statements = res?.statements || res?.data || [];
      
      // If we have statements, show summary
      if (!statements.length) {
        host.innerHTML = `
          <tr>
            <td colspan="5" class="py-6 text-center text-slate-400 text-xs">
              No recent bank statement lines found. Click "Sync Feeds Now" to ingest transactions.
            </td>
          </tr>
        `;
        return;
      }

      host.innerHTML = statements.slice(0, 8).map((st) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50/50 text-xs">
          <td class="py-2.5 px-3 font-medium text-slate-900">${esc(st.original_filename || st.source || "Live Feed")}</td>
          <td class="py-2.5 px-3 text-slate-500">${st.created_at ? new Date(st.created_at).toLocaleDateString() : "-"}</td>
          <td class="py-2.5 px-3">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
              ${esc(st.status || "Parsed")}
            </span>
          </td>
          <td class="py-2.5 px-3 text-right font-semibold text-slate-800">${esc(st.total_lines || "—")} lines</td>
          <td class="py-2.5 px-3 text-right">
            <button type="button" class="text-xs font-bold text-emerald-600 hover:text-emerald-800" onclick="window.switchScreen('bank-recon')">
              Reconcile &rarr;
            </button>
          </td>
        </tr>
      `).join("");

    } catch (err) {
      console.warn("Failed to fetch statement lines:", err);
    }
  }

  function openConnectModal() {
    const modal = document.getElementById("bfConnectModal");
    if (modal) modal.classList.remove("hidden");
  }

  function closeConnectModal() {
    const modal = document.getElementById("bfConnectModal");
    if (modal) modal.classList.add("hidden");
  }

  async function submitConnectForm(e) {
    e.preventDefault();
    const cid = getCid();

    const provider = document.querySelector('input[name="bfProvider"]:checked')?.value || "sandbox";
    const bankName = document.getElementById("bfBankNameInput")?.value.trim() || (provider === "stitch" ? "Standard Bank" : "Premier Business Bank");
    const accName = document.getElementById("bfAccNameInput")?.value.trim() || "Main Operating Account";
    const accNo = document.getElementById("bfAccNoInput")?.value.trim() || "8821";
    const balance = document.getElementById("bfBalanceInput")?.value || "10000";
    const currency = document.getElementById("bfCurrencyInput")?.value || "USD";

    try {
      await window.apiFetch(`/api/companies/${cid}/bank-feeds`, {
        method: "POST",
        body: JSON.stringify({
          provider,
          bank_name: bankName,
          account_name: accName,
          account_number: accNo,
          balance: Number(balance),
          currency,
        }),
      });

      alert(`Successfully connected ${bankName}! Initial live feed sync has been completed.`);
      closeConnectModal();
      await fetchFeeds();
      renderFeedsCards();
      await fetchRecentTransactions();
    } catch (err) {
      alert("Failed to connect bank: " + (err?.message || "Error"));
    }
  }

  function bindEvents() {
    document.getElementById("bfConnectBankBtn")?.addEventListener("click", openConnectModal);
    document.getElementById("bfCloseModalBtn")?.addEventListener("click", closeConnectModal);
    document.getElementById("bfCancelModalBtn")?.addEventListener("click", closeConnectModal);
    document.getElementById("bfConnectForm")?.addEventListener("submit", submitConnectForm);
    document.getElementById("bfSyncAllBtn")?.addEventListener("click", syncAllFeeds);

    document.getElementById("bfGotoReconBtn")?.addEventListener("click", () => {
      window.switchScreen?.("bank-recon");
    });
  }

  window.bindBankFeedsScreen = async function () {
    await fetchFeeds();
    renderFeedsCards();
    await fetchRecentTransactions();
    bindEvents();
  };
})();
