# app/ppe/routes.py
from __future__ import annotations
from BackEnd.Services.assets.tenants import company_schema
from datetime import datetime, date as _date
from flask import request, jsonify, make_response, Blueprint, current_app, g
import psycopg2.extras
from decimal import Decimal
from datetime import date as _date, datetime as _dt
# Add near top of ppe/routes.py
from BackEnd.Services.assets.ppe_db import get_conn
from . import service
from . import posting
from datetime import date, datetime, timedelta
from flask import request, jsonify, current_app
import psycopg2.extras
import json
from BackEnd.Services.db_service import db_service  # <-- adjust if needed
from BackEnd.Services.assets.posting import post_disposal, company_asset_rules
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.credit_policy import can_approve_ppe, can_post_ppe, ppe_review_required, user_role
from BackEnd.Services.company import company_policy

ppe_bp = Blueprint("ppe", __name__)

# -------------------------
# Helpers
# -------------------------
from datetime import date, datetime


def _parse_date(value, field_name: str = "date", required: bool = True) -> date | None:
    """
    Converts incoming payload values into a Python date.

    Accepts:
      - "YYYY-MM-DD"
      - ISO datetime strings
      - JS Date strings
      - datetime
      - date
      - None

    Returns:
      date | None

    Raises:
      ValueError if invalid or required and missing.
    """

    if value is None or value == "":
        if required:
            raise ValueError(f"{field_name} is required.")
        return None

    # Already a date (but not datetime)
    if isinstance(value, date) and not isinstance(value, datetime):
        return value

    # Datetime → date
    if isinstance(value, datetime):
        return value.date()

    # String parsing
    if isinstance(value, str):
        s = value.strip()

        if not s:
            if required:
                raise ValueError(f"{field_name} is required.")
            return None

        try:
            # Handle ISO or datetime strings
            return datetime.fromisoformat(s[:10]).date()
        except Exception:
            pass

        try:
            # Fallback: strict YYYY-MM-DD
            return datetime.strptime(s[:10], "%Y-%m-%d").date()
        except Exception:
            raise ValueError(f"Invalid {field_name}: '{value}'")

    raise ValueError(f"Unsupported {field_name} value type: {type(value).__name__}")



def _parse_optional_date(payload: dict, key: str) -> _date | None:
    v = payload.get(key)

    if v is None:
        return None

    # accept python date/datetime (just in case)
    if isinstance(v, _dt):
        return v.date()
    if isinstance(v, _date):
        return v

    # accept empty string
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        return _date.fromisoformat(s)

    # anything else is invalid
    raise ValueError(f"{key} must be YYYY-MM-DD (string)")

def _must_not_be_future(d, field: str):
    if d and d > _date.today():
        raise ValueError(f"{field} cannot be in the future.")
def _q(schema: str, sql: str) -> str:
    return sql.replace("{schema}", schema)

def _to_date(x):
    if x is None:
        return None
    if isinstance(x, date) and not isinstance(x, datetime):
        return x
    if isinstance(x, datetime):
        return x.date()
    if isinstance(x, str):
        return datetime.fromisoformat(x[:10]).date()
    return None
def _corsify(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    return resp

def _json_error(msg, code=400):
    return jsonify({"ok": False, "error": msg}), code

def _opt():
    return _corsify(make_response("", 204))

def _int_arg(name: str, default: int):
    try:
        return int(request.args.get(name, default))
    except Exception:
        return default

# ✅ keep ONLY ONE _iso_date (string normalizer)

def _iso_date(s) -> _date | None:
    """
    Normalises incoming date values to a Python date object.

    Accepts:
      - "YYYY-MM-DD"
      - ISO datetime strings
      - datetime
      - date
    Returns:
      - datetime.date
      - None if blank
    """
    if not s:
        return None

    if isinstance(s, _date):
        return s

    if isinstance(s, datetime):
        return s.date()

    s = str(s).strip()
    if not s:
        return None

    try:
        return datetime.fromisoformat(s[:10]).date()
    except Exception:
        return None


def _deny_if_wrong_company(
    payload,
    company_id: int,
    *,
    db_service,
    engagement_id: int | None = None,
):
    role = (payload.get("role") or "").strip().lower()
    if role == "admin":
        return None

    user_id = payload.get("user_id") or payload.get("sub")
    try:
        user_id = int(user_id) if user_id is not None else None
    except Exception:
        user_id = None

    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        target_company_id = int(company_id)
    except Exception:
        return jsonify({"ok": False, "error": "AUTH|invalid_company_id"}), 400

    token_company_id = payload.get("token_company_id", payload.get("company_id"))
    try:
        token_company_id = int(token_company_id) if token_company_id is not None else None
    except Exception:
        token_company_id = None

    allowed_company_ids = (
        payload.get("token_allowed_company_ids")
        or payload.get("allowed_company_ids")
        or []
    )
    try:
        allowed_company_ids = [int(x) for x in allowed_company_ids]
    except Exception:
        allowed_company_ids = []

    # direct access
    if target_company_id == token_company_id:
        return None

    if target_company_id in allowed_company_ids:
        return None

    # delegated access through engagement workspaces
    candidate_home_company_ids = []
    if token_company_id is not None:
        candidate_home_company_ids.append(token_company_id)

    for cid in allowed_company_ids:
        if cid not in candidate_home_company_ids:
            candidate_home_company_ids.append(cid)

    for home_company_id in candidate_home_company_ids:
        try:
            with db_service._conn_cursor() as (_, cur):
                delegated_ok = db_service.user_has_delegated_company_access(
                    cur,
                    user_id=user_id,
                    company_id=home_company_id,
                    target_company_id=target_company_id,
                    engagement_id=engagement_id,
                )
            if delegated_ok:
                return None
        except Exception as e:
            print("DELEGATED ACCESS CHECK FAILED", {
                "user_id": user_id,
                "home_company_id": home_company_id,
                "target_company_id": target_company_id,
                "engagement_id": engagement_id,
                "error": str(e),
            })

    return jsonify({"ok": False, "error": "Access denied for this company"}), 403

def _actor_user_id(payload: dict) -> int | None:
    try:
        return int(payload.get("user_id") or payload.get("sub") or 0) or None
    except Exception:
        return None

def _parse_date_arg(name: str) -> date | None:
    """
    Parse ?as_at=YYYY-MM-DD from querystring.
    Returns None if missing/blank.
    Raises ValueError for invalid format.
    """
    v = (request.args.get(name) or "").strip()
    if not v:
        return None
    try:
        return date.fromisoformat(v)
    except Exception:
        raise ValueError(f"Invalid {name}. Use YYYY-MM-DD.")

def _end_of_month(d: date) -> date:
    # next month first day - 1 day
    nm = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return nm - timedelta(days=1)

def _require_approve_post_if_review(*, mode: str, policy: dict, action: str):
    """
    Returns (must_redirect, response, status_code).
    If PPE review is required for this action, block /post and tell FE to call /approve-post.
    """
    try:
        needs_review = bool(ppe_review_required(mode, policy, action))
    except TypeError:
        needs_review = bool(ppe_review_required(mode, policy, doc=action))

    if not needs_review:
        return (False, None, None)

    approve_post_map = {
        "post_depreciation": "/depreciation/{id}/approve-post",
        "post_disposal": "/asset-disposals/{id}/approve-post",
        "post_revaluation": "/revaluations/{id}/approve-post",
        "post_impairment": "/impairments/{id}/approve-post",
        "classify_hfs": "/held-for-sale/{id}/approve-post",
    }
    url_tpl = approve_post_map.get(str(action or "").lower())

    return (
        True,
        jsonify({
            "ok": False,
            "error": "Review required. Use approve-post endpoint.",
            "code": "REVIEW_REQUIRED",
            "action": str(action or "").lower(),
            "approve_post_url": url_tpl,
        }),
        409
    )

def _audit_safe(
    *,
    company_id: int,
    payload: dict,
    module: str,
    action: str,
    entity_type: str,
    entity_id: str,
    entity_ref: str | None = None,
    journal_id: int | None = None,
    vendor_id: int | None = None,
    customer_id: int | None = None,
    amount: float = 0.0,
    currency: str | None = None,
    before_json: dict | None = None,
    after_json: dict | None = None,
    message: str | None = None,
    cur=None,
):
    """Best-effort audit logging using your existing db_service.audit_log(). Never breaks the route."""
    try:
        actor = _actor_user_id(payload) or 0
        db_service.audit_log(
            company_id,
            actor_user_id=actor,
            module=module,
            action=action,
            severity="info",
            entity_type=entity_type,
            entity_id=str(entity_id),
            entity_ref=entity_ref,
            journal_id=journal_id,
            vendor_id=vendor_id,
            customer_id=customer_id,
            amount=float(amount or 0.0),
            currency=currency,
            before_json=before_json or {},
            after_json=after_json or {},
            message=message,
            source="api",
            cur=cur,
        )
    except Exception:
        current_app.logger.exception("audit_log failed (non-fatal)")



@ppe_bp.route("/api/companies/<int:company_id>/asset-acquisitions/<int:acq_id>/journal-preview", methods=["GET", "OPTIONS"])
@require_auth
def acquisition_journal_preview(company_id, acq_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                out = posting.build_asset_acquisition_journal_preview(cur, company_id, acq_id)
                return jsonify(out), 200
    except Exception as e:
        current_app.logger.exception("journal preview failed")
        return _json_error(str(e), 400)

# -------------------------
# ASSETS
# ------------------------
@ppe_bp.route("/api/companies/<int:company_id>/assets", methods=["GET", "POST", "OPTIONS"])
@require_auth
def assets_list_or_create(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    # -------------------------
    # GET (list)
    # -------------------------
    if request.method == "GET":
        status = (request.args.get("status") or "").strip() or None
        asset_class = (request.args.get("class") or "").strip() or None
        q = (request.args.get("q") or "").strip() or None

        limit = _int_arg("limit", 50)
        offset = _int_arg("offset", 0)

        try:
            as_at = _parse_date_arg("as_at") or _end_of_month(date.today())
        except Exception as e:
            return _json_error(str(e), 400)

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_assets(
                    cur,
                    company_id,
                    status=status,
                    asset_class=asset_class,
                    q=q,
                    limit=limit,
                    offset=offset,
                    as_at=as_at,
                )
                return jsonify({"ok": True, "data": rows, "as_at": as_at.isoformat()})

    # -------------------------
    # POST (create)
    # -------------------------
    payload_in = request.get_json(force=True) or {}

    try:
        entry_mode = (payload_in.get("entry_mode") or "acquisition").strip().lower()
        if entry_mode not in ("acquisition", "opening_balance"):
            raise ValueError("Invalid entry_mode. Use 'acquisition' or 'opening_balance'.")

        # -------------------------
        # Date validation
        # -------------------------
        acq = _parse_optional_date(payload_in, "acquisition_date")
        afu = _parse_optional_date(payload_in, "available_for_use_date")

        _must_not_be_future(acq, "Acquisition date")
        _must_not_be_future(afu, "Available for use date")

        if acq and afu and afu < acq:
            raise ValueError("Available for use date cannot be earlier than acquisition date.")

        opening_as_at = None
        if entry_mode == "opening_balance":
            opening_as_at = _parse_optional_date(payload_in, "opening_as_at")
            if not opening_as_at:
                raise ValueError("opening_as_at is required for opening balance assets")

            _must_not_be_future(opening_as_at, "Opening as at")

        posting_date = _parse_optional_date(payload_in, "posting_date")

        if entry_mode == "opening_balance":
            if not posting_date:
                raise ValueError("posting_date is required for opening balance posting")

            _must_not_be_future(posting_date, "Posting date")
            
            if acq and opening_as_at < acq:
                raise ValueError("Opening as at cannot be earlier than acquisition date.")

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                new_id = service.create_asset(cur, company_id, payload_in)

                opening_journal_id = None
                if entry_mode == "opening_balance":
                    opening_journal_id = posting.post_opening_balance(
                        cur,
                        company_id,
                        int(new_id),
                        posting_date=posting_date,   # ✅ ADD THIS
                        user=payload,
                        approved_via="asset_create",
                    )

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_asset",
                    entity_type="asset",
                    entity_id=str(new_id),
                    entity_ref=(
                        payload_in.get("asset_name")
                        or payload_in.get("name")
                        or f"ASSET-{new_id}"
                    ),
                    before_json={"request": payload_in},
                    after_json={
                        "asset_id": int(new_id),
                        "entry_mode": entry_mode,
                        "opening_journal_id": int(opening_journal_id) if opening_journal_id else None,
                    },
                    message=(
                        f"Created opening-balance asset {new_id}"
                        if entry_mode == "opening_balance"
                        else f"Created asset {new_id}"
                    ),
                    cur=cur,
                )

                conn.commit()

                return jsonify({
                    "ok": True,
                    "id": int(new_id),
                    "entry_mode": entry_mode,
                    "opening_journal_id": int(opening_journal_id) if opening_journal_id else None,
                }), 201

    except Exception as e:
        current_app.logger.exception("create_asset failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>", methods=["GET", "PUT", "OPTIONS"])
@require_auth
def assets_get_or_update(company_id, asset_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                row = service.get_asset_with_balances(cur, company_id, asset_id)
                if not row:
                    return _json_error("Not found", 404)
                return jsonify({"ok": True, "data": row})

    # PUT (update)
    payload_in = request.get_json(force=True) or {}
    if not isinstance(payload_in, dict):
        return _json_error("Invalid payload", 400)

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                before = service.get_asset(cur, company_id, asset_id)
                if not before:
                    return _json_error("Not found", 404)

                # -----------------------------
                # ✅ Policy enforcement: model switch eligibility
                # -----------------------------
                # Only enforce if caller is changing measurement_model
                new_model = payload_in.get("measurement_model")
                if new_model is not None:
                    old_model = (before.get("measurement_model") or "").strip().lower()
                    nm = (str(new_model) or "").strip().lower()

                    # normalize common aliases
                    if nm in ("fv", "fairvalue", "fair value"):
                        nm = "fair_value"

                    if nm and nm != old_model:
                        policy_doc = company_asset_rules(company_id)  # reads asset_policies payload_json + defaults
                        # raises ValueError if not allowed
                        posting.assert_model_switch_allowed(before, nm, policy_doc)

                        # store normalized model value so DB is consistent
                        payload_in["measurement_model"] = nm

                # -----------------------------
                # Update
                # -----------------------------
                ok = service.update_asset(cur, company_id, asset_id, payload_in)
                if ok is False:
                    return _json_error("Not found / not updated", 404)

                after = service.get_asset(cur, company_id, asset_id)

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="update_asset",
                    entity_type="asset",
                    entity_id=str(asset_id),
                    entity_ref=(after or {}).get("asset_name") or (before or {}).get("asset_name") or f"ASSET-{asset_id}",
                    before_json={"asset": before, "patch": payload_in},
                    after_json={"asset": after},
                    message=f"Updated asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True})

    except ValueError as ve:
        # policy failures / eligibility failures
        return _json_error(str(ve), 400)
    except Exception as e:
        current_app.logger.exception("update_asset failed")
        return _json_error(str(e), 400)


# -------------------------
# ACQUISITIONS
# -------------------------
@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>/acquisitions", methods=["GET", "POST", "OPTIONS"])
@require_auth
def acquisitions_list_or_create(company_id, asset_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_acquisitions(cur, company_id, asset_id)
                return jsonify({"ok": True, "data": rows})

    # POST: create acquisition
    payload_in = request.get_json(force=True) or {}

    funding = (payload_in.get("funding_source") or payload_in.get("funding") or "cash")
    funding = str(funding).strip().lower()
    if funding == "bank":
        funding = "bank_cash"
    if funding == "cash":
        funding = "bank_cash"
    payload_in["funding_source"] = funding

    posting_date = _parse_optional_date(payload_in, "posting_date")

    reference = (payload_in.get("reference") or "").strip()
    payload_in["reference"] = reference or None
    if not payload_in["reference"]:
        return _json_error("reference is required for acquisition", 400)

    if not posting_date:
        return _json_error("posting_date is required for acquisition", 400)

    _must_not_be_future(posting_date, "Posting date")

    payload_in["posting_date"] = posting_date

    if isinstance(payload_in.get("acquisition_date"), str):
        payload_in["acquisition_date"] = _iso_date(payload_in["acquisition_date"])

    if payload_in.get("supplier_id") is None and payload_in.get("vendor_id") is not None:
        payload_in["supplier_id"] = payload_in.get("vendor_id")

    if funding in ("vendor_credit", "grni"):
        sup = int(payload_in.get("supplier_id") or 0)
        if sup <= 0:
            return _json_error("supplier_id required for vendor_credit/grni funding_source", 400)

    if funding == "vendor_credit":
        inv = (payload_in.get("vendor_invoice_no") or payload_in.get("invoice_no") or payload_in.get("invoice_number") or "").strip()
        payload_in["vendor_invoice_no"] = inv
        if not inv:
            return _json_error("vendor_invoice_no required for vendor_credit funding_source", 400)

    if funding == "grni":
        grn = (payload_in.get("grn_no") or payload_in.get("grn_number") or payload_in.get("grn_ref") or "").strip()
        payload_in["grn_no"] = grn
        if not grn:
            return _json_error("grn_no required for grni funding_source", 400)

    if funding == "bank_cash":
        bank_id = int(payload_in.get("bank_account_id") or 0)
        if bank_id <= 0:
            return _json_error("bank_account_id required for bank/cash funding_source", 400)
        payload_in["bank_account_id"] = bank_id

    if funding == "other":
        other = (payload_in.get("credit_account_code") or "").strip()
        payload_in["credit_account_code"] = other
        if not other:
            return _json_error("credit_account_code required for other funding_source", 400)

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                new_id = service.create_acquisition(cur, company_id, asset_id, payload_in)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_acquisition",
                    entity_type="asset_acquisition",
                    entity_id=str(new_id),
                    entity_ref=(payload_in.get("vendor_invoice_no") or payload_in.get("grn_no") or payload_in.get("reference") or f"ACQ-{new_id}"),
                    vendor_id=int(payload_in.get("supplier_id") or 0) or None,
                    before_json={"request": payload_in, "asset_id": int(asset_id)},
                    after_json={"acquisition_id": int(new_id), "asset_id": int(asset_id)},
                    message=f"Created acquisition {new_id} for asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "id": new_id}), 201
    except Exception as e:
        current_app.logger.exception("create_acquisition failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/asset-acquisitions/<int:acq_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def acquisitions_post(company_id, acq_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                jid = posting.post_acquisition(cur, company_id, acq_id)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="post_acquisition",
                    entity_type="asset_acquisition",
                    entity_id=str(acq_id),
                    entity_ref=f"ACQ-{acq_id}",
                    journal_id=int(jid) if jid else None,
                    before_json={"acquisition_id": int(acq_id)},
                    after_json={"posted_journal_id": int(jid) if jid else None},
                    message=f"Posted acquisition {acq_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "posted_journal_id": jid})
    except Exception as e:
        current_app.logger.exception("post_acquisition failed")
        return _json_error(str(e), 400)

# -------------------------
# DEPRECIATION CRUD + RUN + POST
# -------------------------
@ppe_bp.route("/api/companies/<int:company_id>/depreciation", methods=["GET", "POST", "OPTIONS"])
@require_auth
def depreciation_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        asset_id = request.args.get("asset_id", type=int)
        status = request.args.get("status")
        period_end = request.args.get("period_end")
        limit = _int_arg("limit", 100)
        offset = _int_arg("offset", 0)

        pe = _iso_date(period_end) if period_end else None

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_depreciation(
                    cur, company_id,
                    asset_id=asset_id,
                    status=status,
                    period_end=pe,
                    limit=limit, offset=offset
                )
                return jsonify({"ok": True, "data": rows})

    # POST (create)
    payload_in = request.get_json(force=True) or {}
    try:
        for k in ("period_start", "period_end"):
            if isinstance(payload_in.get(k), str):
                payload_in[k] = _iso_date(payload_in[k])

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                new_id = service.create_depreciation(cur, company_id, payload_in)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_depreciation",
                    entity_type="depreciation",
                    entity_id=str(new_id),
                    entity_ref=f"DEP-{new_id}",
                    before_json={"request": payload_in},
                    after_json={"depreciation_id": int(new_id)},
                    message=f"Created depreciation {new_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "id": new_id}), 201
    except Exception as e:
        current_app.logger.exception("create_depreciation failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/depreciation/<int:dep_id>/void", methods=["POST", "OPTIONS"])
@require_auth
def depreciation_void(company_id, dep_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    payload_in = request.get_json(silent=True) or {}
    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                service.void_depreciation(cur, company_id, dep_id)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="void_depreciation",
                    entity_type="depreciation",
                    entity_id=str(dep_id),
                    entity_ref=f"DEP-{dep_id}",
                    before_json={"depreciation_id": int(dep_id), "reason": payload_in},
                    after_json={"voided": True},
                    message=f"Voided depreciation {dep_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("void_depreciation failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/depreciation/run", methods=["POST", "OPTIONS"])
@require_auth
def depreciation_run_generate(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    payload_in = request.get_json(force=True) or {}

    try:
        ps = _iso_date(payload_in["period_start"])
        pe = _iso_date(payload_in["period_end"])
        asset_class = payload_in.get("asset_class")
        asset_id = payload_in.get("asset_id")
        asset_id = int(asset_id) if asset_id else None

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                if asset_id:
                    dep_id = posting.generate_single_asset_depreciation(
                        cur, company_id, asset_id, ps, pe,
                        created_by=payload.get("sub"),
                    )
                    ids = [dep_id] if dep_id else []
                else:
                    ids = posting.generate_depreciation_run(
                        cur, company_id, ps, pe,
                        asset_class=asset_class,
                    )

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="run_depreciation",
                    entity_type="depreciation_run",
                    entity_id=f"{ps}:{pe}",
                    entity_ref=f"DEP-RUN {ps}..{pe}",
                    before_json={"request": payload_in},
                    after_json={"created_ids": ids, "count": len(ids)},
                    message=f"Generated depreciation run {ps}..{pe} ({len(ids)} rows)",
                    cur=cur,
                )

            conn.commit()

        return jsonify({"ok": True, "created_ids": ids, "count": len(ids)})

    except Exception as e:
        current_app.logger.exception("generate_depreciation_run failed")
        return _json_error(str(e), 400)


# -------------------------------------------------------------------
# Depreciation /post (RESTORE AUDIT)
# -------------------------------------------------------------------
@ppe_bp.route("/api/companies/<int:company_id>/depreciation/<int:dep_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def depreciation_post(company_id, dep_id):
    if request.method == "OPTIONS":
        return _opt()

    user = getattr(g, "current_user", None) or {}
    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    ) 
    if deny:
        return deny

    pol = company_policy(company_id)
    mode = pol["mode"]
    company_profile = pol["company"]
    policy = pol["policy"]

    must, resp, status = _require_approve_post_if_review(
        mode=mode,
        policy=policy,
        action="post_depreciation",
    )
    if must:
        return resp, status

    if not can_post_ppe(user, company_profile, mode):
        return _json_error("Not allowed to post depreciation.", 403)

    try:
        schema = company_schema(company_id)

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                # ...
                jid = posting.post_depreciation(cur, company_id, dep_id, user=user)
                # ...
                conn.commit()
                return jsonify({"ok": True, "posted_journal_id": jid})

    except Exception as e:
        current_app.logger.exception("post_depreciation failed")
        return _json_error(str(e), 400)
    
@ppe_bp.route("/api/companies/<int:company_id>/depreciation/recalculate", methods=["POST", "OPTIONS"])
@require_auth
def depreciation_recalculate(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    payload_in = request.get_json(force=True) or {}
    try:
        ps = _iso_date(payload_in["period_start"])
        pe = _iso_date(payload_in["period_end"])
        asset_class = payload_in.get("asset_class")

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                # void draft rows in the period
                schema = company_schema(company_id)
                cur.execute(_q(schema, """
                UPDATE {schema}.asset_depreciation
                SET status='void'
                WHERE company_id=%s
                    AND period_start=%s
                    AND period_end=%s
                    AND COALESCE(status,'draft')='draft'
                """), (company_id, ps, pe))

                # regenerate
                asset_id = payload_in.get("asset_id")
                asset_id = int(asset_id) if asset_id else None

                with get_conn(company_id) as conn:
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                        if asset_id:
                            # ✅ run for ONE asset only
                            dep_id = posting.generate_single_asset_depreciation(
                                cur, company_id, asset_id, ps, pe,
                                created_by=payload.get("sub")  # optional
                            )
                            ids = [dep_id] if dep_id else []
                        else:
                            # ✅ run for ALL assets (optional class filter)
                            ids = posting.generate_depreciation_run(
                                cur, company_id, ps, pe,
                                asset_class=asset_class
                            )

                        conn.commit()
                        return jsonify({"ok": True, "created_ids": ids, "count": len(ids)})

                conn.commit()
                return jsonify({"ok": True, "created_ids": ids, "count": len(ids)})

    except Exception as e:
        current_app.logger.exception("depreciation_recalculate failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/depreciation/preview", methods=["POST", "OPTIONS"])
@require_auth
def depreciation_preview(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        payload_in = request.get_json(force=True) or {}
        ps = _to_date(payload_in.get("period_start"))
        pe = _to_date(payload_in.get("period_end"))

        if not ps:
            return _json_error("period_start is required", 400)
        if not pe:
            return _json_error("period_end is required", 400)

        asset_class = (payload_in.get("asset_class") or "").strip() or None
        asset_id_raw = payload_in.get("asset_id")
        asset_id = int(asset_id_raw) if asset_id_raw not in (None, "", 0, "0") else None

        with get_conn(company_id) as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if asset_id:
                row = posting.preview_single_asset_depreciation(
                    cur, company_id, asset_id, ps, pe, asset_class=asset_class
                )
                rows = [row] if row else []
            else:
                rows = posting.preview_depreciation_run(
                    cur, company_id, ps, pe, asset_class=asset_class
                )

        return jsonify({"ok": True, "data": rows})

    except Exception as e:
        current_app.logger.exception("depreciation_preview failed")
        return _json_error(str(e), 400)


def _parse_dep_ids(payload_in: dict) -> list[int]:
    raw = payload_in.get("dep_ids") or payload_in.get("ids") or []

    # allow "455,456" or "455 456" as a convenience
    if isinstance(raw, str):
        raw = [x for x in raw.replace(",", " ").split() if x]

    # allow single int
    if isinstance(raw, int):
        raw = [raw]

    if not isinstance(raw, (list, tuple)):
        return []

    out: list[int] = []
    for x in raw:
        try:
            out.append(int(str(x).strip()))
        except Exception:
            pass
    return sorted(set(out))

# -----------------------------
# Depreciation /post-batch (gatekeeper + audit)
# -----------------------------
@ppe_bp.route("/api/companies/<int:company_id>/depreciation/post-batch", methods=["POST", "OPTIONS"])
@require_auth
def depreciation_post_batch(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = getattr(g, "current_user", None) or {}
    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    pol = company_policy(company_id)
    mode = pol["mode"]                  # "owner_managed" | "assisted" | "controlled"
    company_profile = pol["company"]
    policy = pol["policy"]

    # Your normalizer outputs: owner, admin, cfo, ceo, manager, senior, accountant, clerk, viewer, other
    role = user_role(user)

    # Use the batch action key (as you already changed)
    review_required = bool(ppe_review_required(mode, policy, "post_depreciation_batch"))

    can_post = can_post_ppe(user, company_profile, mode)

    # Who may SUBMIT a request (even if they cannot post)
    # - viewers should not initiate anything
    CAN_REQUEST_APPROVAL_ROLES = {"owner", "admin", "cfo", "ceo", "manager", "senior", "accountant", "clerk", "other"}

    current_app.logger.info(
        "depr_post_batch gate: can_post=%s review_required=%s role=%s mode=%s",
        can_post, review_required, role, mode
    )

    # -------- Permission gate ----------
    if review_required:
        # When review is required: allow posters OR allowed requesters
        if not (can_post or (role in CAN_REQUEST_APPROVAL_ROLES and role != "viewer")):
            return _json_error("Not allowed to submit depreciation batch for approval.", 403)
    else:
        # When no review is required: must be able to post
        if not can_post:
            return _json_error("Not allowed to post depreciation batch.", 403)

    payload_in = request.get_json(force=True, silent=True) or {}
    dep_ids = _normalize_dep_ids(payload_in)
    if not dep_ids:
        return _json_error("dep_ids is required", 400)

    schema = company_schema(company_id)

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                cur.execute(_q(schema, """
                    SELECT id, asset_id, status, period_end, depreciation_amount
                    FROM {schema}.asset_depreciation
                    WHERE company_id=%s AND id = ANY(%s)
                    FOR UPDATE
                """), (company_id, dep_ids))
                rows = cur.fetchall() or []
                by_id = {int(r["id"]): r for r in rows}
                missing = [i for i in dep_ids if i not in by_id]

                # (Optional but recommended) Only consider eligible rows for approval/posting
                # Prevent approval requests that include already-posted/void/reversed lines.
                eligible = []
                skipped = []
                for dep_id in dep_ids:
                    r = by_id.get(dep_id)
                    if not r:
                        continue
                    st = (r.get("status") or "").strip().lower()
                    if st == "posted":
                        skipped.append({"dep_id": dep_id, "reason": "already_posted"})
                        continue
                    if st in {"void", "reversed"}:
                        skipped.append({"dep_id": dep_id, "reason": f"status={st}"})
                        continue
                    # keep draft/pending_review etc.
                    eligible.append(dep_id)

                if review_required:
                    if not eligible:
                        conn.commit()
                        return jsonify({
                            "ok": True,
                            "review_required": True,
                            "approval_request_id": None,
                            "dep_ids": [],
                            "missing": missing,
                            "skipped": skipped,
                            "message": "Nothing eligible to submit for approval."
                        }), 200

                    # period_end (first non-null)
                    pe = None
                    for r in rows:
                        if int(r["id"]) in set(eligible) and r.get("period_end"):
                            pe = str(r["period_end"])[:10]
                            break

                    total_amt = sum(
                        float(by_id[i].get("depreciation_amount") or 0)
                        for i in eligible
                        if i in by_id
                    )

                    dep_ids_sorted = sorted(eligible)
                    dedupe_key = (
                        f"ppe:depr:batch:pe:{pe or 'na'}"
                        f":n:{len(dep_ids_sorted)}"
                        f":min:{dep_ids_sorted[0]}:max:{dep_ids_sorted[-1]}"
                    )

                    requested_by = int(user.get("id") or 0)
                    if requested_by <= 0:
                        return _json_error("AUTH|missing_user_id", 401)

                    # Approver routing per your rules:
                    # - assisted => sole approver is owner
                    # - controlled => final approver is cfo
                    # - owner_managed => should normally not be review_required, but safe fallback to owner
                    suggested_approver_role = "cfo" if mode == "controlled" else "owner"

                    # pre-check: is there already an active/pending approval for same action?
                    cur.execute(_q(schema, """
                    SELECT id, status
                    FROM {schema}.approval_requests
                    WHERE company_id=%s
                        AND entity_type=%s
                        AND entity_id=%s
                        AND module=%s
                        AND action=%s
                        AND status IN ('pending','submitted','in_review')  -- adjust to your "active" statuses
                    ORDER BY created_at DESC
                    LIMIT 1
                    """), (company_id, "depreciation_batch", "batch", "ppe", "approve_depreciation"))

                    existing = cur.fetchone()
                    if existing:
                        return jsonify({
                            "ok": False,
                            "review_required": True,
                            "warning": "APPROVAL_ALREADY_PENDING",
                            "message": "An approval request for this depreciation batch is already pending.",
                            "approval_request_id": int(existing["id"]),
                            "status": existing["status"],
                            "dep_ids": sorted(dep_ids),
                            "missing": missing,
                        }), 409

                    req = db_service.create_approval_request(
                        company_id,
                        entity_type="depreciation_batch",
                        entity_id="batch",
                        entity_ref=(f"DEP-BATCH {pe}" if pe else "DEP-BATCH"),
                        module="ppe",
                        action="approve_depreciation",
                        requested_by_user_id=requested_by,
                        amount=total_amt,
                        currency=None,
                        risk_level="low",
                        dedupe_key=dedupe_key,
                        payload_json={
                            "dep_ids": dep_ids_sorted,
                            "period_end": pe,
                            "mode": mode,
                            "suggested_approver_role": suggested_approver_role,

                            # If you want to explicitly mark “external approvals handled outside system”
                            # you can pass a flag your approvals UI can display.
                            "approval_flow": (
                                "internal_system"
                                if mode in ("assisted", "controlled")
                                else "external_company_process"
                            ),
                        },
                        cur=cur,
                    )

                    approval_id = int(req.get("id") or 0)
                    if approval_id <= 0:
                        return _json_error("Failed to create approval request", 400)

                    cur.execute(_q(schema, """
                        UPDATE {schema}.asset_depreciation
                        SET status='pending_review',
                            approval_id=%s,
                            submitted_at=NOW(),
                            submitted_by=%s
                        WHERE company_id=%s
                          AND id = ANY(%s)
                          AND status IN ('draft','pending_review')
                    """), (approval_id, requested_by, company_id, dep_ids_sorted))

                    conn.commit()
                    return jsonify({
                    "ok": False,
                    "error": "APPROVAL_REQUIRED",
                    "approval_request": req,          # full request object (best, matches AP)
                    "approval_request_id": approval_id,  # optional convenience
                    "dep_ids": dep_ids_sorted,
                    "missing": missing,
                    }), 202

                # No review required: post immediately (only eligible)
                posted = []
                for dep_id in eligible:
                    jid = posting.post_depreciation(cur, company_id, dep_id, user=user)
                    posted.append({"dep_id": dep_id, "journal_id": int(jid) if jid else None})

                conn.commit()
                return jsonify({
                    "ok": True,
                    "review_required": False,
                    "posted": posted,
                    "skipped": skipped,
                    "missing": missing,
                }), 200

    except Exception as e:
        current_app.logger.exception("depreciation_post_batch failed")
        return _json_error(str(e), 400)
    
# -------------------------
# REVALUATIONS CRUD + VOID + POST
# -------------------------
@ppe_bp.route("/api/companies/<int:company_id>/revaluations", methods=["GET", "POST", "OPTIONS"])
@require_auth
def revaluations_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        asset_id = request.args.get("asset_id", type=int)
        status = request.args.get("status")
        limit = _int_arg("limit", 100)
        offset = _int_arg("offset", 0)

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_revaluations(cur, company_id, asset_id=asset_id, status=status, limit=limit, offset=offset)
                return jsonify({"ok": True, "data": rows})

    # POST (create)
    payload_in = request.get_json(force=True) or {}
    try:
        if isinstance(payload_in.get("revaluation_date"), str):
            payload_in["revaluation_date"] = _iso_date(payload_in["revaluation_date"])

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                new_id = service.create_revaluation(cur, company_id, payload_in)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_revaluation",
                    entity_type="revaluation",
                    entity_id=str(new_id),
                    entity_ref=f"REVAL-{new_id}",
                    before_json={"request": payload_in},
                    after_json={"revaluation_id": int(new_id)},
                    message=f"Created revaluation {new_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "id": new_id}), 201
    except Exception as e:
        current_app.logger.exception("create_revaluation failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/revaluations/<int:reval_id>/void", methods=["POST", "OPTIONS"])
@require_auth
def revaluations_void(company_id, reval_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                service.void_revaluation(cur, company_id, reval_id)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="void_revaluation",
                    entity_type="revaluation",
                    entity_id=str(reval_id),
                    entity_ref=f"REVAL-{reval_id}",
                    before_json={"revaluation_id": int(reval_id)},
                    after_json={"voided": True},
                    message=f"Voided revaluation {reval_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("void_revaluation failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/revaluations/<int:reval_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def revaluation_post(company_id, reval_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    pol = company_policy(company_id)
    mode = pol["mode"]
    company_profile = pol["company"]
    policy = pol["policy"]

    must, resp, *_ = _require_approve_post_if_review(mode=mode, policy=policy, action="post_revaluation")
    if must:
        return resp

    if not can_post_ppe(user, company_profile, mode):
        return _json_error("Not allowed to post revaluations.", 403)

    schema = company_schema(company_id)

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                # 1) Lock revaluation row
                cur.execute(_q(schema, """
                    SELECT id, company_id, asset_id, revaluation_date, status, posted_journal_id,
                           revaluation_change, oci_revaluation_surplus, pnl_revaluation_gain, pnl_revaluation_loss
                    FROM {schema}.asset_revaluations
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, reval_id))
                before = cur.fetchone()
                if not before:
                    return _json_error("Revaluation not found", 404)

                st = (before.get("status") or "").strip().lower()

                # 2) Idempotent return
                if st == "posted" and before.get("posted_journal_id"):
                    conn.commit()
                    return jsonify({
                        "ok": True,
                        "status": "posted",
                        "posted_journal_id": int(before["posted_journal_id"]),
                        "idempotent": True,
                    }), 200

                if st in {"void", "reversed"}:
                    return _json_error(f"Cannot post in status '{st}'", 400)

                # 3) Optional: lock the asset row too (prevents concurrent postings on same asset)
                asset_id = int(before.get("asset_id") or 0)
                if asset_id > 0:
                    cur.execute(_q(schema, """
                        SELECT id
                        FROM {schema}.assets
                        WHERE company_id=%s AND id=%s
                        FOR UPDATE
                    """), (company_id, asset_id))

                # 4) Post
                jid = posting.post_revaluation(cur, company_id, reval_id, user=user)

                # 5) Fetch after (optional, but good for audit + amount)
                cur.execute(_q(schema, """
                    SELECT id, company_id, asset_id, revaluation_date, status, posted_journal_id,
                           revaluation_change, oci_revaluation_surplus, pnl_revaluation_gain, pnl_revaluation_loss
                    FROM {schema}.asset_revaluations
                    WHERE company_id=%s AND id=%s
                """), (company_id, reval_id))
                after = cur.fetchone() or {}

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="post_revaluation",
                    entity_type="revaluation",
                    entity_id=str(reval_id),
                    entity_ref=f"REVAL-{reval_id}",
                    journal_id=int(jid) if jid else None,
                    amount=float(after.get("revaluation_change") or before.get("revaluation_change") or 0.0),
                    currency=(pol.get("company") or {}).get("currency"),
                    before_json={"row": before},
                    after_json={"row": after},
                    message=f"Posted revaluation {reval_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "status": "posted", "posted_journal_id": int(jid) if jid else None}), 200

    except Exception as e:
        current_app.logger.exception("post_revaluation failed")
        return _json_error(str(e), 400)
    
# -------------------------
# IMPAIRMENTS CRUD + VOID + POST
# -------------------------
@ppe_bp.route("/api/companies/<int:company_id>/impairments", methods=["GET", "POST", "OPTIONS"])
@require_auth
def impairments_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        asset_id = request.args.get("asset_id", type=int)
        status = request.args.get("status")
        limit = _int_arg("limit", 100)
        offset = _int_arg("offset", 0)
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_impairments(cur, company_id, asset_id=asset_id, status=status, limit=limit, offset=offset)
                return jsonify({"ok": True, "data": rows})

    # POST (create)
    payload_in = request.get_json(force=True) or {}
    try:
        if isinstance(payload_in.get("impairment_date"), str):
            payload_in["impairment_date"] = _iso_date(payload_in["impairment_date"])

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                new_id = service.create_impairment(cur, company_id, payload_in)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_impairment",
                    entity_type="impairment",
                    entity_id=str(new_id),
                    entity_ref=f"IMP-{new_id}",
                    before_json={"request": payload_in},
                    after_json={"impairment_id": int(new_id)},
                    message=f"Created impairment {new_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "id": new_id}), 201
    except Exception as e:
        current_app.logger.exception("create_impairment failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/impairments/<int:imp_id>/void", methods=["POST", "OPTIONS"])
@require_auth
def impairments_void(company_id, imp_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                service.void_impairment(cur, company_id, imp_id)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="void_impairment",
                    entity_type="impairment",
                    entity_id=str(imp_id),
                    entity_ref=f"IMP-{imp_id}",
                    before_json={"impairment_id": int(imp_id)},
                    after_json={"voided": True},
                    message=f"Voided impairment {imp_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("void_impairment failed")
        return _json_error(str(e), 400)


# -------------------------------------------------------------------
# Impairment /post (RESTORE AUDIT)
# -------------------------------------------------------------------
@ppe_bp.route("/api/companies/<int:company_id>/impairments/<int:imp_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def impairment_post(company_id, imp_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    pol = company_policy(company_id)
    mode = pol["mode"]
    company_profile = pol["company"]
    policy = pol["policy"]

    must, resp, *_ = _require_approve_post_if_review(mode=mode, policy=policy, action="post_impairment")
    if must:
        return resp

    if not can_post_ppe(user, company_profile, mode):
        return _json_error("Not allowed to post impairments.", 403)

    schema = company_schema(company_id)

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                # Lock impairment row
                cur.execute(_q(schema, """
                    SELECT id, company_id, asset_id, impairment_date, status, posted_journal_id,
                           impairment_amount, reversal_amount
                    FROM {schema}.asset_impairments
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, imp_id))
                before = cur.fetchone()
                if not before:
                    return _json_error("Impairment not found", 404)

                st = (before.get("status") or "").strip().lower()

                if st == "posted" and before.get("posted_journal_id"):
                    conn.commit()
                    return jsonify({
                        "ok": True,
                        "status": "posted",
                        "posted_journal_id": int(before["posted_journal_id"]),
                        "idempotent": True,
                    }), 200

                if st in {"void", "reversed"}:
                    return _json_error(f"Cannot post in status '{st}'", 400)

                # Optional: lock asset
                asset_id = int(before.get("asset_id") or 0)
                if asset_id > 0:
                    cur.execute(_q(schema, """
                        SELECT id
                        FROM {schema}.assets
                        WHERE company_id=%s AND id=%s
                        FOR UPDATE
                    """), (company_id, asset_id))

                jid = posting.post_impairment(cur, company_id, imp_id, user=user)

                cur.execute(_q(schema, """
                    SELECT id, company_id, asset_id, impairment_date, status, posted_journal_id,
                           impairment_amount, reversal_amount
                    FROM {schema}.asset_impairments
                    WHERE company_id=%s AND id=%s
                """), (company_id, imp_id))
                after = cur.fetchone() or {}

                amt = after.get("impairment_amount")
                if amt in (None, "", 0) and after.get("reversal_amount"):
                    amt = after.get("reversal_amount")

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="post_impairment",
                    entity_type="impairment",
                    entity_id=str(imp_id),
                    entity_ref=f"IMP-{imp_id}",
                    journal_id=int(jid) if jid else None,
                    amount=float(amt or 0.0),
                    currency=(pol.get("company") or {}).get("currency"),
                    before_json={"row": before},
                    after_json={"row": after},
                    message=f"Posted impairment {imp_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "status": "posted", "posted_journal_id": int(jid) if jid else None}), 200

    except Exception as e:
        current_app.logger.exception("post_impairment failed")
        return _json_error(str(e), 400)

# -------------------------
# DISPOSALS CRUD + VOID + POST
# -------------------------
@ppe_bp.route("/api/companies/<int:company_id>/disposals", methods=["GET", "POST", "OPTIONS"])
@require_auth
def disposals_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        asset_id = request.args.get("asset_id", type=int)
        status = request.args.get("status")
        limit = _int_arg("limit", 100)
        offset = _int_arg("offset", 0)

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_disposals(cur, company_id, asset_id=asset_id, status=status, limit=limit, offset=offset)
                return jsonify({"ok": True, "data": rows})

    # POST (create)
    payload_in = request.get_json(force=True) or {}
    try:
        if isinstance(payload_in.get("disposal_date"), str):
            payload_in["disposal_date"] = _iso_date(payload_in["disposal_date"])

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                new_id = service.create_disposal(cur, company_id, payload_in)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_disposal",
                    entity_type="disposal",
                    entity_id=str(new_id),
                    entity_ref=f"DISP-{new_id}",
                    before_json={"request": payload_in},
                    after_json={"disposal_id": int(new_id)},
                    message=f"Created disposal {new_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "id": new_id}), 201
    except Exception as e:
        current_app.logger.exception("create_disposal failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/disposals/<int:disp_id>/void", methods=["POST", "OPTIONS"])
@require_auth
def disposals_void(company_id, disp_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                service.void_disposal(cur, company_id, disp_id)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="void_disposal",
                    entity_type="disposal",
                    entity_id=str(disp_id),
                    entity_ref=f"DISP-{disp_id}",
                    before_json={"disposal_id": int(disp_id)},
                    after_json={"voided": True},
                    message=f"Voided disposal {disp_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("void_disposal failed")
        return _json_error(str(e), 400)


# -------------------------------------------------------------------
# Disposal /post (RESTORE AUDIT)
# -------------------------------------------------------------------
@ppe_bp.route("/api/companies/<int:company_id>/disposals/<int:disp_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def disposal_post(company_id, disp_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    pol = company_policy(company_id)
    mode = pol["mode"]
    company_profile = pol["company"]
    policy = pol["policy"]

    must, resp, *_ = _require_approve_post_if_review(mode=mode, policy=policy, action="post_disposal")
    if must:
        return resp

    if not can_post_ppe(user, company_profile, mode):
        return _json_error("Not allowed to post disposals.", 403)

    schema = company_schema(company_id)

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                # Lock disposal row
                cur.execute(_q(schema, """
                    SELECT id, company_id, asset_id, disposal_date, status, posted_journal_id,
                           proceeds, carrying_amount, gain_loss
                    FROM {schema}.asset_disposals
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, disp_id))
                before = cur.fetchone()
                if not before:
                    return _json_error("Disposal not found", 404)

                st = (before.get("status") or "").strip().lower()

                if st == "posted" and before.get("posted_journal_id"):
                    conn.commit()
                    return jsonify({
                        "ok": True,
                        "status": "posted",
                        "posted_journal_id": int(before["posted_journal_id"]),
                        "idempotent": True,
                    }), 200

                if st in {"void", "reversed"}:
                    return _json_error(f"Cannot post in status '{st}'", 400)

                # Optional: lock asset
                asset_id = int(before.get("asset_id") or 0)
                if asset_id > 0:
                    cur.execute(_q(schema, """
                        SELECT id
                        FROM {schema}.assets
                        WHERE company_id=%s AND id=%s
                        FOR UPDATE
                    """), (company_id, asset_id))

                jid = posting.post_disposal(cur, company_id, disp_id, user=user)

                cur.execute(_q(schema, """
                    SELECT id, company_id, asset_id, disposal_date, status, posted_journal_id,
                           proceeds, carrying_amount, gain_loss
                    FROM {schema}.asset_disposals
                    WHERE company_id=%s AND id=%s
                """), (company_id, disp_id))
                after = cur.fetchone() or {}

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="post_disposal",
                    entity_type="disposal",
                    entity_id=str(disp_id),
                    entity_ref=f"DISP-{disp_id}",
                    journal_id=int(jid) if jid else None,
                    amount=float(after.get("proceeds") or before.get("proceeds") or 0.0),
                    currency=(pol.get("company") or {}).get("currency"),
                    before_json={"row": before},
                    after_json={"row": after},
                    message=f"Posted disposal {disp_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "status": "posted", "posted_journal_id": int(jid) if jid else None}), 200

    except Exception as e:
        current_app.logger.exception("post_disposal failed")
        return _json_error(str(e), 400)
    
# -------------------------
# HELD FOR SALE CRUD + REVERSE + POST
# -------------------------
@ppe_bp.route("/api/companies/<int:company_id>/held-for-sale", methods=["GET", "POST", "OPTIONS"])
@require_auth
def hfs_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        asset_id = request.args.get("asset_id", type=int)
        status = request.args.get("status")
        limit = _int_arg("limit", 100)
        offset = _int_arg("offset", 0)

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_hfs(cur, company_id, asset_id=asset_id, status=status, limit=limit, offset=offset)
                return jsonify({"ok": True, "data": rows})

    # POST (create)
    payload_in = request.get_json(force=True) or {}
    try:
        if isinstance(payload_in.get("classification_date"), str):
            payload_in["classification_date"] = _iso_date(payload_in["classification_date"])
        if isinstance(payload_in.get("disposal_date"), str):
            payload_in["disposal_date"] = _iso_date(payload_in["disposal_date"])

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                new_id = service.create_hfs(cur, company_id, payload_in)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_hfs",
                    entity_type="held_for_sale",
                    entity_id=str(new_id),
                    entity_ref=f"HFS-{new_id}",
                    before_json={"request": payload_in},
                    after_json={"hfs_id": int(new_id)},
                    message=f"Created held-for-sale {new_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "id": new_id}), 201
    except Exception as e:
        current_app.logger.exception("create_hfs failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/held-for-sale/<int:hfs_id>/reverse", methods=["POST", "OPTIONS"])
@require_auth
def hfs_reverse(company_id, hfs_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                service.reverse_hfs(cur, company_id, hfs_id)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="reverse_hfs",
                    entity_type="held_for_sale",
                    entity_id=str(hfs_id),
                    entity_ref=f"HFS-{hfs_id}",
                    before_json={"hfs_id": int(hfs_id)},
                    after_json={"reversed": True},
                    message=f"Reversed held-for-sale {hfs_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("reverse_hfs failed")
        return _json_error(str(e), 400)

# -------------------------------------------------------------------
# Held-for-sale /post (RESTORE AUDIT)
# -------------------------------------------------------------------
@ppe_bp.route("/api/companies/<int:company_id>/held-for-sale/<int:hfs_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def hfs_post(company_id, hfs_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    pol = company_policy(company_id)
    mode = pol["mode"]
    company_profile = pol["company"]
    policy = pol["policy"]

    must, resp, *_ = _require_approve_post_if_review(mode=mode, policy=policy, action="classify_hfs")
    if must:
        return resp

    if not can_post_ppe(user, company_profile, mode):
        return _json_error("Not allowed to post held-for-sale.", 403)

    schema = company_schema(company_id)

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                # Lock HFS row
                cur.execute(_q(schema, """
                    SELECT id, company_id, asset_id, classification_date, status, posted_journal_id,
                           carrying_amount, impairment_on_classification
                    FROM {schema}.asset_held_for_sale
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, hfs_id))
                before = cur.fetchone()
                if not before:
                    return _json_error("Held-for-sale record not found", 404)

                st = (before.get("status") or "").strip().lower()

                if st == "posted" and before.get("posted_journal_id"):
                    conn.commit()
                    return jsonify({
                        "ok": True,
                        "status": "posted",
                        "posted_journal_id": int(before["posted_journal_id"]),
                        "idempotent": True,
                    }), 200

                if st in {"void", "reversed"}:
                    return _json_error(f"Cannot post in status '{st}'", 400)

                # Optional: lock asset
                asset_id = int(before.get("asset_id") or 0)
                if asset_id > 0:
                    cur.execute(_q(schema, """
                        SELECT id
                        FROM {schema}.assets
                        WHERE company_id=%s AND id=%s
                        FOR UPDATE
                    """), (company_id, asset_id))

                jid = posting.post_hfs(cur, company_id, hfs_id, user=user)

                cur.execute(_q(schema, """
                    SELECT id, company_id, asset_id, classification_date, status, posted_journal_id,
                           carrying_amount, impairment_on_classification
                    FROM {schema}.asset_held_for_sale
                    WHERE company_id=%s AND id=%s
                """), (company_id, hfs_id))
                after = cur.fetchone() or {}

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="post_hfs",
                    entity_type="held_for_sale",
                    entity_id=str(hfs_id),
                    entity_ref=f"HFS-{hfs_id}",
                    journal_id=int(jid) if jid else None,
                    amount=float(after.get("carrying_amount") or before.get("carrying_amount") or 0.0),
                    currency=(pol.get("company") or {}).get("currency"),
                    before_json={"row": before},
                    after_json={"row": after},
                    message=f"Posted held-for-sale {hfs_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "status": "posted", "posted_journal_id": int(jid) if jid else None}), 200

    except Exception as e:
        current_app.logger.exception("post_hfs failed")
        return _json_error(str(e), 400)
    
# -------------------------
# TRANSFERS CRUD
# -------------------------
@ppe_bp.route("/api/companies/<int:company_id>/transfers", methods=["GET", "POST", "OPTIONS"])
@require_auth
def transfers_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        asset_id = request.args.get("asset_id", type=int)
        limit = _int_arg("limit", 100)
        offset = _int_arg("offset", 0)
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_transfers(cur, company_id, asset_id=asset_id, limit=limit, offset=offset)
                return jsonify({"ok": True, "data": rows})

    # POST (create)
    payload_in = request.get_json(force=True) or {}
    try:
        if isinstance(payload_in.get("transfer_date"), str):
            payload_in["transfer_date"] = _iso_date(payload_in["transfer_date"])

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                tid = service.create_transfer(cur, company_id, payload_in)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_transfer",
                    entity_type="transfer",
                    entity_id=str(tid),
                    entity_ref=f"TR-{tid}",
                    before_json={"request": payload_in},
                    after_json={"transfer_id": int(tid)},
                    message=f"Created transfer {tid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "id": tid}), 201
    except Exception as e:
        current_app.logger.exception("create_transfer failed")
        return _json_error(str(e), 400)


# -------------------------
# STANDARD TRANSFERS CRUD + VOID
# -------------------------
@ppe_bp.route("/api/companies/<int:company_id>/standard-transfers", methods=["GET", "POST", "OPTIONS"])
@require_auth
def standard_transfers_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        asset_id = request.args.get("asset_id", type=int)
        status = request.args.get("status")
        limit = _int_arg("limit", 100)
        offset = _int_arg("offset", 0)

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_standard_transfers(cur, company_id, asset_id=asset_id, status=status, limit=limit, offset=offset)
                return jsonify({"ok": True, "data": rows})

    # POST (create)
    payload_in = request.get_json(force=True) or {}
    try:
        if isinstance(payload_in.get("transfer_date"), str):
            payload_in["transfer_date"] = _iso_date(payload_in["transfer_date"])

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                tid = service.create_standard_transfer(cur, company_id, payload_in)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_standard_transfer",
                    entity_type="standard_transfer",
                    entity_id=str(tid),
                    entity_ref=f"STR-{tid}",
                    before_json={"request": payload_in},
                    after_json={"standard_transfer_id": int(tid)},
                    message=f"Created standard transfer {tid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "id": tid}), 201
    except Exception as e:
        current_app.logger.exception("create_standard_transfer failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/standard-transfers/<int:tr_id>/void", methods=["POST", "OPTIONS"])
@require_auth
def standard_transfers_void(company_id, tr_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                service.void_standard_transfer(cur, company_id, tr_id)

                # ✅ AUDIT
                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="void_standard_transfer",
                    entity_type="standard_transfer",
                    entity_id=str(tr_id),
                    entity_ref=f"STR-{tr_id}",
                    before_json={"standard_transfer_id": int(tr_id)},
                    after_json={"voided": True},
                    message=f"Voided standard transfer {tr_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("void_standard_transfer failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>/activity", methods=["GET", "OPTIONS"])
@require_auth
def asset_activity(company_id, asset_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    limit = _int_arg("limit", 250)
    offset = _int_arg("offset", 0)
    include_archived = (request.args.get("include_archived") or "").strip().lower() in ("1", "true", "yes")

    with get_conn(company_id) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            rows = service.list_asset_activity(
                cur, company_id, asset_id,
                include_archived=include_archived,
                limit=limit, offset=offset
            )
            return jsonify({"ok": True, "data": rows, "limit": limit, "offset": offset, "include_archived": include_archived})

# -------------------------
# ASSET DOCUMENTS
# -------------------------
@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>/documents", methods=["GET", "POST", "OPTIONS"])
@require_auth
def asset_documents_list_or_create(company_id, asset_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        limit = _int_arg("limit", 100)
        offset = _int_arg("offset", 0)
        doc_type = (request.args.get("doc_type") or "").strip() or None
        q = (request.args.get("q") or "").strip() or None
        include_archived = (request.args.get("include_archived") or "").strip().lower() in ("1","true","yes")

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_asset_documents(
                    cur, company_id, asset_id,
                    doc_type=doc_type, q=q,
                    include_archived=include_archived,
                    limit=limit, offset=offset
                )
                return jsonify({"ok": True, "data": rows, "limit": limit, "offset": offset, "include_archived": include_archived})

    # POST
    payload_in = request.get_json(force=True) or {}
    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                new_id = service.create_asset_document(cur, company_id, asset_id, payload_in)

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_asset_document",
                    entity_type="asset_document",
                    entity_id=str(new_id),
                    entity_ref=(payload_in.get("file_name") or f"DOC-{new_id}"),
                    before_json={"request": payload_in, "asset_id": int(asset_id)},
                    after_json={"document_id": int(new_id), "asset_id": int(asset_id)},
                    message=f"Added document {new_id} to asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "id": new_id}), 201
    except Exception as e:
        current_app.logger.exception("create_asset_document failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>/documents/<int:doc_id>", methods=["DELETE", "OPTIONS"])
@require_auth
def asset_documents_delete(company_id, asset_id, doc_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                before = service.get_asset_document(cur, company_id, asset_id, doc_id)
                if not before:
                    return _json_error("Not found", 404)

                service.delete_asset_document(cur, company_id, asset_id, doc_id)

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="delete_asset_document",
                    entity_type="asset_document",
                    entity_id=str(doc_id),
                    entity_ref=(before.get("file_name") or f"DOC-{doc_id}"),
                    before_json={"doc": before},
                    after_json={"deleted": True},
                    message=f"Deleted document {doc_id} from asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("delete_asset_document failed")
        return _json_error(str(e), 400)


# -------------------------
# ASSET VERIFICATIONS / STOCKTAKE
# -------------------------
@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>/verifications", methods=["GET", "POST", "OPTIONS"])
@require_auth
def asset_verifications_list_or_create(company_id, asset_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    if request.method == "GET":
        limit = _int_arg("limit", 100)
        offset = _int_arg("offset", 0)
        status = (request.args.get("status") or "").strip() or None
        include_archived = (request.args.get("include_archived") or "").strip().lower() in ("1","true","yes")

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                rows = service.list_asset_verifications(
                    cur, company_id, asset_id,
                    status=status,
                    include_archived=include_archived,
                    limit=limit, offset=offset
                )
                return jsonify({"ok": True, "data": rows, "limit": limit, "offset": offset, "include_archived": include_archived})

    payload_in = request.get_json(force=True) or {}
    try:
        if isinstance(payload_in.get("verification_date"), str):
            payload_in["verification_date"] = _iso_date(payload_in["verification_date"])

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                new_id = service.create_asset_verification(cur, company_id, asset_id, payload_in)

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="create_asset_verification",
                    entity_type="asset_verification",
                    entity_id=str(new_id),
                    entity_ref=f"VER-{new_id}",
                    before_json={"request": payload_in, "asset_id": int(asset_id)},
                    after_json={"verification_id": int(new_id), "asset_id": int(asset_id)},
                    message=f"Created verification {new_id} for asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "id": new_id}), 201
    except Exception as e:
        current_app.logger.exception("create_asset_verification failed")
        return _json_error(str(e), 400)


@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>/verifications/<int:ver_id>/void", methods=["POST", "OPTIONS"])
@require_auth
def asset_verifications_void(company_id, asset_id, ver_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                before = service.get_asset_verification(cur, company_id, asset_id, ver_id)
                if not before:
                    return _json_error("Not found", 404)

                service.void_asset_verification(cur, company_id, asset_id, ver_id)

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="void_asset_verification",
                    entity_type="asset_verification",
                    entity_id=str(ver_id),
                    entity_ref=f"VER-{ver_id}",
                    before_json={"verification": before},
                    after_json={"voided": True},
                    message=f"Voided verification {ver_id} for asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("void_asset_verification failed")
        return _json_error(str(e), 400)

@ppe_bp.route(
    "/api/companies/<int:company_id>/assets/<int:asset_id>/documents/<int:doc_id>",
    methods=["GET", "PUT", "DELETE", "OPTIONS"],
)
@require_auth
def asset_documents_get_update_delete(company_id, asset_id, doc_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                if request.method == "GET":
                    row = service.get_asset_document(cur, company_id, asset_id, doc_id)
                    if not row:
                        return _json_error("Not found", 404)
                    return jsonify({"ok": True, "data": row})

                if request.method == "PUT":
                    payload_in = request.get_json(force=True) or {}
                    before = service.get_asset_document(cur, company_id, asset_id, doc_id)
                    if not before:
                        return _json_error("Not found", 404)

                    service.update_asset_document(cur, company_id, asset_id, doc_id, payload_in)
                    after = service.get_asset_document(cur, company_id, asset_id, doc_id)

                    _audit_safe(
                        company_id=company_id,
                        payload=payload,
                        module="ppe",
                        action="update_asset_document",
                        entity_type="asset_document",
                        entity_id=str(doc_id),
                        entity_ref=(after or {}).get("file_name") or (before or {}).get("file_name") or f"DOC-{doc_id}",
                        before_json={"doc": before, "patch": payload_in},
                        after_json={"doc": after},
                        message=f"Updated document {doc_id} for asset {asset_id}",
                        cur=cur,
                    )

                    conn.commit()
                    return jsonify({"ok": True, "data": after})

                if request.method == "DELETE":
                    before = service.get_asset_document(cur, company_id, asset_id, doc_id)
                    if not before:
                        return _json_error("Not found", 404)

                    service.delete_asset_document(cur, company_id, asset_id, doc_id)

                    _audit_safe(
                        company_id=company_id,
                        payload=payload,
                        module="ppe",
                        action="delete_asset_document",
                        entity_type="asset_document",
                        entity_id=str(doc_id),
                        entity_ref=(before.get("file_name") or f"DOC-{doc_id}"),
                        before_json={"doc": before},
                        after_json={"deleted": True},
                        message=f"Deleted document {doc_id} from asset {asset_id}",
                        cur=cur,
                    )

                    conn.commit()
                    return jsonify({"ok": True})

                return _json_error(f"Method {request.method} not allowed", 405)

    except Exception as e:
        current_app.logger.exception("asset_documents_get_update_delete failed")
        return _json_error(str(e), 400)

def update_asset_document(cur, company_id: int, asset_id: int, doc_id: int, payload: dict):
    schema = company_schema(company_id)
    # Only allow metadata edits (not changing asset_id/company_id)
    allowed = {
        "doc_type", "file_name", "mime_type", "file_size_bytes",
        "file_url", "storage_key", "file_path",
        "reference", "notes"
    }

    patch = {k: payload.get(k) for k in allowed if k in payload}

    if "doc_type" in patch and patch["doc_type"] is not None:
        patch["doc_type"] = str(patch["doc_type"]).strip().lower()

    if "file_name" in patch and patch["file_name"] is not None:
        patch["file_name"] = str(patch["file_name"]).strip()
        if not patch["file_name"]:
            raise Exception("file_name cannot be blank")

    if not patch:
        return True  # nothing to update

    sets = ", ".join([f"{k}=%s" for k in patch.keys()])
    params = list(patch.values()) + [company_id, asset_id, doc_id]

    cur.execute(_q(schema, f"""
        UPDATE {{schema}}.asset_documents
        SET {sets}
        WHERE company_id=%s AND asset_id=%s AND id=%s
    """), params)
    return True

@ppe_bp.route(
    "/api/companies/<int:company_id>/assets/<int:asset_id>/verifications/<int:ver_id>",
    methods=["GET", "PUT", "OPTIONS"],
)
@require_auth
def asset_verifications_get_or_update(company_id, asset_id, ver_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                if request.method == "GET":
                    row = service.get_asset_verification(cur, company_id, asset_id, ver_id)
                    if not row:
                        return _json_error("Not found", 404)
                    return jsonify({"ok": True, "data": row})

                # PUT
                payload_in = request.get_json(force=True) or {}
                before = service.get_asset_verification(cur, company_id, asset_id, ver_id)
                if not before:
                    return _json_error("Not found", 404)

                # normalize date if provided
                if isinstance(payload_in.get("verification_date"), str):
                    payload_in["verification_date"] = _iso_date(payload_in["verification_date"])

                service.update_asset_verification(cur, company_id, asset_id, ver_id, payload_in)
                after = service.get_asset_verification(cur, company_id, asset_id, ver_id)

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="update_asset_verification",
                    entity_type="asset_verification",
                    entity_id=str(ver_id),
                    entity_ref=f"VER-{ver_id}",
                    before_json={"verification": before, "patch": payload_in},
                    after_json={"verification": after},
                    message=f"Updated verification {ver_id} for asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "data": after})

    except Exception as e:
        current_app.logger.exception("asset_verifications_get_or_update failed")
        return _json_error(str(e), 400)

def update_asset_verification(cur, company_id: int, asset_id: int, ver_id: int, payload: dict):
    allowed = {"verification_date", "status", "location", "custodian", "notes", "verified_by"}
    patch = {k: payload.get(k) for k in allowed if k in payload}

    if "status" in patch and patch["status"] is not None:
        patch["status"] = str(patch["status"]).strip().lower()

    # prevent edits once voided (optional rule)
    cur.execute(
        "SELECT status FROM asset_verifications WHERE company_id=%s AND asset_id=%s AND id=%s",
        [company_id, asset_id, ver_id],
    )
    row = cur.fetchone()
    if not row:
        raise Exception("Not found")
    if str(row.get("status") or "").lower() == "void":
        raise Exception("Cannot update a voided verification")

    if not patch:
        return True

    sets = ", ".join([f"{k}=%s" for k in patch.keys()])
    params = list(patch.values()) + [company_id, asset_id, ver_id]

    cur.execute(
        f"""
        UPDATE asset_verifications
        SET {sets}
        WHERE company_id=%s AND asset_id=%s AND id=%s
        """,
        params
    )
    return True

@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>/documents/<int:doc_id>/archive",
              methods=["POST", "OPTIONS"])
@require_auth
def asset_document_archive(company_id, asset_id, doc_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                before = service.get_asset_document(cur, company_id, asset_id, doc_id)
                if not before:
                    return _json_error("Not found", 404)

                actor = _actor_user_id(payload) or 0
                service.archive_asset_document(cur, company_id, asset_id, doc_id, actor)

                after = service.get_asset_document(cur, company_id, asset_id, doc_id)

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="archive_asset_document",
                    entity_type="asset_document",
                    entity_id=str(doc_id),
                    entity_ref=(before.get("file_name") or f"DOC-{doc_id}"),
                    before_json={"doc": before},
                    after_json={"doc": after},
                    message=f"Archived document {doc_id} on asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "data": after})
    except Exception as e:
        current_app.logger.exception("asset_document_archive failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>/documents/<int:doc_id>/unarchive",
              methods=["POST", "OPTIONS"])
@require_auth
def asset_document_unarchive(company_id, asset_id, doc_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                before = service.get_asset_document(cur, company_id, asset_id, doc_id)
                if not before:
                    return _json_error("Not found", 404)

                actor = _actor_user_id(payload) or 0
                service.unarchive_asset_document(cur, company_id, asset_id, doc_id, actor)

                after = service.get_asset_document(cur, company_id, asset_id, doc_id)

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="unarchive_asset_document",
                    entity_type="asset_document",
                    entity_id=str(doc_id),
                    entity_ref=(before.get("file_name") or f"DOC-{doc_id}"),
                    before_json={"doc": before},
                    after_json={"doc": after},
                    message=f"Unarchived document {doc_id} on asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "data": after})
    except Exception as e:
        current_app.logger.exception("asset_document_unarchive failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>/verifications/<int:ver_id>/archive",
              methods=["POST", "OPTIONS"])
@require_auth
def asset_verification_archive(company_id, asset_id, ver_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                before = service.get_asset_verification(cur, company_id, asset_id, ver_id)
                if not before:
                    return _json_error("Not found", 404)

                actor = _actor_user_id(payload) or 0
                service.archive_asset_verification(cur, company_id, asset_id, ver_id, actor)

                after = service.get_asset_verification(cur, company_id, asset_id, ver_id)

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="archive_asset_verification",
                    entity_type="asset_verification",
                    entity_id=str(ver_id),
                    entity_ref=f"VER-{ver_id}",
                    before_json={"verification": before},
                    after_json={"verification": after},
                    message=f"Archived verification {ver_id} on asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "data": after})
    except Exception as e:
        current_app.logger.exception("asset_verification_archive failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/assets/<int:asset_id>/verifications/<int:ver_id>/unarchive",
              methods=["POST", "OPTIONS"])
@require_auth
def asset_verification_unarchive(company_id, asset_id, ver_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                before = service.get_asset_verification(cur, company_id, asset_id, ver_id)
                if not before:
                    return _json_error("Not found", 404)

                actor = _actor_user_id(payload) or 0
                service.unarchive_asset_verification(cur, company_id, asset_id, ver_id, actor)

                after = service.get_asset_verification(cur, company_id, asset_id, ver_id)

                _audit_safe(
                    company_id=company_id,
                    payload=payload,
                    module="ppe",
                    action="unarchive_asset_verification",
                    entity_type="asset_verification",
                    entity_id=str(ver_id),
                    entity_ref=f"VER-{ver_id}",
                    before_json={"verification": before},
                    after_json={"verification": after},
                    message=f"Unarchived verification {ver_id} on asset {asset_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "data": after})
    except Exception as e:
        current_app.logger.exception("asset_verification_unarchive failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/asset-usage", methods=["GET", "POST", "OPTIONS"])
@require_auth
def asset_usage_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)

    # -------------------------
    # LIST
    # -------------------------
    if request.method == "GET":
        asset_id    = request.args.get("asset_id")
        status      = request.args.get("status")       # optional: draft|posted|void
        period_end  = request.args.get("period_end")   # optional: YYYY-MM-DD
        period_from = request.args.get("period_from")  # optional: YYYY-MM-DD
        period_to   = request.args.get("period_to")    # optional: YYYY-MM-DD

        limit  = _int_arg("limit", 50)
        offset = _int_arg("offset", 0)

        where = ["company_id=%s"]
        params = [company_id]

        if asset_id:
            where.append("asset_id=%s")
            params.append(int(asset_id))

        if status:
            where.append("status=%s")
            params.append(str(status).strip().lower())

        if period_end:
            where.append("period_end=%s")
            params.append(_parse_date(period_end))

        # overlap range filter (useful for checks)
        if period_from and period_to:
            pf = _parse_date(period_from)
            pt = _parse_date(period_to)
            where.append("period_start <= %s AND period_end >= %s")
            params.extend([pt, pf])

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(_q(schema, f"""
                    SELECT *
                    FROM {{schema}}.asset_usage
                    WHERE {" AND ".join(where)}
                    ORDER BY period_end DESC, id DESC
                    LIMIT %s OFFSET %s
                """), params + [limit, offset])

                rows = cur.fetchall() or []
                return jsonify({"ok": True, "data": rows})

    # -------------------------
    # CREATE
    # -------------------------
    payload_in = request.get_json(force=True) or {}

    try:
        asset_id = int(payload_in["asset_id"])
        ps = _parse_date(payload_in["period_start"])
        pe = _parse_date(payload_in["period_end"])

        if pe < ps:
            raise ValueError("period_end must be >= period_start")

        units = Decimal(payload_in.get("units_used") or 0)
        if units <= 0:
            raise ValueError("Units used must be greater than 0.")

        # ✅ default to POSTED (so depreciation can see it)
        status = (payload_in.get("status") or "posted").strip().lower()
        if status not in ("draft", "posted"):
            raise ValueError("Invalid status. Use 'draft' or 'posted'.")

        notes = payload_in.get("notes")

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                # ✅ Determine mode from asset
                cur.execute(_q(schema, """
                    SELECT COALESCE(uop_usage_mode,'DELTA') AS mode
                    FROM {schema}.assets
                    WHERE company_id=%s AND id=%s
                """), (company_id, asset_id))
                mode = str((cur.fetchone() or {}).get("mode") or "DELTA").upper()

                if mode == "READING":
                    # ✅ readings are "as-at" snapshots -> force single day
                    ps = pe

                    # ✅ only block duplicate reading on SAME date (period_end)
                    cur.execute(_q(schema, """
                        SELECT 1
                        FROM {schema}.asset_usage
                        WHERE company_id=%s AND asset_id=%s
                          AND status <> 'void'
                          AND period_end = %s
                        LIMIT 1
                    """), (company_id, asset_id, pe))
                    if cur.fetchone():
                        raise ValueError("A reading already exists for this date.")

                else:
                    # ✅ DELTA usage -> block overlapping ranges
                    cur.execute(_q(schema, """
                        SELECT 1
                        FROM {schema}.asset_usage
                        WHERE company_id=%s AND asset_id=%s
                          AND status <> 'void'
                          AND period_start <= %s
                          AND period_end   >= %s
                        LIMIT 1
                    """), (company_id, asset_id, pe, ps))
                    if cur.fetchone():
                        raise ValueError("Usage already exists for an overlapping period for this asset.")

                cur.execute(_q(schema, """
                    INSERT INTO {schema}.asset_usage(
                        company_id,
                        asset_id,
                        period_start,
                        period_end,
                        units_used,
                        notes,
                        status,
                        created_at
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,NOW())
                    RETURNING id
                """), (
                    company_id,
                    asset_id,
                    ps,
                    pe,
                    units,
                    notes,
                    status,
                ))

                new_id = cur.fetchone()["id"]
                conn.commit()

                return jsonify({"ok": True, "id": new_id, "status": status, "mode": mode}), 201

    except Exception as e:
        current_app.logger.exception("create_usage failed")
        return _json_error(str(e), 400)
    
@ppe_bp.route("/api/companies/<int:company_id>/asset-usage/<int:usage_id>", methods=["GET"])
@require_auth
def get_asset_usage(company_id, usage_id):

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)

    with get_conn(company_id) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

            cur.execute(_q(schema, """
                SELECT *
                FROM {schema}.asset_usage
                WHERE company_id=%s AND id=%s
            """), (company_id, usage_id))

            row = cur.fetchone()
            if not row:
                return _json_error("Usage record not found", 404)

            return jsonify({"ok": True, "data": row})

@ppe_bp.route("/api/companies/<int:company_id>/asset-usage/<int:usage_id>", methods=["PUT"])
@require_auth
def update_asset_usage(company_id, usage_id):

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    payload_in = request.get_json(force=True) or {}
    schema = company_schema(company_id)

    try:
        units = Decimal(payload_in.get("units_used") or 0)
        notes = payload_in.get("notes")

        if units <= 0:
            raise ValueError("Units must be greater than 0.")

        with get_conn(company_id) as conn:
            with conn.cursor() as cur:

                cur.execute(_q(schema, """
                    UPDATE {schema}.asset_usage
                    SET units_used=%s,
                        notes=%s,
                        updated_at=NOW()
                    WHERE company_id=%s AND id=%s
                """), (units, notes, company_id, usage_id))

                conn.commit()
                return jsonify({"ok": True})

    except Exception as e:
        current_app.logger.exception("update_usage failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/asset-usage/<int:usage_id>/void", methods=["POST"])
@require_auth
def void_asset_usage(company_id, usage_id):

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)

    with get_conn(company_id) as conn:
        with conn.cursor() as cur:

            cur.execute(_q(schema, """
                UPDATE {schema}.asset_usage
                SET status='void',
                    updated_at=NOW()
                WHERE company_id=%s AND id=%s
            """), (company_id, usage_id))

            conn.commit()

    return jsonify({"ok": True})

@ppe_bp.route("/api/companies/<int:company_id>/depreciation/<int:dep_id>/approve-post", methods=["POST", "OPTIONS"])
@require_auth
def approve_post_depreciation(company_id: int, dep_id: int):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)

    payload_in = request.get_json(silent=True) or {}
    approval_note = (payload_in.get("note") or payload_in.get("approval_note") or "").strip() or None

    pol = company_policy(company_id)
    mode = (pol.get("mode") or "").strip().lower()
    company_profile = pol.get("company") or {}
    policy = pol.get("policy") or {}

    review_required = ppe_review_required(mode, policy, "post_depreciation")

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                cur.execute(_q(schema, """
                    SELECT *
                    FROM {schema}.asset_depreciation
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, dep_id))
                dep = cur.fetchone()
                if not dep:
                    return _json_error("Depreciation not found", 404)

                st = (dep.get("status") or "").strip().lower()

                # idempotent
                if st == "posted" and dep.get("posted_journal_id"):
                    return jsonify({"ok": True, "status": "posted", "journal_id": dep["posted_journal_id"]})

                if st in {"void", "reversed"}:
                    return _json_error(f"Cannot post depreciation in status '{st}'", 400)

                # ✅ review gate: must be pending_review
                if review_required and st != "pending_review":
                    return _json_error(
                        f"Cannot approve+post depreciation while status is '{st}'. Submit for review first.",
                        400
                    )

                # permission gate
                if review_required:
                    if not can_approve_ppe(user, company_profile, mode):
                        return _json_error("Not allowed to approve/post depreciation in review mode.", 403)
                else:
                    if not can_post_ppe(user, company_profile, mode):
                        return _json_error("Not allowed to post depreciation.", 403)

                # basic validations
                if not dep.get("asset_id"):
                    return _json_error("Depreciation missing asset_id.", 400)
                if not dep.get("period_end"):
                    return _json_error("Depreciation missing period_end.", 400)

                jid = posting.post_depreciation(cur, company_id, dep_id, user=user)

                cur.execute(_q(schema, """
                    UPDATE {schema}.asset_depreciation
                    SET approved_by=%s,
                        approved_at=NOW(),
                        approval_note=COALESCE(%s, approval_note)
                    WHERE company_id=%s AND id=%s
                """), (user.get("id"), approval_note, company_id, dep_id))

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="approve_post_depreciation" if review_required else "post_depreciation",
                    entity_type="depreciation",
                    entity_id=str(dep_id),
                    entity_ref=f"DEP-{dep_id}",
                    journal_id=int(jid) if jid else None,
                    before_json={"depreciation_id": int(dep_id), "status": st},
                    after_json={"posted_journal_id": int(jid) if jid else None, "approved_by": user.get("id")},
                    message=f"{'Approved+posted' if review_required else 'Posted'} depreciation {dep_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "status": "posted", "journal_id": jid})

    except Exception as e:
        current_app.logger.exception("approve_post_depreciation failed")
        return _json_error(str(e), 400)
    
@ppe_bp.route("/api/companies/<int:company_id>/revaluations/<int:reval_id>/approve-post", methods=["POST", "OPTIONS"])
@require_auth
def approve_post_revaluation(company_id: int, reval_id: int):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)

    payload_in = request.get_json(silent=True) or {}
    approval_note = (payload_in.get("note") or payload_in.get("approval_note") or "").strip() or None

    pol = company_policy(company_id)
    mode = (pol.get("mode") or "").strip().lower()
    company_profile = pol.get("company") or {}
    policy = pol.get("policy") or {}

    review_required = ppe_review_required(mode, policy, "post_revaluation")

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                cur.execute(_q(schema, """
                    SELECT *
                    FROM {schema}.asset_revaluations
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, reval_id))
                r = cur.fetchone()
                if not r:
                    return _json_error("Revaluation not found", 404)

                st = (r.get("status") or "").strip().lower()

                # idempotent
                if st == "posted" and r.get("posted_journal_id"):
                    return jsonify({"ok": True, "status": "posted", "journal_id": r["posted_journal_id"]})

                if st in {"void", "reversed"}:
                    return _json_error(f"Cannot post revaluation in status '{st}'", 400)

                # ✅ review gate: must be pending_review
                if review_required and st != "pending_review":
                    return _json_error(
                        f"Cannot approve+post revaluation while status is '{st}'. Submit for review first.",
                        400
                    )

                # permission gate
                if review_required:
                    if not can_approve_ppe(user, company_profile, mode):
                        return _json_error("Not allowed to approve/post revaluations in review mode.", 403)
                else:
                    if not can_post_ppe(user, company_profile, mode):
                        return _json_error("Not allowed to post revaluations.", 403)

                if not r.get("asset_id"):
                    return _json_error("Revaluation missing asset_id.", 400)
                if not r.get("revaluation_date"):
                    return _json_error("Revaluation missing revaluation_date.", 400)

                jid = posting.post_revaluation(cur, company_id, reval_id)

                cur.execute(_q(schema, """
                    UPDATE {schema}.asset_revaluations
                    SET approved_by=%s,
                        approved_at=NOW(),
                        approval_note=COALESCE(%s, approval_note)
                    WHERE company_id=%s AND id=%s
                """), (user.get("id"), approval_note, company_id, reval_id))

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="approve_post_revaluation" if review_required else "post_revaluation",
                    entity_type="revaluation",
                    entity_id=str(reval_id),
                    entity_ref=f"REVAL-{reval_id}",
                    journal_id=int(jid) if jid else None,
                    before_json={"revaluation_id": int(reval_id), "status": st},
                    after_json={"posted_journal_id": int(jid) if jid else None, "approved_by": user.get("id")},
                    message=f"{'Approved+posted' if review_required else 'Posted'} revaluation {reval_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "status": "posted", "journal_id": jid})

    except Exception as e:
        current_app.logger.exception("approve_post_revaluation failed")
        return _json_error(str(e), 400)
    
@ppe_bp.route("/api/companies/<int:company_id>/impairments/<int:imp_id>/approve-post", methods=["POST", "OPTIONS"])
@require_auth
def approve_post_impairment(company_id: int, imp_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)

    payload_in = request.get_json(silent=True) or {}
    approval_note = (payload_in.get("note") or payload_in.get("approval_note") or "").strip() or None

    pol = company_policy(company_id)
    mode = (pol.get("mode") or "").strip().lower()
    company_profile = pol.get("company") or {}
    policy = pol.get("policy") or {}

    review_required = ppe_review_required(mode, policy, "post_impairment")

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                cur.execute(_q(schema, """
                    SELECT *
                    FROM {schema}.asset_impairments
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, imp_id))
                r = cur.fetchone()
                if not r:
                    return _json_error("Impairment not found", 404)

                st = (r.get("status") or "").strip().lower()

                # idempotent
                if st == "posted" and r.get("posted_journal_id"):
                    return jsonify({"ok": True, "status": "posted", "journal_id": r["posted_journal_id"]})

                if st in {"void", "reversed"}:
                    return _json_error(f"Cannot post impairment in status '{st}'", 400)

                # ✅ review gate: must be pending_review
                if review_required and st != "pending_review":
                    return _json_error(
                        f"Cannot approve+post impairment while status is '{st}'. Submit for review first.",
                        400
                    )

                # permission gate
                if review_required:
                    if not can_approve_ppe(user, company_profile, mode):
                        return _json_error("Not allowed to approve/post impairments in review mode.", 403)
                else:
                    if not can_post_ppe(user, company_profile, mode):
                        return _json_error("Not allowed to post impairments.", 403)

                if not r.get("asset_id"):
                    return _json_error("Impairment missing asset_id.", 400)
                if not r.get("impairment_date"):
                    return _json_error("Impairment missing impairment_date.", 400)

                jid = posting.post_impairment(cur, company_id, imp_id)

                cur.execute(_q(schema, """
                    UPDATE {schema}.asset_impairments
                    SET approved_by=%s,
                        approved_at=NOW(),
                        approval_note=COALESCE(%s, approval_note)
                    WHERE company_id=%s AND id=%s
                """), (user.get("id"), approval_note, company_id, imp_id))

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="approve_post_impairment" if review_required else "post_impairment",
                    entity_type="impairment",
                    entity_id=str(imp_id),
                    entity_ref=f"IMP-{imp_id}",
                    journal_id=int(jid) if jid else None,
                    before_json={"impairment_id": int(imp_id), "status": st},
                    after_json={"posted_journal_id": int(jid) if jid else None, "approved_by": user.get("id")},
                    message=f"{'Approved+posted' if review_required else 'Posted'} impairment {imp_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "status": "posted", "journal_id": jid})

    except Exception as e:
        current_app.logger.exception("approve_post_impairment failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/held-for-sale/<int:hfs_id>/approve-post", methods=["POST", "OPTIONS"])
@require_auth
def approve_post_hfs(company_id: int, hfs_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)

    payload_in = request.get_json(silent=True) or {}
    approval_note = (payload_in.get("note") or payload_in.get("approval_note") or "").strip() or None

    pol = company_policy(company_id)
    mode = (pol.get("mode") or "").strip().lower()
    company_profile = pol.get("company") or {}
    policy = pol.get("policy") or {}

    review_required = ppe_review_required(mode, policy, "classify_hfs")

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                cur.execute(_q(schema, """
                    SELECT *
                    FROM {schema}.asset_held_for_sale
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, hfs_id))
                r = cur.fetchone()
                if not r:
                    return _json_error("Held-for-sale record not found", 404)

                st = (r.get("status") or "").strip().lower()

                # Idempotent: your HFS uses posted_journal_id as the true flag
                if r.get("posted_journal_id"):
                    return jsonify({"ok": True, "status": "posted", "journal_id": r["posted_journal_id"]})

                if st in {"void", "reversed"}:
                    return _json_error(f"Cannot post held-for-sale in status '{st}'", 400)

                # ✅ review gate: must be pending_review
                if review_required and st != "pending_review":
                    return _json_error(
                        f"Cannot approve+post held-for-sale while status is '{st}'. Submit for review first.",
                        400
                    )

                # permission gate
                if review_required:
                    if not can_approve_ppe(user, company_profile, mode):
                        return _json_error("Not allowed to approve/post held-for-sale in review mode.", 403)
                else:
                    if not can_post_ppe(user, company_profile, mode):
                        return _json_error("Not allowed to post held-for-sale.", 403)

                if not r.get("asset_id"):
                    return _json_error("Held-for-sale missing asset_id.", 400)
                if not r.get("classification_date"):
                    return _json_error("Held-for-sale missing classification_date.", 400)

                jid = posting.post_hfs(cur, company_id, hfs_id)

                # If table supports approval columns, store them (non-fatal if missing)
                try:
                    cur.execute(_q(schema, """
                        UPDATE {schema}.asset_held_for_sale
                        SET approved_by=%s,
                            approved_at=NOW(),
                            approval_note=COALESCE(%s, approval_note)
                        WHERE company_id=%s AND id=%s
                    """), (user.get("id"), approval_note, company_id, hfs_id))
                except Exception:
                    current_app.logger.warning(
                        "asset_held_for_sale missing approval columns; skipping approved_* update"
                    )

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="approve_post_hfs" if review_required else "post_hfs",
                    entity_type="held_for_sale",
                    entity_id=str(hfs_id),
                    entity_ref=f"HFS-{hfs_id}",
                    journal_id=int(jid) if jid else None,
                    before_json={"hfs_id": int(hfs_id), "status": st},
                    after_json={"posted_journal_id": int(jid) if jid else None, "approved_by": user.get("id")},
                    message=f"{'Approved+posted' if review_required else 'Posted'} held-for-sale {hfs_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "status": "posted", "journal_id": jid})

    except Exception as e:
        current_app.logger.exception("approve_post_hfs failed")
        return _json_error(str(e), 400)
    
@ppe_bp.route(
    "/api/companies/<int:company_id>/asset-disposals/<int:disposal_id>/approve-post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def approve_post_asset_disposal(company_id: int, disposal_id: int):
    """
    Unified approve-post endpoint for asset disposals.

    Behaviour by governance mode:

    • review_required = False (Owner-managed / relaxed)
        → Acts like POST (can_post_ppe required)

    • review_required = True (Assisted / Controlled)
        → Acts like APPROVE + POST
        → Requires status = 'pending_review'
        → Requires can_approve_ppe
    """

    if request.method == "OPTIONS":
        return _opt()

    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)

    payload_in = request.get_json(silent=True) or {}
    approval_note = (
        payload_in.get("note")
        or payload_in.get("approval_note")
        or ""
    ).strip() or None

    # ---------------------------------------------------
    # Policy + mode
    # ---------------------------------------------------
    pol = company_policy(company_id)
    mode = (pol.get("mode") or "").strip().lower()
    company_profile = pol.get("company") or {}
    policy = pol.get("policy") or {}

    review_required = ppe_review_required(mode, policy, "post_disposal")

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                # ---------------------------------------------------
                # Lock disposal row
                # ---------------------------------------------------
                cur.execute(_q(schema, """
                    SELECT *
                    FROM {schema}.asset_disposals
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, disposal_id))

                disp = cur.fetchone()
                if not disp:
                    return _json_error("Disposal not found", 404)

                st = (disp.get("status") or "").strip().lower()

                # ---------------------------------------------------
                # Idempotent check
                # ---------------------------------------------------
                if st == "posted" and disp.get("posted_journal_id"):
                    return jsonify({
                        "ok": True,
                        "status": "posted",
                        "journal_id": disp["posted_journal_id"],
                    })

                # ---------------------------------------------------
                # Hard status blocks
                # ---------------------------------------------------
                if st in {"void", "reversed"}:
                    return _json_error(
                        f"Cannot post disposal in status '{st}'",
                        400,
                    )

                # ---------------------------------------------------
                # REVIEW GATE (main driver)
                # ---------------------------------------------------
                if review_required and st != "pending_review":
                    return _json_error(
                        f"Cannot approve+post disposal while status is '{st}'. "
                        f"Submit for review first.",
                        400,
                    )

                # ---------------------------------------------------
                # Permission gate
                # ---------------------------------------------------
                if review_required:
                    if not can_approve_ppe(user, company_profile, mode):
                        return _json_error(
                            "Not allowed to approve/post disposals in review mode.",
                            403,
                        )
                else:
                    if not can_post_ppe(user, company_profile, mode):
                        return _json_error(
                            "Not allowed to post disposals.",
                            403,
                        )

                # ---------------------------------------------------
                # Basic validations
                # ---------------------------------------------------
                if not disp.get("asset_id"):
                    return _json_error(
                        "Disposal missing asset_id.",
                        400,
                    )

                if not disp.get("disposal_date"):
                    return _json_error(
                        "Disposal missing disposal_date.",
                        400,
                    )

                # ---------------------------------------------------
                # Post to GL
                # Must set:
                #   posted_journal_id
                #   posted_at
                #   status = 'posted'
                # ---------------------------------------------------
                jid = post_disposal(
                    cur,
                    company_id=company_id,
                    disposal_id=disposal_id,
                )

                # ---------------------------------------------------
                # Capture approval / posting info
                # ---------------------------------------------------
                cur.execute(_q(schema, """
                    UPDATE {schema}.asset_disposals
                    SET approved_by=%s,
                        approved_at=NOW(),
                        approval_note=COALESCE(%s, approval_note)
                    WHERE company_id=%s AND id=%s
                """), (
                    user.get("id"),
                    approval_note,
                    company_id,
                    disposal_id,
                ))

                # ---------------------------------------------------
                # Audit trail
                # ---------------------------------------------------
                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action=(
                        "approve_post_disposal"
                        if review_required
                        else "post_disposal"
                    ),
                    entity_type="disposal",
                    entity_id=str(disposal_id),
                    entity_ref=f"DISP-{disposal_id}",
                    journal_id=int(jid) if jid else None,
                    before_json={
                        "disposal_id": int(disposal_id),
                        "status": st,
                    },
                    after_json={
                        "posted_journal_id": int(jid) if jid else None,
                        "approved_by": user.get("id"),
                    },
                    message=(
                        f"{'Approved+posted' if review_required else 'Posted'} "
                        f"disposal {disposal_id} to journal {jid}"
                    ),
                    cur=cur,
                )

                conn.commit()

                return jsonify({
                    "ok": True,
                    "status": "posted",
                    "journal_id": jid,
                })

    except Exception as e:
        current_app.logger.exception(
            "approve_post_asset_disposal failed"
        )
        return _json_error(str(e), 400)

# -----------------------------
# Depreciation /approve-post-batch
# - locks rows
# - enforces pending_review when review is required
# - stamps approval fields
# - audit trail
# -----------------------------
def _normalize_dep_ids(payload: dict) -> list[int]:
    raw = payload.get("dep_ids") or payload.get("ids") or []

    # Allow comma/space separated string: "1,2 3"
    if isinstance(raw, str):
        raw = [x for x in raw.replace(",", " ").split() if x]

    # Allow single int
    if isinstance(raw, int):
        raw = [raw]

    out: list[int] = []
    if isinstance(raw, (list, tuple)):
        for x in raw:
            try:
                out.append(int(str(x).strip()))
            except Exception:
                pass

    return sorted(set(out)) 

@ppe_bp.route("/api/companies/<int:company_id>/depreciation/approve-post-batch", methods=["POST", "OPTIONS"])
@require_auth
def approve_post_depreciation_batch(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)

    payload_in = request.get_json(force=True, silent=True) or {}
    dep_ids = payload_in.get("dep_ids") or payload_in.get("ids") or []
    approval_note = (payload_in.get("note") or payload_in.get("approval_note") or "").strip() or None

    # Policy (single source of truth)
    pol = company_policy(company_id)
    mode = (pol.get("mode") or "").strip().lower()
    company_profile = pol.get("company") or {}
    policy = pol.get("policy") or {}

    review_required = bool(ppe_review_required(mode, policy, "post_depreciation"))

    # ✅ permission gate (mode/review aware)
    if review_required:
        if not can_approve_ppe(user, company_profile, mode):
            return _json_error("Not allowed to approve/post depreciation batch in review mode.", 403)
    else:
        if not can_post_ppe(user, company_profile, mode):
            return _json_error("Not allowed to post depreciation batch.", 403)

    try:
        dep_ids = _normalize_dep_ids(payload_in)
        if not dep_ids:
            current_app.logger.warning(
                "approve-post-batch missing dep_ids payload_in=%s request.data=%r",
                payload_in, request.data
            )
            return _json_error("dep_ids is required", 400)

        posted: list[dict] = []
        skipped: list[dict] = []
        missing: list[int] = []

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                # ✅ Lock all rows up-front (single lock set, consistent ordering)
                cur.execute(_q(schema, """
                    SELECT *
                    FROM {schema}.asset_depreciation
                    WHERE company_id=%s AND id = ANY(%s)
                    FOR UPDATE
                """), (company_id, dep_ids))
                rows = cur.fetchall() or []
                by_id = {int(r["id"]): r for r in rows}

                for dep_id in dep_ids:
                    r = by_id.get(int(dep_id))
                    if not r:
                        missing.append(int(dep_id))
                        continue

                    st = (r.get("status") or "").strip().lower()

                    # idempotent
                    if st == "posted" and r.get("posted_journal_id"):
                        skipped.append({
                            "dep_id": int(dep_id),
                            "journal_id": int(r["posted_journal_id"]),
                            "reason": "already_posted",
                        })
                        continue

                    if st in {"void", "reversed"}:
                        skipped.append({
                            "dep_id": int(dep_id),
                            "reason": f"status={st}",
                        })
                        continue

                    # ✅ REVIEW GATE (main driver)
                    if review_required and st != "pending_review":
                        skipped.append({
                            "dep_id": int(dep_id),
                            "reason": f"requires_pending_review(status={st})",
                        })
                        continue

                    # Basic validations
                    if not r.get("asset_id"):
                        skipped.append({
                            "dep_id": int(dep_id),
                            "reason": "missing_asset_id",
                        })
                        continue
                    if not r.get("period_end"):
                        skipped.append({
                            "dep_id": int(dep_id),
                            "reason": "missing_period_end",
                        })
                        continue

                    # ✅ Post (your service should stamp posted_journal_id/status='posted')
                    jid = posting.post_depreciation(cur, company_id, int(dep_id))
                    posted.append({"dep_id": int(dep_id), "journal_id": int(jid) if jid else None})

                    # ✅ Stamp approval fields (useful even when review_required is False)
                    cur.execute(_q(schema, """
                        UPDATE {schema}.asset_depreciation
                        SET approved_by=%s,
                            approved_at=NOW(),
                            approval_note=COALESCE(%s, approval_note)
                        WHERE company_id=%s AND id=%s
                    """), (user.get("id"), approval_note, company_id, int(dep_id)))

                # ✅ Audit (single batch record)
                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="approve_post_depreciation_batch" if review_required else "post_depreciation_batch",
                    entity_type="depreciation_batch",
                    entity_id="batch",
                    entity_ref=f"DEP-BATCH {len(dep_ids)}",
                    before_json={"dep_ids": dep_ids, "approval_note": approval_note},
                    after_json={
                        "posted": posted,
                        "skipped": skipped,
                        "missing": missing,
                        "approved_by": user.get("id"),
                        "count_posted": len(posted),
                        "count_skipped": len(skipped),
                        "count_missing": len(missing),
                    },
                    message=(
                        f"{'Approved+posted' if review_required else 'Posted'} depreciation batch "
                        f"({len(posted)} posted, {len(skipped)} skipped, {len(missing)} missing)"
                    ),
                    cur=cur,
                )

                conn.commit()

                return jsonify({
                    "ok": True,
                    "review_required": review_required,
                    "count_posted": len(posted),
                    "count_skipped": len(skipped),
                    "count_missing": len(missing),
                    "posted": posted,
                    "skipped": skipped,
                    "missing": missing,
                    "approved_by": user.get("id"),
                })

    except Exception as e:
        current_app.logger.exception("approve_post_depreciation_batch failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/subsequent-measurements", methods=["GET", "POST", "OPTIONS"])
@require_auth
def subsequent_measurements_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)

    if request.method == "GET":
        asset_id = request.args.get("asset_id", type=int)
        status = (request.args.get("status") or "").strip() or None
        limit = _int_arg("limit", 100)
        offset = _int_arg("offset", 0)

        where = ["company_id=%s"]
        params = [company_id]
        if asset_id:
            where.append("asset_id=%s")
            params.append(int(asset_id))
        if status:
            where.append("status=%s")
            params.append(status.lower())

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(_q(schema, f"""
                    SELECT *
                    FROM {{schema}}.asset_subsequent_measurements
                    WHERE {" AND ".join(where)}
                    ORDER BY event_date DESC, id DESC
                    LIMIT %s OFFSET %s
                """), params + [limit, offset])
                rows = cur.fetchall() or []
                return jsonify({"ok": True, "data": rows})

    # POST (create)
    payload_in = request.get_json(force=True) or {}

    try:
        # normalize date
        if isinstance(payload_in.get("event_date"), str):
            payload_in["event_date"] = _iso_date(payload_in["event_date"])

        d = payload_in.get("event_date")
        _must_not_be_future(d, "Event date")

        user = getattr(g, "current_user", None) or {}
        pol = company_policy(company_id)
        mode = (pol.get("mode") or "").strip().lower()
        company_profile = pol.get("company") or {}
        policy = pol.get("policy") or {}

        role = user_role(user)

        review_required = bool(ppe_review_required(mode, policy, "create_subsequent_measurement"))
        can_post = can_post_ppe(user, company_profile, mode)

        CAN_REQUEST_APPROVAL_ROLES = {"owner", "admin", "cfo", "ceo", "manager", "senior", "accountant", "clerk", "other"}

        # gate
        if review_required:
            if not (can_post or (role in CAN_REQUEST_APPROVAL_ROLES and role != "viewer")):
                return _json_error("Not allowed to submit subsequent measurement for approval.", 403)
        else:
            # if no review required, allow create (even if cannot post) OR keep strict if you want
            # I'll keep it permissive (create draft is ok)
            pass

        schema = company_schema(company_id)

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                policy_doc = company_asset_rules(company_id)

                asset_id = int(payload_in.get("asset_id") or 0)
                if asset_id <= 0:
                    return _json_error("Missing asset_id", 400)

                event_type = (payload_in.get("event_type") or "").strip().lower()
                amount = float(payload_in.get("amount") or 0.0)

                asset = service.fetch_asset_row(cur, company_id, asset_id)

                # ✅ eligibility gate (model + class + capitalization threshold)
                posting.assert_sm_eligible(company_id, asset, event_type, amount, policy_doc)

                # 1) create row (service decides status default draft)
                new_id = service.create_subsequent_measurement(cur, company_id, payload_in)

                # 2) if review required: create approval request + mark SM pending_review
                approval_id = None
                if review_required:
                    requested_by = int(user.get("id") or 0)
                    if requested_by <= 0:
                        return _json_error("AUTH|missing_user_id", 401)

                    # suggested approver role (match your pattern)
                    suggested_approver_role = "cfo" if mode == "controlled" else "owner"

                    # dedupe key: stable enough, but unique per SM id to avoid collisions
                    pj = {
                        "sm_id": int(new_id),
                        "asset_id": int(payload_in.get("asset_id") or 0),
                        "event_date": str(payload_in.get("event_date"))[:10] if payload_in.get("event_date") else None,
                        "event_type": (payload_in.get("event_type") or "").strip().lower(),
                        "amount": float(payload_in.get("amount") or 0.0),
                        "mode": mode,
                        "suggested_approver_role": suggested_approver_role,
                    }
                    dedupe_key = f"ppe:sm:create:{company_id}:sm:{int(new_id)}"

                    req = db_service.create_approval_request(
                        company_id,
                        entity_type="subsequent_measurement",
                        entity_id=str(int(new_id)),
                        entity_ref=f"SM-{int(new_id)}",
                        module="ppe",
                        action="create_subsequent_measurement",
                        requested_by_user_id=requested_by,
                        amount=float(payload_in.get("amount") or 0.0),
                        currency=None,
                        risk_level="low",
                        dedupe_key=dedupe_key,
                        payload_json=pj,
                        cur=cur,
                    )
                    approval_id = int(req.get("id") or 0)

                    cur.execute(_q(schema, """
                        UPDATE {schema}.asset_subsequent_measurements
                        SET status='pending_review',
                            approval_id=%s,
                            updated_at=NOW()
                        WHERE company_id=%s AND id=%s
                        AND status IN ('draft','pending_review')
                    """), (approval_id, company_id, int(new_id)))

                    _audit_safe(
                        company_id=company_id,
                        payload=user,
                        module="ppe",
                        action="create_subsequent_measurement",
                        entity_type="subsequent_measurement",
                        entity_id=str(new_id),
                        entity_ref=f"SM-{new_id}",
                        before_json={"request": payload_in},
                        after_json={"id": int(new_id), "approval_request_id": approval_id},
                        message=f"Created SM {new_id} and submitted for approval {approval_id}",
                        cur=cur,
                    )

                    conn.commit()
                    return jsonify({
                        "ok": False,
                        "error": "APPROVAL_REQUIRED",
                        "approval_request": req,
                        "approval_request_id": approval_id,
                        "id": int(new_id),
                    }), 202

                # no review required => normal create result
                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="create_subsequent_measurement",
                    entity_type="subsequent_measurement",
                    entity_id=str(new_id),
                    entity_ref=f"SM-{new_id}",
                    before_json={"request": payload_in},
                    after_json={"id": int(new_id)},
                    message=f"Created subsequent measurement {new_id}",
                    cur=cur,
                )
                conn.commit()
                return jsonify({"ok": True, "id": int(new_id)}), 201

    except Exception as e:
        current_app.logger.exception("create_subsequent_measurement failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/subsequent-measurements/preview", methods=["POST", "OPTIONS"])
@require_auth
def subsequent_measurements_preview(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    payload_in = request.get_json(force=True) or {}

    try:
        # normalize date
        if isinstance(payload_in.get("event_date"), str):
            payload_in["event_date"] = _iso_date(payload_in["event_date"])

        d = payload_in.get("event_date")
        _must_not_be_future(d, "Event date")

        asset_id = int(payload_in.get("asset_id") or 0)
        if asset_id <= 0:
            return _json_error("Missing asset_id", 400)

        event_type = (payload_in.get("event_type") or "").strip().lower()
        amount = float(payload_in.get("amount") or 0.0)

        user = getattr(g, "current_user", None) or {}
        schema = company_schema(company_id)

        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                policy_doc = company_asset_rules(company_id) or {}
                asset = service.fetch_asset_row(cur, company_id, asset_id)

                if not asset:
                    return _json_error("Asset not found", 404)

                posting.assert_sm_eligible(company_id, asset, event_type, amount, policy_doc)

                out = posting.build_sm_preview(
                    company_id=company_id,
                    asset_row=asset,
                    payload=payload_in,
                    policy=policy_doc,
                    cur=cur,
                    schema=schema,
                    user=user,
                )

                return jsonify({"ok": True, **out})

    except Exception as e:
        current_app.logger.exception("subsequent_measurements_preview failed")
        return _json_error(str(e), 400)
    
@ppe_bp.route("/api/companies/<int:company_id>/subsequent-measurements/<int:sm_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def subsequent_measurement_post(company_id: int, sm_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    pol = company_policy(company_id)
    mode = (pol.get("mode") or "").strip().lower()
    company_profile = pol.get("company") or {}
    policy = pol.get("policy") or {}

    role = user_role(user)

    review_required = bool(ppe_review_required(mode, policy, "post_subsequent_measurement"))
    can_post = can_post_ppe(user, company_profile, mode)

    CAN_REQUEST_APPROVAL_ROLES = {"owner", "admin", "cfo", "ceo", "manager", "senior", "accountant", "clerk", "other"}

    # gate
    if review_required:
        if not (can_post or (role in CAN_REQUEST_APPROVAL_ROLES and role != "viewer")):
            return _json_error("Not allowed to submit SM posting for approval.", 403)
    else:
        if not can_post:
            return _json_error("Not allowed to post subsequent measurement.", 403)

    schema = company_schema(company_id)

    payload_in = request.get_json(silent=True) or {}
    note = (payload_in.get("note") or "").strip() or None

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                # lock SM row
                cur.execute(_q(schema, """
                    SELECT *
                    FROM {schema}.asset_subsequent_measurements
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, sm_id))
                sm = cur.fetchone()
                if not sm:
                    return _json_error("Subsequent measurement not found", 404)

                policy_doc = company_asset_rules(company_id)

                asset = service.fetch_asset_row(cur, company_id, int(sm.get("asset_id") or 0))

                posting.assert_sm_eligible(
                    company_id,
                    asset,
                    (sm.get("event_type") or ""),
                    float(sm.get("amount") or 0.0),
                    policy_doc
                ) 

                st = (sm.get("status") or "").strip().lower()

                # idempotent
                if st == "posted" and sm.get("posted_journal_id"):
                    conn.commit()
                    return jsonify({"ok": True, "status": "posted", "journal_id": int(sm["posted_journal_id"])}), 200

                if st in {"void", "reversed"}:
                    return _json_error(f"Cannot post in status '{st}'", 400)

                # If review required => create approval request (do NOT post here)
                if review_required:
                    requested_by = int(user.get("id") or 0)
                    if requested_by <= 0:
                        return _json_error("AUTH|missing_user_id", 401)

                    suggested_approver_role = "cfo" if mode == "controlled" else "owner"

                    # dedupe: one active post request per SM
                    dedupe_key = f"ppe:sm:post:{company_id}:sm:{int(sm_id)}"

                    req = db_service.create_approval_request(
                        company_id,
                        entity_type="subsequent_measurement",
                        entity_id=str(int(sm_id)),
                        entity_ref=f"SM-{int(sm_id)}",
                        module="ppe",
                        action="post_subsequent_measurement",
                        requested_by_user_id=requested_by,
                        amount=float(sm.get("amount") or 0.0),
                        currency=None,
                        risk_level="low",
                        dedupe_key=dedupe_key,
                        payload_json={
                            "sm_id": int(sm_id),
                            "asset_id": int(sm.get("asset_id") or 0),
                            "event_date": str(sm.get("event_date"))[:10] if sm.get("event_date") else None,
                            "event_type": (sm.get("event_type") or "").strip().lower(),
                            "amount": float(sm.get("amount") or 0.0),
                            "mode": mode,
                            "suggested_approver_role": suggested_approver_role,
                            "note": note,
                        },
                        cur=cur,
                    )
                    approval_id = int(req.get("id") or 0)

                    cur.execute(_q(schema, """
                        UPDATE {schema}.asset_subsequent_measurements
                        SET status='pending_review',
                            approval_id=%s,
                            updated_at=NOW()
                        WHERE company_id=%s AND id=%s
                          AND status IN ('draft','pending_review')
                    """), (approval_id, company_id, sm_id))

                    _audit_safe(
                        company_id=company_id,
                        payload=user,
                        module="ppe",
                        action="post_subsequent_measurement",
                        entity_type="subsequent_measurement",
                        entity_id=str(sm_id),
                        entity_ref=f"SM-{sm_id}",
                        before_json={"status": st},
                        after_json={"status": "pending_review", "approval_request_id": approval_id},
                        message=f"Submitted SM {sm_id} for posting approval {approval_id}",
                        cur=cur,
                    )

                    conn.commit()
                    return jsonify({
                        "ok": False,
                        "error": "APPROVAL_REQUIRED",
                        "approval_request": req,
                        "approval_request_id": approval_id,
                        "sm_id": int(sm_id),
                    }), 202

                # No review required: post immediately
                jid = posting.post_subsequent_measurement(cur, company_id, sm_id, user=user)

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="post_subsequent_measurement",
                    entity_type="subsequent_measurement",
                    entity_id=str(sm_id),
                    entity_ref=f"SM-{sm_id}",
                    journal_id=int(jid) if jid else None,
                    after_json={"posted_journal_id": int(jid) if jid else None},
                    message=f"Posted SM {sm_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "status": "posted", "journal_id": int(jid) if jid else None}), 200

    except Exception as e:
        current_app.logger.exception("post_subsequent_measurement failed")
        return _json_error(str(e), 400)
    
@ppe_bp.route("/api/companies/<int:company_id>/subsequent-measurements/<int:sm_id>/approve-post", methods=["POST", "OPTIONS"])
@require_auth
def approve_post_subsequent_measurement(company_id: int, sm_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)
    payload_in = request.get_json(silent=True) or {}
    approval_note = (payload_in.get("note") or payload_in.get("approval_note") or "").strip() or None

    pol = company_policy(company_id)
    mode = (pol.get("mode") or "").strip().lower()
    company_profile = pol.get("company") or {}
    policy = pol.get("policy") or {}

    review_required = bool(ppe_review_required(mode, policy, "post_subsequent_measurement"))

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(_q(schema, """
                    SELECT *
                    FROM {schema}.asset_subsequent_measurements
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, sm_id))
                sm = cur.fetchone()
                if not sm:
                    return _json_error("Subsequent measurement not found", 404)

                st = (sm.get("status") or "").strip().lower()

                if st == "posted" and sm.get("posted_journal_id"):
                    return jsonify({"ok": True, "status": "posted", "journal_id": sm["posted_journal_id"]})

                if st in {"void", "reversed"}:
                    return _json_error(f"Cannot post in status '{st}'", 400)

                if review_required and st != "pending_review":
                    return _json_error(
                        f"Cannot approve+post while status is '{st}'. Submit for review first.",
                        400
                    )

                if review_required:
                    if not can_approve_ppe(user, company_profile, mode):
                        return _json_error("Not allowed to approve/post in review mode.", 403)
                else:
                    if not can_post_ppe(user, company_profile, mode):
                        return _json_error("Not allowed to post.", 403)

                jid = posting.post_subsequent_measurement(cur, company_id, sm_id, user=user)

                cur.execute(_q(schema, """
                    UPDATE {schema}.asset_subsequent_measurements
                    SET approved_by=%s,
                        approved_at=NOW(),
                        approval_note=COALESCE(%s, approval_note)
                    WHERE company_id=%s AND id=%s
                """), (user.get("id"), approval_note, company_id, sm_id))

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="approve_post_subsequent_measurement" if review_required else "post_subsequent_measurement",
                    entity_type="subsequent_measurement",
                    entity_id=str(sm_id),
                    entity_ref=f"SM-{sm_id}",
                    journal_id=int(jid) if jid else None,
                    before_json={"status": st},
                    after_json={"posted_journal_id": int(jid) if jid else None},
                    message=f"{'Approved+posted' if review_required else 'Posted'} subsequent measurement {sm_id} to journal {jid}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "status": "posted", "journal_id": jid})

    except Exception as e:
        current_app.logger.exception("approve_post_subsequent_measurement failed")
        return _json_error(str(e), 400)

@ppe_bp.route("/api/companies/<int:company_id>/assets/policies", methods=["GET", "POST", "OPTIONS"])
@require_auth
def asset_policies_get_or_save(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)
    user = getattr(g, "current_user", None) or {}
    user_id = int(user.get("id") or 0) if isinstance(user, dict) else 0

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                # -----------------------------
                # GET
                # -----------------------------
                if request.method == "GET":
                    cur.execute(_q(schema, """
                        SELECT company_id, payload_json, updated_at, updated_by
                        FROM {schema}.asset_policies
                        WHERE company_id=%s
                        LIMIT 1
                    """), (company_id,))
                    row = cur.fetchone()

                    item = row["payload_json"] if row else {}
                    return jsonify({"ok": True, "item": item})

                # -----------------------------
                # POST (save / upsert)
                # -----------------------------
                payload_in = request.get_json(force=True) or {}

                if not isinstance(payload_in, dict):
                    return _json_error("Invalid policies payload", 400)

                # Optional sanity checks for policy structure
                if "capitalization" in payload_in and not isinstance(payload_in["capitalization"], dict):
                    return _json_error("capitalization must be an object", 400)

                if "models" in payload_in and not isinstance(payload_in["models"], dict):
                    return _json_error("models must be an object", 400)

                if "classification" in payload_in and not isinstance(payload_in["classification"], dict):
                    return _json_error("classification must be an object", 400)

                if "eligibility" in payload_in and not isinstance(payload_in["eligibility"], dict):
                    return _json_error("eligibility must be an object", 400)

                cur.execute(_q(schema, """
                    INSERT INTO {schema}.asset_policies (company_id, payload_json, updated_at, updated_by)
                    VALUES (%s, %s::jsonb, NOW(), %s)
                    ON CONFLICT (company_id) DO UPDATE
                    SET payload_json = EXCLUDED.payload_json,
                        updated_at   = NOW(),
                        updated_by   = EXCLUDED.updated_by
                    RETURNING company_id, payload_json, updated_at, updated_by
                """), (company_id, json.dumps(payload_in), user_id if user_id > 0 else None))

                saved = cur.fetchone() or {}
                conn.commit()

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="save_asset_policies",
                    entity_type="asset_policies",
                    entity_id=str(company_id),
                    entity_ref=f"POL-{company_id}",
                    after_json={"payload_json": payload_in},
                    message=f"Saved asset policies for company {company_id}",
                    cur=cur,
                )

                return jsonify({
                    "ok": True,
                    "item": saved.get("payload_json") or payload_in
                }), 200

    except Exception as e:
        current_app.logger.exception("asset_policies_get_or_save failed")
        return _json_error(str(e), 400)

@ppe_bp.route(
    "/api/companies/<int:company_id>/subsequent-measurements/<int:sm_id>",
    methods=["GET", "PUT", "DELETE", "OPTIONS"],
)
@require_auth
def subsequent_measurement_get_update_delete(company_id: int, sm_id: int):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    schema = company_schema(company_id)
    user = getattr(g, "current_user", None) or {}

    try:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                # ---- GET ----
                if request.method == "GET":
                    cur.execute(_q(schema, """
                        SELECT *
                        FROM {schema}.asset_subsequent_measurements
                        WHERE company_id=%s AND id=%s
                        LIMIT 1
                    """), (company_id, sm_id))
                    row = cur.fetchone()
                    if not row:
                        return _json_error("Not found", 404)
                    return jsonify({"ok": True, "data": row})

                # Lock row for PUT/DELETE
                cur.execute(_q(schema, """
                    SELECT *
                    FROM {schema}.asset_subsequent_measurements
                    WHERE company_id=%s AND id=%s
                    FOR UPDATE
                """), (company_id, sm_id))
                sm = cur.fetchone()
                if not sm:
                    return _json_error("Not found", 404)

                st = (sm.get("status") or "").strip().lower()

                # ---- DELETE (soft delete => void) ----
                if request.method == "DELETE":
                    # don’t allow delete if posted (journal exists) or pending approval
                    if st == "posted":
                        return _json_error("Cannot delete a posted subsequent measurement.", 400)
                    if st == "pending_review":
                        return _json_error("Cannot delete while pending review. Cancel/void the approval first.", 400)

                    cur.execute(_q(schema, """
                        UPDATE {schema}.asset_subsequent_measurements
                        SET status='void',
                            updated_at=NOW()
                        WHERE company_id=%s AND id=%s
                          AND status IN ('draft','void')
                    """), (company_id, sm_id))

                    _audit_safe(
                        company_id=company_id,
                        payload=user,
                        module="ppe",
                        action="void_subsequent_measurement",
                        entity_type="subsequent_measurement",
                        entity_id=str(sm_id),
                        entity_ref=f"SM-{sm_id}",
                        before_json={"status": st},
                        after_json={"status": "void"},
                        message=f"Voided subsequent measurement {sm_id}",
                        cur=cur,
                    )

                    conn.commit()
                    return jsonify({"ok": True, "status": "void"}), 200

                # ---- PUT (update draft) ----
                payload_in = request.get_json(force=True) or {}
                if not isinstance(payload_in, dict):
                    return _json_error("Invalid payload", 400)

                if st != "draft":
                    return _json_error(f"Only draft items can be edited (current status: {st}).", 400)

                # normalize date
                if isinstance(payload_in.get("event_date"), str):
                    payload_in["event_date"] = _iso_date(payload_in["event_date"])
                d = payload_in.get("event_date")
                _must_not_be_future(d, "Event date")

                asset_id = int(payload_in.get("asset_id") or sm.get("asset_id") or 0)
                if asset_id <= 0:
                    return _json_error("Missing asset_id", 400)

                event_type = (payload_in.get("event_type") or sm.get("event_type") or "").strip().lower()
                if event_type not in ("add_cost", "change_estimate"):
                    return _json_error("Invalid event_type", 400)

                amount = float(payload_in.get("amount") or 0.0)

                # fetch asset + check eligibility policy (no mode/review here)
                policy_doc = company_asset_rules(company_id)
                asset = service.fetch_asset_row(cur, company_id, asset_id)
                posting.assert_sm_eligible(company_id, asset, event_type, amount, policy_doc)

                # shape cleanup: ensure irrelevant fields are nulled
                patch = dict(payload_in)
                patch["event_type"] = event_type
                patch["asset_id"] = asset_id

                if event_type == "add_cost":
                    patch["useful_life_months"] = None
                    patch["residual_value"] = None
                    patch["depreciation_method"] = None
                else:
                    patch["amount"] = None
                    patch["debit_account_code"] = None
                    patch["credit_account_code"] = None

                ok = service.update_subsequent_measurement(cur, company_id, sm_id, patch)
                if ok is False:
                    return _json_error("Not found / not updated", 404)

                after = service.get_subsequent_measurement(cur, company_id, sm_id)

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="update_subsequent_measurement",
                    entity_type="subsequent_measurement",
                    entity_id=str(sm_id),
                    entity_ref=f"SM-{sm_id}",
                    before_json={"sm": sm, "patch": payload_in},
                    after_json={"sm": after},
                    message=f"Updated subsequent measurement {sm_id}",
                    cur=cur,
                )

                conn.commit()
                return jsonify({"ok": True, "data": after}), 200

    except Exception as e:
        current_app.logger.exception("subsequent_measurement_get_update_delete failed")
        return _json_error(str(e), 400)