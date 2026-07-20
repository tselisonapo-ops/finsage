import React, { useEffect, useState } from "react";
import LeaseWizard from "./components/leaseWizard";
import LessorLeaseWizard from "./components/LessorLeaseWizard";
import "./styles/lease.css";

type LeaseRole = "lessee" | "lessor";

const LESSOR_RECEIVABLE_ACCOUNTS = new Set([
  "BS_CA_1710",
  "BS_NCA_1720",
]);

function roleFromAccount(
  accountCode?: string | null,
  accountRole?: string | null
): LeaseRole {
  const code = String(accountCode || "")
    .trim()
    .toUpperCase();

  const role = String(accountRole || "")
    .trim()
    .toLowerCase();

  if (
    LESSOR_RECEIVABLE_ACCOUNTS.has(code) ||
    role === "lessor_net_investment_current" ||
    role === "lessor_net_investment_noncurrent" ||
    role === "lessor_lease_income"
  ) {
    return "lessor";
  }

  return "lessee";
}

const LeasePage: React.FC = () => {
  const query = new URLSearchParams(window.location.search);

  const initialAccountCode =
    query.get("account_code") ||
    query.get("accountCode") ||
    "";

  const initialAccountRole =
    query.get("account_role") ||
    query.get("accountRole") ||
    "";

  const [companyId, setCompanyId] = useState(
    Number(query.get("company_id") || 1)
  );

  const [selectedAccountCode, setSelectedAccountCode] =
    useState(initialAccountCode);

  const [leaseRole, setLeaseRole] = useState<LeaseRole>(
    roleFromAccount(
      initialAccountCode,
      initialAccountRole
    )
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data || {};
      const ctx = data.ctx || {};
      const defaults = ctx.defaults || {};

      if (data.companyId) {
        setCompanyId(Number(data.companyId));
      }

      const accountCode = String(
        ctx.accountCode ||
        ctx.account_code ||
        ctx.selectedAccountCode ||
        ctx.selected_account_code ||
        defaults.accountCode ||
        defaults.account_code ||
        data.accountCode ||
        data.account_code ||
        ""
      ).trim();

      const accountRole = String(
        ctx.accountRole ||
        ctx.account_role ||
        defaults.accountRole ||
        defaults.account_role ||
        data.accountRole ||
        data.account_role ||
        ""
      ).trim();

      const explicitRole = String(
        ctx.leaseRole ||
        ctx.lease_role ||
        data.leaseRole ||
        data.lease_role ||
        ""
      ).toLowerCase();

      if (accountCode) {
        setSelectedAccountCode(accountCode);
      }

      if (
        explicitRole === "lessor" ||
        explicitRole === "lessee"
      ) {
        setLeaseRole(explicitRole);
      } else {
        setLeaseRole(
          roleFromAccount(accountCode, accountRole)
        );
      }
    }

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener(
        "message",
        onMessage
      );
    };
  }, []);

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
              : "Lease setup"}
          </h1>

          <div className="lease-page-subtitle">
            {isLessor
              ? (
                <>
                  Capture a lease granted to a customer,
                  classify it and prepare the lessor
                  accounting schedule.
                </>
              )
              : (
                <>
                  Capture your lease, preview the
                  amortisation schedule and opening IFRS
                  16 journal, then post it to the ledger.
                </>
              )}
          </div>
        </div>
      </div>

      <div className="lease-layout">
        <div className="lease-panel">
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
                    Save the agreement between your
                    company and the customer.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    2. Classify lease
                  </span>
                  <span>
                    Determine whether the lease is an
                    operating lease or finance lease.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    3. Build schedule
                  </span>
                  <span>
                    Generate rental income or net
                    investment accounting periods.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    4. Commence lease
                  </span>
                  <span>
                    Post the applicable commencement
                    journal after review.
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
                    Calculate the present value of lease
                    payments excluding VAT.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    2. Build schedule
                  </span>
                  <span>
                    Generate opening balance, interest,
                    principal and closing liability.
                  </span>
                </li>

                <li>
                  <span className="lease-info-label">
                    3. ROU depreciation
                  </span>
                  <span>
                    Apply depreciation to the
                    right-of-use asset.
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