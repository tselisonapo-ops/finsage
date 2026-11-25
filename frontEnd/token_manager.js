/**
 * token_manager.js — FinSage client-side security module
 *
 * GOAL
 *   Stop storing the access token in localStorage / sessionStorage.
 *   localStorage is readable by any JavaScript on the page, so a
 *   single XSS is enough to steal the token. Instead:
 *
 *     1. The access token lives ONLY in a JavaScript variable
 *        (window.__FS_ACCESS_TOKEN__). It is never persisted to
 *        localStorage, sessionStorage, or a cookie. A page reload
 *        clears it, and the token is recovered from the HTTP-only
 *        refresh-cookie via /api/auth/refresh.
 *
 *     2. The refresh token lives in an HTTP-only, SameSite=Strict
 *        cookie set by the backend. JavaScript cannot read it.
 *        XSS can therefore never steal it.
 *
 *     3. The access token expires every 15 minutes. This module
 *        automatically calls /api/auth/refresh every 10 minutes
 *        (well before the 15-minute deadline) to slide the session.
 *
 *     4. If any API call returns HTTP 401, this module transparently
 *        calls /api/auth/refresh once, then retries the original
 *        request with the fresh token.
 *
 * USAGE
 *   Load this script BEFORE dashboard.js / practitionerdashboard.js
 *   (and before any other script that calls apiFetch).
 *
 *   <script src="token_manager.js"></script>
 *   <script src="dashboard.js"></script>
 *
 *   The module exposes:
 *     window.getToken()        -> current access token (string, may be "")
 *     window.setToken(token)   -> store a freshly-received access token
 *     window.clearToken()      -> wipe the in-memory token
 *     window.apiFetch(url, opts) -> drop-in replacement for fetch()
 *                                   that auto-attaches the Bearer header
 *                                   and auto-refreshes on 401
 *     window.bootstrapSession() -> async; call on page load to recover
 *                                   the session from the refresh cookie
 *     window.FS_TOKEN_EVENTS   -> EventTarget for "tokenexpired" /
 *                                   "sessionlost" events
 */

(function () {
  "use strict";

  if (window.__FS_TOKEN_MANAGER_LOADED__) return;
  window.__FS_TOKEN_MANAGER_LOADED__ = true;

  // ── Configuration ──────────────────────────────────────────────
  var API_BASE =
    (window.APP_CONFIG && window.APP_CONFIG.API_BASE) ||
    (window.location.hostname === "127.0.0.1" ||
     window.location.hostname === "localhost"
      ? "http://127.0.0.1:5000"
      : "");

  var REFRESH_ENDPOINT = API_BASE + "/api/auth/refresh";
  var LOGOUT_ENDPOINT = API_BASE + "/api/auth/logout";

  // Refresh every 10 minutes (access token lives 15 min, so this
  // gives a 5-minute safety margin).
  var AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

  // ── In-memory token storage (NEVER persisted) ──────────────────
  var _accessToken = "";
  var _userPayload = null;        // cached decoded JWT payload
  var _refreshTimerId = null;
  var _refreshingPromise = null;  // in-flight refresh (dedup)

  // ── Event target for session lifecycle ─────────────────────────
  var _events = new EventTarget();
  window.FS_TOKEN_EVENTS = _events;

  function _emit(type, detail) {
    try {
      _events.dispatchEvent(new CustomEvent(type, { detail: detail || {} }));
    } catch (_) {}
  }

  // ── Public token accessors (replace the old getToken/setToken) ─
  window.getToken = function () {
    return _accessToken || "";
  };

  window.setToken = function (token) {
    if (!token) {
      _accessToken = "";
      _userPayload = null;
      return;
    }
    _accessToken = String(token);
    _userPayload = _decodeJwt(token);
  };

  window.clearToken = function () {
    _accessToken = "";
    _userPayload = null;
  };

  // Keep a legacy alias for any code that still calls setToken(…, persist)
  window.setTokenPersistent = window.setToken;
  window.setActiveCompanyToken = window.setToken;   // delegated posting
  window.clearActiveCompanyToken = window.clearToken;

  function _decodeJwt(token) {
    try {
      var parts = String(token || "").split(".");
      if (parts.length < 2) return null;
      var payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(payload);
    } catch (_) {
      return null;
    }
  }

  // ── Refresh the access token using the HTTP-only cookie ────────
  /**
   * Calls /api/auth/refresh with credentials:"include" so the
   * browser attaches the HTTP-only refresh cookie automatically.
   *
   * Returns a Promise that resolves to the new token string,
   * or rejects if the refresh failed (cookie missing/expired).
   *
   * Concurrent callers share the same in-flight promise so we
   * never hit the endpoint more than once at the same time.
   */
  function _refreshToken() {
    if (_refreshingPromise) return _refreshingPromise;

    _refreshingPromise = (async function () {
      try {
        var res = await fetch(REFRESH_ENDPOINT, {
          method: "POST",
          credentials: "include",          // send the HTTP-only cookie
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          // 401 means the refresh cookie itself is invalid/expired.
          // The session is truly lost — caller must redirect to signin.
          throw new Error("refresh_failed_" + res.status);
        }

        var data = await res.json();
        if (!data || !data.token) {
          throw new Error("refresh_no_token");
        }

        window.setToken(data.token);

        // Cache user metadata from the refresh response if provided.
        if (data.user) {
          try {
            var stored = JSON.parse(localStorage.getItem("fs_user") || "{}");
            var merged = Object.assign({}, stored, data.user);
            localStorage.setItem("fs_user", JSON.stringify(merged));
            if (data.user.email) localStorage.setItem("userEmail", data.user.email);
            if (data.user.role) localStorage.setItem("userRole", data.user.role);
            if (data.user.company_id != null)
              localStorage.setItem("company_id", String(data.user.company_id));
          } catch (_) {}
        }

        _emit("tokenrefreshed", { expires_in: data.expires_in });
        return data.token;
      } finally {
        _refreshingPromise = null;
      }
    })();

    return _refreshingPromise;
  }

  window.refreshToken = _refreshToken;

  // ── Bootstrap: recover the session on page load ────────────────
  /**
   * Call this once on every page load (dashboard.html,
   * practitionerdashboard.html) BEFORE any API calls.
   *
   * It tries to recover the access token from the HTTP-only
   * refresh cookie. If that fails, it redirects to signin.
   *
   * Returns true if the session was recovered, false otherwise.
   */
  async function bootstrapSession() {
    // If we already have a token in memory (e.g. from signin.html
    // redirecting with a freshly-issued token), keep it.
    if (_accessToken) {
      _startAutoRefresh();
      return true;
    }

    // Otherwise, exchange the refresh cookie for a new access token.
    try {
      await _refreshToken();
      _startAutoRefresh();
      return true;
    } catch (err) {
      console.warn("[token_manager] bootstrap failed:", err);
      _emit("sessionlost", { reason: String(err && err.message || err) });
      return false;
    }
  }
  window.bootstrapSession = bootstrapSession;

  // ── Auto-refresh every 10 minutes ──────────────────────────────
  function _startAutoRefresh() {
    if (_refreshTimerId) return;   // already running

    _refreshTimerId = setInterval(async function () {
      try {
        await _refreshToken();
        console.log("[token_manager] access token refreshed (10-min tick)");
      } catch (err) {
        console.warn("[token_manager] auto-refresh failed:", err);
        _emit("sessionlost", { reason: String(err && err.message || err) });
        _stopAutoRefresh();
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    // Also refresh when the tab regains focus (covers the case
    // where the user left the tab idle for >15 min).
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        _refreshToken().catch(function () {});
      }
    });
  }

  function _stopAutoRefresh() {
    if (_refreshTimerId) {
      clearInterval(_refreshTimerId);
      _refreshTimerId = null;
    }
  }
  window.stopAutoRefresh = _stopAutoRefresh;

  // ── apiFetch: drop-in replacement with auto-refresh-on-401 ─────
  /**
   * Wrapper around fetch() that:
   *   1. Attaches Authorization: Bearer <token> automatically.
   *   2. On HTTP 401, transparently calls /api/auth/refresh and
   *      retries the original request ONCE with the new token.
   *   3. If the refresh also fails, dispatches "sessionlost" and
   *      throws so the caller can handle the redirect.
   *
   * Supports the same calling convention as the old apiFetch:
   *   apiFetch(url, options) -> Promise<data>
   * where `url` can be relative ("/api/...") or absolute.
   */
  window.apiFetch = async function apiFetch(url, options) {
    options = options || {};

    // Normalize the URL
    var finalUrl = url;
    if (url && !/^https?:\/\//i.test(url)) {
      finalUrl = (url.charAt(0) === "/" ? API_BASE + url : API_BASE + "/" + url);
    }

    // Build headers
    var headers = new Headers(options.headers || {});
    var token = window.getToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", "Bearer " + token);
    }
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    // Delegated posting context headers (preserved from old apiFetch)
    try {
      var postingCtx = JSON.parse(localStorage.getItem("fs_posting_context") || "null");
      if (postingCtx) {
        if (postingCtx.engagementId) headers.set("X-FS-Engagement-Id", String(postingCtx.engagementId));
        if (postingCtx.sourceCompanyId) headers.set("X-FS-Source-Company-Id", String(postingCtx.sourceCompanyId));
        if (postingCtx.targetCompanyId) headers.set("X-FS-Target-Company-Id", String(postingCtx.targetCompanyId));
      }
    } catch (_) {}

    var res = await fetch(finalUrl, Object.assign({}, options, { headers: headers, credentials: "include" }));

    // ── 401 → refresh + retry ONCE ──────────────────────────────
    if (res.status === 401 && !options.__retried) {
      console.warn("[token_manager] 401 on " + finalUrl + " — refreshing…");
      try {
        var newToken = await _refreshToken();
        // Retry the original request with the new token
        var retryHeaders = new Headers(options.headers || {});
        retryHeaders.set("Authorization", "Bearer " + newToken);
        if (options.body && !retryHeaders.has("Content-Type")) {
          retryHeaders.set("Content-Type", "application/json");
        }
        res = await fetch(finalUrl, Object.assign({}, options, {
          headers: retryHeaders,
          credentials: "include",
          __retried: true,
        }));
      } catch (refreshErr) {
        console.error("[token_manager] refresh-on-401 failed:", refreshErr);
        _emit("sessionlost", { reason: "refresh_failed_on_401" });
        var err = new Error("SESSION_EXPIRED");
        err.status = 401;
        throw err;
      }
    }

    // ── Parse response ──────────────────────────────────────────
    var contentType = res.headers.get("content-type") || "";
    var isJson = contentType.includes("application/json");
    var data = null;

    if (res.status !== 204) {
      if (isJson) {
        var txt = await res.text().catch(function () { return ""; });
        try { data = txt ? JSON.parse(txt) : null; }
        catch (_) {
          var err2 = new Error("INVALID_JSON_RESPONSE");
          err2.status = res.status;
          err2.url = finalUrl;
          throw err2;
        }
      } else {
        data = await res.text().catch(function () { return ""; });
      }
    }

    // Detect HTML responses (often means the session was redirected
    // to a login page by a reverse proxy).
    if (!isJson && typeof data === "string") {
      if (/^\s*<!doctype html|^\s*<html/i.test(data)) {
        _emit("sessionlost", { reason: "html_response" });
        var err3 = new Error("SIGNED_OUT_OR_HTML_RESPONSE");
        err3.status = res.status || 401;
        err3.url = finalUrl;
        throw err3;
      }
    }

    if (!res.ok) {
      var msg = (data && (data.error || data.message || data.detail)) || ("HTTP " + res.status);
      var err4 = new Error(msg);
      err4.status = res.status;
      err4.data = data;
      err4.url = finalUrl;
      throw err4;
    }

    return data;
  };

  // ── Sign-out: revoke the refresh cookie server-side ────────────
  /**
   * Call this instead of the old performFullLogout().
   * It calls /api/auth/logout (which revokes the refresh token
   * and clears the cookie), then wipes the in-memory access
   * token and redirects to signin.
   */
  window.performFullLogout = async function () {
    // Stop the auto-refresh timer
    _stopAutoRefresh();

    // Tell the server to revoke the refresh cookie
    try {
      await fetch(LOGOUT_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch (_) {}

    // Wipe the in-memory access token
    window.clearToken();

    // Clear any non-sensitive cached user metadata
    [
      "fs_user", "userEmail", "userRole", "company_id",
      "CURRENT_COMPANY_ID", "companyName", "fs_industry",
      "fs_subindustry", "fs_session_locked",
      "fs_session_lock_reason", "fs_posting_context",
      "can_access_practitioner_dashboard",
      "can_access_enterprise_dashboard",
    ].forEach(function (k) {
      try { localStorage.removeItem(k); } catch (_) {}
      try { sessionStorage.removeItem(k); } catch (_) {}
    });

    // Redirect to signin
    var base = (window.location.pathname === "/app" ||
                window.location.pathname.indexOf("/app/") === 0) ? "/app" : "";
    window.location.replace(base + "/signin.html?reason=signed_out");
  };

  // ── Session-lost handler: redirect to signin ───────────────────
  // Any code can listen for "sessionlost" and show a modal, but
  // by default we just redirect.
  _events.addEventListener("sessionlost", function () {
    // Avoid redirect loops on the signin page itself
    if (/signin\.html/i.test(window.location.pathname)) return;
    // Give a small delay so any pending console.warn can flush
    setTimeout(function () {
      var base = (window.location.pathname === "/app" ||
                  window.location.pathname.indexOf("/app/") === 0) ? "/app" : "";
      window.location.replace(base + "/signin.html?reason=session_expired");
    }, 200);
  });

  console.log("[token_manager] loaded — access token in memory, refresh cookie HTTP-only, auto-refresh every 10 min");
})();
