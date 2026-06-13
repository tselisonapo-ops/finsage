import { useState } from "react";
import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";

export function CustomersPage() {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  const [customerForm, setCustomerForm] = useState({
    customer_name: "",
    phone: "",
    email: "",
    customer_type: "retail",
    price_level: "retail",
  });

  async function searchCustomers() {
    try {
      const res = await posApi.listCustomers(query);
      setCustomers(res.customers || []);
      setMessage((res.customers || []).length ? "" : "No customers found.");
    } catch (err) {
      setMessage(err.message || "Failed to search customers.");
    }
  }

  function openCustomerModal() {
    setCustomerForm({
      customer_name: "",
      phone: "",
      email: "",
      customer_type: "retail",
      price_level: "retail",
    });
    setShowCustomerModal(true);
  }

  async function saveCustomer() {
    if (!customerForm.customer_name.trim()) {
      setMessage("Customer name is required.");
      return;
    }

    try {
      await posApi.createCustomer({
        customer_name: customerForm.customer_name.trim(),
        phone: customerForm.phone.trim(),
        email: customerForm.email.trim(),
        customer_type: customerForm.customer_type,
        price_level:
          customerForm.customer_type === "wholesale"
            ? "wholesale"
            : customerForm.price_level || "retail",
      });

      setShowCustomerModal(false);
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
            <button onClick={openCustomerModal}>New Customer</button>
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

      {showCustomerModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h2>New Customer</h2>
              <button onClick={() => setShowCustomerModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <label>Customer Name</label>
              <input
                className="scan-input"
                value={customerForm.customer_name}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    customer_name: e.target.value,
                  })
                }
              />

              <label>Phone Number</label>
              <input
                className="scan-input"
                value={customerForm.phone}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    phone: e.target.value,
                  })
                }
              />

              <label>Email</label>
              <input
                className="scan-input"
                type="email"
                value={customerForm.email}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    email: e.target.value,
                  })
                }
              />

              <label>Customer Type</label>
              <select
                className="scan-input"
                value={customerForm.customer_type}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    customer_type: e.target.value,
                    price_level:
                      e.target.value === "wholesale"
                        ? "wholesale"
                        : customerForm.price_level,
                  })
                }
              >
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
                <option value="account">Account</option>
              </select>

              <label>Price Level</label>
              <select
                className="scan-input"
                value={customerForm.price_level}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    price_level: e.target.value,
                  })
                }
              >
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
              </select>
            </div>

            <div className="modal-footer">
              <button className="soft" onClick={() => setShowCustomerModal(false)}>
                Cancel
              </button>

              <button className="success" onClick={saveCustomer}>
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}