import { useState } from "react";
import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";

export function CustomersPage() {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  async function searchCustomers() {
    try {
      const res = await posApi.listCustomers(query);
      setCustomers(res.customers || []);
      setMessage((res.customers || []).length ? "" : "No customers found.");
    } catch (err) {
      setMessage(err.message || "Failed to search customers.");
    }
  }

  async function createCustomer() {
    const customer_name = prompt("Customer name:");
    if (!customer_name) return;

    const phone = prompt("Phone number:", "") || "";
    const email = prompt("Email:", "") || "";
    const customer_type =
      prompt("Customer type: retail / wholesale / account", "retail") || "retail";

    try {
      await posApi.createCustomer({
        customer_name,
        phone,
        email,
        customer_type,
        price_level: customer_type === "wholesale" ? "wholesale" : "retail",
      });

      setMessage("Customer created.");
      await searchCustomers();
    } catch (err) {
      setMessage(err.message || "Failed to create customer.");
    }
  }

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <span className="eyebrow">Customers</span>
          <h1>Customer Lookup</h1>
          <p>Retail, wholesale and account customers.</p>
        </div>

        <nav className="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/quotes">Quotes</a>
          <a href="#/manager">Manager Workspace</a>
        </nav>
      </header>

      {message && <div className="pos-message">{message}</div>}

      <section className="pos-grid">
        <aside className="left-panel">
          <div className="scan-card">
            <label>Search customer</label>
            <div className="scan-row">
              <input
                className="scan-input"
                value={query}
                placeholder="Name, phone, email, VAT number..."
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchCustomers();
                }}
              />
              <button className="scan-btn" onClick={searchCustomers}>
                Search
              </button>
            </div>
          </div>

          <div className="quick-actions">
            <button onClick={createCustomer}>New Customer</button>
          </div>

          <div className="product-list">
            {customers.length ? (
              customers.map((c) => (
                <button
                  className="result-item"
                  key={c.id}
                  onClick={() => setSelected(c)}
                >
                  <span>
                    <strong>{c.customer_name}</strong>
                    <small>{c.phone || c.email || c.customer_type || ""}</small>
                  </span>
                  <span>{c.price_level || "retail"}</span>
                </button>
              ))
            ) : (
              <div className="empty-state">
                <strong>No customer selected</strong>
                <p>Search or create a customer profile.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="cart-panel">
          <div className="cart-header">
            <div>
              <h2>Customer Details</h2>
              <p>Selected customer profile.</p>
            </div>
            <span className="badge">{selected ? "Selected" : "Waiting"}</span>
          </div>

          {selected ? (
            <div className="summary-card">
              <div>
                <span>Name</span>
                <strong>{selected.customer_name}</strong>
              </div>
              <div>
                <span>Type</span>
                <strong>{selected.customer_type || "retail"}</strong>
              </div>
              <div>
                <span>Price Level</span>
                <strong>{selected.price_level || "retail"}</strong>
              </div>
              <div>
                <span>Default Discount</span>
                <strong>{Number(selected.default_discount_percent || 0)}%</strong>
              </div>
              <div>
                <span>Credit Allowed</span>
                <strong>{selected.credit_allowed ? "Yes" : "No"}</strong>
              </div>
              <div>
                <span>Credit Limit</span>
                <strong>{money(selected.credit_limit || 0)}</strong>
              </div>
              <div>
                <span>Balance</span>
                <strong>{money(selected.current_balance || 0)}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No customer selected</strong>
              <p>Customer details will appear here.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}