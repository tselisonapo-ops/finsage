from flask import Blueprint, request, jsonify, g, current_app, make_response
from BackEnd.Services.auth_middleware import _corsify, require_auth
from .invoice_routes import _deny_if_wrong_company
from BackEnd.Services.company import company_policy
from BackEnd.Services.db_service import db_service

revenue_bp = Blueprint("revenue", __name__)


def _jwt_user_id():
    payload = getattr(request, "jwt_payload", {}) or {}
    uid = payload.get("user_id") or payload.get("sub")
    return int(uid) if uid is not None else None


def _approval_payload_for_run(run: dict) -> dict:
    return {
        "run_id": int(run["id"]),
        "contract_id": int(run["contract_id"]) if run.get("contract_id") else None,
        "period_start": str(run.get("period_start")),
        "period_end": str(run.get("period_end")),
    }


@revenue_bp.route("/api/companies/<int:company_id>/revenue/contracts", methods=["POST", "OPTIONS"])
@require_auth
def api_create_revenue_contract(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    body = request.get_json(silent=True) or {}

    try:
        out = db_service.create_revenue_contract(company_id, body, user_id=user_id)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="create_revenue_contract",
                severity="info",
                entity_type="revenue_contract",
                entity_id=str(out["id"]),
                entity_ref=out.get("contract_number"),
                before_json={},
                after_json=out,
                message=f"Created revenue contract {out.get('contract_number')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_create_revenue_contract")

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("create_revenue_contract failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>", methods=["PUT", "PATCH", "OPTIONS"])
@require_auth
def api_update_revenue_contract(company_id: int, contract_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    body = request.get_json(silent=True) or {}

    try:
        out = db_service.update_revenue_contract(company_id, contract_id, body, user_id=user_id)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="update_revenue_contract",
                severity="info",
                entity_type="revenue_contract",
                entity_id=str(contract_id),
                entity_ref=(out.get("after") or {}).get("contract_number"),
                before_json=out.get("before") or {},
                after_json=out.get("after") or {},
                message=f"Updated revenue contract {(out.get('after') or {}).get('contract_number')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_update_revenue_contract")

        return jsonify({"ok": True, "data": out.get("after"), "before": out.get("before")}), 200
    except Exception as e:
        current_app.logger.exception("update_revenue_contract failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>/versions", methods=["POST", "OPTIONS"])
@require_auth
def api_create_revenue_contract_version(company_id: int, contract_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    try:
        out = db_service.create_revenue_contract_version(company_id, contract_id, body, user_id=user_id)

        try:
            db_service.log_engagement_activity(
                company_id=int(company_id),
                actor_user_id=int(user_id or 0) or None,
                module="revenue",
                action="create_contract_version",
                entity_type="revenue_contract_version",
                entity_id=str(out["id"]),
                entity_ref=f"{contract_id}/v{out.get('version_no')}",
                message=f"Created revenue contract version v{out.get('version_no')}",
            )
        except Exception:
            pass

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="create_revenue_contract_version",
                severity="info",
                entity_type="revenue_contract_version",
                entity_id=str(out["id"]),
                entity_ref=f"{contract_id}/v{out.get('version_no')}",
                before_json={},
                after_json=out,
                message=f"Created revenue contract version {out.get('version_no')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_create_revenue_contract_version")

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("create_revenue_contract_version failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>/obligations", methods=["POST", "OPTIONS"])
@require_auth
def api_add_revenue_obligation(company_id: int, contract_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    try:
        out = db_service.add_revenue_obligation(company_id, contract_id, body, user_id=user_id)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="add_revenue_obligation",
                severity="info",
                entity_type="revenue_obligation",
                entity_id=str(out["id"]),
                entity_ref=out.get("obligation_code"),
                before_json={},
                after_json=out,
                message=f"Added revenue obligation {out.get('obligation_code')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_add_revenue_obligation")

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("add_revenue_obligation failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@revenue_bp.route("/api/companies/<int:company_id>/revenue/contracts", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_revenue_contracts(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            limit = int(request.args.get("limit", 100) or 100)
            q = (request.args.get("q") or "").strip()
            status = (request.args.get("status") or "").strip()
            items = db_service.list_revenue_contracts(
                company_id=int(company_id),
                limit=limit,
                q=q or None,
                status=status or None,
            )
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("list_revenue_contracts failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    body = request.get_json(silent=True) or {}
    try:
        out = db_service.create_revenue_contract(company_id, body, user_id=user_id)
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="create_revenue_contract",
                severity="info",
                entity_type="revenue_contract",
                entity_id=str(out["id"]),
                entity_ref=out.get("contract_number"),
                before_json={},
                after_json=out,
                message=f"Created revenue contract {out.get('contract_number')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_revenue_contracts POST")
        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("create_revenue_contract failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/runs", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_revenue_runs(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            limit = int(request.args.get("limit", 50) or 50)
            contract_id = request.args.get("contract_id")
            items = db_service.list_revenue_recognition_runs(
                company_id=int(company_id),
                limit=limit,
                contract_id=int(contract_id) if contract_id else None,
            )
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("list_revenue_recognition_runs failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}
    try:
        out = db_service.create_revenue_recognition_run(company_id, body, user_id=user_id)
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="create_revenue_recognition_run",
                severity="info",
                entity_type="revenue_run",
                entity_id=str((out.get("run") or {}).get("id")),
                entity_ref=f"REV-RUN-{(out.get('run') or {}).get('id')}",
                before_json={},
                after_json=out,
                message=f"Created revenue recognition run {(out.get('run') or {}).get('id')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_revenue_runs POST")
        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("create_revenue_recognition_run failed")
        return jsonify({"ok": False, "error": str(e)}), 400
    

@revenue_bp.route("/api/companies/<int:company_id>/revenue/obligations/<int:obligation_id>", methods=["PATCH", "OPTIONS"])
@require_auth
def api_update_revenue_obligation(company_id: int, obligation_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    try:
        out = db_service.update_revenue_obligation(company_id, obligation_id, body, user_id=user_id)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="update_revenue_obligation",
                severity="info",
                entity_type="revenue_obligation",
                entity_id=str(obligation_id),
                entity_ref=(out.get("after") or {}).get("obligation_code"),
                before_json=out.get("before") or {},
                after_json=out.get("after") or {},
                message=f"Updated revenue obligation {(out.get('after') or {}).get('obligation_code')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_update_revenue_obligation")

        return jsonify({"ok": True, "data": out.get("after"), "before": out.get("before")}), 200
    except Exception as e:
        current_app.logger.exception("update_revenue_obligation failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>/billings", methods=["POST", "OPTIONS"])
@require_auth
def api_record_revenue_billing_event(company_id: int, contract_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    try:
        out = db_service.record_revenue_billing_event(company_id, contract_id, body, user_id=user_id)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="record_revenue_billing_event",
                severity="info",
                entity_type="revenue_billing_event",
                entity_id=str((out.get("event") or {}).get("id")),
                entity_ref=(out.get("contract") or {}).get("contract_number"),
                before_json={},
                after_json=out,
                message=f"Recorded revenue billing event for contract {(out.get('contract') or {}).get('contract_number')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_record_revenue_billing_event")

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("record_revenue_billing_event failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>/cash_receipts", methods=["POST", "OPTIONS"])
@require_auth
def api_record_revenue_cash_event(company_id: int, contract_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    try:
        out = db_service.record_revenue_cash_event(company_id, contract_id, body, user_id=user_id)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="record_revenue_cash_event",
                severity="info",
                entity_type="revenue_cash_event",
                entity_id=str((out.get("event") or {}).get("id")),
                entity_ref=(out.get("contract") or {}).get("contract_number"),
                before_json={},
                after_json=out,
                message=f"Recorded revenue cash event for contract {(out.get('contract') or {}).get('contract_number')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_record_revenue_cash_event")

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("record_revenue_cash_event failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/obligations/<int:obligation_id>/progress", methods=["POST", "OPTIONS"])
@require_auth
def api_record_revenue_progress_update(company_id: int, obligation_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    try:
        out = db_service.record_revenue_progress_update(company_id, obligation_id, body, user_id=user_id)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="record_revenue_progress_update",
                severity="info",
                entity_type="revenue_progress_update",
                entity_id=str((out.get("progress_update") or {}).get("id")),
                entity_ref=str(obligation_id),
                before_json={},
                after_json=out,
                message=f"Recorded revenue progress update for obligation {obligation_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_record_revenue_progress_update")

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("record_revenue_progress_update failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/runs/preview", methods=["POST", "OPTIONS"])
@require_auth
def api_preview_revenue_recognition_run(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    body = request.get_json(silent=True) or {}

    try:
        out = db_service.preview_revenue_recognition_run(
            company_id,
            period_start=body.get("period_start"),
            period_end=body.get("period_end"),
            contract_id=body.get("contract_id"),
        )
        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("preview_revenue_recognition_run failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/runs", methods=["POST", "OPTIONS"])
@require_auth
def api_create_revenue_recognition_run(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    try:
        out = db_service.create_revenue_recognition_run(company_id, body, user_id=user_id)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="create_revenue_recognition_run",
                severity="info",
                entity_type="revenue_run",
                entity_id=str((out.get("run") or {}).get("id")),
                entity_ref=f"REV-RUN-{(out.get('run') or {}).get('id')}",
                before_json={},
                after_json=out,
                message=f"Created revenue recognition run {(out.get('run') or {}).get('id')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_create_revenue_recognition_run")

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("create_revenue_recognition_run failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/runs/<int:run_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def api_post_revenue_recognition_run(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    cp = company_policy(int(company_id)) or {}
    mode = str(cp.get("mode") or "owner_managed").strip().lower()
    policy = cp.get("policy") or {}
    company_profile = cp.get("company") or {}
    user = getattr(g, "current_user", None) or {}

    review_required = (
        mode in {"assisted", "controlled"}
        and bool(
            cp.get("revenue_review_enabled")
            or cp.get("require_revenue_recognition_run_review")
        )
    )

    try:
        run = db_service.fetch_one(
            f"SELECT * FROM {db_service.company_schema(company_id)}.revenue_recognition_runs WHERE id=%s LIMIT 1;",
            (int(run_id),),
        )
        if not run:
            return jsonify({"ok": False, "error": "Recognition run not found"}), 404

        if review_required:
            dedupe_key = f"{company_id}:revenue:post_recognition_run:revenue_run:{run_id}"
            req = db_service.create_approval_request(
                company_id,
                entity_type="revenue_run",
                entity_id=str(run_id),
                entity_ref=f"REV-RUN-{run_id}",
                module="revenue",
                action="post_recognition_run",
                requested_by_user_id=int(user_id),
                amount=float(run.get("total_revenue_delta") or 0.0),
                currency=None,
                risk_level="high",
                dedupe_key=dedupe_key,
                payload_json=_approval_payload_for_run(run),
            )

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="approval_requested",
                severity="info",
                entity_type="approval_request",
                entity_id=str(req.get("id")),
                entity_ref=req.get("entity_ref"),
                approval_request_id=int(req.get("id") or 0),
                amount=float(req.get("amount") or 0.0),
                currency=req.get("currency"),
                before_json={},
                after_json=req,
                message=f"Revenue approval requested for {req.get('action')} {req.get('entity_ref')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in revenue approval_requested")
            
            return jsonify({"ok": False, "error": "APPROVAL_REQUIRED", "approval_request": req}), 409

        out = db_service.post_revenue_recognition_run(company_id, run_id, user_id=user_id)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="post_revenue_recognition_run",
                severity="info",
                entity_type="revenue_run",
                entity_id=str(run_id),
                entity_ref=f"REV-RUN-{run_id}",
                before_json={"status": "draft"},
                after_json=out,
                message=f"Posted revenue recognition run {run_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_post_revenue_recognition_run")

        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("post_revenue_recognition_run failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@revenue_bp.route("/api/companies/<int:company_id>/revenue/runs/<int:run_id>/reverse", methods=["POST", "OPTIONS"])
@require_auth
def api_reverse_revenue_recognition_run(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    cp = company_policy(int(company_id)) or {}
    mode = str(cp.get("mode") or "owner_managed").strip().lower()
    policy = cp.get("policy") or {}

    review_required = (
        mode in {"assisted", "controlled"}
        and bool(
            cp.get("revenue_review_enabled")
            or cp.get("require_revenue_recognition_run_review")
        )
    )

    try:
        run = db_service.fetch_one(
            f"SELECT * FROM {db_service.company_schema(company_id)}.revenue_recognition_runs WHERE id=%s LIMIT 1;",
            (int(run_id),),
        )
        if not run:
            return jsonify({"ok": False, "error": "Recognition run not found"}), 404

        if review_required:
            dedupe_key = f"{company_id}:revenue:reverse_recognition_run:revenue_run:{run_id}"
            req = db_service.create_approval_request(
                company_id,
                entity_type="revenue_run",
                entity_id=str(run_id),
                entity_ref=f"REV-RUN-{run_id}",
                module="revenue",
                action="reverse_recognition_run",
                requested_by_user_id=int(user_id),
                amount=float(run.get("total_revenue_delta") or 0.0),
                currency=None,
                risk_level="critical",
                dedupe_key=dedupe_key,
                payload_json=_approval_payload_for_run(run),
            )

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="approval_requested",
                severity="info",
                entity_type="approval_request",
                entity_id=str(req.get("id")),
                entity_ref=req.get("entity_ref"),
                approval_request_id=int(req.get("id") or 0),
                amount=float(req.get("amount") or 0.0),
                currency=req.get("currency"),
                before_json={},
                after_json=req,
                message=f"Revenue approval requested for {req.get('action')} {req.get('entity_ref')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in revenue approval_requested")
            
            return jsonify({"ok": False, "error": "APPROVAL_REQUIRED", "approval_request": req}), 409

        out = db_service.reverse_revenue_recognition_run(company_id, run_id, user_id=user_id)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="reverse_revenue_recognition_run",
                severity="warning",
                entity_type="revenue_run",
                entity_id=str(run_id),
                entity_ref=f"REV-RUN-{run_id}",
                before_json={"status": "posted"},
                after_json=out,
                message=f"Reversed revenue recognition run {run_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_reverse_revenue_recognition_run")

        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("reverse_revenue_recognition_run failed")
        return jsonify({"ok": False, "error": str(e)}), 400