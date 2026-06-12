import { useEffect, useMemo, useState } from "react";
import { money } from "../utils/currency.js";
import { posApi } from "../services/posApi.js";

export function OrderScreen({ embedded = false, canSell = false, canOrder = false }) {
  const [orderType, setOrderType] = useState("table");
  const [orderStatus, setOrderStatus] = useState("pending");
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [driverName, setDriverName] = useState("");
  const [cart, setCart] = useState([]);

  const [menuItems, setMenuItems] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(false);

  const total = useMemo(
    () => cart.reduce((sum, x) => sum + Number(x.qty || 0) * Number(x.price || 0), 0),
    [cart]
  );

  useEffect(() => {
    loadMenuItems();
  }, []);

  async function loadMenuItems() {
    try {
      setLoadingMenu(true);

      const res = await posApi.searchItems("", 100);
      const items = res.items || res.data || res || [];

      setMenuItems(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to load menu items.");
    } finally {
      setLoadingMenu(false);
    }
  }

  function addItem(item) {
    setCart((prev) => {
      const existing = prev.find((x) => x.id === item.id);

      if (existing) {
        return prev.map((x) =>
          x.id === item.id ? { ...x, qty: Number(x.qty || 0) + 1 } : x
        );
      }

      return [...prev, { ...item, qty: 1 }];
    });
  }

  function removeItem(id) {
    setCart((prev) => prev.filter((x) => x.id !== id));
  }

  function sendToKitchen() {
    if (!cart.length) {
      alert("Add items before sending order to kitchen.");
      return;
    }

    if (orderType === "table" && !tableNumber.trim()) {
      alert("Enter table number.");
      return;
    }

    setOrderStatus("started");
    alert("Order sent to kitchen.");
  }

  function saveOrder() {
    if (!cart.length) {
      alert("Add items before saving order.");
      return;
    }

    alert("Order saved.");
  }

  return (
    <main className={embedded ? "embedded-order-screen" : "pos-page"}>
      {!embedded && (
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
      )}

      <section className="order-status-filter">
        {["pending", "started", "completed", "paid", "unpaid", "returned", "delivered"].map((s) => (
          <button
            key={s}
            className={orderStatus === s ? "active-filter" : ""}
            onClick={() => setOrderStatus(s)}
          >
            {s}
          </button>
        ))}
      </section>

      <section className="pos-grid">
        <aside className="left-panel">
          <h3>Order Type</h3>

          <div className="quick-actions">
            <button onClick={() => setOrderType("table")}>Table</button>
            <button onClick={() => setOrderType("collection")}>Collection</button>
            <button onClick={() => setOrderType("delivery")}>Delivery</button>
          </div>

          {orderType === "table" && (
            <input
              className="scan-input"
              placeholder="Table Number"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
            />
          )}

          {orderType === "collection" && (
            <input
              className="scan-input"
              placeholder="Customer Name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          )}

          {orderType === "delivery" && (
            <>
              <input
                className="scan-input"
                placeholder="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />

              <input
                className="scan-input"
                placeholder="Delivery Address"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />

              <input
                className="scan-input"
                placeholder="Driver (optional)"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
            </>
          )}

          <div className="order-summary-box">
            <span>Order Status</span>
            <strong>{orderStatus}</strong>
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
        </aside>

        <section className="cart-panel">
          <div className="cart-header">
            <div>
              <h2>Current Order</h2>
              <p>{orderType === "table" ? `Table ${tableNumber || "..."}` : orderType}</p>
            </div>
          </div>

          <div className="order-menu-grid">
            {loadingMenu ? (
              <div className="cart-empty">Loading menu...</div>
            ) : menuItems.length ? (
              menuItems.map((item) => (
                <button
                  key={item.id}
                  className="order-menu-card"
                  onClick={() =>
                    addItem({
                      id: item.id,
                      name: item.name || item.item_name || item.description,
                      price:
                        item.selling_price ||
                        item.sales_price ||
                        item.unit_price ||
                        item.price ||
                        0,
                      category: item.category || item.sku || "",
                      image_url: item.image_url || "",
                    })
                  }
                >
                  <div className="order-menu-image">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} />
                    ) : (
                      <span>🍽️</span>
                    )}
                  </div>

                  <div className="order-menu-info">
                    <strong>
                      {item.name || item.item_name || item.description}
                    </strong>

                    <small>
                      {item.category || item.sku || ""}
                    </small>

                    <b>
                      {money(
                        item.selling_price ||
                        item.sales_price ||
                        item.unit_price ||
                        item.price ||
                        0
                      )}
                    </b>
                  </div>
                </button>
              ))
            ) : (
              <div className="cart-empty">No menu items found.</div>
            )}
          </div>

          <div className="cart-table order-cart-table">
            <div className="cart-head">
              <span>Item</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Total</span>
            </div>

            {cart.length ? (
              cart.map((line) => (
                <div className="cart-line" key={line.id}>
                  <span>
                    <strong>{line.name}</strong>
                    <button className="line-remove" onClick={() => removeItem(line.id)}>
                      Remove
                    </button>
                  </span>
                  <span>{line.qty}</span>
                  <span>{money(line.price)}</span>
                  <span>{money(line.qty * line.price)}</span>
                </div>
              ))
            ) : (
              <div className="cart-empty">Tap menu items to add them to the order.</div>
            )}
          </div>

          <div className="summary-card">
            <div className="grand-total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
          </div>

          <div className="payment-bar">
            <button className="primary" onClick={sendToKitchen}>
              Send To Kitchen
            </button>

            <button className="success" onClick={saveOrder}>
              Save Order
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}