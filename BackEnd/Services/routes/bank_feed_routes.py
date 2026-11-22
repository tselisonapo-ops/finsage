from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app, make_response
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service
from BackEnd.Services.bank_feed_service import bank_feed_service

bank_feeds_bp = Blueprint("bank_feeds_bp", __name__)

def _corsify(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, x-pos-client-version, Accept"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    return resp

def _deny_if_wrong_company(payload, company_id: int):
    role = (payload.get("role") or "").strip().lower()
    if role == "admin":
        return None
    token_cid = payload.get("token_company_id", payload.get("company_id"))
    allowed = payload.get("token_allowed_company_ids") or payload.get("allowed_company_ids") or []
    try:
        allowed = [int(x) for x in allowed]
    except Exception:
        allowed = []
    try:
        cid = int(company_id)
        if token_cid and int(token_cid) == cid:
            return None
        if cid in allowed:
            return None
    except Exception:
        pass
    return jsonify({"ok": False, "error": "AUTH|forbidden_company"}), 403

@bank_feeds_bp.route("/api/companies/<int:company_id>/bank-feeds", methods=["GET", "POST", "OPTIONS"])
@require_auth
def list_or_connect_bank_feeds(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    payload = getattr(request, "auth_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    if request.method == "GET":
        feeds = db_service.list_bank_feeds(company_id)
        return _corsify(jsonify({"ok": True, "bank_feeds": feeds}))

    # POST - Connect bank feed
    body = request.get_json(silent=True) or {}
    created = db_service.create_bank_feed(company_id, body)

    # Auto-run an initial sync so the feed is populated immediately
    try:
        sync_result = bank_feed_service.sync_feed(company_id, int(created["id"]))
        created["initial_sync"] = sync_result
    except Exception as ex:
        current_app.logger.warning(f"Initial bank feed sync warning: {ex}")

    return _corsify(jsonify({"ok": True, "bank_feed": created})), 201

@bank_feeds_bp.route("/api/companies/<int:company_id>/bank-feeds/<int:feed_id>/sync", methods=["POST", "OPTIONS"])
@require_auth
def sync_bank_feed_endpoint(company_id: int, feed_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    payload = getattr(request, "auth_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    body = request.get_json(silent=True) or {}
    custom_txns = body.get("transactions")

    try:
        result = bank_feed_service.sync_feed(company_id, feed_id, transactions=custom_txns)
        return _corsify(jsonify(result))
    except Exception as ex:
        current_app.logger.exception(f"Bank feed sync failed: {ex}")
        return _corsify(jsonify({"ok": False, "error": str(ex)})), 500

@bank_feeds_bp.route("/api/companies/<int:company_id>/bank-feeds/<int:feed_id>/disconnect", methods=["POST", "OPTIONS"])
@require_auth
def disconnect_feed_endpoint(company_id: int, feed_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    payload = getattr(request, "auth_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    ok = db_service.disconnect_bank_feed(company_id, feed_id)
    return _corsify(jsonify({"ok": ok}))

@bank_feeds_bp.route("/api/companies/<int:company_id>/bank-feeds/webhook", methods=["POST", "OPTIONS"])
def bank_feed_webhook(company_id: int):
    """
    Receives real-time push events from Open Banking aggregators (Stitch / Plaid / TrueLayer).
    """
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    body = request.get_json(silent=True) or {}
    current_app.logger.info(f"Received bank feed webhook for company {company_id}: {body}")

    feed_id = body.get("feed_id")
    if feed_id:
        try:
            bank_feed_service.sync_feed(company_id, int(feed_id))
        except Exception as ex:
            current_app.logger.error(f"Webhook sync error: {ex}")

    return _corsify(jsonify({"ok": True, "received": True}))
