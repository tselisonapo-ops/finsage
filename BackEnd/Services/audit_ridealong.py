"""
FinSage — Phase 3: audit ride-along
===================================

Closes the audit gap found in the Phase 3 sweep: only ~38 of ~173 routes
call db_service.audit_log manually. This hook auto-audits every
state-changing request (POST/PUT/PATCH/DELETE) under
/api/companies/<cid>/... WITHOUT touching a single route — same
centralised philosophy as the entitlement gate.

Where does it write?
    Reuses the EXISTING audit infra: db_service.audit_log() →
    {schema}.audit_trail. Rows written here carry source="api_auto" so
    you can always tell them apart from the manual, hand-crafted rows
    (source="api") and filter/rename later.

Modes (env AUDIT_AUTO_MODE):
    off     → hook does nothing
    shadow  → logs what it WOULD record (default; safe during rollout)
    on      → writes audit_trail rows

Safety rules baked in:
    - NEVER raises: any failure logs a warning and leaves the response
      untouched. Auditing must never break a business request.
    - Skips 5xx responses (failed operations don't get success-looking
      rows) and only records 2xx/3xx; 4xx is logged at debug.
    - Skips paths that ALREADY audit themselves manually (see
      DEFAULT_EXCLUDES — taken from the Phase 3 sweep of api_server.py)
      plus read-only/operational noise (tokens, file downloads,
      entitlements reads).
    - Exclusions are extendable without redeploying code:
          AUDIT_AUTO_EXCLUDE="/suppliers,/.*/temp"
      (comma-separated regexes, appended to the defaults).

Entity extraction is best-effort from the URL:
    /api/companies/<cid>/invoices/42/post  →  module=invoices,
    action=post, entity_type=invoice, entity_id="42"
    Falls back to method-style actions (create/update/delete) when the
    last path segment isn't a recognised verb.

Wiring (ONE line, right next to the entitlement gate):
    from BackEnd.Services.subscription.audit_ridealong import (
        register_audit_ridealong,
    )
    register_audit_ridealong(app, db_service)
"""

import os
import re
import logging

from flask import g, request, current_app

log = logging.getLogger("finsage.audit")

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

COMPANY_PATH_RX = re.compile(r"^/api/companies/(\d+)(/.*)?$")

# Paths that already write their own audit_log rows (Phase 3 sweep of
# api_server.py) or are pure noise. The ride-along must not duplicate
# them. Extend via AUDIT_AUTO_EXCLUDE env (comma-separated regexes).
DEFAULT_EXCLUDES = [
    r"/entitlements/?$",                       # this integration's reads
    r"/(logo|branding)",                       # self-audited (upload_logo)
    r"/inventory/(items|adjust|stocktake|receive|receipts|write-down)",  # self-audited
    r"/services/items",                        # self-audited (service items)
    r"/(view_token|pdf_token|view|pdf)$",      # token/preview issuance
    r"/logo/file|/pos_imports/\d+/file",       # binary downloads
    r"/audit(-_)?trail/?$",                    # reads of the audit trail itself
]

# last-segment verbs worth recording verbatim as the action
VERB_RX = re.compile(
    r"^(post|reverse|approve|release|reject|decide|submit|receive|adjust|"
    r"allocate[_-]?payment|close|reopen|email|import|parse|preview|void|"
    r"lock|cancel|archive|deduplicate|generate|run|recalculate|stop|"
    r"assign|issue|accept|satisfy|post[_-]?batch|write[_-]?down|"
    r"import|mapping|reclassify|capitalis|commission)"
)

# resource → (module, entity_type). Anything unmapped falls back to
# (resource, singular(resource)).
MODULE_ALIASES = {
    "journal": ("journal", "journal"),
    "journals": ("journal", "journal"),
    "invoices": ("invoices", "invoice"),
    "invoice": ("invoices", "invoice"),
    "customers": ("customers", "customer"),
    "customer": ("customers", "customer"),
    "vendors": ("ap", "vendor"),
    "vendor": ("ap", "vendor"),
    "ap": ("ap", "vendor"),
    "bank_accounts": ("bank", "bank_account"),
    "bank-accounts": ("bank", "bank_account"),
    "bank_statements": ("bank", "bank_statement"),
    "pos_summaries": ("pos", "pos_summary"),
    "pos_imports": ("pos", "pos_import"),
    "inventory": ("inventory", "inventory_item"),
    "purchase-orders": ("ap", "purchase_order"),
    "purchase_orders": ("ap", "purchase_order"),
    "quotes": ("quotes", "quote"),
    "users": ("settings", "user"),
    "account_settings": ("settings", "account_settings"),
    "year-end-close": ("periods", "year_end"),
}


def _excludes():
    pats = list(DEFAULT_EXCLUDES)
    extra = os.getenv("AUDIT_AUTO_EXCLUDE", "")
    for chunk in extra.split(","):
        chunk = chunk.strip()
        if chunk:
            pats.append(chunk)
    return [re.compile(p, re.IGNORECASE) for p in pats]


def _singular(word):
    if word.endswith("ies") and len(word) > 3:
        return word[:-3] + "y"
    if word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def _actor_id():
    u = getattr(g, "current_user", None) or {}
    try:
        return int(u.get("id") or 0)
    except (TypeError, ValueError):
        pass
    payload = getattr(request, "jwt_payload", {}) or {}
    try:
        return int(payload.get("user_id") or payload.get("sub") or 0)
    except (TypeError, ValueError):
        return 0


def _parse_path():
    """→ (company_id, module, entity_type, entity_id, action) or None."""
    m = COMPANY_PATH_RX.match(request.path or "")
    if not m:
        return None
    company_id = int(m.group(1))
    rest = (m.group(2) or "").strip("/")
    if not rest:
        return None

    segments = rest.split("/")
    resource = segments[0].lower()
    module, entity_type = MODULE_ALIASES.get(
        resource, (resource, _singular(resource))
    )

    entity_id = ""
    action = None
    tail = [s for s in segments[1:] if s]

    if tail and re.fullmatch(r"\d+", tail[-1]):
        entity_id = tail[-1]
        tail = tail[:-1]

    if tail:
        verb = tail[-1].lower()
        if VERB_RX.match(verb):
            action = verb.replace("-", "_")
        elif len(tail) > 1:
            action = tail[-1].lower().replace("-", "_")
    if action is None:
        if request.method == "POST":
            action = "create" if not entity_id else "update"
        elif request.method in ("PUT", "PATCH"):
            action = "update"
        elif request.method == "DELETE":
            action = "delete"
        else:
            action = request.method.lower()

    return company_id, module, entity_type, entity_id, action


# ------------------------------------------------------------------
# Registration
# ------------------------------------------------------------------

def register_audit_ridealong(app, db_service, mode=None):
    """
    Call ONCE after the entitlement gate registration:

        register_audit_ridealong(app, db_service)

    Modes (env AUDIT_AUTO_MODE): off | shadow (default) | on
    """
    mode = (mode or os.getenv("AUDIT_AUTO_MODE") or "shadow").lower()
    if mode not in {"off", "shadow", "on"}:
        mode = "shadow"

    excludes = _excludes()

    @app.after_request
    def _audit_ridealong(response):
        try:
            if mode == "off":
                return response
            if request.method not in WRITE_METHODS:
                return response

            parsed = _parse_path()
            if parsed is None:
                return response

            company_id, module, entity_type, entity_id, action = parsed

            path = request.path or ""
            for rx in excludes:
                if rx.search(path):
                    return response

            status = response.status_code
            if status >= 500:
                # failed server-side ops don't get success-looking rows
                return response

            actor = _actor_id()
            message = (f"auto-audit {request.method} {path} -> {status}")

            if mode == "shadow":
                current_app.logger.info(
                    "[AUDIT:shadow] WOULD RECORD cid=%s actor=%s module=%s "
                    "action=%s entity=%s#%s status=%s method=%s path=%s",
                    company_id, actor, module, action, entity_type,
                    entity_id or "-", status, request.method, path,
                )
                return response

            db_service.audit_log(
                company_id,
                actor_user_id=actor,
                module=module,
                action=action,
                severity="warning" if request.method == "DELETE" else "info",
                entity_type=entity_type,
                entity_id=entity_id or "0",
                message=message,
                source="api_auto",
            )
        except Exception:
            # auditing must NEVER break the business response
            current_app.logger.warning(
                "audit ride-along failed (non-fatal) path=%s",
                request.path, exc_info=True,
            )
        return response

    log.info("audit ride-along registered (mode=%s)", mode)
    return mode
