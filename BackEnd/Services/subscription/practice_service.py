"""
FinSage — Phase 5: Practice service (plans, metering, delegation uplift)
========================================================================

Three responsibilities, all additive to Phases 1–4:

1. PRACTICE IDENTITY
   A firm is "on a practice plan" when its company_subscriptions row
   points at a plan_code prefixed `practice_`. resolve() already handles
   those codes (PRACTICE_PLAN_TIERS) — the firm's own books are gated by
   the included business tier exactly like any other company.

2. CLIENT-COMPANY METERING
   "Provisioned client companies" = DISTINCT client company ids across
   BOTH registries in the FIRM's schema:
     - {schema}.customer_company_links (customer → linked company)
     - {schema}.engagements where workspace_status='provisioned'
   Count-on-read like every other quota (no counter table, no drift),
   30s per-process cache, tolerant of a missing table (that registry
   simply contributes nothing). Enforced at PROVISIONING time only:
   existing clients are never auto-deleted when a firm downgrades —
   provisioning just stops until they upgrade or unlink.

3. DELEGATION UPLIFT (the "agency" rule)
   Governance rule ③ said practitioner work follows the CLIENT's plan
   (URL company_id resolves it — automatic). Phase 5 layers ONE
   exception on top: a validly-signed DELEGATED token (the JWT that
   enter-workspace issues, carrying source_company_id / target_company_id
   / engagement_id) lifts the practitioner's SESSION to the firm's
   practice plan uplift tier:

       effective_tier = max(client_tier, uplift_tier)

   Hard properties (all enforced here):
     - Session-scoped only. Nothing is written to the client's
       subscription; the client's OWN users keep seeing their own plan.
     - The uplift applies ONLY when the token targets the same company
       as the URL (defence in depth; require_auth re-verifies anyway).
     - The firm's practice plan must be status active|trialing. A lapsed
       practice plan stops powering client workspaces immediately.
     - Client billing flags WIN: if the CLIENT company is in read-only
       grace, writes are blocked for practitioners too (the base state's
       read_only/status/metadata are never overwritten by the uplift).
     - Fail-closed everywhere: any error → the unuplifted base state.
     - Cache-safe: merge_uplift never mutates the cached resolve() dicts.

   Token peek: the gate runs before require_auth, so it reads the JWT
   itself — HMAC-verified against JWT_SECRET_KEY (same secret the app
   uses; algorithms overridable via JWT_PRACTICE_ALGORITHMS, default
   HS256/384/512). Verification failure → no uplift, never a crash.

Wiring (once, AFTER register_entitlement_gate):
    from BackEnd.Services.subscription.practice_service import (
        register_practice,
    )
    register_practice(app, db_service)

The gate and the entitlements endpoint pick the service up from
app.extensions["practice"]; if it isn't registered they behave exactly
as in Phase 4 (no uplift, no metering).

Provisioning routes that DON'T carry the firm's company_id in the URL
(e.g. POST /api/engagements) call the helper directly:

    from flask import current_app
    current_app.extensions["practice"].assert_can_provision(firm_cid)
    # ... create link / engagement / workspace ...
    current_app.extensions["practice"].record_client_added(firm_cid)
"""

import os
import re
import time
import logging

log = logging.getLogger("finsage.practice")

# Same shape as the gate's regex: /api/companies/<cid>/...
COMPANY_PATH_RX = re.compile(r"^/api/companies/(\d+)(/|$)")

PRACTICE_PREFIX = "practice_"

# Plan ladder (practice_seed.py seeds the rows). Kept here as the
# service-level source for upsell logic; module_tiers.PRACTICE_PLAN_TIERS
# is the reviewable mirror for the gate side.
PRACTICE_PLAN_CODES = (
    "practice_starter",
    "practice_growth",
    "practice_firm",
)

NEXT_PRACTICE_PLAN = {
    "practice_starter": "practice_growth",
    "practice_growth": "practice_firm",
    "practice_firm": None,
}

# Limits that describe the FIRM side and must never leak into an
# uplifted CLIENT state.
PRACTICE_ONLY_LIMIT_KEYS = {
    "client_companies",
    "delegation_uplift_tier",
    "practice_users",
}

# A practice plan powers client workspaces only while it's live.
ACTIVE_STATUSES = {"active", "trialing"}


class PracticeLimitReached(Exception):
    """Raised by assert_can_provision. `.payload` is a JSON-ready body
    the route can return as (jsonify(...), 403)."""

    def __init__(self, payload):
        super().__init__(payload.get("error", "practice_limit_reached"))
        self.payload = payload


def _max_limit(current, incoming):
    """Numeric limit merge where -1 means unlimited (wins over any number)."""
    try:
        c = int(current)
    except (TypeError, ValueError):
        c = None
    try:
        v = int(incoming)
    except (TypeError, ValueError):
        v = None
    if c is None:
        return v
    if v is None:
        return c
    if c < 0 or v < 0:
        return -1
    return max(c, v)


def merge_uplift(base_state, firm_state):
    """
    PURE merge — the heart of the delegation uplift. Returns
    (merged_state_or_base, info). Never mutates either input (both come
    from the 60s resolve cache).

    merge rules
      tier      effective = max(base.tier, firm.limits.delegation_uplift_tier)
      features  union; practice_* keys stripped (they describe the FIRM)
      limits    max-wins (-1 wins) on shared keys; practice-only keys skipped
      status / trial / grace / metadata / read_only — BASE ONLY (client
                billing lapsed-ness governs the workspace for everyone)
    """
    base_tier = int(base_state.get("tier") or 0)
    firm_limits = firm_state.get("limits") or {}
    try:
        uplift_to = int(firm_limits.get("delegation_uplift_tier") or 0)
    except (TypeError, ValueError):
        uplift_to = 0

    info = {
        "applied": False,
        "source_company_id": firm_state.get("company_id"),
        "practice_plan_code": firm_state.get("plan_code"),
        "uplift_to_tier": uplift_to,
        "effective_tier": base_tier,
    }

    # Defence in depth: even a direct caller can't uplift from a
    # non-practice state, whatever its limits claim.
    if not str(firm_state.get("plan_code") or "").startswith(PRACTICE_PREFIX):
        return base_state, info

    if uplift_to <= 0 or uplift_to <= base_tier:
        # Nothing to lift (firm plan has no uplift, or the client's own
        # plan already meets/exceeds it) — return the base untouched.
        return base_state, info

    base_features = dict(base_state.get("features") or {})
    for key, value in (firm_state.get("features") or {}).items():
        if str(key).startswith("practice_"):
            continue
        base_features[key] = bool(base_features.get(key, False)) or bool(value)

    base_limits = dict(base_state.get("limits") or {})
    for key, value in (firm_limits or {}).items():
        if str(key).startswith("practice_") or key in PRACTICE_ONLY_LIMIT_KEYS:
            continue
        base_limits[key] = _max_limit(base_limits.get(key), value)

    merged = dict(base_state)
    merged["features"] = base_features
    merged["limits"] = base_limits
    merged["tier"] = uplift_to

    info["applied"] = True
    info["effective_tier"] = uplift_to
    merged["practice_uplift"] = info
    return merged, info


class PracticeService:
    """
    db_service needs: get_conn(), company_schema(cid).
    entitlement_service: the shared EntitlementService (resolve cache);
    auto-wired from app.extensions["entitlements"] if not passed.
    """

    CLIENTS_CACHE_TTL = 30  # seconds; provisioning is rare, counts are cheap

    def __init__(self, db_service, entitlement_service=None):
        self.db = db_service
        self.ent = entitlement_service
        self._clients_cache = {}   # company_id -> (expires_at, used_count)

    # ------------------------------------------------------------------
    # wiring helpers
    # ------------------------------------------------------------------

    def _ent(self):
        if self.ent is not None:
            return self.ent
        try:
            from flask import current_app
            self.ent = current_app.extensions.get("entitlements")
        except Exception:
            self.ent = None
        if self.ent is None:
            from subscription.entitlements import (
                EntitlementService,
            )
            self.ent = EntitlementService(self.db)
        return self.ent

    def record_client_added(self, company_id):
        """Call AFTER a successful client provisioning so the count is
          fresh on the very next request (the 30s TTL is the backstop)."""
        self._clients_cache.pop(company_id, None)

    # ------------------------------------------------------------------
    # practice identity
    # ------------------------------------------------------------------

    def practice_state(self, company_id):
        """
        Firm-side view for the endpoint/gate:
            {"plan_code","status","tier","uplift_to_tier",
             "features","limits","clients":{used,limit,unlimited,remaining}}
        None when the company is not on a practice plan.
        """
        state = self._ent().resolve(company_id)
        plan_code = str(state.get("plan_code") or "")
        if not plan_code.startswith(PRACTICE_PREFIX):
            return None

        limits = state.get("limits") or {}
        try:
            uplift_to = int(limits.get("delegation_uplift_tier") or 0)
            client_limit = int(limits.get("client_companies") or 0)
        except (TypeError, ValueError):
            uplift_to, client_limit = 0, 0

        if client_limit < 0:
            clients = {"used": None, "limit": -1, "unlimited": True,
                       "remaining": None}
        else:
            used = self.count_provisioned_clients(company_id)
            clients = {"used": used, "limit": client_limit,
                       "unlimited": False,
                       "remaining": max(client_limit - used, 0)}

        return {
            "plan_code": plan_code,
            "status": state.get("status"),
            "tier": int(state.get("tier") or 0),
            "uplift_to_tier": uplift_to,
            "features": state.get("features") or {},
            "limits": limits,
            "clients": clients,
            "next_practice_plan": NEXT_PRACTICE_PLAN.get(plan_code),
        }

    # ------------------------------------------------------------------
    # client-company metering (count-on-read)
    # ------------------------------------------------------------------

    def count_provisioned_clients(self, company_id):
        now = time.time()
        cached = self._clients_cache.get(company_id)
        if cached and cached[0] > now:
            return cached[1]
        used = self._count_clients_uncached(company_id)
        self._clients_cache[company_id] = (now + self.CLIENTS_CACHE_TTL, used)
        return used

    def _count_clients_uncached(self, company_id):
        schema = self.db.company_schema(company_id)

        union_sql = """
            SELECT COUNT(DISTINCT cid) FROM (
                SELECT linked_company_id AS cid
                  FROM {schema}.customer_company_links
                 WHERE company_id = %s
                   AND COALESCE(is_active, TRUE) = TRUE
                UNION
                SELECT target_company_id AS cid
                  FROM {schema}.engagements
                 WHERE company_id = %s
                   AND COALESCE(is_active, TRUE) = TRUE
                   AND LOWER(COALESCE(workspace_status, '')) = 'provisioned'
            ) t
        """.format(schema=schema)

        links_only_sql = """
            SELECT COUNT(DISTINCT linked_company_id)
              FROM {schema}.customer_company_links
             WHERE company_id = %s
               AND COALESCE(is_active, TRUE) = TRUE
        """.format(schema=schema)

        engagements_only_sql = """
            SELECT COUNT(DISTINCT target_company_id)
              FROM {schema}.engagements
             WHERE company_id = %s
               AND COALESCE(is_active, TRUE) = TRUE
               AND LOWER(COALESCE(workspace_status, '')) = 'provisioned'
        """.format(schema=schema)

        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                try:
                    cur.execute(union_sql, (company_id, company_id))
                    return int(cur.fetchone()[0])
                except Exception as exc:
                    # One registry table may not exist yet — fall back to
                    # whichever does. Never let metering break a request.
                    msg = str(exc).lower()
                    if "does not exist" not in msg and "undefinedtable" not in msg:
                        raise
                    log.warning(
                        "practice metering fallback cid=%s (%s)",
                        company_id, msg.split("\n")[0][:120],
                    )
                try:
                    cur.execute(links_only_sql, (company_id,))
                    return int(cur.fetchone()[0])
                except Exception as exc:
                    msg = str(exc).lower()
                    if "does not exist" not in msg and "undefinedtable" not in msg:
                        raise
                try:
                    cur.execute(engagements_only_sql, (company_id,))
                    return int(cur.fetchone()[0])
                except Exception:
                    return 0
        finally:
            conn.close()

    def list_clients(self, company_id, limit=500):
        """Client roster for the practice overview endpoint: the
        provisioned client companies with their OWN plan/status."""
        schema = self.db.company_schema(company_id)
        sql = """
            SELECT c.id, c.name, c.industry,
                   s.plan_code, s.status
            FROM (
                SELECT DISTINCT linked_company_id AS cid
                  FROM {schema}.customer_company_links
                 WHERE company_id = %s
                   AND COALESCE(is_active, TRUE) = TRUE
                UNION
                SELECT DISTINCT target_company_id AS cid
                  FROM {schema}.engagements
                 WHERE company_id = %s
                   AND COALESCE(is_active, TRUE) = TRUE
                   AND LOWER(COALESCE(workspace_status, '')) = 'provisioned'
            ) u
            JOIN public.companies c ON c.id = u.cid
            LEFT JOIN LATERAL (
                SELECT p.plan_code, s2.status
                FROM public.company_subscriptions s2
                JOIN public.subscription_plans p ON p.id = s2.plan_id
                WHERE s2.company_id = u.cid
                ORDER BY s2.created_at DESC
                LIMIT 1
            ) s ON TRUE
            ORDER BY c.name
            LIMIT %s
        """.format(schema=schema)

        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                try:
                    cur.execute(sql, (company_id, company_id, int(limit)))
                    rows = cur.fetchall()
                except Exception as exc:
                    msg = str(exc).lower()
                    if "does not exist" not in msg and "undefinedtable" not in msg:
                        raise
                    log.warning("practice roster unavailable cid=%s",
                                company_id)
                    return []
        finally:
            conn.close()

        clients = []
        for cid, name, industry, plan_code, status in rows:
            clients.append({
                "company_id": int(cid),
                "name": name,
                "industry": industry,
                "plan_code": plan_code,
                "status": status,
            })
        return clients

    # ------------------------------------------------------------------
    # provisioning meter (quota helper + gate check)
    # ------------------------------------------------------------------

    def check_provision_quota(self, company_id, path=None, method="POST"):
        """
        Gate-side check. Returns None when NOT applicable (non-POST, path
        not a provisioning shape, or company not on a practice plan);
        otherwise a dict with allowed/used/limit.
        """
        path = path if path is not None else _request_path()
        if method != "POST" or not path:
            return None

        try:
            from BackEnd.Services.module_tiers import (
                PRACTICE_PROVISION_RULES,
            )
        except Exception:
            from module_tiers import PRACTICE_PROVISION_RULES

        for rx, quota_key in PRACTICE_PROVISION_RULES:
            if rx.search(path):
                break
        else:
            return None

        state = self._ent().resolve(company_id)
        plan_code = str(state.get("plan_code") or "")
        if not plan_code.startswith(PRACTICE_PREFIX):
            return None

        try:
            client_limit = int(
                (state.get("limits") or {}).get("client_companies") or 0)
        except (TypeError, ValueError):
            client_limit = 0

        if client_limit < 0:
            return {"quota_key": "client_companies", "allowed": True,
                    "unlimited": True, "used": None, "limit": -1,
                    "plan_code": plan_code,
                    "status": state.get("status")}

        used = self.count_provisioned_clients(company_id)
        return {"quota_key": "client_companies",
                "allowed": (used + 1) <= client_limit,
                "unlimited": False, "used": used, "limit": client_limit,
                "plan_code": plan_code, "status": state.get("status")}

    def assert_can_provision(self, company_id, actor_user_id=None):
        """
        Route-side guard for provisioning endpoints the gate can't see
        (no company_id in the URL). Non-practice firms pass unmetered —
        deliberate: pre-Phase-5 firms keep working, shadow logs show
        their usage until you convert them deliberately.

        Raises PracticeLimitReached when a practice firm is at its
        client_companies limit.
        """
        state = self._ent().resolve(company_id)
        plan_code = str(state.get("plan_code") or "")

        if not plan_code.startswith(PRACTICE_PREFIX):
            return {"allowed": True, "metered": False,
                    "reason": "not_on_practice_plan"}

        try:
            client_limit = int(
                (state.get("limits") or {}).get("client_companies") or 0)
        except (TypeError, ValueError):
            client_limit = 0

        if client_limit < 0:
            return {"allowed": True, "metered": True, "unlimited": True,
                    "plan_code": plan_code}

        used = self.count_provisioned_clients(company_id)
        if used + 1 <= client_limit:
            return {"allowed": True, "metered": True,
                    "used": used, "limit": client_limit,
                    "plan_code": plan_code}

        log.warning(
            "practice provision DENIED cid=%s plan=%s used=%s limit=%s",
            company_id, plan_code, used, client_limit,
        )
        raise PracticeLimitReached({
            "ok": False,
            "error": "practice_limit_reached",
            "practice_plan": plan_code,
            "next_practice_plan": NEXT_PRACTICE_PLAN.get(plan_code),
            "upgrade": True,
            "quota": {"key": "client_companies", "used": used,
                      "limit": client_limit, "unlimited": False,
                      "remaining": 0},
            "actor_user_id": actor_user_id,
        })

    # ------------------------------------------------------------------
    # delegation uplift (request-aware; gate + endpoint call this)
    # ------------------------------------------------------------------

    def peek_delegated_token(self, token=None, secret=None):
        """
        Reads the delegated JWT the way enter-workspace issued it.
        HMAC-VERIFIED (fail-closed): signature/algorithm failures mean
        NO uplift, never an error. Returns
            {"source_company_id","target_company_id","engagement_id"}
        or None.
        """
        claims = self._decode_bearer(token=token, secret=secret)
        if not claims:
            return None

        delegated = bool(claims.get("is_delegated_company_access")) or \
            str(claims.get("access_scope") or "") == "delegated_workspace"
        if not delegated:
            return None

        def _int(v):
            try:
                return int(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        source = _int(claims.get("source_company_id"))
        target = _int(claims.get("target_company_id")
                      or claims.get("company_id"))
        if not source or not target:
            return None

        return {
            "source_company_id": source,
            "target_company_id": target,
            "engagement_id": _int(claims.get("engagement_id")),
        }

    def _decode_bearer(self, token=None, secret=None):
        try:
            if token is None:
                from flask import request
                header = request.headers.get("Authorization", "") or ""
                if not header.lower().startswith("bearer "):
                    return None
                token = header[7:].strip()
            if not token:
                return None

            secret = secret or os.getenv("JWT_SECRET_KEY")
            if not secret:
                log.warning(
                    "JWT_SECRET_KEY not set — delegation uplift disabled")
                return None

            algorithms = [a.strip() for a in (
                os.getenv("JWT_PRACTICE_ALGORITHMS")
                or "HS256,HS384,HS512"
            ).split(",") if a.strip()]

            import jwt  # PyJWT — same library api_server uses

            claims = jwt.decode(token, key=secret, algorithms=algorithms)
            return claims if isinstance(claims, dict) else None
        except Exception as exc:
            # Signature/alg/expiry problems → no uplift. Log once-level
            # detail but never raise into the request path.
            log.info("delegation peek skipped: %s",
                     str(exc)[:140])
            return None

    def apply_delegation_uplift(self, base_state):
        """
        The single entry point the gate and the entitlements endpoint
        call. base_state = service.resolve(url_company_id). Returns the
        merged (uplifted) state, or the base state untouched. NEVER
        raises; NEVER mutates the cached base dict.
        """
        try:
            if not base_state or base_state.get("company_id") is None:
                return base_state

            path = _request_path()
            if not path or not COMPANY_PATH_RX.match(path):
                return base_state

            claims = self.peek_delegated_token()
            if not claims:
                return base_state

            if int(claims["target_company_id"]) != \
                    int(base_state["company_id"]):
                # Token for a different company than the URL — let the
                # normal (unuplifted) checks govern; require_auth will
                # have its own opinion.
                return base_state

            firm_state = self._ent().resolve(claims["source_company_id"])
            if not firm_state:
                return base_state

            plan_code = str(firm_state.get("plan_code") or "")
            if not plan_code.startswith(PRACTICE_PREFIX):
                return base_state

            if firm_state.get("status") not in ACTIVE_STATUSES:
                log.info(
                    "uplift withheld: firm cid=%s practice plan=%s "
                    "status=%s (needs active|trialing)",
                    claims["source_company_id"], plan_code,
                    firm_state.get("status"),
                )
                return base_state

            merged, info = merge_uplift(base_state, firm_state)
            if info.get("applied"):
                log.info(
                    "practice uplift client=%s firm=%s plan=%s "
                    "engagement=%s tier %s→%s",
                    base_state["company_id"], claims["source_company_id"],
                    plan_code, claims.get("engagement_id"),
                    base_state.get("tier"), info["effective_tier"],
                )
            return merged
        except Exception:
            log.warning("delegation uplift check failed — "
                        "continuing unuplifted", exc_info=True)
            return base_state


def _request_path():
    """Request path when inside a Flask request, else None (pure tests,
    cron jobs)."""
    try:
        from flask import request
        return request.path or None
    except Exception:
        return None


def register_practice(app, db_service, entitlement_service=None):
    """
    Call ONCE, after register_entitlement_gate(app, db_service):
        register_practice(app, db_service)
    """
    svc = PracticeService(db_service, entitlement_service=entitlement_service)
    app.extensions["practice"] = svc
    log.info("practice service registered (metering + delegation uplift)")
    return svc
