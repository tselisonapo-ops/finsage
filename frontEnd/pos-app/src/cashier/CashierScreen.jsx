
import { useMemo, useState } from "react";
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

      const activeCashier = res.cashier || res.data?.cashier || {
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
    setSignedIn(false);
    setCashier(null);
    setCart([]);
    setMessage("Cashier signed out.");
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
            <button onClick={() => setCart([])}>New Sale</button>
            <button onClick={() => (window.location.hash = "#/quotes")}>Quotation</button>
            <button
              onClick={() => {
                if (
                  cashier?.role !== "manager" &&
                  cashier?.role !== "supervisor"
                ) {
                  setMessage(
                    "Return requests require manager approval."
                  );
                }

                window.location.hash = "#/returns";
              }}
            >
              Return
            </button>
            <button>Hold Sale</button>
            <button onClick={() => (window.location.hash = "#/customers")}>Customer</button>
            {usesInventory && <button onClick={() => (window.location.hash = "#/price-check")}>Price Check</button>}
          </div>

          <div className="product-list">
            <div className="section-title">
              <h2>{usesInventory ? "Product Search" : "Service Search"}</h2>
              <span>Waiting</span>
            </div>
            <div className="empty-state">
              <strong>No item selected</strong>
              <p>Search or scan to add items to the sale.</p>
            </div>
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
            <button className="warning">Discount</button>
            <button className="primary">Payment</button>
            <button className="success">Complete Sale</button>
          </div>
        </section>
      </section>

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