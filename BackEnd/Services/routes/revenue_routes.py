from flask import Blueprint, request, jsonify, g, current_app, make_response
from BackEnd.Services.auth_middleware import _corsify, require_auth
from .invoice_routes import _deny_if_wrong_company
from BackEnd.Services.company import company_policy
from BackEnd.Services.db_service import db_service
from BackEnd.Services.credit_policy import can_decide_request

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

def _normalize_revenue_contract_body(body: dict) -> dict:
    body = dict(body or {})

    has_financing = bool(body.get("has_significant_financing_component", False))

    payload_json = body.get("payload_json") or {}
    if not isinstance(payload_json, dict):
        payload_json = {}

    financing = payload_json.get("financing")
    if not isinstance(financing, dict):
        financing = {}

    if has_financing:
        payload_json["financing"] = {
            "role": str(financing.get("role") or "").strip().lower(),
            "rate": float(financing.get("rate") or 0.0),
            "start_date": financing.get("start_date") or None,
            "end_date": financing.get("end_date") or None,
            "notes": str(financing.get("notes") or "").strip(),
        }
    else:
        payload_json["financing"] = None
        body["financing_component_amount"] = 0.0

    body["payload_json"] = payload_json

    if body.get("contract_currency"):
        body["contract_currency"] = str(body.get("contract_currency") or "").strip().upper()

    if body.get("billing_method"):
        body["billing_method"] = str(body.get("billing_method") or "").strip().lower()

    if body.get("status"):
        body["status"] = str(body.get("status") or "").strip().lower()

    return body

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

    body = _normalize_revenue_contract_body(request.get_json(silent=True) or {})

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

@revenue_bp.route("/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>/submit", methods=["POST", "OPTIONS"])
@require_auth
def api_submit_revenue_contract(company_id: int, contract_id: int):
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
    user = getattr(g, "current_user", {}) or {}
    company_profile = cp.get("company") or {}

    review_required = (
        mode in {"assisted", "controlled"}
        and bool(
            cp.get("revenue_review_enabled")
            or cp.get("require_revenue_contract_review")
        )
    )

    can_self_approve = can_decide_request(
        user=user,
        company_profile=company_profile,
        mode=mode,
        module="revenue",
        action="create_contract",
    )

    try:
        contract = db_service.get_revenue_contract(int(company_id), int(contract_id))
        if not contract:
            return jsonify({"ok": False, "error": "Revenue contract not found"}), 404

        approval_status = str(contract.get("approval_status") or "draft").strip().lower()

        if approval_status not in {"draft", "rejected", "pending_approval"}:
            return jsonify({
                "ok": False,
                "error": f"Contract cannot be submitted from approval_status '{approval_status}'"
            }), 409

        contract_ref = (contract.get("contract_number") or f"REV-CON-{contract_id}").strip()

        if review_required and not can_self_approve:
            dedupe_key = f"{company_id}:revenue:create_contract:revenue_contract:{contract_id}"
            req = db_service.create_approval_request(
                company_id,
                entity_type="revenue_contract",
                entity_id=str(contract_id),
                entity_ref=contract_ref,
                module="revenue",
                action="create_contract",
                requested_by_user_id=int(user_id),
                amount=float(contract.get("transaction_price") or 0.0),
                currency=contract.get("contract_currency"),
                risk_level="high",
                dedupe_key=dedupe_key,
                payload_json={
                    "contract_id": int(contract_id),
                },
            )

            try:
                db_service.update_revenue_contract(
                    int(company_id),
                    int(contract_id),
                    {"approval_status": "pending_approval"},
                    user_id=int(user_id),
                )
            except Exception:
                current_app.logger.exception("Failed to set revenue contract approval_status pending_approval")

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
                    before_json=contract,
                    after_json=req,
                    message=f"Revenue approval requested for contract {req.get('entity_ref')}",
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed in api_submit_revenue_contract")

            return jsonify({
                "ok": False,
                "error": "APPROVAL_REQUIRED",
                "approval_request": req,
            }), 409

        out = db_service.approve_revenue_contract(
            company_id=int(company_id),
            contract_id=int(contract_id),
            user_id=int(user_id),
        )

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("submit_revenue_contract failed")
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

    body = _normalize_revenue_contract_body(request.get_json(silent=True) or {})

    try:
        existing = db_service.get_revenue_contract(int(company_id), int(contract_id))
        if not existing:
            return jsonify({"ok": False, "error": "Revenue contract not found"}), 404

        existing_status = str(existing.get("status") or "draft").strip().lower()

        cp = company_policy(int(company_id)) or {}
        mode = str(cp.get("mode") or "owner_managed").strip().lower()

        review_required = (
            existing_status in {"approved", "active"}
            and mode in {"assisted", "controlled"}
            and bool(
                cp.get("revenue_review_enabled")
                or cp.get("require_revenue_modification_review")
            )
        )

        contract_ref = (existing.get("contract_number") or f"REV-CON-{contract_id}").strip()

        if review_required:
            req = db_service.create_approval_request(
                company_id,
                entity_type="revenue_contract",
                entity_id=str(contract_id),
                entity_ref=contract_ref,
                module="revenue",
                action="approve_modification",
                requested_by_user_id=int(user_id),
                amount=float(body.get("transaction_price") or existing.get("transaction_price") or 0.0),
                currency=body.get("contract_currency") or existing.get("contract_currency"),
                risk_level="high",
                dedupe_key=f"{company_id}:revenue:approve_modification:revenue_contract:{contract_id}",
                payload_json={
                    "contract_id": int(contract_id),
                    "modification": body,
                },
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
                    before_json=existing,
                    after_json=req,
                    message=f"Revenue modification approval requested for {req.get('entity_ref')}",
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed in api_update_revenue_contract")

            return jsonify({
                "ok": False,
                "error": "APPROVAL_REQUIRED",
                "approval_request": req,
            }), 409

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

@revenue_bp.route(
    "/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>/versions",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_create_revenue_contract_version(company_id: int, contract_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            items = db_service.list_revenue_contract_versions(
                company_id=int(company_id),
                contract_id=int(contract_id),
            )
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("list_revenue_contract_versions failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    body = request.get_json(silent=True) or {}

    try:
        out = db_service.create_revenue_contract_version(
            company_id, contract_id, body, user_id=user_id
        )

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

@revenue_bp.route(
    "/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>/obligations",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_add_revenue_obligation(company_id: int, contract_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            items = db_service.list_revenue_obligations(
                company_id=int(company_id),
                contract_id=int(contract_id),
            )
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("list_revenue_obligations failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    body = request.get_json(silent=True) or {}

    timing = str(body.get("recognition_timing") or "point_in_time").strip().lower()
    body["recognition_timing"] = timing

    if body.get("recognition_trigger") is not None:
        body["recognition_trigger"] = str(body.get("recognition_trigger") or "").strip().lower() or None

    if body.get("satisfaction_status") is not None:
        body["satisfaction_status"] = str(body.get("satisfaction_status") or "").strip().lower() or "pending"
    else:
        body["satisfaction_status"] = "pending"

    if body.get("satisfaction_evidence_ref") is not None:
        body["satisfaction_evidence_ref"] = str(body.get("satisfaction_evidence_ref") or "").strip() or None

    if timing == "point_in_time":
        body["progress_method"] = None
        body["expected_total_cost"] = 0.0
        body["actual_cost_to_date"] = 0.0
        body["progress_percent"] = 0.0
    else:
        body["recognized_at_point_in_time_date"] = None
        body["recognition_trigger"] = None
        body["progress_method"] = str(body.get("progress_method") or "cost_to_cost").strip().lower()

        # clear PIT satisfaction fields for over-time
        body["satisfaction_status"] = "pending"
        body["satisfied_at"] = None
        body["satisfaction_evidence_ref"] = None

    try:
        out = db_service.add_revenue_obligation(
            company_id, contract_id, body, user_id=user_id
        )

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
    

@revenue_bp.route("/api/companies/<int:company_id>/revenue/obligations/<int:obligation_id>", methods=["GET", "PATCH", "OPTIONS"])
@require_auth
def api_update_revenue_obligation(company_id: int, obligation_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            out = db_service.get_revenue_obligation(int(company_id), int(obligation_id))
            if not out:
                return jsonify({"ok": False, "error": "Revenue obligation not found"}), 404
            return jsonify({"ok": True, "data": out}), 200
        except Exception as e:
            current_app.logger.exception("get_revenue_obligation failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    body = request.get_json(silent=True) or {}

    if "recognition_timing" in body and body.get("recognition_timing") is not None:
        body["recognition_timing"] = str(body.get("recognition_timing") or "").strip().lower()

    if "progress_method" in body and body.get("progress_method") is not None:
        body["progress_method"] = str(body.get("progress_method") or "").strip().lower()

    if "recognition_trigger" in body and body.get("recognition_trigger") is not None:
        body["recognition_trigger"] = str(body.get("recognition_trigger") or "").strip().lower() or None

    if "satisfaction_status" in body and body.get("satisfaction_status") is not None:
        body["satisfaction_status"] = str(body.get("satisfaction_status") or "").strip().lower()

    if "satisfaction_evidence_ref" in body and body.get("satisfaction_evidence_ref") is not None:
        body["satisfaction_evidence_ref"] = str(body.get("satisfaction_evidence_ref") or "").strip() or None

    timing = body.get("recognition_timing")

    if timing == "point_in_time":
        body["progress_method"] = None
        body["expected_total_cost"] = 0.0
        body["actual_cost_to_date"] = 0.0
        body["progress_percent"] = 0.0

    elif timing == "over_time":
        body["recognized_at_point_in_time_date"] = None
        body["recognition_trigger"] = None
        if not body.get("progress_method"):
            body["progress_method"] = "cost_to_cost"

        body["satisfaction_status"] = "pending"
        body["satisfied_at"] = None
        body["satisfaction_evidence_ref"] = None

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
    
@revenue_bp.route(
    "/api/companies/<int:company_id>/revenue/obligations/<int:obligation_id>/satisfy",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_satisfy_revenue_obligation(company_id: int, obligation_id: int):
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

    if "recognition_trigger" in body and body.get("recognition_trigger") is not None:
        body["recognition_trigger"] = str(body.get("recognition_trigger") or "").strip().lower() or None

    if "satisfaction_status" in body and body.get("satisfaction_status") is not None:
        body["satisfaction_status"] = str(body.get("satisfaction_status") or "").strip().lower()
    else:
        body["satisfaction_status"] = "satisfied"

    if "satisfaction_evidence_ref" in body and body.get("satisfaction_evidence_ref") is not None:
        body["satisfaction_evidence_ref"] = str(body.get("satisfaction_evidence_ref") or "").strip() or None

    try:
        out = db_service.mark_revenue_obligation_satisfied(
            company_id=company_id,
            obligation_id=obligation_id,
            data=body,
            user_id=user_id,
        )

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="revenue",
                action="satisfy_revenue_obligation",
                severity="info",
                entity_type="revenue_obligation",
                entity_id=str(obligation_id),
                entity_ref=(out.get("after") or {}).get("obligation_code"),
                before_json=out.get("before") or {},
                after_json=out.get("after") or {},
                message=f"Marked revenue obligation {(out.get('after') or {}).get('obligation_code')} as {(out.get('after') or {}).get('satisfaction_status')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_satisfy_revenue_obligation")

        return jsonify({
            "ok": True,
            "data": out.get("after"),
            "before": out.get("before"),
        }), 200

    except Exception as e:
        current_app.logger.exception("satisfy_revenue_obligation failed")
        return jsonify({"ok": False, "error": str(e)}), 400
    
@revenue_bp.route(
    "/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>/billings",
    methods=["GET", "POST", "OPTIONS"]
)
@require_auth
def api_record_revenue_billing_event(company_id: int, contract_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            items = db_service.list_revenue_billing_events(
                company_id=int(company_id),
                contract_id=int(contract_id),
            )
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("list_revenue_billing_events failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    try:
        out = db_service.record_revenue_billing_event(
            company_id,
            contract_id,
            body,
            user_id=user_id,
        )

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
    
@revenue_bp.route(
    "/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>/cash_receipts",
    methods=["GET", "POST", "OPTIONS"]
)
@require_auth
def api_record_revenue_cash_event(company_id: int, contract_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            items = db_service.list_revenue_cash_events(
                company_id=int(company_id),
                contract_id=int(contract_id),
            )
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("list_revenue_cash_events failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    try:
        out = db_service.record_revenue_cash_event(
            company_id,
            contract_id,
            body,
            user_id=user_id,
        )

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

@revenue_bp.route(
    "/api/companies/<int:company_id>/revenue/obligations/<int:obligation_id>/progress",
    methods=["GET", "POST", "OPTIONS"]
)
@require_auth
def api_record_revenue_progress_update(company_id: int, obligation_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            items = db_service.list_revenue_progress_updates(
                company_id=int(company_id),
                obligation_id=int(obligation_id),
            )
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("list_revenue_progress_updates failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    user_id = _jwt_user_id()
    body = request.get_json(silent=True) or {}

    # 🔥 ADD HERE (before calling db_service)
    obl = db_service.get_revenue_obligation(company_id, obligation_id)

    if obl:
        configured = str(obl.get("progress_method") or "cost_to_cost").strip().lower()
        incoming = str(body.get("update_type") or configured).strip().lower()

        if incoming != configured:
            return jsonify({
                "ok": False,
                "error": f"Update type '{incoming}' does not match obligation method '{configured}'"
            }), 400

    try:
        out = db_service.record_revenue_progress_update(
            company_id,
            obligation_id,
            body,
            user_id=user_id
        )

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
            f"""
            SELECT *
            FROM {db_service.company_schema(company_id)}.revenue_recognition_runs
            WHERE id=%s
            LIMIT 1
            """,
            (int(run_id),),
        )
        if not run:
            return jsonify({"ok": False, "error": "Recognition run not found"}), 404

        # approval path
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

            return jsonify({
                "ok": False,
                "error": "APPROVAL_REQUIRED",
                "approval_request": req,
            }), 409

        # direct post path
        out = db_service.post_revenue_recognition_run(
            company_id=int(company_id),
            run_id=int(run_id),
            user_id=int(user_id),
        )

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

        msg = str(e or "")
        if msg.startswith("PERIOD_LOCKED|"):
            return jsonify({"ok": False, "error": msg}), 409

        return jsonify({"ok": False, "error": msg}), 400

@revenue_bp.route("/api/companies/<int:company_id>/revenue/obligations/<int:obligation_id>/billing_position", methods=["GET", "OPTIONS"])
@require_auth
def api_get_revenue_obligation_billing_position(company_id: int, obligation_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        out = db_service.get_revenue_obligation_billing_position(
            company_id=int(company_id),
            obligation_id=int(obligation_id),
        )
        if not out:
            return jsonify({"ok": False, "error": "Revenue obligation not found"}), 404

        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("get_revenue_obligation_billing_position failed")
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
                dedupe_key=f"{company_id}:revenue:reverse_recognition_run:revenue_run:{run_id}",
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

            return jsonify({
                "ok": False,
                "error": "APPROVAL_REQUIRED",
                "approval_request": req
            }), 409

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

@revenue_bp.route(
    "/api/companies/<int:company_id>/revenue/obligations/<int:obligation_id>/billable_preview",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_get_revenue_obligation_billable_preview(company_id: int, obligation_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        out = db_service.get_revenue_obligation_billable_preview(
            company_id=int(company_id),
            obligation_id=int(obligation_id),
        )
        if not out:
            return jsonify({"ok": False, "error": "Revenue obligation not found"}), 404

        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("get_revenue_obligation_billable_preview failed")
        return jsonify({"ok": False, "error": str(e)}), 400
    
@revenue_bp.route(
    "/api/companies/<int:company_id>/revenue/contracts/<int:contract_id>/billing-policy",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_get_revenue_contract_billing_policy(company_id: int, contract_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        out = db_service.get_revenue_contract_billing_policy(
            company_id=int(company_id),
            contract_id=int(contract_id),
        )
        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("get_revenue_contract_billing_policy failed")
        return jsonify({"ok": False, "error": str(e)}), 400