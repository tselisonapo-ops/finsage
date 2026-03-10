// src/App.tsx
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

  // ✅ wait until postMessage hydrates localStorage/sessionStorage
  useEffect(() => {
    const read = () => {
      try {
        const cid = getWizardCompanyId();
        setCompanyId(cid);
      } catch {
        // not ready yet
      }
    };

    read();

    // retry a few times quickly (iframe hydrate usually happens immediately)
    const t = setInterval(read, 200);

    // also re-check when message arrives
    const onMsg = () => read();
    window.addEventListener("message", onMsg);

    return () => {
      clearInterval(t);
      window.removeEventListener("message", onMsg);
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
