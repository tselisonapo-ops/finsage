import { useEffect, useMemo, useState } from "react";
import { getCompanyContext, getPosMode, companyUsesInventory, getCurrency } from "../config.js";import { money } from "../utils/currency.js";
import { posApi } from "../services/posApi.js";
import { OrderScreen } from "./OrderScreen.jsx";

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
  const [terminals, setTerminals] = useState([]);
  const [activeTerminal, setActiveTerminal] = useState(null);

  const [shifts, setShifts] = useState([]);
  const [activeShift, setActiveShift] = useState(null);
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState("");

  const [showSignin, setShowSignin] = useState(false);
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [cashier, setCashier] = useState(null);
  const [activePanel, setActivePanel] = useState("sale");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [amountTendered, setAmountTendered] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState([]);
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

      if (res.company) {
        localStorage.setItem("active_company", JSON.stringify(res.company));
        localStorage.setItem("active_company_id", String(res.company.id));
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
      const termRes = await posApi.listTerminals();
      console.log("TERMINALS RESPONSE", termRes);
      const terminals = termRes.terminals || [];

      setTerminals(terminals);

      if (terminals.length) {
        setActiveTerminal(terminals[0]);
      }
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

  async function searchProducts() {
    const q = searchText.trim();

    if (!q) {
      setMessage("Enter barcode, SKU or product name.");
      return;
    }

    try {
      setSearching(true);
      setMessage("");

      const res = await posApi.searchItems(q, 20);
      const items = res.items || res.data || res || [];

      setSearchResults(Array.isArray(items) ? items : []);

      if (!items.length) {
        setMessage("No matching item found.");
      }
    } catch (err) {
      setMessage(err.message || "Product search failed.");
    } finally {
      setSearching(false);
    }
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

  async function searchCustomers() {
    try {
      const res = await posApi.listCustomers(customerQuery);
      setCustomers(res.customers || []);
      setMessage((res.customers || []).length ? "" : "No customers found.");
    } catch (err) {
      setMessage(err.message || "Failed to search customers.");
    }
  }

  async function createCustomerQuick() {
    const customer_name = prompt("Customer name:");
    if (!customer_name) return;

    const phone = prompt("Phone number:", "") || "";
    const email = prompt("Email:", "") || "";
    const customer_type =
      prompt("Customer type: retail / wholesale / account", "retail") || "retail";

    await posApi.createCustomer({
      customer_name,
      phone,
      email,
      customer_type,
      price_level: customer_type === "wholesale" ? "wholesale" : "retail",
    });

    setMessage("Customer created.");
    await searchCustomers();
  }

  async function finalisePayment() {
    console.log("FINALISE SALE", cart, totals);

    if (!cart.length) {
      setMessage("No items to complete.");
      return;
    }

    if (!selectedPaymentMethod) {
      setMessage("Select a payment method first.");
      return;
    }

    if (selectedPaymentMethod === "account" && !selectedCustomer) {
      setMessage("Select a customer for account sale.");
      setActivePanel("customer");
      return;
    }

    if (!activeTerminal) {
      setMessage("Select a terminal first.");
      return;
    }

    try {
      const saleNo = `POS-${Date.now()}`;

      const salePayload = {
        sale_no: saleNo,
        terminal_id: activeTerminal.id,
        shift_id: activeShift?.id || null,
        cashier_user_id:
          cashier?.company_user_id ||
          cashier?.user_id ||
          cashier?.id ||
          null,
        customer_name: selectedCustomer?.customer_name || "Walk-in Customer",
        customer_id: selectedCustomer?.id || null,
      };

      console.log("CREATE SALE PAYLOAD", salePayload);

      const saleRes = await posApi.createSale(salePayload);

      const saleId =
        saleRes?.sale_id ||
        saleRes?.data?.sale_id;

      if (!saleId) {
        throw new Error("Sale ID was not returned.");
      }

      for (const line of cart) {
        await posApi.addSaleLine(saleId, {
          item_id: line.id || line.item_id,
          qty: Number(line.qty || 1),
          unit_price: Number(
            line.sales_price ||
            line.unit_price ||
            line.price ||
            0
          ),
          discount_amount: Number(line.discount_amount || 0),
        });
      }

      const gross = Number(totals.gross || totals.total || 0);
      const tendered = Number(amountTendered || gross);

      await posApi.recordPayment(saleId, {
        payment_method: selectedPaymentMethod,
        amount: gross,
        received_amount: tendered,
        change_amount:
          selectedPaymentMethod === "cash"
            ? Math.max(tendered - gross, 0)
            : 0,
      });

      await posApi.completeSale(saleId);

      setMessage(`Sale ${saleNo} completed successfully.`);

      setCart([]);
      setSelectedPaymentMethod("");
      setAmountTendered("");
      setActivePanel("sale");
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Failed to complete sale.");
    }
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

          {isRestaurantLike && signedIn && (
            <button onClick={() => setActivePanel("orders")}>
              Orders
            </button>
          )}

          {isFsUser && (
            <>
              <a href="#/manager">Manager Workspace</a>

              <button onClick={() => (window.location.href = "/dashboard")}>
                Back to FinSage
              </button>
            </>
          )}
        </nav>
      </header>

      <section className="status-strip compact">
        <div><span>POS Mode</span><strong>{mode === "restaurant" ? "Restaurant" : "Retail"}</strong></div>
        <div><span>Inventory</span><strong>{usesInventory ? "Enabled" : "Service Only"}</strong></div>
        <div><span>Cashier</span><strong>{signedIn ? cashier?.name || cashier?.employee_code || "Signed In" : "Not Signed In"}</strong></div>
        <div><span>Currency</span><strong>{getCurrency(company)}</strong></div>

        {signedIn && (
          <div>
            <span>Terminal</span>
            <select
              className="scan-input compact-select"
              value={activeTerminal?.id || ""}
              onChange={(e) => {
                const terminal = terminals.find((x) => Number(x.id) === Number(e.target.value));
                setActiveTerminal(terminal || null);
              }}
            >
              <option value="">Select Terminal</option>
              {terminals.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
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
            {isRestaurantLike && (
              <div className="quick-actions">
                <button onClick={() => setActivePanel("sale")}>
                  Menu
                </button>

                <button onClick={() => setActivePanel("orders")}>
                  Orders
                </button>

                <button onClick={() => setActivePanel("customer")}>
                  Customers
                </button>

                {canSell && (
                  <button onClick={() => setActivePanel("payment")}>
                    Payments
                  </button>
                )}

                {canSell && (
                  <button onClick={() => setActivePanel("return")}>
                    Returns
                  </button>
                )}
              </div>
            )}

          <div className="scan-card">
            <label>{usesInventory ? "Scan barcode or search product" : "Search service item"}</label>
            <div className="scan-row">
              <input
                className="scan-input"
                placeholder={usesInventory ? "Scan barcode, SKU or product name..." : "Search service..."}
                disabled={!signedIn}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchProducts();
                }}
              />

              <button
                className="scan-btn"
                disabled={!signedIn || searching}
                onClick={searchProducts}
              >
                {searching ? "..." : "Search"}
              </button>
            </div>
          </div>

          <div className="quick-actions">
            {canSell && (
              <button
                onClick={() => {
                  setCart([]);
                  setActivePanel("sale");
                }}
              >
                New Sale
              </button>
            )}

            {canSell && (
              <button onClick={() => setActivePanel("quotation")}>
                Quotation
              </button>
            )}

            {canSell && (
              <button onClick={() => setActivePanel("return")}>
                Return
              </button>
            )}

            {canSell && (
              <button onClick={() => setActivePanel("holdSale")}>
                Hold Sale
              </button>
            )}

            <button onClick={() => setActivePanel("customer")}>
              Customer
            </button>

            {usesInventory && canSell && (
              <button onClick={() => setActivePanel("priceCheck")}>
                Price Check
              </button>
            )}
          </div>

          <div className="product-list">
            {activePanel === "orders" && (
              <OrderScreen
                embedded={true}
                canSell={canSell}
                canOrder={canOrder}
              />
            )}
            {activePanel === "sale" && (
              <>
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
                  <>
                    {searchResults.length ? (
                      <div className="menu-grid">
                        {searchResults.map((item) => (
                          <button
                            key={item.id}
                            className="menu-item-card"
                            onClick={() =>
                              addMenuItemToCart({
                                id: item.id,
                                name: item.name || item.item_name || item.description,
                                price:
                                  item.selling_price ||
                                  item.unit_price ||
                                  item.price ||
                                  0,
                                image_url: item.image_url || "",
                                category: item.category || item.sku || "",
                              })
                            }
                          >
                            <div className="menu-info">
                              <strong>
                                {item.name || item.item_name || item.description}
                              </strong>

                              <small>
                                {item.sku || item.barcode || ""}
                              </small>

                              <b>
                                {money(
                                  item.selling_price ||
                                  item.unit_price ||
                                  item.price ||
                                  0
                                )}
                              </b>
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
                  </>
                )}
              </>
            )}

            {activePanel === "holdSale" && (
              <>
                <div className="section-title">
                  <h2>Hold Sale</h2>
                  <span>Save current sale for later</span>
                </div>

                <div className="empty-state">
                  <strong>Hold sale panel</strong>
                  <p>This sale can be placed on hold and resumed later.</p>
                </div>
              </>
            )}

            {activePanel === "customer" && (
              <>
                <div className="section-title">
                  <h2>Customer</h2>
                  <span>Optional for walk-in sales</span>
                </div>

                <div className="scan-card">
                  <label>Search customer</label>

                  <div className="scan-row">
                    <input
                      className="scan-input"
                      value={customerQuery}
                      placeholder="Name, phone, email..."
                      onChange={(e) => setCustomerQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") searchCustomers();
                      }}
                    />

                    <button className="scan-btn" onClick={searchCustomers}>
                      Search
                    </button>
                  </div>

                  <div className="quick-actions" style={{ marginTop: 10 }}>
                    <button onClick={createCustomerQuick}>New Customer</button>
                    <button onClick={() => setSelectedCustomer(null)}>Walk-in Customer</button>
                  </div>
                </div>

                <div className="product-list">
                  {customers.length ? (
                    customers.map((c) => (
                      <button
                        className="result-item"
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setMessage(`Customer selected: ${c.customer_name}`);
                          setActivePanel("sale");
                        }}
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
                      <strong>{selectedCustomer?.customer_name || "Walk-in Customer"}</strong>
                      <p>
                        Customer is only required for account sales or when you choose to capture one.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {activePanel === "quotation" && (
              <>
                <div className="section-title">
                  <h2>Quotation</h2>
                  <span>Create quote from current cart</span>
                </div>

                <div className="empty-state">
                  <strong>Quotation panel</strong>
                  <p>Quotation tools will render here.</p>
                </div>
              </>
            )}

            {activePanel === "return" && (
              <>
                <div className="section-title">
                  <h2>Return</h2>
                  <span>Process returned items</span>
                </div>

                <div className="empty-state">
                  <strong>Return panel</strong>
                  <p>Return search and processing will render here.</p>
                </div>
              </>
            )}

            {activePanel === "priceCheck" && (
              <>
                <div className="section-title">
                  <h2>Price Check</h2>
                  <span>Check product price</span>
                </div>

                <div className="empty-state">
                  <strong>Price check panel</strong>
                  <p>Scan or search item to check price.</p>
                </div>
              </>
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

          {activePanel === "payment" && (
            <div className="payment-panel">
              <div className="receipt-payment-box">
                <div className="receipt-payment-row">
                  <label>Amount Tendered</label>

                  <input
                    className="scan-input"
                    type="number"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                  />
                </div>

                <div className="receipt-payment-row change-row">
                  <label>Change</label>

                  <strong>
                    {money(
                      selectedPaymentMethod === "cash"
                        ? Math.max(Number(amountTendered || 0) - Number(totals.gross || 0), 0)
                        : 0
                    )}
                  </strong>
                </div>
              </div>

              <div className="payment-method-title">
                Pay with {selectedPaymentMethod || "..."}
              </div>

              <div className="quick-actions">
                <button onClick={() => setSelectedPaymentMethod("cash")}>Cash</button>
                <button onClick={() => setSelectedPaymentMethod("card")}>Speedpoint / Card</button>
                <button onClick={() => setSelectedPaymentMethod("mobile_money")}>Mobile Money</button>
                <button onClick={() => setSelectedPaymentMethod("account")}>Account Sale</button>
                <button onClick={() => setSelectedPaymentMethod("split")}>Split Payment</button>
              </div>
            </div>
          )}
          <div className="payment-bar">
            <button className="soft">Print Quote/Bill</button>

            {canSell && (
              <button
                type="button"
                className="primary"
                onClick={() => setActivePanel("payment")}
              >
                Pay with {selectedPaymentMethod || "..."}
              </button>
            )}

            {canSell && (
              <button
                type="button"
                className="success"
                onClick={() => {
                  if (!cart.length) {
                    setMessage("Add at least one item before completing the sale.");
                    return;
                  }

                  if (!selectedPaymentMethod) {
                    setActivePanel("payment");
                    setMessage("Choose payment method before completing the sale.");
                    return;
                  }

                  finalisePayment();
                }}
              >
                Complete Sale
              </button>
            )}

            {!canSell && canOrder && isRestaurantLike && (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  if (!cart.length) {
                    setMessage("Add items before sending order to kitchen.");
                    return;
                  }

                  setMessage("Order sent to kitchen.");
                  setCart([]);
                  setActivePanel("sale");
                }}
              >
                Send To Kitchen
              </button>
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