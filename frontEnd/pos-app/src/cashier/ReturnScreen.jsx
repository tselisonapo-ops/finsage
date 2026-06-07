import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";

let returnLines = [];

export function renderReturnScreen() {
  setTimeout(bindReturnEvents, 0);

  return `
    <main class="pos-page">
      <header class="pos-header">
        <div>
          <span class="eyebrow">Returns</span>
          <h1>Customer Returns</h1>
          <p>Process refunds and restocking.</p>
        </div>
        <nav class="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/manager">Manager Workspace</a>
        </nav>
      </header>

      <section class="pos-grid">
        <aside class="left-panel">
          <div class="scan-card">
            <label>Return information</label>
            <input id="returnNo" class="scan-input" placeholder="Return number e.g. RET-001" />
            <input id="originalSaleId" class="scan-input" placeholder="Original sale ID optional" />
            <input id="returnReason" class="scan-input" placeholder="Reason" />
          </div>

          <div class="scan-card">
            <label>Add return item manually</label>
            <input id="returnDesc" class="scan-input" placeholder="Description" />
            <input id="returnQty" class="scan-input" placeholder="Qty" />
            <input id="returnPrice" class="scan-input" placeholder="Unit price" />
            <button id="addReturnLineBtn" class="scan-btn">Add Return Line</button>
          </div>
        </aside>

        <section class="cart-panel">
          <div class="cart-header">
            <div>
              <h2>Return Basket</h2>
              <p>${returnLines.length} item(s)</p>
            </div>
            <span class="badge">Draft</span>
          </div>

          <div class="cart-table">
            <div class="cart-head">
              <span>Item</span><span>Qty</span><span>Price</span><span>Refund</span>
            </div>
            <div>${renderReturnLines()}</div>
          </div>

          <div class="payment-bar">
            <button class="primary" id="saveReturnBtn">Save Return</button>
            <button class="soft" id="clearReturnBtn">Clear</button>
          </div>
        </section>
      </section>
    </main>
  `;
}

function bindReturnEvents() {
  document.querySelector("#addReturnLineBtn")?.addEventListener("click", addReturnLine);
  document.querySelector("#saveReturnBtn")?.addEventListener("click", saveReturn);
  document.querySelector("#clearReturnBtn")?.addEventListener("click", () => {
    returnLines = [];
    refresh();
  });
}

function addReturnLine() {
  const description = document.querySelector("#returnDesc")?.value?.trim();
  const qty = Number(document.querySelector("#returnQty")?.value || 1);
  const unit_price = Number(document.querySelector("#returnPrice")?.value || 0);

  if (!description) return alert("Description required.");

  returnLines.push({
    description,
    qty,
    unit_price,
    vat_amount: 0,
    gross_amount: qty * unit_price,
    restock: true,
  });

  refresh();
}

function renderReturnLines() {
  if (!returnLines.length) return `<div class="cart-empty">No return items added.</div>`;

  return returnLines.map(line => `
    <div class="cart-line">
      <span><strong>${line.description}</strong></span>
      <span>${line.qty}</span>
      <span>${money(line.unit_price)}</span>
      <span>${money(line.gross_amount)}</span>
    </div>
  `).join("");
}

async function saveReturn() {
  if (!returnLines.length) return alert("Add return lines first.");

  const return_no = document.querySelector("#returnNo")?.value?.trim() || `RET-${Date.now()}`;
  const reason = document.querySelector("#returnReason")?.value?.trim() || "";
  const original_sale_id = document.querySelector("#originalSaleId")?.value || null;

  const refund_amount = returnLines.reduce((s, x) => s + Number(x.gross_amount || 0), 0);

  const res = await posApi.createReturn({
    return_no,
    reason,
    original_sale_id,
    refund_method: "cash",
    refund_amount,
    lines: returnLines,
  });

  alert(`Return saved: ${res.return_id || res.data?.return_id}`);
  returnLines = [];
  refresh();
}

function refresh() {
  document.querySelector("#app").innerHTML = renderReturnScreen();
}