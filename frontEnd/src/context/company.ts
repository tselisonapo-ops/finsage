export function getWizardCompanyId(): number {
  const raw = localStorage.getItem("company_id") || "";
  const cid = parseInt(raw, 10);
  if (!cid || Number.isNaN(cid)) throw new Error("Wizard missing company_id");
  return cid;
}
