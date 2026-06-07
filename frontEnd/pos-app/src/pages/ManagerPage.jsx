import { useEffect, useMemo, useState } from "react";
import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";

const TABS = [
  ["overview", "Overview"],
  ["shifts", "Shifts & Cash-up"],
  ["terminals", "Terminals"],
  ["customers", "Customers"],
  ["pricing", "Pricing"],
  ["promotions", "Promotions"],
  ["labels", "Barcode Labels"],
  ["staff", "POS Staff"],
];

export function ManagerPage() {
  const [tab, setTab] = useState("overview");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [terminals, setTerminals] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [priceLevels, setPriceLevels] = useState([]);
  const [promotions, setPromotions] = useState([]);

  const openShifts = useMemo(
    () => shifts.filter((x) => x.status === "open").length,
    [shifts]
  );

  useEffect(() => {
    loadTabData(tab);
  }, [tab]);

  async function loadTabData(activeTab = tab) {
    setLoading(true);
    setMessage("");

    try {
      if (activeTab === "overview") {
        await Promise.allSettled([
          loadTerminals(),
          loadShifts(),
          loadCustomers(),
          loadPriceLevels(),
          loadPromotions(),
        ]);
      }

      if (activeTab === "terminals") await loadTerminals();
      if (activeTab === "shifts") await loadShifts();
      if (activeTab === "customers") await loadCustomers();
      if (activeTab === "pricing") await loadPriceLevels();
      if (activeTab === "promotions") await loadPromotions();
    } catch (err) {
      setMessage(err.message || "Failed to load manager data.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTerminals() {
    const res = await posApi.listTerminals();
    setTerminals(res.terminals || []);
  }

  async function loadShifts() {
    const res = await posApi.listShifts("");
    setShifts(res.shifts || []);
  }

  async function loadCustomers(q = "") {
    const res = await posApi.listCustomers(q);
    setCustomers(res.customers || []);
  }

  async function loadPriceLevels() {
    const res = await posApi.listPriceLevels();
    setPriceLevels(res.price_levels || []);
  }

  async function loadPromotions() {
    const res = await posApi.listPromotions();
    setPromotions(res.promotions || []);
  }

  async function createTerminal() {
    const terminal_code = prompt("Terminal code:", `TILL-${Date.now()}`);
    if (!terminal_code) return;

    const name = prompt("Terminal name:", terminal_code) || terminal_code;
    const branch_name = prompt("Branch name:", "Main") || "Main";

    await posApi.createTerminal({
      terminal_code,
      name,
      branch_name,
      location: "",
      cash_drawer_enabled: false,
      is_active: true,
    });

    setMessage("Terminal created.");
    await loadTerminals();
  }

  async function closeShift(shiftId) {
    const counted = prompt("Counted cash amount:", "0");
    if (counted === null) return;

    await posApi.closeShift(shiftId, {
      counted_cash: Number(counted || 0),
    });

    setMessage("Shift closed.");
    await loadShifts();
  }

  async function createCustomer() {
    const customer_name = prompt("Customer name:");
    if (!customer_name) return;

    const customer_type =
      prompt("Customer type: retail / wholesale / account", "retail") || "retail";
    const phone = prompt("Phone:", "") || "";
    const email = prompt("Email:", "") || "";

    await posApi.createCustomer({
      customer_name,
      customer_type,
      phone,
      email,
      price_level: customer_type === "wholesale" ? "wholesale" : "retail",
    });

    setMessage("Customer created.");
    await loadCustomers();
  }

  async function createPriceLevel() {
    const price_level = prompt("Price level name:", "wholesale");
    if (!price_level) return;

    const description = prompt("Description:", "") || "";

    await posApi.createPriceLevel({
      price_level,
      description,
      is_active: true,
    });

    setMessage("Price level created.");
    await loadPriceLevels();
  }

  async function createPromotion() {
    const promo_code = prompt("Promotion code:", `PROMO-${Date.now()}`);
    if (!promo_code) return;

    const name = prompt("Promotion name:", promo_code) || promo_code;
    const discount_percent = Number(prompt("Discount percent:", "0") || 0);

    await posApi.createPromotion({
      promo_code,
      name,
      promo_type: "percent",
      discount_percent,
      discount_amount: 0,
      rules_json: {},
      is_active: true,
    });

    setMessage("Promotion created.");
    await loadPromotions();
  }

  async function generateLabel() {
    const itemId = Number(prompt("Inventory item ID:", "0") || 0);
    if (!itemId) {
      setMessage("Enter item ID first.");
      return;
    }

    const res = await posApi.generateBarcode(itemId);
    const barcode = res.barcode || res.data?.barcode;

    await posApi.queueBarcodeLabel({
      item_id: itemId,
      barcode,
      copies: 1,
    });

    setMessage(`Barcode queued: ${barcode}`);
  }

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <span className="eyebrow">Store Manager</span>
          <h1>POS Manager Workspace</h1>
          <p>Manage shifts, cash-up, terminals, customers, discounts and stock labels.</p>
        </div>

        <nav className="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/orders">Orders</a>
          <button onClick={() => (window.location.href = "/dashboard")}>
            Back to FinSage
          </button>
        </nav>
      </header>

      {message && <div className="pos-message">{message}</div>}

      <section className="manager-tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active-tab" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </section>

      {loading && <div className="pos-message">Loading...</div>}

      {tab === "overview" && (
        <OverviewTab
          openShifts={openShifts}
          terminals={terminals}
          customers={customers}
          priceLevels={priceLevels}
          promotions={promotions}
        />
      )}

      {tab === "shifts" && (
        <ShiftsTab shifts={shifts} onRefresh={loadShifts} onCloseShift={closeShift} />
      )}

      {tab === "terminals" && (
        <TerminalsTab terminals={terminals} onCreate={createTerminal} />
      )}

      {tab === "customers" && (
        <CustomersTab
          customers={customers}
          onCreate={createCustomer}
          onSearch={loadCustomers}
        />
      )}

      {tab === "pricing" && (
        <PricingTab priceLevels={priceLevels} onCreate={createPriceLevel} />
      )}

      {tab === "promotions" && (
        <PromotionsTab promotions={promotions} onCreate={createPromotion} />
      )}

      {tab === "labels" && <LabelsTab onGenerate={generateLabel} />}

      {tab === "staff" && <StaffTab setMessage={setMessage} />}
    </main>
  );
}

function OverviewTab({ openShifts, terminals, customers, priceLevels, promotions }) {
  return (
    <section className="manager-grid">
      <ManagerCard title="Open Shifts" value={openShifts} text="Cashiers currently active." />
      <ManagerCard title="Terminals" value={terminals.length} text="Configured POS terminals." />
      <ManagerCard title="Customers" value={customers.length} text="Retail, wholesale and account profiles." />
      <ManagerCard title="Price Levels" value={priceLevels.length} text="Retail, wholesale, VIP and staff pricing." />
      <ManagerCard title="Promotions" value={promotions.length} text="Active and scheduled promotions." />
      <ManagerCard title="Cash-up" value="Review" text="Close shifts and compare expected vs counted cash." />
    </section>
  );
}

function ManagerCard({ title, value, text }) {
  return (
    <article className="manager-card">
      <h3>{title}</h3>
      <strong>{value}</strong>
      <p>{text}</p>
    </article>
  );
}

function ShiftsTab({ shifts, onRefresh, onCloseShift }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Shifts & Cash-up</h2>
          <p>Review open shifts and close cashiers at end of day.</p>
        </div>
        <button className="scan-btn" onClick={onRefresh}>Refresh</button>
      </div>

      <div className="data-list">
        {shifts.length ? (
          shifts.map((s) => (
            <div className="data-row" key={s.id}>
              <div>
                <strong>{s.terminal_name || "Terminal"} — Shift #{s.id}</strong>
                <small>Cashier: {s.cashier_user_id || "-"} • Status: {s.status}</small>
              </div>
              <div>
                <strong>{money(s.expected_cash || 0)}</strong>
                {s.status === "open" && (
                  <button onClick={() => onCloseShift(s.id)}>Close</button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No shifts loaded</strong>
            <p>Click refresh.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function TerminalsTab({ terminals, onCreate }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Terminals</h2>
          <p>Create and manage POS terminals.</p>
        </div>
        <button className="scan-btn" onClick={onCreate}>New Terminal</button>
      </div>

      <div className="data-list">
        {terminals.length ? (
          terminals.map((t) => (
            <div className="data-row" key={t.id}>
              <div>
                <strong>{t.name}</strong>
                <small>{t.terminal_code} • {t.branch_name || "Main"} • {t.location || ""}</small>
              </div>
              <span className="badge">{t.is_active ? "Active" : "Inactive"}</span>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No terminals</strong>
            <p>Create the first POS terminal.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CustomersTab({ customers, onCreate, onSearch }) {
  const [query, setQuery] = useState("");

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>POS Customers</h2>
          <p>Manage retail, wholesale and account customers.</p>
        </div>
        <button className="scan-btn" onClick={onCreate}>New Customer</button>
      </div>

      <div className="scan-card">
        <div className="scan-row">
          <input
            className="scan-input"
            placeholder="Search customer..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="scan-btn" onClick={() => onSearch(query)}>
            Search
          </button>
        </div>
      </div>

      <div className="data-list">
        {customers.length ? (
          customers.map((c) => (
            <div className="data-row" key={c.id}>
              <div>
                <strong>{c.customer_name}</strong>
                <small>{c.customer_type || "retail"} • {c.price_level || "retail"} • {c.phone || c.email || ""}</small>
              </div>
              <strong>{money(c.credit_limit || 0)}</strong>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No customers loaded</strong>
            <p>Search or create one.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PricingTab({ priceLevels, onCreate }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Pricing</h2>
          <p>Set retail, wholesale, VIP or staff price levels.</p>
        </div>
        <button className="scan-btn" onClick={onCreate}>New Price Level</button>
      </div>

      <div className="data-list">
        {priceLevels.length ? (
          priceLevels.map((p) => (
            <div className="data-row" key={p.id}>
              <div>
                <strong>{p.price_level}</strong>
                <small>{p.description || ""}</small>
              </div>
              <span className="badge">{p.is_active ? "Active" : "Inactive"}</span>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No price levels</strong>
            <p>Create wholesale, VIP or staff pricing.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PromotionsTab({ promotions, onCreate }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Promotions</h2>
          <p>Create discounts and promotion rules.</p>
        </div>
        <button className="scan-btn" onClick={onCreate}>New Promotion</button>
      </div>

      <div className="data-list">
        {promotions.length ? (
          promotions.map((p) => (
            <div className="data-row" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <small>{p.promo_code} • {p.promo_type}</small>
              </div>
              <div>
                <strong>{Number(p.discount_percent || 0)}%</strong>
                <span className="badge">{p.is_active ? "Active" : "Inactive"}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No promotions loaded</strong>
            <p>Create active POS promotions.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function LabelsTab({ onGenerate }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Barcode Labels</h2>
          <p>Generate and queue barcode labels for printing.</p>
        </div>
        <button className="scan-btn" onClick={onGenerate}>Generate Label</button>
      </div>

      <div className="empty-state">
        <strong>Label workflow</strong>
        <p>Generate or queue barcode label printing by item ID.</p>
      </div>
    </section>
  );
}

function StaffTab({ setMessage }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>POS Staff</h2>
          <p>Add cashier, waiter, waitress, kitchen user or driver access.</p>
        </div>
        <button
          className="scan-btn"
          onClick={() =>
            setMessage("POS staff invite route should use company_invites with access_scope='pos' and pos_role.")
          }
        >
          Add POS Staff
        </button>
      </div>

      <div className="empty-state">
        <strong>POS staff invitations</strong>
        <p>This will use public.company_invites with access_scope='pos' and pos_role.</p>
      </div>
    </section>
  );
}