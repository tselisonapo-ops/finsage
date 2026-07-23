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
        <div className="lease-page-heading">
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

      <div className="lease-layout lease-layout-full">
        <div className="lease-panel lease-main-panel">
          <section className="lease-how-card">
            <h3>
              {isLessor
                ? "How lessor accounting works"
                : "How this works"}
            </h3>

            <div className="lease-how-grid">
              {isLessor ? (
                <>
                  <div className="lease-how-item">
                    <span className="lease-how-number">
                      1
                    </span>

                    <div>
                      <strong>Create lease</strong>
                      <small>
                        Save the customer agreement.
                      </small>
                    </div>
                  </div>

                  <div className="lease-how-item">
                    <span className="lease-how-number">
                      2
                    </span>

                    <div>
                      <strong>Classify lease</strong>
                      <small>
                        Determine operating or finance.
                      </small>
                    </div>
                  </div>

                  <div className="lease-how-item">
                    <span className="lease-how-number">
                      3
                    </span>

                    <div>
                      <strong>Build schedule</strong>
                      <small>
                        Generate accounting periods.
                      </small>
                    </div>
                  </div>

                  <div className="lease-how-item">
                    <span className="lease-how-number">
                      4
                    </span>

                    <div>
                      <strong>Commence lease</strong>
                      <small>
                        Post after review.
                      </small>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="lease-how-item">
                    <span className="lease-how-number">
                      1
                    </span>

                    <div>
                      <strong>Compute PV</strong>
                      <small>
                        Calculate the lease liability.
                      </small>
                    </div>
                  </div>

                  <div className="lease-how-item">
                    <span className="lease-how-number">
                      2
                    </span>

                    <div>
                      <strong>Build schedule</strong>
                      <small>
                        Allocate interest and principal.
                      </small>
                    </div>
                  </div>

                  <div className="lease-how-item">
                    <span className="lease-how-number">
                      3
                    </span>

                    <div>
                      <strong>ROU depreciation</strong>
                      <small>
                        Calculate asset depreciation.
                      </small>
                    </div>
                  </div>

                  <div className="lease-how-item">
                    <span className="lease-how-number">
                      4
                    </span>

                    <div>
                      <strong>Post journal</strong>
                      <small>
                        Post the opening IFRS 16 journal.
                      </small>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          <div className="lease-wizard-area">
            {isLessor ? (
              <LessorLeaseWizard
                companyId={companyId}
                selectedAccountCode={
                  selectedAccountCode
                }
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
        </div>
      </div>
    </div>
  );
};

export default LeasePage;