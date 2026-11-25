/**
 * posTokenManager.js — POS app security module
 *
 * Manages TWO tokens in memory (never in localStorage):
 *
 *   1. fsToken   — the FinSage user access token (received via
 *                  postMessage from the parent dashboard, or
 *                  recovered via /api/auth/refresh using the
 *                  HTTP-only refresh cookie).
 *
 *   2. posToken  — the POS employee token (received from
 *                  /api/companies/<cid>/pos/auth/signin and
 *                  stored in memory only).
 *
 * Non-sensitive metadata (company_id, employee info, etc.) is
 * kept in sessionStorage so it survives page reloads within the
 * same tab but is cleared when the tab closes.
 *
 * Auto-refresh: every 10 minutes, calls /api/auth/refresh to
 * get a new fsToken using the HTTP-only cookie.
 */

(function () {
  "use strict";

  if (window.__POS_TOKEN_MANAGER_LOADED__) return;
  window.__POS_TOKEN_MANAGER_LOADED__ = true;

  // ── In-memory token storage ────────────────────────────────
  var _fsToken = "";
  var _posToken = "";

  // ── Public accessors ────────────────────────────────────────
  window.getFsToken = function () { return _fsToken; };
  window.setFsToken = function (t) { _fsToken = typeof t === "string" ? t : ""; };

  window.getPosToken = function () { return _posToken; };
  window.setPosToken = function (t) { _posToken = typeof t === "string" ? t : ""; };

  window.clearPosToken = function () { _posToken = ""; };
  window.clearFsToken = function () { _fsToken = ""; };

  // Combined accessor (for backward compat with getAuthToken)
  window.getAuthToken = function () {
    return _fsToken ||
      sessionStorage.getItem("fs_user_token") || // legacy fallback
      "";
  };

  // ── Auto-refresh fsToken every 10 minutes ───────────────────
  var REFRESH_INTERVAL_MS = 10 * 60 * 1000;
  var _refreshTimerId = null;
  var _refreshingPromise = null;

  function _getBaseUrl() {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:5000";
    }
    return window.location.origin;
  }

  function _refreshFsToken() {
    if (_refreshingPromise) return _refreshingPromise;

    _refreshingPromise = (async function () {
      try {
        var res = await fetch(_getBaseUrl() + "/api/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (!res.ok) throw new Error("refresh_failed_" + res.status);

        var data = await res.json();
        if (!data || !data.token) throw new Error("refresh_no_token");

        _fsToken = data.token;

        // Cache user metadata in sessionStorage (not sensitive)
        if (data.user) {
          try {
            sessionStorage.setItem("fs_user", JSON.stringify(data.user));
            if (data.user.email) sessionStorage.setItem("userEmail", data.user.email);
            if (data.user.company_id != null)
              sessionStorage.setItem("company_id", String(data.user.company_id));
          } catch (_) {}
        }

        return data.token;
      } finally {
        _refreshingPromise = null;
      }
    })();

    return _refreshingPromise;
  }

  window.refreshFsToken = _refreshFsToken;

  // ── Bootstrap: recover fsToken on page load ─────────────────
  async function bootstrapSession() {
    if (_fsToken) {
      _startAutoRefresh();
      return true;
    }

    // Check sessionStorage for legacy token (migration fallback)
    var sessionToken = sessionStorage.getItem("fs_user_token");
    if (sessionToken) {
      _fsToken = sessionToken;
      // Clear it from sessionStorage — we only needed it to bridge
      // the transition. Future reloads will use the refresh cookie.
      sessionStorage.removeItem("fs_user_token");
      _startAutoRefresh();
      return true;
    }

    // Try to recover via the HTTP-only refresh cookie
    try {
      await _refreshFsToken();
      _startAutoRefresh();
      return true;
    } catch (err) {
      console.warn("[posTokenManager] bootstrap failed:", err);
      return false;
    }
  }
  window.bootstrapPosSession = bootstrapSession;

  function _startAutoRefresh() {
    if (_refreshTimerId) return;

    _refreshTimerId = setInterval(async function () {
      try {
        await _refreshFsToken();
        console.log("[posTokenManager] fsToken refreshed (10-min tick)");
      } catch (err) {
        console.warn("[posTokenManager] auto-refresh failed:", err);
      }
    }, REFRESH_INTERVAL_MS);

    // Also refresh when tab regains focus
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        _refreshFsToken().catch(function () {});
      }
    });
  }

  console.log("[posTokenManager] loaded — tokens in memory, auto-refresh every 10 min");
})();
