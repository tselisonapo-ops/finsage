// frontEnd/src/context/company.ts
//
// ✅ Security hardening: read company_id from sessionStorage
// (not localStorage). company_id is not a secret, but we moved
// it to sessionStorage so it is cleared when the wizard tab
// closes, reducing the surface area of persisted data.

export function getWizardCompanyId(): number {
  const raw =
    sessionStorage.getItem("company_id") ||
    sessionStorage.getItem("active_company_id") ||
    "";
  const cid = parseInt(raw, 10);
  if (!cid || Number.isNaN(cid)) throw new Error("Wizard missing company_id");
  return cid;
}
