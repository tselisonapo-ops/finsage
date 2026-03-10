// src/LeasePage.tsx
import React from "react";
import LeaseWizard from "./components/leaseWizard";
import "./styles/lease.css";

const LeasePage: React.FC = () => {
  return (
    <div className="lease-page">
      <div className="lease-page-header">
        <div>
          <div className="lease-page-badge">IFRS 16 · Lessee</div>
          <h1 className="lease-page-title">Lease setup</h1>
          <div className="lease-page-subtitle">
            Capture your lease, preview the amortisation schedule and opening IFRS 16 journal,
            then post to the ledger in one flow.
          </div>
        </div>
      </div>

      <div className="lease-layout">
        <div className="lease-panel">
          <LeaseWizard
            companyId={1}
            defaultLeaseLiabilityAccount="BS_CL_2610"
            defaultRouAssetAccount="BS_NCA_1610"
            defaultInterestExpenseAccount="PL_OPEX_6019"
            defaultDepreciationExpenseAccount="PL_OPEX_6017"
            defaultDirectCostOffsetAccount="BS_CL_2200" // or a better specific one you create
          />
        </div>

        <div className="lease-panel lease-info-panel">
          <h3>How this works</h3>
          <p>
            When you save the lease, FinSage will:
          </p>
          <ul className="lease-info-list">
            <li>
              <span className="lease-info-label">1. Compute PV</span>
              <span>Calculate the present value of lease payments (excluding VAT).</span>
            </li>
            <li>
              <span className="lease-info-label">2. Build schedule</span>
              <span>
                Generate the full amortisation table: opening balance, interest, principal and closing
                liability for each period.
              </span>
            </li>
            <li>
              <span className="lease-info-label">3. ROU depreciation</span>
              <span>
                Apply straight-line depreciation on the right-of-use asset over the lease term.
              </span>
            </li>
            <li>
              <span className="lease-info-label">4. Post journal</span>
              <span>
                Post the day-1 journal (DR ROU, CR Lease liability, CR offsets) into the company&apos;s ledger.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default LeasePage;
