export function getCompanyContext() {
  const sources = [
    window.COMPANY_CONTEXT,
    window.ACTIVE_COMPANY,
    window.CURRENT_COMPANY,
    window.companyContext,
  ];

  for (const src of sources) {
    if (src && typeof src === "object") return src;
  }

  try {
    return JSON.parse(localStorage.getItem("active_company") || "{}");
  } catch {
    return {};
  }
}

export function getCompanyId() {
  const company = getCompanyContext();
  return Number(company?.id || localStorage.getItem("active_company_id") || 0);
}

export function getAuthToken() {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("access_token") ||
    ""
  );
}

export function getPosMode(company = getCompanyContext()) {
  const industry = String(company?.industry || company?.industry_profile?.key || "").toLowerCase();

  if (industry.includes("restaurant") || industry.includes("hospitality")) {
    return "restaurant";
  }

  return "retail";
}

export function companyUsesInventory(company = getCompanyContext()) {
  return Boolean(
    company?.industry_profile?.uses_inventory ??
    company?.uses_inventory ??
    company?.inventory_mode !== "none"
  );
}

export function getCurrency(company = getCompanyContext()) {
  return company?.currency || "ZAR";
}