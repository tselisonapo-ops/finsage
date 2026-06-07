import { useMemo, useState } from "react";
import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";

export function QuotesPage() {
  const [customerName, setCustomerName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [lines, setLines] = useState([]);
  const [message, setMessage] = useState("");

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, x) => s + Number(x.qty || 0) * Number(x.unit_price || 0), 0);
    const discount = lines.reduce((s, x) => s + Number(x.discount_amount || 0), 0);
    const vat = lines.reduce((s, x) => s + Number(x.vat_amount || 0), 0);
    const gross = lines.reduce((s, x) => s + Number(x.gross_amount || 0), 0);
    return { subtotal, discount, vat, gross };
  }, [lines]);

  async function searchItems() {
    if (!query.trim()) return;

    try {
      const res = await posApi.searchItems(query.trim(), 12);
      setResults(res.items || []);
      setMessage((res.items || []).length ? "" : "No items found.");
    } catch (err) {
      setMessage(err.message || "Failed to search items.");
    }
  }

  function addLine(item) {
    const qty = 1;
    const unit_price = Number(item.sales_price || item.unit_price || 0);
    const vat_amount = 0;
    const gross_amount = qty * unit_price + vat_amount;

    setLines((prev) => [
      ...prev,
      {
        item_type: "inventory",
        item_id: item.id,
        description: item.name || item.description || "Item",
        sku: item.sku || "",
        barcode: item.barcode || "",
        qty,
        unit_price,
        discount_amount: 0,
        vat_amount,
        gross_amount,
      },
    ]);
  }

  function removeLine(index) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveQuote() {
    if (!lines.length) {
      setMessage("Add quote items first.");
      return;
    }

    try {
      const quoteNo = `QPOS-${Date.now()}`;

      const res = await posApi.createQuote({
        quote_no: quoteNo,
        customer_name: customerName.trim() || "Walk-in customer",
        lines,
      });

      setMessage(`Quote saved: ${res.quote_id || res.data?.quote_id}`);
    } catch (err) {
      setMessage(err.message || "Failed to save quote.");
    }
  }

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <span className="eyebrow">Quotation</span>
          <h1>POS Quotation</h1>
          <p>Create quick printable quotations.</p>
        </div>

        <nav className="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/customers">Customers</a>
        </nav>
      </header>

      {message && <div className="pos-message">{message}</div>}

      <section className="pos-grid">
        <aside className="left-panel">
          <div className="scan-card">
            <label>Customer</label>
            <input
              className="scan-input"
              value={customerName}
              placeholder="Walk-in customer / customer name..."
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>

          <div className="scan-card">
            <label>Add item</label>
            <div className="scan-row">
              <input
                className="scan-input"
                value={query}
                placeholder="Barcode, SKU or product..."
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchItems();
                }}
              />
              <button className="scan-btn" onClick={searchItems}>
                Search
              </button>
            </div>
          </div>

          <div className="product-list">
            {results.length ? (
              results.map((item) => (
                <button
                  className="result-item"
                  key={item.id}
                  onClick={() => addLine(item)}
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
                <p>Search items to add to quote.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="cart-panel">
          <div className="cart-header">
            <div>
              <h2>Current Quote</h2>
              <p>Quote total: {money(totals.gross)}</p>
            </div>
            <span className="badge">Draft</span>
          </div>

          <div className="cart-table">
            <div className="cart-head">
              <span>Item</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Total</span>
            </div>

            {lines.length ? (
              lines.map((line, idx) => (
                <div className="cart-line" key={idx}>
                  <span>
                    <strong>{line.description}</strong>
                    <small>{line.sku || ""}</small>
                  </span>
                  <span>{line.qty}</span>
                  <span>{money(line.unit_price)}</span>
                  <span>
                    {money(line.gross_amount)}
                    <button className="line-remove" onClick={() => removeLine(idx)}>×</button>
                  </span>
                </div>
              ))
            ) : (
              <div className="cart-empty">No quote items added.</div>
            )}
          </div>

          <div className="summary-card">
            <div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div>
            <div><span>Discount</span><strong>{money(totals.discount)}</strong></div>
            <div><span>VAT</span><strong>{money(totals.vat)}</strong></div>
            <div className="grand-total"><span>Quote Total</span><strong>{money(totals.gross)}</strong></div>
          </div>

          <div className="payment-bar">
            <button className="soft" onClick={() => setLines([])}>Clear</button>
            <button className="primary" onClick={saveQuote}>Save Quote</button>
            <button className="success" onClick={() => window.print()}>Print</button>
          </div>
        </section>
      </section>
    </main>
  );
}