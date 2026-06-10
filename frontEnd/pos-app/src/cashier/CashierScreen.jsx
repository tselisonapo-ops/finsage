import { useEffect, useMemo, useState } from "react";
import { getCompanyContext, getPosMode, companyUsesInventory, getCurrency } from "../config.js";import { money } from "../utils/currency.js";
import { posApi } from "../services/posApi.js";

const fsToken =
  sessionStorage.getItem("fs_user_token") ||
  localStorage.getItem("fs_user_token") ||
  "";

const fsUser = JSON.parse(localStorage.getItem("fs_user") || "{}");
const isFsUser = !!fsToken;

export function CashierPage() {
  const company = getCompanyContext();
  const mode = getPosMode(company);
  const isRestaurantLike = mode === "restaurant" || mode === "club";
  const usesInventory = companyUsesInventory(company);

  const [signedIn, setSignedIn] = useState(false);
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState("");

  const [showSignin, setShowSignin] = useState(false);
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [cashier, setCashier] = useState(null);

useEffect(() => {
  restorePosSession();
}, []);

async function restorePosSession() {
  const token = localStorage.getItem("pos_token");

  if (!token) return;

  try {
    const res = await posApi.posAuthMe();
    setCashier(res.employee);
    setSignedIn(true);
  } catch {
    localStorage.removeItem("pos_token");
    setCashier(null);
    setSignedIn(false);
  }
}

const [menuItems, setMenuItems] = useState([
  {
    id: 1,
    name: "Bunny Chow",
    price: 65,
    image_url: "",
    category: "Meals",
  },
  {
    id: 2,
    name: "Chicken & Chips",
    price: 55,
    image_url: "",
    category: "Meals",
  },
]);

  const posRole = String(
    cashier?.pos_role ||
    cashier?.role ||
    ""
  ).toLowerCase();

  const canSell = ["cashier", "manager", "supervisor"].includes(posRole);

  const canOrder = [
    "waiter",
    "waitress",
    "cashier",
    "manager",
    "supervisor",
  ].includes(posRole);

  const canAccessPos =
    signedIn &&
    ["cashier", "manager", "supervisor", "waiter", "waitress"].includes(posRole);
    
  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, x) => s + Number(x.qty || 0) * Number(x.unit_price || 0), 0);
    const discount = cart.reduce((s, x) => s + Number(x.discount_amount || 0), 0);
    const vat = cart.reduce((s, x) => s + Number(x.vat_amount || 0), 0);
    const gross = cart.reduce((s, x) => s + Number(x.gross_amount || 0), 0);
    return { subtotal, discount, vat, gross };
  }, [cart]);

  async function signIn() {
    if (!employeeCode.trim() || !pin.trim()) {
      setMessage("Employee ID and password/PIN are required.");
      return;
    }

    try {
      const res = await posApi.cashierSignin({
        employee_code: employeeCode.trim(),
        pin: pin.trim(),
      });

      if (res.pos_token) {
        localStorage.setItem("pos_token", res.pos_token);
      }

      const activeCashier =
        res.employee ||
        res.cashier ||
        res.data?.employee ||
        res.data?.cashier ||
        {
          employee_code: employeeCode.trim(),
        };

      setCashier(activeCashier);
      setSignedIn(true);
      setShowSignin(false);
      setEmployeeCode("");
      setPin("");
      setMessage("Cashier signed in.");
    } catch (err) {
      setMessage(err.message || "Cashier sign-in failed.");
    }
  }

  function signOut() {
    localStorage.removeItem("pos_token");

    setSignedIn(false);
    setCashier(null);
    setCart([]);
    setMessage("Cashier signed out.");
  }

  function addMenuItemToCart(item) {
    if (!canOrder && !canSell) {
      setMessage("You do not have permission to add items.");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((x) => x.item_id === item.id);

      if (existing) {
        return prev.map((x) =>
          x.item_id === item.id
            ? {
                ...x,
                qty: Number(x.qty || 0) + 1,
                gross_amount:
                  (Number(x.qty || 0) + 1) * Number(x.unit_price || 0),
              }
            : x
        );
      }

      return [
        ...prev,
        {
          item_id: item.id,
          description: item.name,
          qty: 1,
          unit_price: Number(item.price || 0),
          vat_amount: 0,
          discount_amount: 0,
          gross_amount: Number(item.price || 0),
          image_url: item.image_url,
        },
      ];
    });
  }

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <span className="eyebrow">
            {
              mode === "club"
                ? "Club / Bar POS"
                : mode === "restaurant"
                ? "Restaurant POS"
                : mode === "service"
                ? "Service POS"
                : "Retail POS"
            }
          </span>

          <h1>{company?.name || "FinSage POS"}</h1>

          <p>
            {
              mode === "club"
                ? "Bar tabs, food orders and cashier workspace"
                : mode === "restaurant"
                ? "Order taking and billing workspace"
                : mode === "service"
                ? "Service sales workspace"
                : "Cashier sales workspace"
            }
          </p>
        </div>

        <nav className="header-actions">
          {signedIn ? (
            <button onClick={signOut}>
              Sign Out
              {cashier?.name ? ` (${cashier.name})` : ""}
            </button>
          ) : (
            <button onClick={() => setShowSignin(true)}>
              Cashier Sign In
            </button>
          )}

          {(mode === "restaurant" || mode === "club") && (
            <a href="#/orders">Orders</a>
          )}

          <a href="#/manager">Manager Workspace</a>

          <button onClick={() => (window.location.href = "/dashboard")}>
            Back to FinSage
          </button>
        </nav>
      </header>

      <section className="status-strip">
        <div><span>POS Mode</span><strong>{mode === "restaurant" ? "Restaurant" : "Retail"}</strong></div>
        <div><span>Inventory</span><strong>{usesInventory ? "Enabled" : "Service Only"}</strong></div>
        <div><span>Cashier</span><strong>{signedIn ? cashier?.name || cashier?.employee_code || "Signed In" : "Not Signed In"}</strong></div>
        <div><span>Currency</span><strong>{getCurrency(company)}</strong></div>
      </section>

      {message && <div className="pos-message">{message}</div>}

      {signedIn && !canAccessPos && (
        <div className="pos-message">
          Your role does not have access to this POS screen.
        </div>
      )}

      {canAccessPos && (
        <section className="pos-grid">
          <aside className="left-panel">
            {mode === "restaurant" && (
              <div className="scan-card">
                <label>Order type</label>
                <div className="quick-actions">
                  <button onClick={() => (window.location.hash = "#/orders?type=table")}>Table Order</button>
                  <button onClick={() => (window.location.hash = "#/orders?type=collection")}>Collection</button>
                  <button onClick={() => (window.location.hash = "#/orders?type=delivery")}>Delivery</button>
                  <button>Send to Kitchen</button>
                  <button>Print Bill</button>
                  <button>Close Table</button>
                </div>
              </div>
          )}

          <div className="scan-card">
            <label>{usesInventory ? "Scan barcode or search product" : "Search service item"}</label>
            <div className="scan-row">
              <input
                className="scan-input"
                placeholder={usesInventory ? "Scan barcode, SKU or product name..." : "Search service..."}
                disabled={!signedIn}
              />
              <button className="scan-btn" disabled={!signedIn}>Search</button>
            </div>
          </div>

          <div className="quick-actions">
            {canSell && <button onClick={() => setCart([])}>New Sale</button>}

            {canSell && (
              <button onClick={() => (window.location.hash = "#/quotes")}>
                Quotation
              </button>
            )}

            {canSell && (
              <button onClick={() => (window.location.hash = "#/returns")}>
                Return
              </button>
            )}

            {canSell && <button>Hold Sale</button>}

            <button onClick={() => (window.location.hash = "#/customers")}>
              Customer
            </button>

            {usesInventory && canSell && (
              <button onClick={() => (window.location.hash = "#/price-check")}>
                Price Check
              </button>
            )}
          </div>

          <div className="product-list">
            <div className="section-title">
              <h2>{isRestaurantLike ? "Menu" : "Product Search"}</h2>
              <span>{canOrder || canSell ? "Tap item to add" : "No access"}</span>
            </div>

            {isRestaurantLike ? (
              <div className="menu-grid">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    className="menu-item-card"
                    disabled={!canOrder && !canSell}
                    onClick={() => addMenuItemToCart(item)}
                  >
                    <div className="menu-image">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} />
                      ) : (
                        <span>🍽️</span>
                      )}
                    </div>

                    <div className="menu-info">
                      <strong>{item.name}</strong>
                      <small>{item.category}</small>
                      <b>{money(item.price)}</b>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No item selected</strong>
                <p>Search or scan to add items to the sale.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="cart-panel">
          <div className="cart-header">
            <div>
              <h2>{mode === "restaurant" ? "Current Order" : "Current Sale"}</h2>
              <p>Walk-in customer</p>
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

            {cart.length ? (
              cart.map((line, idx) => (
                <div className="cart-line" key={idx}>
                  <span><strong>{line.description}</strong><small>{line.sku || ""}</small></span>
                  <span>{line.qty}</span>
                  <span>{money(line.unit_price)}</span>
                  <span>{money(line.gross_amount)}</span>
                </div>
              ))
            ) : (
              <div className="cart-empty">No items added yet.</div>
            )}
          </div>

          <div className="summary-card">
            <div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div>
            <div><span>Discount</span><strong>{money(totals.discount)}</strong></div>
            <div><span>VAT</span><strong>{money(totals.vat)}</strong></div>
            <div className="grand-total"><span>Total Due</span><strong>{money(totals.gross)}</strong></div>
          </div>

          <div className="payment-bar">
            <button className="soft">Print Quote/Bill</button>

            {canSell && <button className="warning">Discount</button>}

            {canSell && <button className="primary">Payment</button>}

            {canSell && <button className="success">Complete Sale</button>}

            {!canSell && canOrder && (
              <button className="success">Proceed to Payout</button>
            )}
          </div>
        </section>
      </section>
      )}

      {showSignin && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal">
            <div className="modal-head">
              <h2>Cashier Sign In</h2>
              <button onClick={() => setShowSignin(false)}>×</button>
            </div>

            <div className="modal-body">
              <label>Employee ID</label>
              <input
                className="scan-input"
                placeholder="4 or 5 digit ID"
                value={employeeCode}
                maxLength={5}
                autoFocus
                onChange={(e) => setEmployeeCode(e.target.value.replace(/\D/g, ""))}
              />

              <label>Password / PIN</label>
              <input
                className="scan-input"
                type="password"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") signIn();
                }}
              />
            </div>

            <div className="modal-footer">
              <button className="soft" onClick={() => setShowSignin(false)}>
                Cancel
              </button>
              <button className="success" onClick={signIn}>
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}