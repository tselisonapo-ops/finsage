import React from "react";
import LeaseWizard from "./components/leaseWizard";
import LessorLeaseWizard from "./components/LessorLeaseWizard";
import "./styles/lease.css";

type LeaseRole = "lessee" | "lessor";

type LeasePageProps = {
  companyId: number;
  mode: "inception" | "existing";
  leaseRole: LeaseRole;
  selectedAccountCode?: string;
};

const LeasePage: React.FC<LeasePageProps> = ({
  companyId,
  mode,
  leaseRole,
  selectedAccountCode = "",
}) => {
  const isLessor = leaseRole === "lessor";

  return (
    <div className="lease-page">
      <div className="lease-page-header">
        <div>
          <div className="lease-page-badge">
            IFRS 16 · {isLessor ? "Lessor" : "Lessee"}
          </div>

          <h1 className="lease-page-title">
            {isLessor
              ? "Lessor lease setup"
              : mode === "existing"
                ? "Existing lease setup"
                : "Lease setup"}
          </h1>

          <div className="lease-page-subtitle">
            {isLessor
              ? "Capture a lease granted to a customer, classify it and prepare the lessor accounting schedule."
              : mode === "existing"
                ? "Bring an existing lease onto FinSage and calculate the IFRS 16 opening balances at go-live."
                : "Capture your lease, preview the amortisation schedule and opening IFRS 16 journal, then post it to the ledger."}
          </div>
        </div>
      </div>

      <div className="lease-layout">
        <div className="lease-panel">
          {isLessor ? (
            <LessorLeaseWizard
              companyId={companyId}
              selectedAccountCode={selectedAccountCode}
              defaultCurrentReceivableAccount="BS_CA_1710"
              defaultNonCurrentReceivableAccount="BS_NCA_1720"
              defaultLeaseIncomeAccount="PL_OI_4800"
              defaultArAccount="BS_CA_9002"
              defaultVatOutputAccount="BS_CL_2310"
              defaultFinanceIncomeAccount="PL_OI_4300"
            />
          ) : (
            <LeaseWizard
              companyId={companyId}
              mode={mode}
              defaultLeaseLiabilityAccount="BS_CL_2610"
              defaultRouAssetAccount="BS_NCA_1610"
              defaultInterestExpenseAccount="PL_OPEX_6029"
              defaultDepreciationExpenseAccount="PL_OPEX_6119"
              defaultDirectCostOffsetAccount="BS_CL_2200"
            />
          )}
        </div>

        <div className="lease-panel lease-info-panel">
          {isLessor ? (
            <>
              <h3>How lessor accounting works</h3>

              <p>
                When you save this lease, FinSage will:
              </p>

              <ul className="lease-info-list">
                <li>
                  <span className="lease-info-label">
                    1. Create lease
                  </span>
                  <span>
                    Save the agreement between your company and the customer.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    2. Classify lease
                  </span>
                  <span>
                    Determine whether the lease is an operating lease or finance lease.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    3. Build schedule
                  </span>
                  <span>
                    Generate rental income or net investment accounting periods.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    4. Commence lease
                  </span>
                  <span>
                    Post the applicable commencement journal after review.
                  </span>
                </li>
              </ul>
            </>
          ) : (
            <>
              <h3>How this works</h3>

              <p>
                When you save the lease, FinSage will:
              </p>

              <ul className="lease-info-list">
                <li>
                  <span className="lease-info-label">
                    1. Compute PV
                  </span>
                  <span>
                    Calculate the present value of lease payments excluding VAT.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    2. Build schedule
                  </span>
                  <span>
                    Generate opening balance, interest, principal and closing liability.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    3. ROU depreciation
                  </span>
                  <span>
                    Apply depreciation to the right-of-use asset.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    4. Post journal
                  </span>
                  <span>
                    Post the opening IFRS 16 journal.
                  </span>
                </li>
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeasePage;