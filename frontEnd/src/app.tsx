import { useEffect, useRef, useState } from "react";
import "./App.css";
import LeasePage from "./leasePage";
import { getWizardCompanyId } from "./context/company";

type ActiveTool = "ifrs16_new" | "ifrs16_existing";
type LeaseRole = "lessee" | "lessor";

type LeaseWizardContext = {
  mode?: "inception" | "existing";
  leaseRole?: LeaseRole;
  accountCode?: string;
  account_code?: string;
  accountName?: string;
  account_name?: string;
  meta?: {
    account_code?: string;
    account_name?: string;
  };
};

type LeaseWizardMessage = {
  type?: string;
  token?: string;
  companyId?: number | string;
  role?: string;
  ctx?: LeaseWizardContext;
};

function App() {
  const [activeTool, setActiveTool] =
    useState<ActiveTool>("ifrs16_new");

  const [companyId, setCompanyId] =
    useState<number | null>(null);

  const [leaseRole, setLeaseRole] =
    useState<LeaseRole>("lessee");

  const [selectedAccountCode, setSelectedAccountCode] =
    useState("");

  const redirectScheduledRef = useRef(false);

  useEffect(() => {
    const isLocal = [
      "localhost",
      "127.0.0.1",
    ].includes(window.location.hostname);

    const productionOrigin =
      "https://finspheresolutions.com";

    const allowedOrigins = isLocal
      ? [
          "http://127.0.0.1:5500",
          "http://localhost:5500",
          "http://localhost:5173",
          "http://127.0.0.1:5173",
        ]
      : [productionOrigin];

    let intervalId: number | null = null;

    const readCompanyId = () => {
      try {
        const cid = getWizardCompanyId();

        if (!cid) return;

        setCompanyId(Number(cid));

        if (intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      } catch {
        // Parent context has not arrived yet.
      }
    };

    const onMessage = (
      event: MessageEvent<unknown>
    ) => {
      if (
        !allowedOrigins.includes(event.origin)
      ) {
        return;
      }

      const data =
        event.data &&
        typeof event.data === "object"
          ? (event.data as LeaseWizardMessage)
          : {};

      if (
        data.type !== "lease_wizard_context"
      ) {
        return;
      }

      const ctx = data.ctx || {};

      const accountCode = String(
        ctx.accountCode ||
          ctx.account_code ||
          ctx.meta?.account_code ||
          ""
      )
        .trim()
        .toUpperCase();

      const isLessorAccount = [
        "BS_CA_1710",
        "BS_NCA_1720",
      ].includes(accountCode);

      const resolvedRole: LeaseRole =
        ctx.leaseRole === "lessor" ||
        isLessorAccount
          ? "lessor"
          : "lessee";

      setLeaseRole(resolvedRole);
      setSelectedAccountCode(accountCode);

      if (ctx.mode === "existing") {
        setActiveTool("ifrs16_existing");
      } else if (ctx.mode === "inception") {
        setActiveTool("ifrs16_new");
      }

      const token = data.token;
      const incomingCompanyId =
        data.companyId;

      if (token) {
        localStorage.setItem(
          "fs_user_token",
          token
        );

        sessionStorage.setItem(
          "fs_user_token",
          token
        );

        localStorage.setItem(
          "auth_token",
          token
        );

        sessionStorage.setItem(
          "auth_token",
          token
        );
      }

      if (incomingCompanyId != null) {
        const cid = Number(
          incomingCompanyId
        );

        localStorage.setItem(
          "active_company_id",
          String(cid)
        );

        sessionStorage.setItem(
          "active_company_id",
          String(cid)
        );

        localStorage.setItem(
          "company_id",
          String(cid)
        );

        setCompanyId(cid);
      }

      if (data.role) {
        localStorage.setItem(
          "userRole",
          data.role
        );
      }

      console.log(
        "[APP] applied lease context",
        {
          accountCode,
          leaseRole: ctx.leaseRole,
          resolvedRole,
          mode: ctx.mode,
          companyId:
            incomingCompanyId != null
              ? Number(incomingCompanyId)
              : companyId,
        }
      );

      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    window.addEventListener(
      "message",
      onMessage
    );

    if (
      window.parent &&
      window.parent !== window
    ) {
      window.parent.postMessage(
        {
          type: "lease_wizard_ready",
        },
        isLocal ? "*" : productionOrigin
      );
    }

    readCompanyId();

    intervalId = window.setInterval(
      readCompanyId,
      200
    );

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }

      window.removeEventListener(
        "message",
        onMessage
      );
    };
  }, [companyId]);

  useEffect(() => {
    if (
      companyId ||
      redirectScheduledRef.current
    ) {
      return;
    }

    const isLocal = [
      "localhost",
      "127.0.0.1",
    ].includes(window.location.hostname);

    const productionOrigin =
      "https://finspheresolutions.com";

    const token =
      localStorage.getItem(
        "fs_user_token"
      ) ||
      sessionStorage.getItem(
        "fs_user_token"
      );

    const redirectUrl = !token
      ? isLocal
        ? "http://127.0.0.1:5500/signin.html"
        : `${productionOrigin}/signin.html`
      : isLocal
        ? "http://127.0.0.1:5500/dashboard.html"
        : `${productionOrigin}/dashboard.html`;

    redirectScheduledRef.current = true;

    const timeoutId = window.setTimeout(
      () => {
        window.location.replace(
          redirectUrl
        );
      },
      3000
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [companyId]);

  if (!companyId) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Loading wizard context…</h2>

        <p>
          Waiting for company and token from
          the parent application.
        </p>

        <p>
          You will be redirected if the
          context does not arrive.
        </p>
      </div>
    );
  }

  const isNewLease =
    activeTool === "ifrs16_new";

  const isLessor =
    leaseRole === "lessor";

  const pageTitle = isLessor
    ? "IFRS 16 - Lessor lease"
    : isNewLease
      ? "IFRS 16 - New lease (inception)"
      : "IFRS 16 - Existing lease (mid-term)";

  const pageSubtitle = isLessor
    ? "Capture the lease granted to a customer, classify it and generate the lessor accounting schedule."
    : isNewLease
      ? "Capture lease terms at inception, calculate ROU and liability, and post the Day-1 journal."
      : "Bring an existing lease onto FinSage mid-term and calculate the IFRS 16 opening balances at go-live.";

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="logo-block">
          <div className="logo-dot" />

          <div className="logo-text">
            FinSage
          </div>
        </div>

        <nav className="side-nav">
          <div className="side-nav-section">
            Reporting & compliance
          </div>

          {isLessor ? (
            <button
              className="side-nav-item active"
              type="button"
            >
              <span>
                IFRS 16 - Lessor lease
              </span>
            </button>
          ) : (
            <>
              <button
                className={
                  "side-nav-item" +
                  (
                    activeTool ===
                    "ifrs16_new"
                      ? " active"
                      : ""
                  )
                }
                type="button"
                onClick={() =>
                  setActiveTool(
                    "ifrs16_new"
                  )
                }
              >
                <span>
                  IFRS 16 - New lease
                </span>
              </button>

              <button
                className={
                  "side-nav-item" +
                  (
                    activeTool ===
                    "ifrs16_existing"
                      ? " active"
                      : ""
                  )
                }
                type="button"
                onClick={() =>
                  setActiveTool(
                    "ifrs16_existing"
                  )
                }
              >
                <span>
                  IFRS 16 - Existing lease
                </span>
              </button>
            </>
          )}
        </nav>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div>
            <h1 className="page-title">
              {pageTitle}
            </h1>

            <p className="page-subtitle">
              {pageSubtitle}
            </p>
          </div>
        </header>

        <div className="app-content">
          <LeasePage
            companyId={companyId}
            mode={
              isNewLease
                ? "inception"
                : "existing"
            }
            leaseRole={leaseRole}
            selectedAccountCode={
              selectedAccountCode
            }
          />
        </div>
      </main>
    </div>
  );
}

export default App;