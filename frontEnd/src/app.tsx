import { useEffect, useRef, useState } from "react";import "./App.css";
import LeaseWizard from "./components/leaseWizard";
import { getWizardCompanyId } from "./context/company";

type ActiveTool = "ifrs16_new" | "ifrs16_existing";

interface LeaseWizardProps {
  companyId: number;
  mode: "inception" | "existing";
  defaultLeaseLiabilityAccount: string;
  defaultRouAssetAccount: string;
  defaultInterestExpenseAccount: string;
  defaultDepreciationExpenseAccount: string;
  defaultDirectCostOffsetAccount: string;
}

function App() {
  const [activeTool, setActiveTool] = useState<ActiveTool>("ifrs16_new");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const redirectScheduledRef = useRef(false);

  useEffect(() => {
    const IS_LOCAL =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    const PARENT_ORIGIN = IS_LOCAL
      ? "http://127.0.0.1:5500"
      : "https://finsage-1.onrender.com";

    let intervalId: number | null = null;

    const read = () => {
      try {
        const cid = getWizardCompanyId();
        if (cid) {
          setCompanyId(Number(cid));
          if (intervalId) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch {
        // not ready yet
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== PARENT_ORIGIN) return;

      const data = event.data || {};
      if (data.type !== "lease_wizard_context") return;

      const { token, companyId } = data;

      if (!token || !companyId) return;

      localStorage.setItem("fs_user_token", token);
      sessionStorage.setItem("fs_user_token", token);
      sessionStorage.setItem("active_company_id", String(companyId));
      localStorage.setItem("active_company_id", String(companyId));

      setCompanyId(Number(companyId));

      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    window.addEventListener("message", onMessage);

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "lease_wizard_ready" }, PARENT_ORIGIN);
    }

    read();
    intervalId = window.setInterval(read, 200);

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    if (companyId || redirectScheduledRef.current) return;

    const IS_LOCAL =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    const token =
      localStorage.getItem("fs_user_token") ||
      sessionStorage.getItem("fs_user_token");

    const REDIRECT_URL = !token
      ? (IS_LOCAL
          ? "http://127.0.0.1:5500/signin.html"
          : "https://finsage-1.onrender.com/signin.html")
      : (IS_LOCAL
          ? "http://127.0.0.1:5500/dashboard.html"
          : "https://finsage-1.onrender.com/dashboard.html");

    redirectScheduledRef.current = true;

    const t = window.setTimeout(() => {
      window.location.replace(REDIRECT_URL);
    }, 3000);

    return () => window.clearTimeout(t);
  }, [companyId]);

  if (!companyId) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Loading wizard context…</h2>
        <p>Waiting for company + token from parent app.</p>
        <p>If this takes too long you will be redirected.</p>
      </div>
    );
  }

  const isNewLease = activeTool === "ifrs16_new";

  const pageTitle = isNewLease
    ? "IFRS 16 - New lease (inception)"
    : "IFRS 16 - Existing lease (mid-term)";

  const pageSubtitle = isNewLease
    ? "Capture lease terms at inception, calculate ROU & liability, and post the Day-1 journal."
    : "Bring an existing lease onto FinSage mid-term. Calculate the IFRS 16 opening balances at go-live.";

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="logo-block">
          <div className="logo-dot" />
          <div className="logo-text">FinSage</div>
        </div>

        <nav className="side-nav">
          <div className="side-nav-section">Reporting & compliance</div>

          <button
            className={"side-nav-item" + (activeTool === "ifrs16_new" ? " active" : "")}
            onClick={() => setActiveTool("ifrs16_new")}
          >
            <span>IFRS 16 - New lease</span>
          </button>

          <button
            className={"side-nav-item" + (activeTool === "ifrs16_existing" ? " active" : "")}
            onClick={() => setActiveTool("ifrs16_existing")}
          >
            <span>IFRS 16 - Existing lease</span>
          </button>
        </nav>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div>
            <h1 className="page-title">{pageTitle}</h1>
            <p className="page-subtitle">{pageSubtitle}</p>

            <LeaseWizard
              {...({
                companyId,
                mode: isNewLease ? "inception" : "existing",
                defaultLeaseLiabilityAccount: "BS_CL_2610",
                defaultRouAssetAccount: "BS_NCA_1610",
                defaultInterestExpenseAccount: "PL_OPEX_6019",
                defaultDepreciationExpenseAccount: "PL_OPEX_6017",
                defaultDirectCostOffsetAccount: "BS_CL_2200",
              } as LeaseWizardProps)}
            />
          </div>
        </header>
      </main>
    </div>
  );
}

export default App;