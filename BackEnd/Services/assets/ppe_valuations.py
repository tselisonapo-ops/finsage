from flask import Blueprint, request, jsonify, g, current_app
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.company import company_policy
from BackEnd.Services.credit_policy import can_post_ppe, ppe_review_required, user_role
from BackEnd.Services.assets.ppe_reporting import _q, _json_error, _audit_safe
from BackEnd.Services.assets.tenants import company_schema
from BackEnd.Services.assets.service import fetch_asset_row
from BackEnd.Services.assets.posting import post_revaluation, asset_class_key, asset_standard_and_model, company_asset_rules
from BackEnd.Services.utils.http_helpers import _opt
bp_valuations_ = Blueprint("ppe_valuations", __name__)

def assert_asset_revaluation_eligible(
    cur,
    company_id: int,
    revaluation_id: int,
    revaluation_row: dict,
    asset_row: dict,
    policy: dict,
) -> None:
    cls_key = asset_class_key(asset_row, policy)
    std, model = asset_standard_and_model(asset_row, policy)

    elig_root = (policy.get("eligibility") or {})
    reval_elig = (elig_root.get("revaluations") or {})

    # 1) model/standard must allow revaluation flow
    allowed_by_model = reval_elig.get("allowed_by_model") or {}
    model_key = f"{std}_{model}".lower()   # e.g. ias16_revaluation, ias16_cost, ias38_revaluation
    is_allowed = allowed_by_model.get(model_key)

    if is_allowed is False:
        raise ValueError(
            f"Revaluation not allowed under model '{model_key}' for asset class '{cls_key}'."
        )

    # sensible defaults if policy is silent
    if is_allowed is None:
        if std == "ias16" and model != "revaluation":
            raise ValueError(
                f"IAS 16 asset '{cls_key}' must use revaluation model before revaluation can be posted."
            )
        if std == "ias38" and model != "revaluation":
            raise ValueError(
                f"IAS 38 asset '{cls_key}' must use revaluation model before revaluation can be posted."
            )
        if std == "ias40":
            raise ValueError(
                "IAS 40 assets should use fair value / IAS 40 flow, not IAS 16 revaluation posting."
            )

    # 2) class-specific disallow
    disallow_by_class = reval_elig.get("disallow_by_class") or {}
    blocked = bool(disallow_by_class.get(cls_key))
    if blocked:
        raise ValueError(f"Revaluation not allowed for asset class '{cls_key}'.")

    # 3) numeric checks
    carrying_before = float(revaluation_row.get("carrying_amount_before") or 0.0)
    carrying_after  = float(revaluation_row.get("carrying_amount_after") or 0.0)
    fair_value      = float(revaluation_row.get("fair_value") or 0.0)
    change          = float(revaluation_row.get("revaluation_change") or 0.0)

    oci_surplus     = float(revaluation_row.get("oci_revaluation_surplus") or 0.0)
    pnl_gain        = float(revaluation_row.get("pnl_revaluation_gain") or 0.0)
    pnl_loss        = float(revaluation_row.get("pnl_revaluation_loss") or 0.0)

    if fair_value < 0 or carrying_after < 0 or carrying_before < 0:
        raise ValueError("Revaluation amounts cannot be negative.")

    expected_change = round(carrying_after - carrying_before, 2)
    actual_change = round(change, 2)
    if actual_change != expected_change:
        raise ValueError(
            f"Revaluation change mismatch: expected {expected_change:.2f}, found {actual_change:.2f}."
        )

    # effect split must reconcile
    # positive change => OCI surplus + P/L gain
    # negative change => P/L loss (and maybe reserve reversal logic later)
    reconciled = round((oci_surplus + pnl_gain - pnl_loss), 2)
    if reconciled != actual_change:
        raise ValueError(
            f"Revaluation allocation mismatch: OCI+gain-loss = {reconciled:.2f}, expected {actual_change:.2f}."
        )

    # 4) valuation evidence required?
    evidence_rules = reval_elig.get("evidence") or {}
    require_valuation_row = bool(evidence_rules.get("require_valuation_row", True))
    require_external_valuer = bool(evidence_rules.get("require_external_valuer", False))
    require_report_reference = bool(evidence_rules.get("require_report_reference", False))

    schema = company_schema(company_id)

    cur.execute(f"""
        SELECT
            v.id,
            v.valuer_id,
            v.valuer_name,
            v.valuer_firm,
            v.valuer_is_external,
            v.report_reference,
            v.report_date
        FROM {schema}.asset_revaluation_valuations v
        WHERE v.company_id = %s
          AND v.revaluation_id = %s
        ORDER BY v.id ASC
    """, (company_id, revaluation_id))
    vals = cur.fetchall() or []

    if require_valuation_row and not vals:
        raise ValueError("At least one valuation detail row is required before posting revaluation.")

    if require_external_valuer and vals:
        has_external = any(bool(v.get("valuer_is_external")) for v in vals)
        if not has_external:
            raise ValueError("An external valuer is required before posting this revaluation.")

    if require_report_reference and vals:
        has_report = any(str(v.get("report_reference") or "").strip() for v in vals)
        if not has_report:
            raise ValueError("A valuation report reference is required before posting this revaluation.")

    # 5) optional class/frequency checks
    max_age_days = int((evidence_rules.get("max_valuation_age_days") or 0) or 0)
    if max_age_days > 0 and vals:
        rv_date = revaluation_row.get("revaluation_date")
        if rv_date:
            from datetime import date as _date
            rvd = rv_date if isinstance(rv_date, _date) else _date.fromisoformat(str(rv_date)[:10])

            for v in vals:
                vd = v.get("report_date") or v.get("valuation_date")
                if not vd:
                    continue
                vdd = vd if isinstance(vd, _date) else _date.fromisoformat(str(vd)[:10])
                age = abs((rvd - vdd).days)
                if age > max_age_days:
                    raise ValueError(
                        f"Valuation evidence is too old ({age} days). Max allowed is {max_age_days} days."
                    )

@bp_valuations_.route(
    "/api/companies/<int:company_id>/asset-revaluations/<int:revaluation_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def asset_revaluation_post(company_id: int, revaluation_id: int | None):
    if request.method == "OPTIONS":
        return _opt()

    user = getattr(g, "current_user", None) or {}
    deny = _deny_if_wrong_company(user, company_id)
    if deny:
        return deny

    pol = company_policy(company_id)
    mode = (pol.get("mode") or "").strip().lower()
    company_profile = pol.get("company") or {}
    policy = pol.get("policy") or {}
    policy_doc = company_asset_rules(company_id)

    role = user_role(user)
    review_required = bool(ppe_review_required(mode, policy, "post_asset_revaluation"))
    can_post = can_post_ppe(user, company_profile, mode)

    CAN_REQUEST_APPROVAL_ROLES = {
        "owner", "admin", "cfo", "ceo", "manager", "senior", "accountant", "clerk", "other"
    }

    if review_required:
        if not (can_post or (role in CAN_REQUEST_APPROVAL_ROLES and role != "viewer")):
            return _json_error("Not allowed to submit asset revaluation posting for approval.", 403)
    else:
        if not can_post:
            return _json_error("Not allowed to post asset revaluation.", 403)

    schema = company_schema(company_id)
    payload_in = request.get_json(silent=True) or {}
    note = (payload_in.get("note") or "").strip() or None

    try:
        with db_service.transaction() as (conn, cur):
            # -------------------------------------------------
            # 1) CREATE / UPDATE the revaluation first
            # -------------------------------------------------
            # create_full_asset_revaluation_flow should:
            # - create new if revaluation_id is None
            # - update existing if revaluation_id is supplied
            resolved_revaluation_id = db_service.create_full_asset_revaluation_flow(
                conn,
                company_id,
                payload_in,
                user_id=int(user.get("id") or 0) or None,
                cur=cur,
                revaluation_id=revaluation_id,   # <-- add this to your service signature
            )

            if not resolved_revaluation_id:
                raise ValueError("Failed to create/update asset revaluation")

            revaluation_id = int(resolved_revaluation_id)

            # -------------------------------------------------
            # 2) LOCK saved row
            # -------------------------------------------------
            cur.execute(_q(schema, """
                SELECT *
                FROM {schema}.asset_revaluations
                WHERE company_id=%s AND id=%s
                FOR UPDATE
            """), (company_id, revaluation_id))
            rv = cur.fetchone()
            if not rv:
                return _json_error("Asset revaluation not found", 404)

            st = (rv.get("status") or "").strip().lower()

            # -------------------------------------------------
            # 3) EVENT / STANDARD GUARDS
            # -------------------------------------------------
            event_type = (payload_in.get("event_type") or rv.get("event_type") or "valuation").strip().lower()
            if event_type != "valuation":
                raise ValueError("Asset revaluation posting route only supports event_type='valuation'.")

            asset = fetch_asset_row(cur, company_id, int(rv.get("asset_id") or 0))
            if not asset:
                return _json_error("Asset not found", 404)

            std, model = asset_standard_and_model(asset, policy_doc)
            if std not in {"ias16", "ias38", "ias40", "ias41"}:
                raise ValueError(f"Valuation route not supported for accounting standard '{std}'.")

            # allow design now, but only IAS16 full posting for now
            if std in {"ias38", "ias40", "ias41"}:
                raise ValueError(f"{std.upper()} valuation posting is not fully implemented yet.")

            # -------------------------------------------------
            # 4) IDEMPOTENCY / STATUS
            # -------------------------------------------------
            if st == "posted" and rv.get("posted_journal_id"):
                return jsonify({
                    "ok": True,
                    "status": "posted",
                    "revaluation_id": revaluation_id,
                    "journal_id": int(rv["posted_journal_id"]),
                }), 200

            if st in {"void", "reversed"}:
                return _json_error(f"Cannot post in status '{st}'", 400)

            # -------------------------------------------------
            # 5) ELIGIBILITY CHECK
            # -------------------------------------------------
            valuation_rows = db_service.list_asset_revaluation_valuation_rows(
                cur,
                company_id,
                revaluation_id,
            )

            assert_asset_revaluation_eligible(
                revaluation_row=rv,
                asset_row=asset,
                valuation_rows=valuation_rows,
                policy=policy_doc,
            )

            # -------------------------------------------------
            # 6) APPROVAL OR IMMEDIATE POST
            # -------------------------------------------------
            if review_required:
                requested_by = int(user.get("id") or 0)
                if requested_by <= 0:
                    return _json_error("AUTH|missing_user_id", 401)

                suggested_approver_role = "cfo" if mode == "controlled" else "owner"
                dedupe_key = f"ppe:revaluation:post:{company_id}:revaluation:{revaluation_id}"

                req = db_service.create_approval_request(
                    company_id,
                    entity_type="asset_revaluation",
                    entity_id=str(revaluation_id),
                    entity_ref=f"REVAL-{revaluation_id}",
                    module="ppe",
                    action="post_asset_revaluation",
                    requested_by_user_id=requested_by,
                    amount=float(rv.get("revaluation_change") or 0.0),
                    currency=None,
                    risk_level="medium",
                    dedupe_key=dedupe_key,
                    payload_json={
                        "revaluation_id": revaluation_id,
                        "asset_id": int(rv.get("asset_id") or 0),
                        "event_type": event_type,
                        "accounting_standard": std,
                        "measurement_model": model,
                        "revaluation_date": str(rv.get("revaluation_date"))[:10] if rv.get("revaluation_date") else None,
                        "fair_value": float(rv.get("fair_value") or 0.0),
                        "carrying_amount_before": float(rv.get("carrying_amount_before") or 0.0),
                        "carrying_amount_after": float(rv.get("carrying_amount_after") or 0.0),
                        "revaluation_change": float(rv.get("revaluation_change") or 0.0),
                        "method": (rv.get("method") or "").strip().lower(),
                        "mode": mode,
                        "suggested_approver_role": suggested_approver_role,
                        "note": note,
                    },
                    cur=cur,
                )
                approval_id = int(req.get("id") or 0)

                cur.execute(_q(schema, """
                    UPDATE {schema}.asset_revaluations
                    SET status='pending_review',
                        approval_id=%s,
                        updated_at=NOW()
                    WHERE company_id=%s AND id=%s
                      AND status IN ('draft','pending_review')
                """), (approval_id, company_id, revaluation_id))

                _audit_safe(
                    company_id=company_id,
                    payload=user,
                    module="ppe",
                    action="post_asset_revaluation",
                    entity_type="asset_revaluation",
                    entity_id=str(revaluation_id),
                    entity_ref=f"REVAL-{revaluation_id}",
                    before_json={"status": st},
                    after_json={"status": "pending_review", "approval_request_id": approval_id},
                    message=f"Submitted asset revaluation {revaluation_id} for posting approval {approval_id}",
                    cur=cur,
                )

                return jsonify({
                    "ok": False,
                    "error": "APPROVAL_REQUIRED",
                    "approval_request": req,
                    "approval_request_id": approval_id,
                    "revaluation_id": revaluation_id,
                    "status": "pending_review",
                }), 202

            jid = post_revaluation(cur, company_id, revaluation_id, user=user)

            _audit_safe(
                company_id=company_id,
                payload=user,
                module="ppe",
                action="post_asset_revaluation",
                entity_type="asset_revaluation",
                entity_id=str(revaluation_id),
                entity_ref=f"REVAL-{revaluation_id}",
                journal_id=int(jid) if jid else None,
                after_json={"posted_journal_id": int(jid) if jid else None},
                message=f"Posted asset revaluation {revaluation_id} to journal {jid}",
                cur=cur,
            )

            return jsonify({
                "ok": True,
                "status": "posted",
                "revaluation_id": revaluation_id,
                "journal_id": int(jid) if jid else None,
            }), 200

    except Exception as e:
        current_app.logger.exception("post_asset_revaluation failed")
        return _json_error(str(e), 400)
    
@bp_valuations_.route("/api/companies/<int:company_id>/assets/<int:asset_id>/revaluations", methods=["GET"])
@require_auth
def api_list_asset_revaluations(company_id, asset_id):
    user_id = getattr(g, "user_id", None)

    try:
        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_asset_revaluations(
                cur,
                company_id,
                asset_id,
                user_id=user_id,
            )
        return jsonify({"ok": True, "items": rows})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@bp_valuations_.route("/api/companies/<int:company_id>/asset-revaluations/<int:revaluation_id>", methods=["GET"])
@require_auth
def api_get_asset_revaluation(company_id, revaluation_id):
    user_id = getattr(g, "user_id", None)

    try:
        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_asset_revaluation_detail(
                cur,
                company_id,
                revaluation_id,
                user_id=user_id,
            )

        if not row:
            return jsonify({"ok": False, "error": "Not found"}), 404

        return jsonify({"ok": True, "item": row})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@bp_valuations_.route("/api/companies/<int:company_id>/asset-valuers", methods=["GET"])
@require_auth
def api_list_asset_valuers(company_id):
    user_id = getattr(g, "user_id", None)
    q = (request.args.get("q") or "").strip()
    limit = int(request.args.get("limit") or 50)

    try:
        rows = db_service.list_asset_valuers(
            company_id,
            q=q,
            limit=limit,
            user_id=user_id,
        )
        return jsonify({"ok": True, "items": rows})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400