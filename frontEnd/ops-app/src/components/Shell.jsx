
import {
  Bell,
  Building2,
  CheckSquare,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  FileText,
  LayoutDashboard,
  ListTodo,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  ScanSearch,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TriangleAlert,
  Users,
  WalletCards,
  Warehouse,
  ArrowLeftRight,
} from "lucide-react";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession } from "../api/api";

export default function Shell({
  session,
  active = "dashboard",
  children,
}) {
  const nav = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ============================================================
  // FINANCE STATE
  // ============================================================

  const payablesActive =
    active?.startsWith("payables-") ||
    active === "payment-vouchers";

  const [financeOpen, setFinanceOpen] = useState(true);
  const [payablesOpen, setPayablesOpen] = useState(payablesActive);

  const financeActive =
    active === "finance" ||
    active === "finance-overview" ||
    active === "finance-my-work" ||
    active === "payment-vouchers" ||
    payablesActive;

  // ============================================================
  // WAREHOUSE / INVENTORY STATE
  // ============================================================

  const warehouseActive =
    active === "inventory" ||
    active === "inventory-dashboard" ||
    active === "warehouses" ||
    active === "stock-movements" ||
    active === "stocktake";

  const [warehouseOpen, setWarehouseOpen] = useState(true);

  // ============================================================
  // MAIN WORKSPACE ITEMS
  // ============================================================

  const items = [
    ["dashboard", LayoutDashboard, "Overview", "/"],
    ["team", Users, "People", "/people"],
    ["requests", FileText, "Requests", "/requests"],
    ["approvals", CheckSquare, "Approvals", "/approvals"],
    ["procurement", ShoppingCart, "Procurement", "/procurement"],
    ["budget", WalletCards, "Budget control", "/budget"],
    ["organisation", Building2, "Organisation", "/organisation"],
    ["governance", ShieldCheck, "Governance", "/governance"],
    ["settings", Settings, "Settings", "/settings"],
  ];

  // ============================================================
  // LOGOUT
  // ============================================================

  function logout() {
    clearSession();
    nav("/signin", { replace: true });
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      className={`app-shell ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
    >
      <aside
        className={`sidebar ${
          sidebarCollapsed ? "collapsed" : ""
        }`}
      >

        {/* ======================================================
            BRAND
        ====================================================== */}

        <div className="brand sidebar-brand-row">
          <div className="brand-mark">F</div>

          {!sidebarCollapsed && (
            <div className="sidebar-brand-copy">
              <strong>FinSage Nexus</strong>
              <small>by FinSphere</small>
            </div>
          )}

          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() =>
              setSidebarCollapsed(value => !value)
            }
            title={
              sidebarCollapsed
                ? "Expand sidebar"
                : "Collapse sidebar"
            }
            aria-label={
              sidebarCollapsed
                ? "Expand sidebar"
                : "Collapse sidebar"
            }
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        </div>

        {/* ======================================================
            NAVIGATION
        ====================================================== */}

        <nav>
          {!sidebarCollapsed && (
            <span className="nav-label">WORKSPACE</span>
          )}

          {/* ----------------------------------------------------
              WORKSPACE
          ---------------------------------------------------- */}

          {items.slice(0, 5).map(
            ([key, Icon, label, path]) => (
              <button
                key={key}
                type="button"
                title={
                  sidebarCollapsed
                    ? label
                    : undefined
                }
                className={`nav-item ${
                  active === key ? "active" : ""
                }`}
                onClick={() => nav(path)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            )
          )}

          {/* ====================================================
              FINANCE
          ==================================================== */}

          <div
            className={`nav-section ${
              financeOpen ? "open" : ""
            }`}
          >
            <button
              type="button"
              title={
                sidebarCollapsed
                  ? "Finance"
                  : undefined
              }
              className={`nav-item nav-parent ${
                financeActive ? "active" : ""
              }`}
              onClick={() => {
                if (sidebarCollapsed) {
                  nav("/finance");
                  return;
                }

                setFinanceOpen(open => !open);
              }}
            >
              <WalletCards size={18} />

              {!sidebarCollapsed && (
                <>
                  <span>Finance</span>

                  <ChevronDown
                    size={15}
                    className={`nav-chevron ${
                      financeOpen ? "open" : ""
                    }`}
                  />
                </>
              )}
            </button>

            <div
              className={`nav-collapse ${
                financeOpen && !sidebarCollapsed
                  ? "open"
                  : ""
              }`}
            >
              <div className="nav-children">

                <button
                  type="button"
                  className={`nav-sub-item ${
                    active === "finance-overview"
                      ? "active"
                      : ""
                  }`}
                  onClick={() => nav("/finance")}
                >
                  <CircleDollarSign size={15} />
                  <span>Overview</span>
                </button>

                <button
                  type="button"
                  className={`nav-sub-item ${
                    active === "finance-my-work"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    nav("/finance/my-work")
                  }
                >
                  <ListTodo size={15} />
                  <span>My Work</span>
                </button>

                <button
                  type="button"
                  className={`nav-sub-item ${
                    active === "payment-vouchers"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    nav(
                      "/finance/payables/payment-vouchers"
                    )
                  }
                >
                  <ClipboardCheck size={15} />
                  <span>Payment Vouchers</span>
                </button>

                {/* PAYABLES */}

                <div
                  className={`nav-sub-group ${
                    payablesOpen ? "open" : ""
                  }`}
                >
                  <button
                    type="button"
                    className={`nav-sub-group-title ${
                      payablesActive ? "active" : ""
                    }`}
                    onClick={() =>
                      setPayablesOpen(open => !open)
                    }
                  >
                    <ReceiptText size={15} />
                    <span>Payables</span>

                    <ChevronDown
                      size={13}
                      className={`nav-group-chevron ${
                        payablesOpen ? "open" : ""
                      }`}
                    />
                  </button>

                  <div
                    className={`nav-sub-collapse ${
                      payablesOpen ? "open" : ""
                    }`}
                  >
                    <div className="nav-sub-group-items">

                      <button
                        type="button"
                        className={`nav-sub-item nested ${
                          active === "payables-invoices"
                            ? "active"
                            : ""
                        }`}
                        onClick={() =>
                          nav(
                            "/finance/payables/invoices"
                          )
                        }
                      >
                        <FileText size={14} />
                        <span>Invoice Inbox</span>
                      </button>

                      <button
                        type="button"
                        className={`nav-sub-item nested ${
                          active === "payables-matching"
                            ? "active"
                            : ""
                        }`}
                        onClick={() =>
                          nav(
                            "/finance/payables/matching"
                          )
                        }
                      >
                        <ScanSearch size={14} />
                        <span>Matching</span>
                      </button>

                      <button
                        type="button"
                        className={`nav-sub-item nested ${
                          active ===
                          "payables-exceptions"
                            ? "active"
                            : ""
                        }`}
                        onClick={() =>
                          nav(
                            "/finance/payables/exceptions"
                          )
                        }
                      >
                        <TriangleAlert size={14} />
                        <span>Exceptions</span>
                      </button>

                      <button
                        type="button"
                        className={`nav-sub-item nested ${
                          active === "payables-ready"
                            ? "active"
                            : ""
                        }`}
                        onClick={() =>
                          nav(
                            "/finance/payables/ready"
                          )
                        }
                      >
                        <FileCheck2 size={14} />
                        <span>
                          Ready for Accounting
                        </span>
                      </button>

                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* ====================================================
              WAREHOUSE / INVENTORY
          ==================================================== */}

          <div
            className={`nav-section ${
              warehouseOpen ? "open" : ""
            }`}
          >
            <button
              type="button"
              title={
                sidebarCollapsed
                  ? "Warehouse"
                  : undefined
              }
              className={`nav-item nav-parent ${
                warehouseActive ? "active" : ""
              }`}
              onClick={() => {
                if (sidebarCollapsed) {
                  nav("/inventory");
                  return;
                }

                setWarehouseOpen(open => !open);
              }}
            >
              <Warehouse size={18} />

              {!sidebarCollapsed && (
                <>
                  <span>Warehouse</span>

                  <ChevronDown
                    size={15}
                    className={`nav-chevron ${
                      warehouseOpen ? "open" : ""
                    }`}
                  />
                </>
              )}
            </button>

            <div
              className={`nav-collapse ${
                warehouseOpen && !sidebarCollapsed
                  ? "open"
                  : ""
              }`}
            >
              <div className="nav-children">

                {/* INVENTORY DASHBOARD */}

                <button
                  type="button"
                  className={`nav-sub-item ${
                    active === "inventory-dashboard"
                      ? "active"
                      : ""
                  }`}
                  onClick={() => nav("/inventory")}
                >
                  <LayoutDashboard size={15} />
                  <span>Inventory Dashboard</span>
                </button>

                {/* WAREHOUSES */}

                <button
                  type="button"
                  className={`nav-sub-item ${
                    active === "warehouses"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    nav("/inventory/warehouses")
                  }
                >
                  <Warehouse size={15} />
                  <span>Warehouses</span>
                </button>

                {/* STOCK MOVEMENTS */}

                <button
                  type="button"
                  className={`nav-sub-item ${
                    active === "stock-movements"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    nav("/inventory/movements")
                  }
                >
                  <ArrowLeftRight size={15} />
                  <span>Stock Movements</span>
                </button>

                {/* STOCKTAKE */}

                <button
                  type="button"
                  className={`nav-sub-item ${
                    active === "stocktake"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    nav("/inventory/stocktake")
                  }
                >
                  <ClipboardCheck size={15} />
                  <span>Stocktake</span>
                </button>

              </div>
            </div>
          </div>

          {/* ----------------------------------------------------
              REMAINING WORKSPACE
          ---------------------------------------------------- */}

          {items.slice(5).map(
            ([key, Icon, label, path]) => (
              <button
                key={key}
                type="button"
                title={
                  sidebarCollapsed
                    ? label
                    : undefined
                }
                className={`nav-item ${
                  active === key ? "active" : ""
                }`}
                onClick={() => nav(path)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            )
          )}
        </nav>

        {/* ======================================================
            SIDEBAR USER
        ====================================================== */}

        <div
          className={`sidebar-user ${
            sidebarCollapsed ? "collapsed" : ""
          }`}
        >
          <div
            className="avatar"
            title={
              sidebarCollapsed
                ? `${session?.first_name || ""} ${
                    session?.last_name || ""
                  }`.trim()
                : undefined
            }
          >
            {(session?.first_name?.[0] || "U").toUpperCase()}
          </div>

          {!sidebarCollapsed && (
            <div className="user-copy">
              <strong>
                {session?.first_name}{" "}
                {session?.last_name}
              </strong>

              <small>
                {session?.position_title ||
                  session?.company_role}
              </small>
            </div>
          )}

          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={logout}
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </aside>

      {/* ========================================================
          WORKSPACE
      ======================================================== */}

      <section className="workspace">
        <header className="topbar">
          <div className="company-switch">
            <Building2 size={18} />

            <div>
              <small>Organisation</small>
              <strong>
                {session?.company_name}
              </strong>
            </div>

            <ChevronDown size={16} />
          </div>

          <div className="top-actions">
            <button className="icon-btn">
              <Bell size={19} />
            </button>

            <div className="department-chip">
              {session?.department_name ||
                "No department"}
            </div>
          </div>
        </header>

        <main className="page-content">
          {children}
        </main>
      </section>
    </div>
  );
}

