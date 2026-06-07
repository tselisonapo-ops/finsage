import { useState } from "react";

export function OrderScreen() {
  const [orderType, setOrderType] = useState("table");

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <span className="eyebrow">Restaurant Orders</span>
          <h1>Order Taking</h1>
          <p>Waiters, waitresses and cashiers can create orders.</p>
        </div>

        <nav className="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/manager">Manager</a>
        </nav>
      </header>

      <section className="pos-grid">
        <aside className="left-panel">
          <h3>Order Type</h3>

          <div className="quick-actions">
            <button onClick={() => setOrderType("table")}>
              Table
            </button>

            <button onClick={() => setOrderType("collection")}>
              Collection
            </button>

            <button onClick={() => setOrderType("delivery")}>
              Delivery
            </button>
          </div>

          {orderType === "table" && (
            <input
              className="scan-input"
              placeholder="Table Number"
            />
          )}

          {orderType === "delivery" && (
            <>
              <input
                className="scan-input"
                placeholder="Customer Name"
              />

              <input
                className="scan-input"
                placeholder="Delivery Address"
              />

              <input
                className="scan-input"
                placeholder="Driver (optional)"
              />
            </>
          )}
        </aside>

        <section className="cart-panel">
          <h2>Current Order</h2>

          <div className="cart-table">
            No items added.
          </div>

          <div className="payment-bar">
            <button className="primary">
              Send To Kitchen
            </button>

            <button className="success">
              Save Order
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}