/* ===================================================================
 * address-autocomplete.js
 * ------------------------------------------------------------------
 * Free address autocomplete for FinSage (Flask + vanilla JS).
 *
 * Talks to your own backend:  GET /api/address/search?q=...&country=...
 * Backend proxies to Photon (free OSM) by default — no API key needed.
 * When you have paying customers, swap the backend to Mapbox by setting
 * env var ADDRESS_PROVIDER=mapbox  +  MAPBOX_TOKEN=...  — no frontend changes.
 *
 * Public API:
 *   new AddressAutocomplete(inputElement, {
 *     country: "ZA",                 // optional ISO code
 *     minLength: 3,                  // default 3
 *     debounceMs: 300,               // default 300
 *     apiBase:   "",                 // defaults to window.APP_CONFIG?.API_BASE
 *     onSelect:  (address) => {}     // structured address object
 *   });
 * =================================================================== */
(function (global) {
  "use strict";

  function getApiBase() {
    return (
      (window.APP_CONFIG && window.APP_CONFIG.API_BASE) ||
      (window.API_BASE) ||
      ""
    );
  }

  function fmtAddress(p) {
    var parts = [];
    if (p.name && p.name !== p.street) parts.push(p.name);
    var streetBits = [];
    if (p.housenumber) streetBits.push(p.housenumber);
    if (p.street) streetBits.push(p.street);
    if (streetBits.length) parts.push(streetBits.join(" "));
    if (p.locality && p.locality !== p.city) parts.push(p.locality);
    if (p.postcode) parts.push(p.postcode);
    if (p.city) parts.push(p.city);
    if (p.state && p.state !== p.city) parts.push(p.state);
    if (p.country) parts.push(p.country);
    return parts.filter(Boolean).join(", ");
  }

  function buildStructuredAddress(feature) {
    var p = feature.properties || {};
    var coords = (feature.geometry && feature.geometry.coordinates) || [null, null];
    var line1Bits = [];
    if (p.housenumber) line1Bits.push(p.housenumber);
    if (p.street) line1Bits.push(p.street);
    var line1 = line1Bits.join(" ").trim();

    // If photon gives us a "name" that isn't just the street, treat it as line 2
    var line2 = "";
    if (p.name && p.name !== (p.street || "") && p.name !== line1) {
      line2 = p.name;
    }

    return {
      line1:        line1,
      line2:        line2,
      locality:     p.locality || "",
      city:         p.city || "",
      state:        p.state || "",
      postcode:     p.postcode || "",
      country:      p.country || "",
      countryCode: p.country_code || (p.country ? p.country.toUpperCase() : ""),
      lat:          coords[1],
      lon:          coords[0],
      formatted:    feature.formatted || fmtAddress(p),
      osmId:        p.osm_id || "",
      osmType:      p.osm_type || "",
      raw:          p,
    };
  }

  class AddressAutocomplete {
    constructor(inputEl, options) {
      if (!inputEl) return;
      this.input = inputEl;
      this.options = options || {};
      this.onSelect = this.options.onSelect || function () {};
      this.country = this.options.country || null;
      this.minLength = this.options.minLength || 3;
      this.debounceMs = this.options.debounceMs || 300;
      this.apiBase = this.options.apiBase !== undefined ? this.options.apiBase : getApiBase();

      this.debounceTimer = null;
      this.currentIndex = -1;
      this.results = [];
      this.activeRequest = null;

      this.setupUI();
      this.attachEvents();
    }

    setupUI() {
      var wrapper = document.createElement("div");
      wrapper.className = "address-autocomplete";
      if (this.input.parentNode) {
        this.input.parentNode.insertBefore(wrapper, this.input);
      }
      wrapper.appendChild(this.input);

      this.listEl = document.createElement("ul");
      this.listEl.className = "address-list";
      this.listEl.setAttribute("role", "listbox");
      this.listEl.style.display = "none";
      wrapper.appendChild(this.listEl);
    }

    attachEvents() {
      var self = this;

      this.input.addEventListener("input", function (e) {
        clearTimeout(self.debounceTimer);
        self.debounceTimer = setTimeout(function () {
          self.search(e.target.value);
        }, self.debounceMs);
      });

      this.input.addEventListener("keydown", function (e) {
        self.handleKeydown(e);
      });

      this.input.addEventListener("blur", function () {
        // delay so click on suggestion fires first
        setTimeout(function () { self.close(); }, 150);
      });

      document.addEventListener("click", function (e) {
        if (!self.input.parentNode.contains(e.target)) self.close();
      });
    }

    async search(query) {
      var q = (query || "").trim();
      if (q.length < this.minLength) {
        this.close();
        return;
      }

      // Abort any in-flight request
      if (this.activeRequest) {
        try { this.activeRequest.abort(); } catch (e) {}
      }

      var params = new URLSearchParams();
      params.set("q", q);
      if (this.country) params.set("country", this.country);

      var xhr = new XMLHttpRequest();
      this.activeRequest = xhr;

      xhr.open("GET", this.apiBase + "/api/address/search?" + params.toString(), true);
      xhr.setRequestHeader("Accept", "application/json");
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        self.activeRequest = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText || "{}");
            self.renderResults(data.features || []);
          } catch (err) {
            console.error("[address-autocomplete] parse error:", err);
            self.close();
          }
        } else {
          console.error("[address-autocomplete] HTTP " + xhr.status);
          self.close();
        }
      };
      try {
        xhr.send();
      } catch (err) {
        console.error("[address-autocomplete] send failed:", err);
        self.close();
      }
    }

    renderResults(features) {
      var self = this;
      this.results = features;
      this.currentIndex = -1;
      this.listEl.innerHTML = "";

      if (!features.length) {
        this.close();
        return;
      }

      features.forEach(function (f, i) {
        var li = document.createElement("li");
        li.setAttribute("role", "option");
        li.textContent = f.formatted || fmtAddress(f.properties || {});
        li.addEventListener("mousedown", function (e) {
          e.preventDefault(); // prevent blur before click
          self.select(i);
        });
        self.listEl.appendChild(li);
      });

      this.listEl.style.display = "block";
    }

    handleKeydown(e) {
      if (!this.results.length) return;
      var key = e.key;

      if (key === "ArrowDown") {
        e.preventDefault();
        this.currentIndex = (this.currentIndex + 1) % this.results.length;
        this.highlight();
      } else if (key === "ArrowUp") {
        e.preventDefault();
        this.currentIndex = (this.currentIndex - 1 + this.results.length) % this.results.length;
        this.highlight();
      } else if (key === "Enter" && this.currentIndex >= 0) {
        e.preventDefault();
        this.select(this.currentIndex);
      } else if (key === "Escape") {
        this.close();
      }
    }

    highlight() {
      var items = this.listEl.children;
      for (var i = 0; i < items.length; i++) {
        if (i === this.currentIndex) items[i].classList.add("active");
        else items[i].classList.remove("active");
      }
      // scroll active item into view
      var active = items[this.currentIndex];
      if (active && active.scrollIntoView) {
        active.scrollIntoView({ block: "nearest" });
      }
    }

    select(idx) {
      var feature = this.results[idx];
      if (!feature) return;
      var addr = buildStructuredAddress(feature);
      this.input.value = addr.formatted || addr.line1 || "";
      try { this.onSelect(addr, feature); } catch (e) { console.error(e); }
      this.close();
    }

    close() {
      this.listEl.style.display = "none";
      this.currentIndex = -1;
    }

    /** Rebind the onSelect callback (e.g. when the form context changes). */
    setOnSelect(fn) {
      this.onSelect = fn || function () {};
    }
  }

  // Tiny helper for forms that want to map a structured address to multiple
  // field IDs in one line.
  function fillFields(mapping, addr) {
    Object.keys(mapping).forEach(function (field) {
      var el = document.getElementById(mapping[field]);
      if (el && addr[field] !== undefined && addr[field] !== null) {
        el.value = addr[field];
        try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }
    });
  }

  global.AddressAutocomplete = AddressAutocomplete;
  global.fillAddressFields = fillFields;
})(window);
