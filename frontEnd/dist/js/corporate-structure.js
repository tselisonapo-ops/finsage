(function () {
  "use strict";

  const FS = window.FinSage || {};

  const ENDPOINTS =
    FS.ENDPOINTS?.companyStructure
      ? FS.ENDPOINTS
      : window.ENDPOINTS;
  const apiFetch = FS.apiFetch || window.apiFetch;
  const getActiveCompanyId = FS.getActiveCompanyId || window.getActiveCompanyId;
  const resolveCurrency=currency=>
    typeof window.resolveCurrency==="function"
      ?window.resolveCurrency(currency)
      :String(currency||window.CURRENT_CURRENCY||window.CURRENT_COMPANY?.currency||"USD")
        .trim().toUpperCase();

  if (!ENDPOINTS?.companyStructure) {
    console.error("[CorporateStructure] ENDPOINTS.companyStructure unavailable.");
    return;
  }

  if (typeof apiFetch !== "function") {
    console.error("[CorporateStructure] apiFetch unavailable.");
    return;
  }

  const STRUCTURE_TYPES = {
    subsidiary: "subsidiary",
    joint_venture: "joint_venture",
    associate: "associate",
    branch_entity: "branch_entity",
    branch_internal: "branch_internal",
    segment: "segment",
  };

  const state = {
    structure: null,
    candidates: [],
    profile: null,
    settings: {},
    editingRelationshipId: null,
  };

  function getStructureCompanyId() {
    return getActiveCompanyId?.() ||
        window.CURRENT_COMPANY_ID ||
        window.CURRENT_COMPANY?.id ||
        null;
    }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtPct(v) {
    if (v == null || v === "") return "—";
    const n = Number(v);
    return Number.isFinite(n) ? `${n}%` : "—";
  }

  function emptyState(message) {
    return `
      <div class="rounded-lg border border-dashed bg-slate-50 px-3 py-4 text-sm text-slate-500">
        ${esc(message)}
      </div>
    `;
  }

  function formSectionTitle(title, subtitle = "") {
    return `
      <div class="mb-3">
        <h6 class="text-sm font-semibold text-slate-800">${esc(title)}</h6>
        ${subtitle ? `<p class="text-xs text-slate-500 mt-1">${esc(subtitle)}</p>` : ""}
      </div>
    `;
  }

  function renderCompanyLikeFields({ type }) {
    const defaults = getDefaultsForStructureType(type);

    return `
      <input type="hidden" name="relationship_type" value="${esc(defaults.relationship_type || "")}" />
      <input type="hidden" name="entity_kind" value="${esc(defaults.entity_kind || "company")}" />

      ${formSectionTitle(
        defaults.title,
        defaults.subtitle
      )}

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Name</label>
          <input name="name" class="w-full border rounded px-3 py-2 text-sm" required />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Organisation Type</label>
          <select
            name="organizationType"
            class="w-full border rounded px-3 py-2 text-sm bg-white"
            required
          >
            <option value="">Select organisation type</option>
            <option value="private_company">Private Company</option>
            <option value="public_company">Public Company</option>
            <option value="sole_trader">Sole Trader</option>
            <option value="partnership">Partnership</option>
            <option value="trust">Trust</option>
            <option value="npo">NPO</option>
            <option value="ngo">NGO</option>
            <option value="body_corporate">Body Corporate</option>
            <option value="club_association">Club / Association</option>
            <option value="government_entity">Government Entity</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Country</label>
          <input
            name="country"
            class="w-full border rounded px-3 py-2 text-sm"
            placeholder="e.g. ZA"
          />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1" for="csIndustry">Industry (Select COA Template)</label>
          <select
            id="csIndustry"
            name="industry"
            required
            class="w-full border rounded px-3 py-2 text-sm bg-white"
          >
            <option value="" selected disabled>Select your industry</option>
          </select>
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1" for="csSubIndustry">Sub-industry</label>
          <select
            id="csSubIndustry"
            name="subIndustry"
            disabled
            class="w-full border rounded px-3 py-2 text-sm bg-slate-100 disabled:opacity-60"
          >
            <option value="" selected disabled>Select sub-industry...</option>
          </select>
        </div>

        <input
          name="currency"
          value="${esc(resolveCurrency())}"
          class="w-full border rounded px-3 py-2 text-sm uppercase"
          placeholder="e.g. ZAR"
        />

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Financial year start</label>
          <input name="finYearStart" class="w-full border rounded px-3 py-2 text-sm" placeholder="01/01" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Registration number</label>
          <input name="companyRegNo" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Registration date</label>
          <input name="companyRegDate" type="date" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">TIN</label>
          <input name="tin" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">VAT</label>
          <input name="vat" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Company email</label>
          <input name="companyEmail" type="email" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Company phone</label>
          <input name="companyPhone" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div class="md:col-span-2">
          <label class="block text-[11px] text-slate-500 mb-1">Physical address</label>
          <input name="physical_address" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div class="md:col-span-2">
          <label class="block text-[11px] text-slate-500 mb-1">Postal address</label>
          <input name="postal_address" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Ownership %</label>
          <input
            name="ownership_percent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            class="w-full border rounded px-3 py-2 text-sm"
            ${defaults.showOwnership ? "" : "disabled"}
          />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Voting %</label>
          <input
            name="voting_percent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            class="w-full border rounded px-3 py-2 text-sm"
            ${defaults.showOwnership ? "" : "disabled"}
          />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Control basis</label>
          <select name="control_basis" class="w-full border rounded px-3 py-2 text-sm">
            <option value="">Select</option>
            <option value="control" ${defaults.control_basis === "control" ? "selected" : ""}>Control</option>
            <option value="significant_influence" ${defaults.control_basis === "significant_influence" ? "selected" : ""}>Significant influence</option>
            <option value="joint_control" ${defaults.control_basis === "joint_control" ? "selected" : ""}>Joint control</option>
            <option value="direct_branch" ${defaults.control_basis === "direct_branch" ? "selected" : ""}>Direct branch</option>
          </select>
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Consolidation method</label>
          <select name="consolidation_method" class="w-full border rounded px-3 py-2 text-sm">
            <option value="">Select</option>
            <option value="full" ${defaults.consolidation_method === "full" ? "selected" : ""}>Full</option>
            <option value="equity" ${defaults.consolidation_method === "equity" ? "selected" : ""}>Equity</option>
            <option value="proportionate" ${defaults.consolidation_method === "proportionate" ? "selected" : ""}>Proportionate</option>
            <option value="none" ${defaults.consolidation_method === "none" ? "selected" : ""}>None</option>
          </select>
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Effective from</label>
          <input name="effective_from" type="date" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div class="md:col-span-2">
          <label class="block text-[11px] text-slate-500 mb-1">Notes</label>
          <textarea name="notes" class="w-full border rounded px-3 py-2 text-sm min-h-[88px]"></textarea>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-end gap-2">
        <button type="button" id="btnStructureCancel" class="border rounded px-3 py-2 text-sm bg-white hover:bg-slate-50">
          Clear
        </button>
        <button type="submit" class="rounded px-3 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800">
          Save
        </button>
      </div>
    `;
  }

  function renderInternalBranchFields() {
    return `
      ${formSectionTitle(
        "Add Internal Branch",
        "Use this for a branch that is not a separate legal entity."
      )}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Branch name</label>
          <input name="name" class="w-full border rounded px-3 py-2 text-sm" required />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Code</label>
          <input name="code" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Country</label>
          <input name="country" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Phone</label>
          <input name="phone" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Email</label>
          <input name="email" type="email" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Manager user ID</label>
          <input name="manager_user_id" type="number" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div class="md:col-span-2">
          <label class="block text-[11px] text-slate-500 mb-1">Address</label>
          <input name="address" class="w-full border rounded px-3 py-2 text-sm" />
        </div>
      </div>

      <div class="mt-4 flex items-center justify-end gap-2">
        <button type="button" id="btnStructureCancel" class="border rounded px-3 py-2 text-sm bg-white hover:bg-slate-50">
          Clear
        </button>
        <button type="submit" class="rounded px-3 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800">
          Save
        </button>
      </div>
    `;
  }

  function renderSegmentFields() {
    return `
      ${formSectionTitle(
        "Add Segment",
        "Use this for operating, geographical, product, customer, or other reporting segments."
      )}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Segment name</label>
          <input name="name" class="w-full border rounded px-3 py-2 text-sm" required />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Code</label>
          <input name="code" class="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Segment type</label>
          <select name="segment_type" class="w-full border rounded px-3 py-2 text-sm">
            <option value="operating">Operating</option>
            <option value="geographical">Geographical</option>
            <option value="product">Product</option>
            <option value="customer">Customer</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div class="md:col-span-2">
          <label class="block text-[11px] text-slate-500 mb-1">Description</label>
          <textarea name="description" class="w-full border rounded px-3 py-2 text-sm min-h-[88px]"></textarea>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-end gap-2">
        <button type="button" id="btnStructureCancel" class="border rounded px-3 py-2 text-sm bg-white hover:bg-slate-50">
          Clear
        </button>
        <button type="submit" class="rounded px-3 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800">
          Save
        </button>
      </div>
    `;
  }

const INDUSTRY_CATALOG = {
  "Agriculture": [
    "Crop Farming",
    "Livestock Farming",
    "Mixed Farming",
    "Dairy Farming",
    "Poultry Farming",
    "Horticulture",
    "Fruit Farming",
    "Forestry & Plantations",
    "Aquaculture",
    "Beekeeping",
    "Game & Wildlife Farming",
    "Agricultural Support Services"
  ],

  "Automotive Services": [
    "Auto Repair Workshop",
    "Auto Electrical",
    "Tyre & Fitment",
    "Panel Beating",
    "Spray Painting",
    "Parts & Spares"
  ],

  "Body Corporate": [],

  "Call Center": [],

  "Car Dealership": [
    "New Vehicles",
    "Used Vehicles",
    "Motorcycle Dealership"
  ],

  "Construction": [
    "Residential Building Contractor",
    "Civil Engineering",
    "Electrical & Mechanical",
    "Plumbing & Drainage",
    "Roadworks"
  ],

  "Engineering & Technical": [
    "Mechanical Engineering",
    "Electrical Engineering",
    "Industrial Engineering",
    "Technical Services"
  ],

  "Hospitality": [
    "Hotel",
    "Events & Catering",
    "Guest House / Lodge"
  ],

  "IT & Technology": [
    "Software Development",
    "Managed IT Services",
    "Networking & Infrastructure",
    "Cybersecurity"
  ],

  "Logistics & Transport": [
    "Freight / Logistics",
    "Courier / Last Mile",
    "Public Transport",
    "Fleet Services"
  ],

  "Management Services": [],

  "Manufacturing": [
    "Light Manufacturing",
    "Fabrication",
    "Food Processing"
  ],

  "Mining": [
    "Open-Pit Mining",
    "Underground Mining",
    "Quarrying & Aggregates",
    "Coal Mining",
    "Gold & PGM Mining"
  ],

  "NPO Education": [
    "Primary Education",
    "Higher Education"
  ],

  "Private School": [],

  "NPO Healthcare": [
    "Clinic",
    "Hospital"
  ],

  "NPO IT": [],

  "NPO Transport": [
    "Fleet Services",
    "Public Transport"
  ],

  "Private Healthcare": [
    "GP Clinic",
    "Specialist Practice",
    "Dentistry"
  ],

  "Professional Services": [
    "Auditing & Accounting",
    "Architecture",
    "Legal Services",
    "Engineering Consulting",
    "HR & Recruitment",
    "Business Consulting"
  ],

  "Property Management": [],

  "Restaurant": [
    "Fast Food",
    "Casual Dining",
    "Fine Dining"
  ],

  "Retail & Wholesale": [
    "Wholesale",
    "E-commerce Retail",
    "Brick & Mortar Retail"
  ],

  "Security Services": [
    "Guarding",
    "Alarm Monitoring",
    "Technical Security Systems"
  ],

  "Design & Creative Services": [
    "Interior Design",
    "Architecture",
    "Graphic Design",
    "Advertising Agency",
    "Creative Studio",
    "Landscape Design"
  ],

  "Personal Care & Beauty Services": [
    "Hair Salon",
    "Barber Shop",
    "Nail Salon",
    "Beauty Spa",
    "Makeup Artist",
    "Wellness & Massage",
    "Tattoo Studio"
  ],

  "Health & Fitness": [
    "Gym",
    "Personal Trainer",
    "Fitness Studio",
    "CrossFit Box",
    "Sports Academy"
  ],

  "Education & Training": [
    "Training Provider",
    "Skills Development",
    "Driving School",
    "Tutoring Services",
    "Corporate Training"
  ],

  "Cleaning Services": [
    "Residential Cleaning",
    "Commercial Cleaning",
    "Industrial Cleaning",
    "Pest Control"
  ],

  "Media & Entertainment": [
    "Content Creator",
    "Podcast Studio",
    "Photography",
    "Videography",
    "Film Production",
    "Music Production"
  ],

  "Telecommunications": [
    "Internet Service Provider",
    "Mobile Network Operator",
    "Pay TV Operator"
  ],

  "Transport": [
    "Courier / Last Mile",
    "Freight / Logistics",
    "Public Transport"
  ],

  "Clubs & Associations": [
    "Sports Club",
    "Social Club",
    "Professional Association",
    "Recreational Association"
  ]
};

  function getSortedIndustries() {
    return Object.keys(INDUSTRY_CATALOG).sort((a, b) => a.localeCompare(b));
  }

  function populateCorporateIndustrySelect(selectedIndustry = "") {
    const industrySel = document.getElementById("csIndustry");
    const subSel = document.getElementById("csSubIndustry");
    if (!industrySel) return;

    const industries = getSortedIndustries();

    industrySel.innerHTML = `
      <option value="" disabled ${selectedIndustry ? "" : "selected"}>Select your industry</option>
      ${industries.map(ind => `
        <option value="${esc(ind)}" ${selectedIndustry === ind ? "selected" : ""}>${esc(ind)}</option>
      `).join("")}
    `;

    populateCorporateSubIndustrySelect(selectedIndustry, "");
  }

  function populateCorporateSubIndustrySelect(industry, selectedSubIndustry = "") {
    const subSel = document.getElementById("csSubIndustry");
    if (!subSel) return;

    const subs = Array.isArray(INDUSTRY_CATALOG[industry]) ? INDUSTRY_CATALOG[industry] : [];

    if (!industry) {
      subSel.innerHTML = `<option value="" selected disabled>Select sub-industry...</option>`;
      subSel.disabled = true;
      subSel.classList.add("bg-slate-100");
      return;
    }

    if (!subs.length) {
      subSel.innerHTML = `<option value="" selected>No sub-industry required</option>`;
      subSel.disabled = true;
      subSel.classList.add("bg-slate-100");
      return;
    }

    subSel.disabled = false;
    subSel.classList.remove("bg-slate-100");

    subSel.innerHTML = `
      <option value="" disabled ${selectedSubIndustry ? "" : "selected"}>Select sub-industry...</option>
      ${subs.map(sub => `
        <option value="${esc(sub)}" ${selectedSubIndustry === sub ? "selected" : ""}>${esc(sub)}</option>
      `).join("")}
    `;
  }

  function bindCorporateIndustryCascade() {
    const industrySel = document.getElementById("csIndustry");
    const subSel = document.getElementById("csSubIndustry");
    if (!industrySel || !subSel) return;

    populateCorporateIndustrySelect(industrySel.value || "");

    industrySel.addEventListener("change", () => {
      populateCorporateSubIndustrySelect(industrySel.value, "");
    });
  }

  function getDefaultsForStructureType(type) {
    switch (type) {
      case STRUCTURE_TYPES.subsidiary:
        return {
          title: "Add Subsidiary",
          subtitle: "Create a related legal entity and link it as a subsidiary.",
          relationship_type: "subsidiary",
          entity_kind: "company",
          organizationType: "private_company",
          control_basis: "control",
          consolidation_method: "full",
          showOwnership: true,
        };

      case STRUCTURE_TYPES.joint_venture:
        return {
          title: "Add Joint Venture",
          subtitle: "Create a related legal entity and link it as a joint venture.",
          relationship_type: "joint_venture",
          entity_kind: "company",
          organizationType: "private_company",
          control_basis: "joint_control",
          consolidation_method: "equity",
          showOwnership: true,
        };

      case STRUCTURE_TYPES.associate:
        return {
          title: "Add Associate",
          subtitle: "Create a related legal entity and link it as an associate.",
          relationship_type: "associate",
          entity_kind: "company",
          organizationType: "private_company",
          control_basis: "significant_influence",
          consolidation_method: "equity",
          showOwnership: true,
        };

      case STRUCTURE_TYPES.branch_entity:
        return {
          title: "Add Registered Branch",
          subtitle: "Use this where the branch has its own legal or tax identity.",
          relationship_type: "branch",
          entity_kind: "branch_entity",
          organizationType: "private_company",
          control_basis: "direct_branch",
          consolidation_method: "full",
          showOwnership: false,
        };

      default:
        return {
          title: "Add Entity",
          subtitle: "",
          relationship_type: "subsidiary",
          entity_kind: "company",
          organizationType: "private_company",
          control_basis: "",
          consolidation_method: "",
          showOwnership: true,
        };
    }
  }

  async function loadGroupReportingProfile(companyId) {
    if (!companyId) return;

    try {
      const res = await apiFetch(
        ENDPOINTS.companyStructure.profile(companyId),
        { method: "GET" }
      );

      state.profile = res?.profile || null;
      renderGroupReportingProfile(state.profile);
    } catch (e) {
      console.error("[CorporateStructure] profile load failed:", e);
      state.profile = null;
      renderGroupReportingProfile(null);
    }
  }

  function renderGroupReportingProfile(profile) {
    const form = document.getElementById("groupReportingProfileForm");
    const status = document.getElementById("groupProfileStatus");
    if (!form) return;

    const company = state.structure?.company || {};
    const p = profile || {};

    form.elements.profile_name.value =
      p.profile_name || `${company.name || ""} Group`;

    form.elements.group_name.value =
      p.group_name || company.name || "";

    form.elements.reporting_currency.value =
      p.reporting_currency ||
      p.group_reporting_currency ||
      company.currency ||
      "";

    form.elements.financial_year_end_month.value =
      p.financial_year_end_month ||
      company.financial_year_end_month ||
      "";

    form.elements.financial_year_end_day.value =
      p.financial_year_end_day ||
      company.financial_year_end_day ||
      "";

    form.elements.default_consolidation_method.value =
      p.default_consolidation_method || "";

    form.elements.enable_intercompany.checked =
      p.enable_intercompany !== false;

    form.elements.enable_fx_translation.checked =
      p.enable_fx_translation !== false;

    form.elements.enable_nci.checked =
      p.enable_nci !== false;

    form.elements.enable_equity_method.checked =
      p.enable_equity_method !== false;

    form.elements.enable_segment_reporting.checked =
      p.enable_segment_reporting === true;

    if (status) {
      status.textContent = profile ? "Configured" : "Not configured";
      status.className = profile
        ? "text-[11px] rounded bg-emerald-50 px-2 py-1 text-emerald-700"
        : "text-[11px] rounded bg-slate-100 px-2 py-1 text-slate-600";
    }
  }

  function bindGroupReportingProfileForm() {
    const form = document.getElementById("groupReportingProfileForm");
    if (!form || form.dataset.bound === "1") return;

    form.dataset.bound = "1";

    form.addEventListener("submit", async e => {
      e.preventDefault();

      const companyId = getStructureCompanyId();
      if (!companyId) return;

      const fd = new FormData(form);

      const payload = {
        profile_name: String(fd.get("profile_name") || "").trim(),
        group_name: String(fd.get("group_name") || "").trim(),
        reporting_currency: String(fd.get("reporting_currency") || "").trim().toUpperCase(),
        default_consolidation_method:
          String(fd.get("default_consolidation_method") || "").trim() || null,

        financial_year_end_month:
          fd.get("financial_year_end_month")
            ? Number(fd.get("financial_year_end_month"))
            : null,

        financial_year_end_day:
          fd.get("financial_year_end_day")
            ? Number(fd.get("financial_year_end_day"))
            : null,

        enable_intercompany: form.elements.enable_intercompany.checked,
        enable_fx_translation: form.elements.enable_fx_translation.checked,
        enable_nci: form.elements.enable_nci.checked,
        enable_equity_method: form.elements.enable_equity_method.checked,
        enable_segment_reporting: form.elements.enable_segment_reporting.checked,
      };

      if (!payload.reporting_currency) {
        alert("Reporting currency is required.");
        return;
      }

      try {
        const res = await apiFetch(
          ENDPOINTS.companyStructure.profile(companyId),
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );

        state.profile = res?.profile || null;
        renderGroupReportingProfile(state.profile);
        alert(res?.message || "Group reporting profile saved.");
      } catch (e) {
        console.error("[CorporateStructure] profile save failed:", e);
        alert(e?.message || "Failed to save group reporting profile.");
      }
    });
  }

  async function loadRelationshipCandidates(companyId) {
    if (!companyId) return [];

    try {
      const res = await apiFetch(
        ENDPOINTS.companyStructure.candidates(companyId),
        { method: "GET" }
      );

      state.candidates = res?.items || [];
    } catch (e) {
      console.error("[CorporateStructure] candidates load failed:", e);
      state.candidates = [];
    }

    return state.candidates;
  }

  function renderLinkExistingFields(type) {
    const defaults = getDefaultsForStructureType(type);

    return `
      ${formSectionTitle(
        `Link Existing ${defaults.title.replace("Add ", "")}`,
        "Link an existing FinSage company without creating another company record."
      )}

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-2">
          <label class="block text-[11px] text-slate-500 mb-1">Existing company</label>

          <select
            name="child_company_id"
            class="w-full border rounded px-3 py-2 text-sm bg-white"
            required
          >
            <option value="">Select company...</option>

            ${state.candidates.map(c => `
              <option value="${esc(c.id)}">
                ${esc(c.name)}
                ${c.system_company_code ? ` · ${esc(c.system_company_code)}` : ""}
              </option>
            `).join("")}
          </select>
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Relationship</label>

          <input
            value="${esc((defaults.relationship_type || "").replaceAll("_", " "))}"
            class="w-full border rounded px-3 py-2 text-sm bg-slate-50"
            disabled
          />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Ownership %</label>
          <input
            name="ownership_percent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            class="w-full border rounded px-3 py-2 text-sm"
            ${defaults.showOwnership ? "" : "disabled"}
          />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Voting %</label>
          <input
            name="voting_percent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            class="w-full border rounded px-3 py-2 text-sm"
            ${defaults.showOwnership ? "" : "disabled"}
          />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Effective from</label>
          <input
            name="effective_from"
            type="date"
            class="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Acquisition date</label>
          <input
            name="acquisition_date"
            type="date"
            class="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Control basis</label>

          <select name="control_basis" class="w-full border rounded px-3 py-2 text-sm">
            <option value="control" ${defaults.control_basis === "control" ? "selected" : ""}>
              Control
            </option>
            <option value="significant_influence" ${defaults.control_basis === "significant_influence" ? "selected" : ""}>
              Significant influence
            </option>
            <option value="joint_control" ${defaults.control_basis === "joint_control" ? "selected" : ""}>
              Joint control
            </option>
            <option value="direct_branch" ${defaults.control_basis === "direct_branch" ? "selected" : ""}>
              Direct branch
            </option>
          </select>
        </div>

        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Consolidation method</label>

          <select name="consolidation_method" class="w-full border rounded px-3 py-2 text-sm">
            <option value="full" ${defaults.consolidation_method === "full" ? "selected" : ""}>Full</option>
            <option value="equity" ${defaults.consolidation_method === "equity" ? "selected" : ""}>Equity</option>
            <option value="proportionate" ${defaults.consolidation_method === "proportionate" ? "selected" : ""}>Proportionate</option>
            <option value="none" ${defaults.consolidation_method === "none" ? "selected" : ""}>None</option>
          </select>
        </div>

        <div class="flex items-end">
          <label class="flex items-center gap-2 text-sm pb-2">
            <input
              name="include_in_group_reporting"
              type="checkbox"
              checked
            />
            Include in group reporting
          </label>
        </div>

        <div class="md:col-span-3">
          <label class="block text-[11px] text-slate-500 mb-1">Notes</label>
          <textarea
            name="notes"
            class="w-full border rounded px-3 py-2 text-sm min-h-[72px]"
          ></textarea>
        </div>
      </div>

      <input
        type="hidden"
        name="relationship_type"
        value="${esc(defaults.relationship_type)}"
      />

      <div class="mt-4 flex justify-end">
        <button
          type="submit"
          class="rounded px-3 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800"
        >
          Link company
        </button>
      </div>
    `;
  }

  async function renderCorporateStructureForm(type) {
    const host = document.getElementById("corporateStructureFormHost");
    if (!host) return;

    const action =
      document.getElementById("corporateStructureAction")?.value || "create";

    const legalEntity =
      type === STRUCTURE_TYPES.subsidiary ||
      type === STRUCTURE_TYPES.joint_venture ||
      type === STRUCTURE_TYPES.associate ||
      type === STRUCTURE_TYPES.branch_entity;

    if (legalEntity && action === "link") {
      const cid = getStructureCompanyId();
      await loadRelationshipCandidates(cid);

      host.innerHTML = `
        <form
          id="corporateStructureDynamicForm"
          data-form-kind="link-company"
        >
          ${renderLinkExistingFields(type)}
        </form>
      `;

      bindCorporateStructureDynamicForm();
      return;
    }

    if (legalEntity) {
      host.innerHTML = `
        <form
          id="corporateStructureDynamicForm"
          data-form-kind="related-company"
          class="space-y-0"
        >
          ${renderCompanyLikeFields({ type })}
        </form>
      `;

      bindCorporateStructureDynamicForm();
      return;
    }

    if (type === STRUCTURE_TYPES.branch_internal) {
      host.innerHTML = `
        <form
          id="corporateStructureDynamicForm"
          data-form-kind="internal-branch"
        >
          ${renderInternalBranchFields()}
        </form>
      `;

      bindCorporateStructureDynamicForm();
      return;
    }

    if (type === STRUCTURE_TYPES.segment) {
      host.innerHTML = `
        <form
          id="corporateStructureDynamicForm"
          data-form-kind="segment"
        >
          ${renderSegmentFields()}
        </form>
      `;

      bindCorporateStructureDynamicForm();
      return;
    }

    host.innerHTML = emptyState("Select a structure item type to continue.");
  }

  async function submitLinkCompanyForm(form) {
    const companyId = getStructureCompanyId();
    if (!companyId) return;

    const payload = collectFormPayload(form);

    payload.include_in_group_reporting =
      form.elements.include_in_group_reporting?.checked !== false;

    if (!payload.child_company_id) {
      alert("Select a company to link.");
      return;
    }

    payload.child_company_id = Number(payload.child_company_id);

    try {
      const res = await apiFetch(
        ENDPOINTS.companyStructure.relationships(companyId),
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      alert(res?.message || "Company linked.");

      await loadCorporateStructure(companyId);
      closeCorporateStructurePanel();
      await renderCorporateStructureForm(
        document.getElementById("relatedCompanyType")?.value ||
        STRUCTURE_TYPES.subsidiary
      );
    } catch (e) {
      console.error("[CorporateStructure] link company failed:", e);
      alert(e?.message || "Failed to link company.");
    }
  }

  function bindCorporateStructureDynamicForm() {
    const form = document.getElementById("corporateStructureDynamicForm");
    if (!form) return;

    const cancelBtn = document.getElementById("btnStructureCancel");
    cancelBtn?.addEventListener("click", () => {
        form.reset();
        applyCorporateStructureFormDefaults();
        closeCorporateStructurePanel();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const kind = form.dataset.formKind || "";
      if (kind === "related-company") {
        await submitRelatedCompanyForm(form);
        return;
      }
      if (kind === "internal-branch") {
        await submitInternalBranchForm(form);
        return;
      }
      if (kind === "link-company") {
        await submitLinkCompanyForm(form);
        return;
      }
      if (kind === "segment") {
        await submitSegmentForm(form);
      }
    });

    applyCorporateStructureFormDefaults();

    if (form.dataset.formKind === "related-company") {
      bindCorporateIndustryCascade();
    }
  }

  function applyCorporateStructureFormDefaults() {
    const type = document.getElementById("relatedCompanyType")?.value || STRUCTURE_TYPES.subsidiary;
    const form = document.getElementById("corporateStructureDynamicForm");
    if (!form) return;

    if (form.dataset.formKind !== "related-company") return;

    const defaults = getDefaultsForStructureType(type);

    const control = form.querySelector('[name="control_basis"]');
    const method = form.querySelector('[name="consolidation_method"]');
    const rel = form.querySelector('[name="relationship_type"]');
    const entityKind = form.querySelector('[name="entity_kind"]');
    const own = form.querySelector('[name="ownership_percent"]');
    const vote = form.querySelector('[name="voting_percent"]');
    const orgType = form.querySelector('[name="organizationType"]');

    if (orgType && !orgType.value) {
      orgType.value = defaults.organizationType || "private_company";
    }
    if (control) control.value = defaults.control_basis || "";
    if (method) method.value = defaults.consolidation_method || "";
    if (rel) rel.value = defaults.relationship_type || "";
    if (entityKind) entityKind.value = defaults.entity_kind || "company";

    if (own) {
      own.disabled = !defaults.showOwnership;
      if (!defaults.showOwnership) own.value = "";
    }
    if (vote) {
      vote.disabled = !defaults.showOwnership;
      if (!defaults.showOwnership) vote.value = "";
    }
  }

  function collectFormPayload(form) {
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());

    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === "string") payload[k] = v.trim();
    }

    const numericKeys = ["ownership_percent", "voting_percent", "manager_user_id"];
    for (const key of numericKeys) {
      if (!(key in payload)) continue;
      if (payload[key] === "") payload[key] = null;
      else {
        const n = Number(payload[key]);
        payload[key] = Number.isFinite(n) ? n : null;
      }
    }

    if (payload.subIndustry === "" || payload.subIndustry === "No sub-industry required") {
      payload.subIndustry = null;
    }

    return payload;
  }

  async function submitRelatedCompanyForm(form) {
    const companyId = getStructureCompanyId();
    if (!companyId) {
      alert("No active company selected.");
      return;
    }

    const payload = collectFormPayload(form);

    console.log(
      "[CorporateStructure] payload",
      JSON.stringify(payload, null, 2)
    );

    if (!payload.name) {
      alert("Name is required.");
      return;
    }
    if (!payload.organizationType) {
      alert("Organisation type is required.");
      return;
    }
    if (!payload.industry) {
      alert("Industry is required.");
      return;
    }

    try {
      const res = await apiFetch(
        ENDPOINTS.companyStructure.relatedCompanies(companyId),
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      alert(res?.message || "Related company created.");
      form.reset();
      applyCorporateStructureFormDefaults();
      await loadCorporateStructure(companyId);
    } catch (e) {
      console.error("[CorporateStructure] related company create failed:", e);
      alert(e?.message || "Failed to create related company.");
    }
  }

  async function submitInternalBranchForm(form) {
    const companyId = getStructureCompanyId();
    if (!companyId) {
      alert("No active company selected.");
      return;
    }

    const payload = collectFormPayload(form);
    if (!payload.name) {
      alert("Branch name is required.");
      return;
    }

    try {
      const res = await apiFetch(
        ENDPOINTS.companyStructure.branches(companyId),
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      alert(res?.message || "Internal branch created.");
      form.reset();
      await loadCorporateStructure(companyId);
    } catch (e) {
      console.error("[CorporateStructure] branch create failed:", e);
      alert(e?.message || "Failed to create internal branch.");
    }
  }

  async function submitSegmentForm(form) {
    const companyId = getStructureCompanyId();
    if (!companyId) {
      alert("No active company selected.");
      return;
    }

    const payload = collectFormPayload(form);
    if (!payload.name) {
      alert("Segment name is required.");
      return;
    }

    try {
      const res = await apiFetch(
        ENDPOINTS.companyStructure.segments(companyId),
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      alert(res?.message || "Segment created.");
      form.reset();
      await loadCorporateStructure(companyId);
    } catch (e) {
      console.error("[CorporateStructure] segment create failed:", e);
      alert(e?.message || "Failed to create segment.");
    }
  }

  function renderRelatedCompaniesList(items=[]){
    const host=document.getElementById("relatedCompaniesList");
    const count=document.getElementById("relatedEntitiesCount");
    if(!host)return;

    count&&(count.textContent=`${items.length} member${items.length===1?"":"s"}`);

    if(!items.length){
      host.innerHTML=emptyState("No group members have been added yet.");
      return;
    }

    host.innerHTML=items.map(r=>{
      const relation=String(r.relationship_type||"entity").replaceAll("_"," ");
      const childName=r.child_company_name||r.name||`Company #${r.child_company_id||""}`;
      const code=r.system_company_code||"—";
      const country=r.country||"—";
      const currency=resolveCurrency(r.currency);
      const entityKind=String(r.entity_kind||"company").replaceAll("_"," ");
      const method=String(r.consolidation_method||"—").replaceAll("_"," ");
      const control=String(r.control_basis||"—").replaceAll("_"," ");
      const included=r.include_in_group_reporting!==false;

      return `
        <div class="group-member-card rounded-xl border bg-white p-4">
          <div class="grid grid-cols-1 xl:grid-cols-[minmax(280px,1.4fr)_minmax(520px,2.4fr)_minmax(190px,.8fr)] gap-5">

            <!-- ENTITY -->
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-semibold text-slate-900">
                  ${esc(childName)}
                </span>

                <span class="text-[10px] uppercase tracking-wide rounded bg-slate-100 text-slate-600 px-2 py-1">
                  ${esc(relation)}
                </span>

                <span class="text-[10px] uppercase tracking-wide rounded bg-slate-100 text-slate-600 px-2 py-1">
                  ${esc(entityKind)}
                </span>
              </div>

              <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span class="text-slate-400">Company code</span>
                  <div class="font-medium text-slate-700">${esc(code)}</div>
                </div>

                <div>
                  <span class="text-slate-400">Currency</span>
                  <div class="font-medium text-slate-700">${esc(currency)}</div>
                </div>

                <div>
                  <span class="text-slate-400">Country</span>
                  <div class="font-medium text-slate-700">${esc(country)}</div>
                </div>

                <div>
                  <span class="text-slate-400">Relationship</span>
                  <div class="font-medium text-slate-700">${esc(relation)}</div>
                </div>
              </div>

              ${r.notes?`
                <div class="mt-3 text-xs text-slate-500 leading-relaxed">
                  ${esc(r.notes)}
                </div>
              `:""}
            </div>

            <!-- CONSOLIDATION DETAILS -->
            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
              <div class="group-member-stat">
                <span>Ownership</span>
                <strong>${fmtPct(r.ownership_percent)}</strong>
              </div>

              <div class="group-member-stat">
                <span>Voting</span>
                <strong>${fmtPct(r.voting_percent)}</strong>
              </div>

              <div class="group-member-stat">
                <span>NCI</span>
                <strong>${fmtPct(r.nci_percent)}</strong>
              </div>

              <div class="group-member-stat">
                <span>Control basis</span>
                <strong>${esc(control)}</strong>
              </div>

              <div class="group-member-stat">
                <span>Method</span>
                <strong>${esc(method)}</strong>
              </div>

              <div class="group-member-stat">
                <span>Group reporting</span>
                <strong class="${included?"text-emerald-700":"text-slate-500"}">
                  ${included?"Included":"Excluded"}
                </strong>
              </div>
            </div>

            <!-- STATUS / ACTIONS -->
            <div class="flex xl:flex-col justify-between xl:items-end gap-3">
              <div class="text-xs xl:text-right">
                ${r.effective_from?`
                  <div class="mb-2">
                    <div class="text-slate-400">Effective from</div>
                    <div class="font-medium text-slate-700">
                      ${esc(r.effective_from)}
                    </div>
                  </div>
                `:""}

                ${r.acquisition_date?`
                  <div>
                    <div class="text-slate-400">Acquisition date</div>
                    <div class="font-medium text-slate-700">
                      ${esc(r.acquisition_date)}
                    </div>
                  </div>
                `:""}
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-cs-edit="${esc(r.id)}"
                  class="border rounded-lg px-3 py-1.5 text-xs bg-white hover:bg-slate-50"
                >
                  Edit
                </button>

                <button
                  type="button"
                  data-cs-deactivate="${esc(r.id)}"
                  class="border rounded-lg px-3 py-1.5 text-xs bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                >
                  Remove
                </button>
              </div>
            </div>

          </div>
        </div>
      `;
    }).join("");

    bindRelationshipActions();
  }

  function renderBranchesList(items = []) {
    const host = document.getElementById("companyBranchesList");
    const count = document.getElementById("branchCount");
    if (!host) return;

    count && (count.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`);

    if (!items.length) {
      host.innerHTML = emptyState("No internal branches added.");
      return;
    }

    host.innerHTML = items.map((b) => `
      <div class="rounded-lg border bg-white px-3 py-3">
        <div class="text-sm font-semibold text-slate-800">${esc(b.name)}</div>
        <div class="mt-1 text-xs text-slate-500">
          ${b.code ? `${esc(b.code)} · ` : ""}${esc(b.country || "—")}
        </div>
        <div class="mt-2 text-xs text-slate-600">
          ${esc(b.address || "No address")}
        </div>
        <div class="mt-1 text-xs text-slate-500">
          ${esc(b.email || "—")} ${b.phone ? `· ${esc(b.phone)}` : ""}
        </div>
      </div>
    `).join("");
  }

  function renderSegmentsList(items = []) {
    const host = document.getElementById("companySegmentsList");
    const count = document.getElementById("segmentCount");
    if (!host) return;

    count && (count.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`);

    if (!items.length) {
      host.innerHTML = emptyState("No segments added.");
      return;
    }

    host.innerHTML = items.map((s) => `
      <div class="rounded-lg border bg-white px-3 py-3">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold text-slate-800">${esc(s.name)}</span>
          <span class="text-[10px] uppercase tracking-wide rounded bg-slate-100 text-slate-600 px-2 py-0.5">
            ${esc(s.segment_type || "other")}
          </span>
        </div>
        <div class="mt-1 text-xs text-slate-500">
          ${s.code ? `Code: ${esc(s.code)}` : "No code"}
        </div>
        ${s.description ? `<div class="mt-2 text-xs text-slate-600">${esc(s.description)}</div>` : ""}
      </div>
    `).join("");
  }

  function closeRelationshipModal() {
    document.getElementById("csRelationshipModal")?.remove();
  }

  function openRelationshipModal(r) {
    closeRelationshipModal();

    document.body.insertAdjacentHTML("beforeend", `
      <div
        id="csRelationshipModal"
        class="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      >
        <div class="w-full max-w-2xl rounded-xl bg-white shadow-xl p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h4 class="font-semibold text-slate-800">
                Edit relationship
              </h4>
              <p class="text-xs text-slate-500 mt-1">
                ${esc(r.child_company_name || "")}
              </p>
            </div>

            <button
              type="button"
              data-cs-modal-close
              class="border rounded px-3 py-1.5 text-xs"
            >
              Close
            </button>
          </div>

          <form id="csRelationshipEditForm" class="mt-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Ownership %</label>
                <input
                  name="ownership_percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value="${esc(r.ownership_percent ?? "")}"
                  class="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Voting %</label>
                <input
                  name="voting_percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value="${esc(r.voting_percent ?? "")}"
                  class="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Effective interest %</label>
                <input
                  name="effective_interest_percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value="${esc(r.effective_interest_percent ?? "")}"
                  class="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Control basis</label>
                <select name="control_basis" class="w-full border rounded px-3 py-2 text-sm">
                  <option value="control" ${r.control_basis === "control" ? "selected" : ""}>Control</option>
                  <option value="significant_influence" ${r.control_basis === "significant_influence" ? "selected" : ""}>Significant influence</option>
                  <option value="joint_control" ${r.control_basis === "joint_control" ? "selected" : ""}>Joint control</option>
                  <option value="direct_branch" ${r.control_basis === "direct_branch" ? "selected" : ""}>Direct branch</option>
                </select>
              </div>

              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Method</label>
                <select name="consolidation_method" class="w-full border rounded px-3 py-2 text-sm">
                  <option value="full" ${r.consolidation_method === "full" ? "selected" : ""}>Full</option>
                  <option value="equity" ${r.consolidation_method === "equity" ? "selected" : ""}>Equity</option>
                  <option value="proportionate" ${r.consolidation_method === "proportionate" ? "selected" : ""}>Proportionate</option>
                  <option value="none" ${r.consolidation_method === "none" ? "selected" : ""}>None</option>
                </select>
              </div>

              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Effective from</label>
                <input
                  name="effective_from"
                  type="date"
                  value="${esc(r.effective_from || "")}"
                  class="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Acquisition date</label>
                <input
                  name="acquisition_date"
                  type="date"
                  value="${esc(r.acquisition_date || "")}"
                  class="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Functional currency</label>
                <input
                  name="functional_currency"
                  value="${esc(r.functional_currency || "")}"
                  class="w-full border rounded px-3 py-2 text-sm uppercase"
                />
              </div>

              <div class="flex items-end">
                <label class="flex items-center gap-2 pb-2 text-sm">
                  <input
                    name="include_in_group_reporting"
                    type="checkbox"
                    ${r.include_in_group_reporting === false ? "" : "checked"}
                  />
                  Include in group reporting
                </label>
              </div>

              <div class="md:col-span-3">
                <label class="block text-[11px] text-slate-500 mb-1">Notes</label>
                <textarea
                  name="notes"
                  class="w-full border rounded px-3 py-2 text-sm min-h-[72px]"
                >${esc(r.notes || "")}</textarea>
              </div>
            </div>

            <div class="mt-4 flex justify-end">
              <button
                type="submit"
                class="rounded px-3 py-2 text-sm bg-slate-900 text-white"
              >
                Save changes
              </button>
            </div>
          </form>
        </div>
      </div>
    `);

    document
      .querySelector("[data-cs-modal-close]")
      ?.addEventListener("click", closeRelationshipModal);

    document
      .getElementById("csRelationshipEditForm")
      ?.addEventListener("submit", async e => {
        e.preventDefault();

        const form = e.currentTarget;
        const companyId = getStructureCompanyId();

        const payload = collectFormPayload(form);

        payload.include_in_group_reporting =
          form.elements.include_in_group_reporting.checked;

        try {
          const res = await apiFetch(
            ENDPOINTS.companyStructure.relationship(companyId, r.id),
            {
              method: "PATCH",
              body: JSON.stringify(payload),
            }
          );

          alert(res?.message || "Relationship updated.");
          closeRelationshipModal();
          await loadCorporateStructure(companyId);
        } catch (err) {
          console.error("[CorporateStructure] relationship update failed:", err);
          alert(err?.message || "Failed to update relationship.");
        }
      });
  }

  function bindRelationshipActions() {
    document.querySelectorAll("[data-cs-edit]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const companyId = getStructureCompanyId();
        const relationshipId = Number(btn.dataset.csEdit || 0);
        if (!companyId || !relationshipId) return;

        try {
          const res = await apiFetch(
            ENDPOINTS.companyStructure.relationship(companyId, relationshipId),
            { method: "GET" }
          );

          if (res?.relationship)
            openRelationshipModal(res.relationship);
        } catch (e) {
          console.error("[CorporateStructure] relationship load failed:", e);
          alert(e?.message || "Failed to load relationship.");
        }
      });
    });

    document.querySelectorAll("[data-cs-deactivate]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const companyId = getStructureCompanyId();
        const relationshipId = Number(btn.dataset.csDeactivate || 0);

        if (!confirm("Remove this entity from the active corporate structure?"))
          return;

        try {
          const res = await apiFetch(
            ENDPOINTS.companyStructure.relationship(companyId, relationshipId),
            {
              method: "DELETE",
              body: JSON.stringify({}),
            }
          );

          alert(res?.message || "Relationship removed.");
          await loadCorporateStructure(companyId);
        } catch (e) {
          console.error("[CorporateStructure] relationship deactivate failed:", e);
          alert(e?.message || "Failed to remove relationship.");
        }
      });
    });
  }

  async function loadCorporateStructure(companyId) {
    const cid = companyId || getStructureCompanyId();
    if (!cid) return;

    try {
      const data = await apiFetch(
        ENDPOINTS.companyStructure.get(cid),
        { method: "GET" }
      );

      state.structure = data || null;

      renderRelatedCompaniesList(data?.relationships || []);
      renderBranchesList(data?.branches || []);
      renderSegmentsList(data?.segments || []);

      await loadGroupReportingProfile(cid);
    } catch (e) {
      console.error("[CorporateStructure] load failed:", e);

      state.structure = null;

      renderRelatedCompaniesList([]);
      renderBranchesList([]);
      renderSegmentsList([]);
      renderGroupReportingProfile(null);
    }
  }

  function openCorporateStructurePanel(){
    document
      .getElementById("corporateStructureEntryPanel")
      ?.classList.remove("hidden");
  }

  function closeCorporateStructurePanel(){
    document
      .getElementById("corporateStructureEntryPanel")
      ?.classList.add("hidden");
  }

  function bindCorporateStructureScreen() {
    const typeSel = document.getElementById("relatedCompanyType");
    const actionSel = document.getElementById("corporateStructureAction");
    const refreshBtn = document.getElementById("btnRefreshCorporateStructure");
    const resetBtn = document.getElementById("btnResetCorporateStructureForm");
    const addStructureBtn=document.getElementById("btnAddCorporateStructureItem");
    const closeStructureBtn=document.getElementById("btnCloseCorporateStructureForm");
    const structurePanel=document.getElementById("corporateStructureEntryPanel");

    bindGroupReportingProfileForm();

    if(addStructureBtn&&addStructureBtn.dataset.bound!=="1"){
      addStructureBtn.dataset.bound="1";
      addStructureBtn.addEventListener("click",()=>{
        structurePanel?.classList.remove("hidden");
        structurePanel?.scrollIntoView({behavior:"smooth",block:"start"});
      });
    }

    if(closeStructureBtn&&closeStructureBtn.dataset.bound!=="1"){
      closeStructureBtn.dataset.bound="1";
      closeStructureBtn.addEventListener("click",()=>{
        structurePanel?.classList.add("hidden");
      });
    }

    if (typeSel && typeSel.dataset.bound !== "1") {
      typeSel.dataset.bound = "1";

      typeSel.addEventListener("change", async () => {
        const isInternal =
          typeSel.value === STRUCTURE_TYPES.branch_internal ||
          typeSel.value === STRUCTURE_TYPES.segment;

        if (actionSel) {
          actionSel.disabled = isInternal;

          if (isInternal)
            actionSel.value = "create";
        }

        await renderCorporateStructureForm(typeSel.value);
      });
    }

    if (actionSel && actionSel.dataset.bound !== "1") {
      actionSel.dataset.bound = "1";

      actionSel.addEventListener("change", async () => {
        await renderCorporateStructureForm(
          typeSel?.value || STRUCTURE_TYPES.subsidiary
        );
      });
    }

    if (refreshBtn && refreshBtn.dataset.bound !== "1") {
      refreshBtn.dataset.bound = "1";

      refreshBtn.addEventListener("click", async () => {
        await loadCorporateStructure(getStructureCompanyId());
      });
    }

    if (resetBtn && resetBtn.dataset.bound !== "1") {
      resetBtn.dataset.bound = "1";

      resetBtn.addEventListener("click", async () => {
        await renderCorporateStructureForm(
          typeSel?.value || STRUCTURE_TYPES.subsidiary
        );
      });
    }

    document
      .getElementById("btnAddCorporateStructureItem")
      ?.addEventListener("click",()=>{
        openCorporateStructurePanel();
      });

    document
      .getElementById("btnCloseCorporateStructureForm")
      ?.addEventListener("click",()=>{
        closeCorporateStructurePanel();
      });

    renderCorporateStructureForm(
      typeSel?.value || STRUCTURE_TYPES.subsidiary
    );
  }
  window.bindCorporateStructureScreen = bindCorporateStructureScreen;
  window.loadCorporateStructure = loadCorporateStructure;
})();