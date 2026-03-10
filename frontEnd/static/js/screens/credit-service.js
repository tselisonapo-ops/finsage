(function () {
  "use strict";

  // called by switchScreen("cust-approvals") in dashboard.js
  window.bindCustomerApprovals = function () {
    const container = document.getElementById("custApprovalContainer");
    if (!container) return;

    container.innerHTML = `
      <h2 class="font-bold text-lg mb-2">Customer Credit Approvals</h2>
      <p class="text-sm text-slate-600 mb-4">
        Review pending customers, apply bank & bureau checks, and approve or decline.
      </p>

      <div class="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
        <aside class="border rounded p-3 h-[60vh] overflow-auto">
          <h3 class="font-semibold mb-2 text-sm">Pending Approvals</h3>
          <div id="approvalList" class="space-y-2 text-sm">
            <!-- pending approvals list will go here -->
          </div>
        </aside>

        <section class="border rounded p-3 h-[60vh] overflow-auto">
          <h3 class="font-semibold mb-2 text-sm">Credit Profile</h3>
          <div id="approvalDetails" class="text-sm text-slate-600">
            <p>Select a customer from the list to review their credit profile.</p>
          </div>
        </section>
      </div>
    `;

    loadPendingApprovals();
  };

  function loadPendingApprovals() {
    const list = document.getElementById("approvalList");
    if (!list) return;
    // Temporary stub row so you see something on screen
    list.innerHTML = `
      <div class="border rounded p-2 bg-slate-50">
        <div class="font-semibold text-sm">No backend hooked yet</div>
        <div class="text-xs text-slate-600">
          Once the API is wired, pending customers will appear here for approval.
        </div>
      </div>
    `;
  }
})();
