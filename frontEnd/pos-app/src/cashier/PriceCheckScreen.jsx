import { useState } from "react";
import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";

export function PriceCheckPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  async function runPriceCheck() {
    const q = query.trim();
    if (!q) return;

    setMessage("");

    try {
      let found = [];

      try {
        const barcodeRes = await posApi.getItemByBarcode(q);
        const item = barcodeRes.item || barcodeRes.data || barcodeRes;
        if (item?.id) found = [item];
      } catch {
        const res = await posApi.searchItems(q, 20);
        found = res.items || [];
      }

      setItems(found);
      setSelected(found[0] || null);

      if (!found.length) setMessage("No items found.");
    } catch (err) {
      setMessage(err.message || "Failed to check price.");
    }
  }

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <span className="eyebrow">Price Check</span>
          <h1>Product Price Check</h1>
          <p>Check stock, price, VAT and barcode details.</p>
        </div>

        <nav className="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/manager">Manager Workspace</a>
        </nav>
      </header>

      {message && <div className="pos-message">{message}</div>}

      <section className="pos-grid">
        <aside className="left-panel">
          <div className="scan-card">
            <label>Scan or search item</label>
            <div className="scan-row">
              <input
                className="scan-input"
                placeholder="Barcode, SKU or item name..."
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runPriceCheck();
                }}
              />
              <button className="scan-btn" onClick={runPriceCheck}>
                Check
              </button>
            </div>
          </div>

          <div className="product-list">
            {items.length ? (
              items.map((item) => (
                <button
                  className="result-item"
                  key={item.id}
                  onClick={() => setSelected(item)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.sku || item.barcode || ""}</small>
                  </span>
                  <span>{money(item.sales_price || 0)}</span>
                </button>
              ))
            ) : (
              <div className="empty-state">
                <strong>No item selected</strong>
                <p>Scan or search an item.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="cart-panel">
          <div className="cart-header">
            <div>
              <h2>Item Information</h2>
              <p>Price and stock details.</p>
            </div>
            <span className="badge">{selected ? "Selected" : "Waiting"}</span>
          </div>

          {selected ? (
            <div className="summary-card">
              <div><span>Name</span><strong>{selected.name || ""}</strong></div>
              <div><span>SKU</span><strong>{selected.sku || "-"}</strong></div>
              <div><span>Barcode</span><strong>{selected.barcode || "-"}</strong></div>
              <div><span>Selling Price</span><strong>{money(selected.sales_price || 0)}</strong></div>
              <div><span>VAT Code</span><strong>{selected.vat_code || "-"}</strong></div>
              <div><span>Stock On Hand</span><strong>{selected.qty_on_hand ?? 0}</strong></div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No item selected</strong>
              <p>Item details will appear here.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}