export function getCompanyContext() {
  const sources = [
    window.COMPANY_CONTEXT,
    window.ACTIVE_COMPANY,
    window.CURRENT_COMPANY,
    window.companyContext,
  ];

  for (const src of sources) {
    if (src && typeof src === "object" && src.id) return src;
  }

  for (const key of ["active_company", "pos_company"]) {
    try {
      const company = JSON.parse(localStorage.getItem(key) || "{}");
      if (company && typeof company === "object" && company.id) return company;
    } catch {}
  }

  return {};
}

export function getCompanyId() {
  const company = getCompanyContext();

  const hashQuery = window.location.hash.split("?")[1] || "";
  const params = new URLSearchParams(hashQuery);

  return Number(
    company?.id ||
    params.get("company_id") ||
    localStorage.getItem("active_company_id") ||
    0
  );
}

export function getAuthToken() {
  return (
    sessionStorage.getItem("fs_user_token") ||
    localStorage.getItem("fs_user_token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("token") ||
    ""
  );
}

export function getPosMode(company = getCompanyContext()) {
  const raw =
    company?.industry_profile?.pos_mode ||
    company?.pos_mode ||
    company?.industry_slug ||
    company?.industry_profile?.key ||
    company?.industry ||
    "";

  const value = String(raw).toLowerCase();

  if (value.includes("restaurant") || value.includes("hospitality")) {
    return "restaurant";
  }

  if (value.includes("club") || value.includes("bar")) {
    return "club";
  }

  if (value.includes("service")) {
    return "service";
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