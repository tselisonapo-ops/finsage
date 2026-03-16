// app.js — registration wired to Flask backend on http://127.0.0.1:5000
(function () {
  "use strict";

  /* =========================================================
   * Config
   * =======================================================*/
  const USE_BACKEND = true;
  const API_BASE =
    window.APP_CONFIG?.API_BASE ||
    "https://finsage-backend-ab25.onrender.com";

  const AUTH_SIGNUP_URL  = API_BASE + "/api/auth/signup";
  const COUNTRY_META_URL = API_BASE + "/api/meta/countries";
  // INDUSTRIES_URL removed from usage – we now use static catalog

  // Cached meta for reuse (country → currency & phone)
  let COUNTRY_META = [];

/* =========================================================
 * Static Industry Catalog  (front-end only)
 * =======================================================*/
const INDUSTRY_CATALOG = {
  "Agriculture": [],

  "Automotive Services": [
    "Auto Repair Workshop",
    "Auto Electrical",
    "Tyre & Fitment",
    "Panel Beating",
    "Spray Painting"
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

  "NPO Transport": [],

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

  "Transport": [
    "Courier / Last Mile",
    "Freight / Logistics",
    "Public Transport"
  ],
  "Clubs & Associations": [
    "Sports Club",
    "Social Club",
    "Professional Association"
  ],
};

  /* =========================================================
   * Tiny helpers
   * =======================================================*/
  function setValidationStyle(input, isValid) {
    if (!input) return;
    input.style.border = isValid
      ? "1px solid var(--color-border)"
      : "2px solid var(--color-error)";
  }

  function val(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    if (el.tagName === "SELECT") return el.value || "";
    return (el.value || "").trim();
  }

  const ROLE_OPTIONS = {
    enterprise: [
      { value: "owner", label: "Business Owner / Founder" },
      { value: "ceo", label: "CEO / Managing Director" },
      { value: "cfo", label: "CFO / Head of Finance" },
      { value: "manager", label: "Finance Manager" },
      { value: "senior", label: "Senior Accountant" },
      { value: "accountant", label: "Accountant" },
      { value: "other", label: "Other Professional Role" }
    ],
    practitioner: [
      { value: "owner", label: "Practice Owner / Founding Partner" },
      { value: "audit_partner", label: "Audit Partner" },
      { value: "engagement_partner", label: "Engagement Partner" },
      { value: "audit_manager", label: "Audit Manager" },
      { value: "quality_control_reviewer", label: "Quality Control Reviewer" },
      { value: "client_service_manager", label: "Client Service Manager" },
      { value: "fs_compiler", label: "Financial Statement Compiler" },
      { value: "bookkeeper", label: "Bookkeeper" },
      { value: "reviewer", label: "Reviewer" },
      { value: "other", label: "Other Professional Role" }
    ]
  };

  function populateRoleOptions() {
    const accountTypeEl = document.getElementById("accountType");
    const roleEl = document.getElementById("userRole");
    if (!accountTypeEl || !roleEl) {
      console.warn("[roles] accountType or userRole element missing");
      return;
    }

    const selectedType = String(accountTypeEl.value || "").toLowerCase().trim();
    const roleSet = ROLE_OPTIONS[selectedType] || [];

    const currentValue = roleEl.value || "";

    roleEl.innerHTML = '<option value="">Select your role...</option>';

    roleSet.forEach(function (role) {
      const opt = document.createElement("option");
      opt.value = role.value;
      opt.textContent = role.label;
      roleEl.appendChild(opt);
    });

    const stillExists = roleSet.some(r => r.value === currentValue);
    roleEl.value = stillExists ? currentValue : "";
  }

  function adaptLabelsByAccountType() {
    const accountTypeEl    = document.getElementById("accountType");
    const companyNameLabel = document.querySelector('label[for="companyName"]');
    const regNoLabel       = document.querySelector('label[for="regNumber"]');
    if (!accountTypeEl || !companyNameLabel || !regNoLabel) return;

    const type = String(accountTypeEl.value || "").toLowerCase();
    if (type === "practitioner") {
      companyNameLabel.textContent = "Practice Name";
      regNoLabel.textContent       = "Practice Registration Number";
    } else {
      companyNameLabel.textContent = "Company/Entity Name";
      regNoLabel.textContent       = "Company Registration Number";
    }

    populateRoleOptions();
  }

  /* =========================================================
   * Step navigation
   * =======================================================*/
  function nextStep(currentStep) {
    const currentFieldset  = document.getElementById("step-" + currentStep);
    const nextFieldset     = document.getElementById("step-" + (currentStep + 1));
    const currentIndicator = document.getElementById("step" + currentStep + "-indicator");
    const nextIndicator    = document.getElementById("step" + (currentStep + 1) + "-indicator");

    if (currentStep === 1) {
      if (!validateStep1()) return;
      // persist step 1 and hydrate step 2 if any previous data
      loadStep2Data();
    }

    if (currentFieldset && nextFieldset) {
      currentFieldset.classList.remove("active-step");
      currentFieldset.classList.add("hidden-step");
      nextFieldset.classList.remove("hidden-step");
      nextFieldset.classList.add("active-step");

      if (currentIndicator) {
        currentIndicator.classList.remove("active");
        currentIndicator.classList.add("completed");
      }
      if (nextIndicator) nextIndicator.classList.add("active");

      adaptLabelsByAccountType();
    }
  }

  function prevStep(currentStep) {
    const currentFieldset  = document.getElementById("step-" + currentStep);
    const prevFieldset     = document.getElementById("step-" + (currentStep - 1));
    const currentIndicator = document.getElementById("step" + currentStep + "-indicator");
    const prevIndicator    = document.getElementById("step" + (currentStep - 1) + "-indicator");

    if (currentFieldset && prevFieldset) {
      currentFieldset.classList.remove("active-step");
      currentFieldset.classList.add("hidden-step");
      prevFieldset.classList.remove("hidden-step");
      prevFieldset.classList.add("active-step");

      if (currentIndicator) currentIndicator.classList.remove("active");
      if (prevIndicator) {
        prevIndicator.classList.add("active");
        prevIndicator.classList.remove("completed");
      }
      loadStep1Data();
      populateRoleOptions();
      adaptLabelsByAccountType();
    }
  }

  /* =========================================================
   * Step 1 — Validation + Persistence
   * =======================================================*/
  function validateStep1() {
    const passwordInput = document.getElementById("password");
    const confirmInput  = document.getElementById("confirmPassword");
    const emailInput    = document.getElementById("email");

    const emailErrorEl    = document.getElementById("emailError");
    const passwordErrorEl = document.getElementById("passwordError");
    const confirmErrorEl  = document.getElementById("confirmError");

    let isValid = true;
    let passwordMessage = "";
    let emailMessage = "";

    [emailErrorEl, passwordErrorEl, confirmErrorEl].forEach(function (el) {
      if (el) {
        el.textContent = "";
        el.style.display = "none";
      }
    });

    // required fields in step 1
    const requiredInputs = document.querySelectorAll(
      '#step-1 input[required], #step-1 select[required], #step-1 textarea[required]'
    );
    for (let i = 0; i < requiredInputs.length; i++) {
      const el = requiredInputs[i];
      const ok = !!(el && el.value);
      setValidationStyle(el, ok);
      if (!ok) isValid = false;
    }

    // email check
    let emailOK = false;
    if (emailInput && emailInput.value) {
      if (!/\S+@\S+\.\S+/.test(emailInput.value)) {
        emailMessage = "Please enter a valid email address.";
      } else {
        emailOK = true;
      }
    }
    if (!emailOK) {
      setValidationStyle(emailInput, false);
      if (emailErrorEl && emailMessage) {
        emailErrorEl.textContent = emailMessage;
        emailErrorEl.style.display = "block";
      }
      isValid = false;
    } else {
      setValidationStyle(emailInput, true);
    }

    // password checks
    let passOK = true;
    const passwordValue = passwordInput ? passwordInput.value : "";
    const confirmValue  = confirmInput ? confirmInput.value : "";

    if (!passwordValue || !confirmValue) {
      passOK = false;
      passwordMessage = "Password is required.";
    } else if (passwordValue.length < 8) {
      passOK = false;
      passwordMessage = "Password must be at least 8 characters long.";
    } else if (passwordValue !== confirmValue) {
      passOK = false;
      passwordMessage = "Passwords do not match.";
    }

    setValidationStyle(passwordInput, passOK);
    setValidationStyle(confirmInput, passOK);

    if (!passOK && passwordMessage) {
      if (passwordErrorEl) {
        passwordErrorEl.textContent  = passwordMessage;
        passwordErrorEl.style.display = "block";
      }
      if (confirmErrorEl) {
        confirmErrorEl.textContent  = passwordMessage;
        confirmErrorEl.style.display = "block";
      }
      isValid = false;
    }

    if (!isValid) {
      const firstInvalid = document.querySelector('#step-1 [style*="border: 2px solid"]');
      if (firstInvalid && firstInvalid.scrollIntoView) {
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return false;
    }

    // Persist Step 1
    const rawType = (val("accountType") || "enterprise").toLowerCase();
    const step1Data = {
      firstName:  val("firstName"),
      lastName:   val("lastName"),
      email:      val("email").toLowerCase(),
      password:   val("password"),
      userRole:   val("userRole") || null,
      accountType: rawType,
      phone:      val("phone") || null
    };

    sessionStorage.setItem("fs_reg_step1_data", JSON.stringify(step1Data));
    return true;
  }

  function loadStep1Data() {
    const saved = sessionStorage.getItem("fs_reg_step1_data");
    if (!saved) return false;
    const data = JSON.parse(saved || "{}");
    ["firstName","lastName","email","userRole","accountType","phone"].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el || data[id] == null) return;
      el.value = data[id];
    });
    return true;
  }

function initTeamInviteToggle() {
  const needTeam = document.getElementById("needTeam");
  const teamInviteBlock = document.getElementById("teamInviteBlock");
  const userRole = document.getElementById("userRole");
  const ownerInviteRow = document.getElementById("ownerInviteRow");

  if (!needTeam || !teamInviteBlock) return;

  function isOwnerRole() {
    return String(userRole?.value || "").trim().toLowerCase() === "owner";
  }

  function syncInviteUI() {
    teamInviteBlock.classList.toggle("hidden", !needTeam.checked);

    // hide owner invite if role is Owner
    if (ownerInviteRow) {
      ownerInviteRow.classList.toggle("hidden", isOwnerRole());
    }
  }

  needTeam.addEventListener("change", syncInviteUI);
  userRole?.addEventListener("change", syncInviteUI);

  syncInviteUI();
}

  function bindStep1Persistence() {
    const els = document.querySelectorAll("#step-1 input, #step-1 select, #step-1 textarea");
    els.forEach(function (input) {
      input.addEventListener("change", function () {
        const current = JSON.parse(sessionStorage.getItem("fs_reg_step1_data") || "{}");
        current[input.id] = input.value;
        sessionStorage.setItem("fs_reg_step1_data", JSON.stringify(current));
      });
    });
  }

  /* =========================================================
   * Step 2 — Industry + Countries + Persistence
   * =======================================================*/
  function handleIndustryChangeMessage() {
    const industrySelect = document.getElementById("industry");
    const coaMessageDiv  = document.getElementById("coa-message");
    if (!industrySelect || !coaMessageDiv) return;

    const selected = industrySelect.value;
    if (selected) {
      coaMessageDiv.innerHTML =
        "✅ <strong>Confirmation:</strong> We are ready to set up your standard <strong>" +
        selected +
        "</strong> Chart of Accounts template upon registration completion.";
      coaMessageDiv.style.display = "block";
    } else {
      coaMessageDiv.style.display = "none";
    }
  }

// ---- Static industry + sub-industry dropdown wiring ----
function initIndustryDropdowns() {
  const industrySel = document.getElementById("industry");
  const subSel      = document.getElementById("subIndustry");
  if (!industrySel || !subSel) return;

  // Initial state for sub-industry
  subSel.innerHTML = '<option value="">Select industry first</option>';
  subSel.disabled = true;
  subSel.required = false; // not required until we know industry
  subSel.classList.add("bg-gray-100", "cursor-not-allowed");

  // Fill industry list
  industrySel.innerHTML = '<option value="">Select your industry</option>';
  Object.keys(INDUSTRY_CATALOG)
    .sort()
    .forEach(function (name) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      industrySel.appendChild(opt);
    });

  // When industry changes, fill / disable sub-industries
  industrySel.addEventListener("change", function () {
    const chosen = industrySel.value;
    const list   = INDUSTRY_CATALOG[chosen] || [];

    if (!chosen) {
      // No industry selected
      subSel.innerHTML = '<option value="">Select industry first</option>';
      subSel.disabled  = true;
      subSel.required  = false;
      subSel.classList.add("bg-gray-100", "cursor-not-allowed");
    } else if (!list.length) {
      // Industry has NO sub-industries -> greyed-out Not applicable
      subSel.innerHTML = '<option value="">Not applicable</option>';
      subSel.disabled  = true;
      subSel.required  = false; // <- important: not required
      subSel.classList.add("bg-gray-100", "cursor-not-allowed");
    } else {
      // Industry HAS sub-industries -> user must choose one
      subSel.disabled  = false;
      subSel.required  = true;  // <- only required in this case
      subSel.classList.remove("bg-gray-100", "cursor-not-allowed");

      subSel.innerHTML = '<option value="">Select sub-industry</option>';
      list.forEach(function (name) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        subSel.appendChild(opt);
      });
    }

    // Update the green confirmation message
    handleIndustryChangeMessage();

    // Persist industry selection
    const s2 = JSON.parse(sessionStorage.getItem("fs_reg_step2_data") || "{}");
    s2.industry = chosen;
    if (!list.length) {
      // if there are no sub-industries, clear any stored value
      s2.subIndustry = "";
    }
    sessionStorage.setItem("fs_reg_step2_data", JSON.stringify(s2));
  });
}

  // ------- Countries + Currency + Phone codes -------------------
  function populateCountryAndCurrency(metaList) {
    COUNTRY_META = metaList || [];

    const countrySel  = document.getElementById("country");
    const currencySel = document.getElementById("currency");
    if (!countrySel || !currencySel) return;

    countrySel.innerHTML  = '<option value="">Select country...</option>';
    currencySel.innerHTML = '<option value="">Select base currency</option>';

    const seenCurrencies = {};

    metaList.forEach(function (c) {
      // Country option (value = ISO code used in validation.py)
      const cOpt = document.createElement("option");
      cOpt.value = c.code;
      cOpt.textContent = c.name + " (" + c.code + ")";
      countrySel.appendChild(cOpt);

      if (c.currency && !seenCurrencies[c.currency]) {
        const curOpt = document.createElement("option");
        curOpt.value = c.currency;
        curOpt.textContent = c.currency;
        currencySel.appendChild(curOpt);
        seenCurrencies[c.currency] = true;
      }
    });

countrySel.addEventListener("change", function () {
  const code = countrySel.value;
  const selected = COUNTRY_META.find(c => c.code === code);
  const phoneInput = document.getElementById("phone");

  if (selected) {
    // Auto-set currency only if empty
    if (selected.currency && !currencySel.value) {
      currencySel.value = selected.currency;
    }

    if (phoneInput) {
      // Clear the phone field (do not insert +27)
      phoneInput.value = "";

      // Placeholder should NOT repeat +27
      phoneInput.placeholder = "82 123 4567";
    }
  } else if (phoneInput) {
    // Default fallback placeholder
    phoneInput.placeholder = "82 123 4567";
  }

      // Persist selection
      const s2 = JSON.parse(sessionStorage.getItem("fs_reg_step2_data") || "{}");
      s2.country = code;
      sessionStorage.setItem("fs_reg_step2_data", JSON.stringify(s2));
    });
  }

  // Convert ISO country code ("ZA") to flag emoji
  function countryCodeToFlagEmoji(code) {
    if (!code || code.length !== 2) return "🏳️";
    const base = 0x1F1E6;
    const cc = code.toUpperCase();
    return String.fromCodePoint(
      base + cc.charCodeAt(0) - 65,
      base + cc.charCodeAt(1) - 65
    );
  }

  // Phone country selector (uses COUNTRY_META)
  function initPhoneCountrySelector(metaList) {
    const btn       = document.getElementById("phoneCountryBtn");
    const dd        = document.getElementById("phoneCountryDropdown");
    const listEl    = document.getElementById("phoneCountryList");
    const searchEl  = document.getElementById("phoneCountrySearch");
    const phoneInp  = document.getElementById("phone");
    const flagSpan  = document.getElementById("phoneCountryFlag");
    const dialSpan  = document.getElementById("phoneCountryDial");
    const isoHidden = document.getElementById("phoneCountryIso");

    if (!btn || !dd || !listEl || !searchEl || !phoneInp || !flagSpan || !dialSpan || !isoHidden) return;
    if (btn.dataset.bound === "1") return;   // ✅ prevent rebinding
    btn.dataset.bound = "1";
    // Build option list
    listEl.innerHTML = "";
    const countries = (metaList || []).slice().sort((a, b) => a.name.localeCompare(b.name));

    countries.forEach(c => {
      const optionBtn = document.createElement("button");
      optionBtn.type  = "button";
      optionBtn.dataset.code = c.code;
      optionBtn.dataset.dial = c.phone || "";
      optionBtn.className =
        "flex w-full items-center gap-2 px-3 py-1.5 hover:bg-gray-100 text-left text-sm";
      optionBtn.innerHTML = `
        <span class="text-lg">${countryCodeToFlagEmoji(c.code)}</span>
        <span>${c.name}</span>
        <span class="ml-auto text-xs text-gray-500">${c.phone || ""}</span>
      `;
      listEl.appendChild(optionBtn);
    });

    function setSelection(code, dial) {
      const country = countries.find(c => c.code === code) || countries[0];
      const dialCode = dial || (country && country.phone) || "";

      const previousDial = dialSpan.textContent.trim();

      flagSpan.textContent = countryCodeToFlagEmoji(country.code);
      dialSpan.textContent = dialCode || "+";
      isoHidden.value = country.code;

      let value = phoneInp.value.trim();

      // Remove previous dial code if present
      if (previousDial && value.startsWith(previousDial)) {
        value = value.slice(previousDial.length).trim();
      }

      // Apply new dial code
      if (dialCode) {
        phoneInp.value = value ? `${dialCode} ${value}` : `${dialCode} `;
        phoneInp.placeholder = `${dialCode} 82 123 4567`;
      }
    }

    // Format phone number and keep dial code intact
    phoneInp.addEventListener("input", () => {
      let val = phoneInp.value.replace(/[^\d+]/g, "");

      const dial = dialSpan.textContent.trim();

      if (val.startsWith(dial)) {
        const rest = val.slice(dial.length).replace(/\D/g, "");
        phoneInp.value = `${dial} ${rest}`;
      }
    });

    // Default: ZA if present, else first country
    const defaultCountry =
      countries.find(c => c.code === "ZA") || countries[0];
    if (defaultCountry) setSelection(defaultCountry.code, defaultCountry.phone);

    // Toggle dropdown
    btn.addEventListener("click", () => {
      dd.classList.toggle("hidden");
      if (!dd.classList.contains("hidden")) {
        searchEl.value = "";
        Array.from(listEl.children).forEach(ch => ch.classList.remove("hidden"));
        searchEl.focus();
      }
    });

    // Allow keyboard opening of dropdown
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        dd.classList.remove("hidden");
        searchEl.focus();
      }
    });

    // Click on option
    listEl.addEventListener("click", e => {
      const optionBtn = e.target.closest("button[data-code]");
      if (!optionBtn) return;
      setSelection(optionBtn.dataset.code, optionBtn.dataset.dial);
      dd.classList.add("hidden");
    });

    // 3-letter (or any) search by name / dial / code
    searchEl.addEventListener("keyup", () => {
      const term = searchEl.value.trim().toLowerCase();
      Array.from(listEl.children).forEach(btn => {
        const text =
          (btn.innerText || "").toLowerCase(); // includes name, dial and code
        btn.classList.toggle("hidden", term && !text.includes(term));
      });
    });

    // Close when clicking outside
    document.addEventListener("click", e => {
      if (!dd.contains(e.target) && !btn.contains(e.target)) {
        dd.classList.add("hidden");
      }
    });
  }

function fetchCountryMeta() {
  const fallback = [
    { code: "ZA", name: "South Africa", currency: "ZAR", phone: "+27" },
    { code: "LS", name: "Lesotho",      currency: "LSL", phone: "+266" },
    { code: "BW", name: "Botswana",     currency: "BWP", phone: "+267" },
    { code: "NA", name: "Namibia",      currency: "NAD", phone: "+264" },
    { code: "ZW", name: "Zimbabwe",     currency: "ZWL", phone: "+263" },
  ];

  return fetch(COUNTRY_META_URL)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      const list = (data && data.countries) || [];
      if (!Array.isArray(list) || !list.length) throw new Error("Empty list");

      populateCountryAndCurrency(list);
      initPhoneCountrySelector(list);   // ✅ add this
    })
    .catch(function (err) {
      console.error("Error fetching countries:", err);
      populateCountryAndCurrency(fallback);
      initPhoneCountrySelector(fallback);
    });
}
  // =========================================================
  // Google Places Autocomplete for Registered Address
  // =========================================================
function initRegAddressAutocomplete() {
  const input = document.getElementById("addressSearch");
  if (!input || !window.google || !google.maps || !google.maps.places) return;

  const autocomplete = new google.maps.places.Autocomplete(input, {
    types: ["geocode"]
    // ✅ global: no componentRestrictions
  });

  const byId = (id) => document.getElementById(id);

  function setVal(id, v) {
    const el = byId(id);
    if (el) el.value = v || "";
  }

  function getComponent(components, type) {
    const c = components.find(x => (x.types || []).includes(type));
    return c ? c.long_name : "";
  }

  autocomplete.addListener("place_changed", function () {
    const place = autocomplete.getPlace();
    if (!place || !place.address_components) return;

    const comps = place.address_components;

    const streetNo = getComponent(comps, "street_number");
    const route    = getComponent(comps, "route");
    const line1    = [streetNo, route].filter(Boolean).join(" ");

    // locality handling differs by country:
    const locality =
      getComponent(comps, "sublocality") ||
      getComponent(comps, "sublocality_level_1") ||
      getComponent(comps, "neighborhood");

    const city =
      getComponent(comps, "locality") ||
      getComponent(comps, "postal_town") ||                 // UK
      getComponent(comps, "administrative_area_level_2");   // fallback

    const region =
      getComponent(comps, "administrative_area_level_1") || // state/province
      getComponent(comps, "administrative_area_level_2");

    const postal = getComponent(comps, "postal_code");

    setVal("regAddressLine1", line1);
    // regAddressLine2 left for user (unit/suite often not reliable)
    setVal("regLocality", locality);
    setVal("regCity", city);
    setVal("regRegion", region);
    setVal("regPostalCode", postal);

    // Optional metadata
    setVal("regPlaceId", place.place_id || "");
    setVal("regFormatted", place.formatted_address || "");

    const loc = place.geometry && place.geometry.location;
    setVal("regLat", loc ? String(loc.lat()) : "");
    setVal("regLng", loc ? String(loc.lng()) : "");

    // Persist to sessionStorage via your existing change listeners
    // (they will fire only if user changes; so trigger manual change events)
    ["regAddressLine1","regLocality","regCity","regRegion","regPostalCode"]
      .forEach(id => {
        const el = byId(id);
        if (el) el.dispatchEvent(new Event("change", { bubbles: true }));
      });
  });
}

  /* =========================================================
   * Step 2 — Validation + Persistence
   * =======================================================*/
function validateStep2() {
    const fin = document.getElementById("finYearStart");
    let finOK = true;

    const requiredInputs = document.querySelectorAll("#step-2 [required]");
    let ok = true;

    for (let i = 0; i < requiredInputs.length; i++) {
      const el = requiredInputs[i];

      // Skip disabled fields (e.g. subIndustry when "Not applicable")
      if (!el || el.disabled) continue;

      const v = !!el.value;
      setValidationStyle(el, v);
      if (!v) ok = false;
    }

    if (fin && fin.value) {
      const re = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])$/; // DD/MM
      const fmtOK = re.test(fin.value);
      if (fmtOK) {
        const parts = fin.value.split("/");
        const day   = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (day > 30 && [2,4,6,9,11].indexOf(month) !== -1) finOK = false;
        else if (month === 2 && day > 29) finOK = false;
      } else finOK = false;
    } else if (fin && fin.hasAttribute("required")) {
      finOK = false;
    }

    setValidationStyle(fin, finOK);
    if (!finOK) ok = false;

    if (!ok) {
      const firstInvalid = document.querySelector('#step-2 [style*="border: 2px solid"]');
      if (firstInvalid && firstInvalid.scrollIntoView) {
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    return ok;
  }

  function loadStep2Data() {
    const saved = sessionStorage.getItem("fs_reg_step2_data");
    if (!saved) return;
    const data = JSON.parse(saved || "{}");
    [
      "companyName","clientCode","industry","subIndustry","country",
      "regNumber","taxNumber","vatNumber","companyEmail",
      "currency","finYearStart","companyRegDate","address",

      // ✅ NEW
      "companyPhone","postalAddress","logoUrl","companyWebsite"
    ].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el || data[id] == null) return;
      el.value = data[id];

      if (id === "industry") {
        const evt = new Event("change");
        el.dispatchEvent(evt);
      }
    });
  }

  function bindStep2Persistence() {
    const els = document.querySelectorAll("#step-2 input, #step-2 select, #step-2 textarea");
    els.forEach(function (input) {
      input.addEventListener("change", function () {
        const current = JSON.parse(sessionStorage.getItem("fs_reg_step2_data") || "{}");
        current[input.id] = input.value;
        sessionStorage.setItem("fs_reg_step2_data", JSON.stringify(current));
      });
    });
  }

// =======================
// UPDATED: handleRegistration()
// =======================
function handleRegistration(event) {
  if (event && event.preventDefault) event.preventDefault();
  if (!validateStep2()) return;

  const step1 = JSON.parse(sessionStorage.getItem("fs_reg_step1_data") || "{}");

  // ✅ keep these early so they are in-scope for payload + validation
  const chosenRole = (step1.userRole || val("userRole") || "").trim().toLowerCase();
  const ownerEmail = (val("ownerEmail") || "").trim().toLowerCase();

  // ✅ If user is not owner, strongly encourage owner email
  if (chosenRole && chosenRole !== "owner" && !ownerEmail) {
    alert("You selected a non-owner role. Please add the Owner's email (recommended).");
    return;
  }

  const countryCode = (val("country") || "").toUpperCase();
  let currencyCode  = (val("currency") || "").toUpperCase();

  // Auto-set currency from country meta if not selected
  if (!currencyCode && COUNTRY_META && COUNTRY_META.length && countryCode) {
    const found = COUNTRY_META.find(c => c.code === countryCode);
    if (found && found.currency) {
      currencyCode = String(found.currency).toUpperCase();
      const curSel = document.getElementById("currency");
      if (curSel) curSel.value = currencyCode;
    }
  }

  const rawType  = (step1.accountType || val("accountType") || "enterprise").toLowerCase();
  const userType = rawType === "practitioner" ? "Practitioner" : "Enterprise";

  // --- Build structured registered + postal addresses ---
  const reg = {
    line1:      val("regAddressLine1") || null,
    line2:      val("regAddressLine2") || null,
    locality:   val("regLocality") || null,
    city:       val("regCity") || null,
    region:     val("regRegion") || null,
    postalCode: val("regPostalCode") || null,
    country:    countryCode || null,

    placeId:    val("regPlaceId") || null,
    formatted:  val("regFormatted") || null,
    lat:        val("regLat") || null,
    lng:        val("regLng") || null
  };

  const postalSame = !!document.getElementById("postalSameAsReg")?.checked;

  const post = postalSame
    ? {
        line1:      reg.line1,
        line2:      reg.line2,
        locality:   reg.locality,
        city:       reg.city,
        region:     reg.region,
        postalCode: reg.postalCode,
        country:    reg.country
      }
    : {
        line1:      val("postAddressLine1") || null,
        line2:      val("postAddressLine2") || null,
        locality:   val("postLocality") || null,
        city:       val("postCity") || null,
        region:     val("postRegion") || null,
        postalCode: val("postPostalCode") || null,
        country:    countryCode || null
      };

  // --- Company payload ---
  const company = {
    companyName:    val("companyName"),
    clientCode:     val("clientCode") || null,
    industry:       val("industry") || null,
    subIndustry:    val("subIndustry") || null,

    country:        countryCode || null,
    companyRegNo:   val("regNumber") || null,
    tin:            val("taxNumber") || null,
    vat:            val("vatNumber") || null,
    companyEmail:   val("companyEmail") || null,

    currency:       currencyCode || null,
    finYearStart:   val("finYearStart") || "01/01",
    companyRegDate: val("companyRegDate") || null,

    registeredAddress: reg,
    postalAddress:     post,
    postalSameAsReg:   postalSame,

    companyPhone:   val("companyPhone") || null,
    logoUrl:        val("logoUrl") || null,
    website:        val("companyWebsite") || null
  };

  // Optional team invitations (unchanged)
  const needTeamEl = document.getElementById("needTeam");
  let teamSetup = null;

  if (needTeamEl && needTeamEl.checked) {
    const rawEmails = val("inviteEmails");
    const emails = rawEmails
      ? rawEmails.split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean)
      : [];

    teamSetup = {
      teamNote:     val("teamNote") || null,
      inviteEmails: emails
    };
  }

  const payload = {
    // user
    email:       (step1.email || val("email") || "").toLowerCase(),
    password:    step1.password || val("password"),
    firstName:   step1.firstName || val("firstName") || null,
    lastName:    step1.lastName  || val("lastName")  || null,
    userRole:    step1.userRole  || val("userRole")  || null,
    userType:    userType,
    phone:       step1.phone     || val("phone")     || null,

    // ✅ new
    ownerInvite: ownerEmail || null,

    // company + team
    company: company,
    team: teamSetup
  };

  if (!USE_BACKEND) {
    alert("Registration successful! (Simulated)");
    sessionStorage.removeItem("fs_reg_step1_data");
    sessionStorage.removeItem("fs_reg_step2_data");
    return;
  }

  fetch(AUTH_SIGNUP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(function (res) {
      return res.json().then(function (p) {
        return { ok: res.ok, status: res.status, payload: p };
      });
    })
    .then(function (result) {
      if (!result.ok) {
        if (result.status === 409) {
          const msg =
            (result.payload && result.payload.error) ||
            "A user with this email already exists. Please sign in instead.";

          const box = document.getElementById("formMessage");
          if (box) {
            box.innerHTML = `
              <div style="margin-bottom:6px;">${msg}</div>
              <button id="goSignInBtn"
                style="
                  background:#0d9488;
                  padding:6px 16px;
                  border-radius:6px;
                  color:white;
                  border:none;
                  cursor:pointer;
                  font-size:0.9rem;
                ">
                OK
              </button>
            `;
            box.classList.remove("hidden");
            box.style.background = "#fee2e2";
            box.style.color = "#b91c1c";
            box.style.border = "1px solid #fecaca";

            const btn = document.getElementById("goSignInBtn");
            if (btn) btn.onclick = () => (window.location.href = "signin.html");
          } else {
            if (confirm(msg + "\n\nClick OK to go to the Sign In page.")) {
              window.location.href = "signin.html";
            }
          }
          return;
        }

        let msg = "Registration failed.";
        if (result.payload && result.payload.errors) {
          msg = JSON.stringify(result.payload.errors, null, 2);
        } else if (result.payload && result.payload.error) {
          msg = result.payload.error;
        }
        alert(msg);
        return;
      }

      const resp = result.payload || {};
      sessionStorage.removeItem("fs_reg_step1_data");
      sessionStorage.removeItem("fs_reg_step2_data");

      const email =
        resp.user_email ||
        resp.email ||
        resp.userEmail ||
        (step1.email || val("email") || "");

      const query = email ? `?email=${encodeURIComponent(email)}` : "";

      if (resp.email_sent === false || resp.status === "confirmation_email_failed") {
        alert("Your account was created, but we could not send the confirmation email right now.");
        window.location.href = `check-email.html${query}&email_failed=1`;
      } else {
        alert("Registration successful! Please check your email to confirm your account.");
        window.location.href = `check-email.html${query}`;
      }
    })
    .catch(function (err) {
      alert("Error: " + (err && err.message ? err.message : "Unexpected error"));
      console.error(err);
    });
}


// =======================
// UPDATED: DOMContentLoaded block (only the parts that changed)
// =======================
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("registrationForm");
  if (form) form.addEventListener("submit", handleRegistration);

  const industryForMsg = document.getElementById("industry");
  if (industryForMsg) industryForMsg.addEventListener("change", handleIndustryChangeMessage);

  const needTeam  = document.getElementById("needTeam");
  const teamSetup = document.getElementById("team-setup");
  if (needTeam && teamSetup) {
    teamSetup.style.display = needTeam.checked ? "block" : "none";
    needTeam.addEventListener("change", function () {
      teamSetup.style.display = needTeam.checked ? "block" : "none";
    });
  }

  const accountType = document.getElementById("accountType");
  if (accountType) {
    adaptLabelsByAccountType();
    accountType.addEventListener("change", adaptLabelsByAccountType);
  }

  // Auto-fill finYearStart from companyRegDate
  const regDateInput = document.getElementById("companyRegDate");
  const finYearInput = document.getElementById("finYearStart");
  if (regDateInput && finYearInput) {
    regDateInput.addEventListener("change", function () {
      const v = regDateInput.value; // yyyy-mm-dd
      if (!v || finYearInput.value) return;
      const parts = v.split("-");
      if (parts.length === 3) {
        const dd = (parts[2] || "").padStart(2, "0");
        const mm = (parts[1] || "").padStart(2, "0");
        finYearInput.value = dd + "/" + mm;
      }
    });
  }

  initTeamInviteToggle();

  // Persistence
  bindStep1Persistence();
  bindStep2Persistence();

  // Rehydrate step 1
  loadStep1Data();

  populateRoleOptions();
  adaptLabelsByAccountType();

  // Init static industries first
  initIndustryDropdowns();

  // Countries from backend, then rehydrate step 2
  fetchCountryMeta().then(function () {
    loadStep2Data();
  });

  // ✅ Google Places Autocomplete (now fills structured address fields)
  initRegAddressAutocomplete();

  // ✅ Postal same-as-registered behaviour
  const sameChk  = document.getElementById("postalSameAsReg");
  const postBloc = document.getElementById("postalAddressBlock");

  function copyRegToPostal() {
    const map = [
      ["regAddressLine1","postAddressLine1"],
      ["regAddressLine2","postAddressLine2"],
      ["regLocality","postLocality"],
      ["regCity","postCity"],
      ["regRegion","postRegion"],
      ["regPostalCode","postPostalCode"],
    ];
    map.forEach(([from, to]) => {
      const a = document.getElementById(from);
      const b = document.getElementById(to);
      if (a && b) b.value = a.value || "";
    });
  }

  if (sameChk && postBloc) {
    postBloc.style.display = sameChk.checked ? "none" : "block";

    sameChk.addEventListener("change", function () {
      if (sameChk.checked) {
        copyRegToPostal();
        postBloc.style.display = "none";
      } else {
        postBloc.style.display = "block";
      }
    });
  }

  // Sign-in / Start trial buttons
  const signinBtn = document.getElementById("signinBtn");
  if (signinBtn) signinBtn.addEventListener("click", () => (window.location.href = "signin.html"));

  const signupBtn = document.getElementById("signupBtn");
  if (signupBtn) {
    signupBtn.addEventListener("click", function () {
      const formEl = document.getElementById("registrationForm");
      if (formEl && formEl.scrollIntoView) formEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Expose navigation to inline HTML
  window.nextStep = nextStep;
  window.prevStep = prevStep;
});

})();
