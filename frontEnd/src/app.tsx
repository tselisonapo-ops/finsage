import { useEffect, useState } from "react";
import "./App.css";
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

  useEffect(() => {
    const IS_LOCAL =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    const PARENT_ORIGIN = IS_LOCAL
      ? "http://127.0.0.1:5500"
      : "https://finsage-1.onrender.com";

    const read = () => {
      try {
        const cid = getWizardCompanyId();
        setCompanyId(cid);
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

      read();
    };

    window.addEventListener("message", onMessage);

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "lease_wizard_ready" }, PARENT_ORIGIN);
    }

    read();

    const t = setInterval(read, 200);

    return () => {
      clearInterval(t);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  if (!companyId) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Loading wizard context…</h2>
        <p>Waiting for company + token from parent app.</p>
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