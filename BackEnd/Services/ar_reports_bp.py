
from datetime import date
from BackEnd.Services.db_service import db_service
from flask import Blueprint, jsonify, request, g, current_app, make_response
from BackEnd.Services.auth_middleware import _corsify, require_auth
from datetime import date
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company

ar_reports_bp = Blueprint("ar_reports_bp", __name__)

def _parse_date(s: str, fallback: date) -> date:
    try:
        return date.fromisoformat((s or "")[:10])
    except Exception:
        return fallback
    
@ar_reports_bp.route("/api/companies/<int:cid>/ar/customers/<int:customer_id>/statement", methods=["GET"])
@require_auth
def customer_statement(cid: int, customer_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    company_id = int(cid)
    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != company_id:
        return jsonify({"error": "Not authorised for this company"}), 403

    today = date.today()
    date_from = _parse_date(request.args.get("from", ""), today.replace(day=1))
    date_to   = _parse_date(request.args.get("to", ""), today)

    try:
        data = db_service.get_customer_statement(
            company_id,
            customer_id,
            date_from=date_from,
            date_to=date_to,
        )
        return jsonify({"ok": True, "data": data}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

@ar_reports_bp.route("/api/companies/<int:cid>/ar/control-reconciliation", methods=["GET"])
@require_auth
def ar_control_reconciliation(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    company_id = int(cid)
    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != company_id:
        return jsonify({"error": "Not authorised for this company"}), 403

    as_at = _parse_date(request.args.get("as_at", ""), date.today())

    try:
        data = db_service.get_ar_control_reconciliation(company_id, as_at=as_at)
        return jsonify({"ok": True, "data": data}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

@ar_reports_bp.route("/api/companies/<int:cid>/ar/aging", methods=["GET", "OPTIONS"])
@require_auth
def ar_aging(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)
    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != company_id:
        return jsonify({"error": "Not authorised for this company"}), 403

    as_at = _parse_date(request.args.get("as_at", ""), date.today())

    cust = request.args.get("customer_id")
    customer_id = int(cust) if cust and str(cust).isdigit() else None

    try:
        data = db_service.get_ar_aging_report(
            company_id,
            as_at=as_at,
            customer_id=customer_id,
        )
        return jsonify({"ok": True, "data": data}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

@ar_reports_bp.route("/api/companies/<int:cid>/invoices/<int:invoice_id>/reverse", methods=["POST", "OPTIONS"])
@require_auth
def reverse_invoice_route(cid: int, invoice_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        user_id = payload.get("user_id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None

        body = request.get_json(silent=True) or {}
        reason = (body.get("reason") or "").strip()
        rev_date = (body.get("date") or "").strip() or None

        # (optional) load before for audit
        before = {}
        try:
            before = db_service.get_invoice_with_lines(company_id, int(invoice_id)) or {}
        except Exception:
            before = {}

        reversal_journal_id = db_service.reverse_invoice(
            company_id,
            int(invoice_id),
            reason=reason,
            reversed_by=user_id,
            reversal_date=rev_date,
        )

        # ✅ AUDIT
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="ar",
                action="reverse_invoice",
                severity="warning",
                entity_type="invoice",
                entity_id=str(int(invoice_id)),
                entity_ref=(before.get("number") or f"INV-{invoice_id}"),
                before_json={"invoice": before, "input": body},
                after_json={"reversal_journal_id": int(reversal_journal_id)},
                message=f"Reversed invoice {before.get('number') or invoice_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in reverse_invoice_route")

        return jsonify({
            "ok": True,
            "invoice_id": int(invoice_id),
            "reversal_journal_id": int(reversal_journal_id),
        }), 200

    except Exception as e:
        current_app.logger.exception("reverse_invoice failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@ar_reports_bp.route("/api/companies/<int:cid>/period-locks", methods=["GET"])
@require_auth
def list_period_locks(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    company_id = int(cid)
    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != company_id:
        return jsonify({"error": "Not authorised for this company"}), 403

    schema = db_service.company_schema(company_id)
    db_service.ensure_company_schema(company_id)

    rows = db_service.fetch_all(
        f"""
        SELECT id, module, lock_from, lock_to, status, reason, created_by, created_at
        FROM {schema}.period_locks
        WHERE company_id=%s
        ORDER BY lock_from DESC, id DESC;
        """,
        (company_id,),
    ) or []
    return jsonify({"rows": rows}), 200

@ar_reports_bp.route("/api/companies/<int:cid>/period-locks", methods=["POST", "OPTIONS"])
@require_auth
def create_period_lock(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        user_id = payload.get("user_id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None

        body = request.get_json(silent=True) or {}
        module = (body.get("module") or "gl").strip().lower()
        if module in ("journal", "manual_journal", "manual-journal"):
            module = "gl"
        if module not in ("gl", "ar", "ap", "all"):
            return jsonify({"error": f"Invalid module: {module}"}), 400

        lock_from = body.get("lock_from")
        lock_to = body.get("lock_to")
        reason = (body.get("reason") or "").strip() or None

        if not lock_from or not lock_to:
            return jsonify({"error": "lock_from and lock_to are required"}), 400

        df = date.fromisoformat(str(lock_from)[:10])
        dt = date.fromisoformat(str(lock_to)[:10])
        if dt < df:
            return jsonify({"error": "lock_to must be >= lock_from"}), 400

        schema = db_service.company_schema(company_id)
        db_service.ensure_company_schema(company_id)

        overlap = db_service.fetch_one(
            f"""
            SELECT 1
            FROM {schema}.period_locks
            WHERE company_id=%s
              AND status='active'
              AND (module=%s OR module='all' OR %s='all')
              AND NOT (%s < lock_from OR %s > lock_to)
            LIMIT 1;
            """,
            (company_id, module, module, dt, df),
        )
        if overlap:
            return jsonify({"error": "Overlapping active lock already exists"}), 409

        row = db_service.fetch_one(
            f"""
            INSERT INTO {schema}.period_locks
              (company_id, module, lock_from, lock_to, status, reason, created_by)
            VALUES
              (%s,%s,%s,%s,'active',%s,%s)
            RETURNING id;
            """,
            (company_id, module, df, dt, reason, user_id),
        ) or {}

        lock_id = row.get("id")

        # ✅ AUDIT
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="gl",
                action="create_period_lock",
                severity="info",
                entity_type="period_lock",
                entity_id=str(lock_id),
                entity_ref=f"{module}:{df}->{dt}",
                before_json={},
                after_json={"lock_id": lock_id, "module": module, "lock_from": str(df), "lock_to": str(dt), "reason": reason},
                message=f"Created period lock ({module}) {df} to {dt}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in create_period_lock")

        return jsonify({"ok": True, "id": lock_id}), 201

    except Exception as e:
        current_app.logger.exception("create_period_lock failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@ar_reports_bp.route("/api/companies/<int:cid>/period-locks/<int:lock_id>/disable", methods=["POST", "OPTIONS"])
@require_auth
def disable_period_lock(cid: int, lock_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None

    schema = db_service.company_schema(company_id)
    db_service.ensure_company_schema(company_id)

    # optional before (for audit)
    before = db_service.fetch_one(
        f"SELECT * FROM {schema}.period_locks WHERE id=%s AND company_id=%s LIMIT 1;",
        (int(lock_id), company_id),
    ) or {}

    row = db_service.fetch_one(
        f"""
        UPDATE {schema}.period_locks
        SET status='inactive'
        WHERE id=%s AND company_id=%s
        RETURNING id;
        """,
        (int(lock_id), company_id),
    )
    if not row:
        return jsonify({"error": "Lock not found"}), 404

    # ✅ AUDIT
    try:
        db_service.audit_log(
            company_id,
            actor_user_id=user_id,
            module="gl",
            action="disable_period_lock",
            severity="warning",
            entity_type="period_lock",
            entity_id=str(int(lock_id)),
            entity_ref=f"{before.get('module') or 'lock'}:{before.get('lock_from')}->{before.get('lock_to')}",
            before_json={"lock": before},
            after_json={"status": "inactive"},
            message=f"Disabled period lock {lock_id}",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed in disable_period_lock")

    return jsonify({"ok": True, "id": int(lock_id)}), 200


@ar_reports_bp.route("/api/companies/<int:cid>/period-locks/check", methods=["GET", "OPTIONS"])
@require_auth
def check_period_lock(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)
    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != company_id:
        return jsonify({"error": "Not authorised for this company"}), 403

    d = request.args.get("date")
    module = (request.args.get("module") or "gl").strip().lower()

    if not d:
        return jsonify({"error": "date is required"}), 400

    # ✅ Friendly aliases
    if module in ("journal", "manual_journal", "manual-journal"):
        module = "gl"
    if module in ("ap", "accounts_payable", "payables"):
        module = "ap"
    if module in ("ar", "accounts_receivable", "receivables"):
        module = "ar"
    if module in ("general_ledger", "general-ledger"):
        module = "gl"

    # ✅ Validate module (prevents weird values)
    if module not in ("gl", "ar", "ap", "all"):
        return jsonify({"error": f"Invalid module: {module}"}), 400

    try:
        dt = date.fromisoformat(str(d)[:10])
    except Exception:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

    locked = db_service.is_date_locked(company_id, tx_date=dt, module=module)

    return jsonify({
        "date": dt.isoformat(),
        "module": module,
        "locked": bool(locked),
    }), 200

@ar_reports_bp.route("/api/companies/<int:cid>/invoices/<int:invoice_id>/writeoff", methods=["POST", "OPTIONS"])
@require_auth
def writeoff_invoice_route(cid: int, invoice_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        user_id = payload.get("user_id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None

        body = request.get_json(silent=True) or {}
        account_code = (body.get("account_code") or "").strip()
        reason = (body.get("reason") or "").strip()
        writeoff_date = (body.get("date") or "").领strip() if False else (body.get("date") or None)  # keep simple

        if not account_code:
            return jsonify({"ok": False, "error": "account_code is required"}), 400

        before = {}
        try:
            before = db_service.get_invoice_with_lines(company_id, int(invoice_id)) or {}
        except Exception:
            before = {}

        writeoff_journal_id = db_service.writeoff_invoice(
            company_id=company_id,
            invoice_id=int(invoice_id),
            writeoff_account_code=account_code,
            reason=reason,
            written_off_by=user_id,
            writeoff_date=writeoff_date,
        )

        # ✅ AUDIT
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="ar",
                action="writeoff_invoice",
                severity="warning",
                entity_type="invoice",
                entity_id=str(int(invoice_id)),
                entity_ref=(before.get("number") or f"INV-{invoice_id}"),
                before_json={"invoice": before, "input": body},
                after_json={"writeoff_journal_id": int(writeoff_journal_id), "account_code": account_code},
                message=f"Wrote off invoice {before.get('number') or invoice_id} to {account_code}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in writeoff_invoice_route")

        return jsonify({
            "ok": True,
            "invoice_id": int(invoice_id),
            "writeoff_journal_id": int(writeoff_journal_id),
        }), 200

    except Exception as e:
        current_app.logger.exception("writeoff_invoice failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@ar_reports_bp.route("/api/companies/<int:cid>/ar/credit-check", methods=["GET","OPTIONS"])
@require_auth
def ar_credit_check(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != cid:
        return jsonify({"ok": False, "error": "Not authorised"}), 403

    try:
        company_id = int(cid)
        customer_id = int(request.args.get("customer_id") or 0)
        amount = request.args.get("amount") or "0"
        as_at = request.args.get("as_at")  # optional

        if not customer_id:
            return jsonify({"ok": False, "error": "customer_id required"}), 400

        out = db_service.credit_check(company_id, customer_id, amount=amount, as_at=as_at)
        return jsonify({"ok": True, **out}), 200

    except Exception as e:
        current_app.logger.exception("ar_credit_check failed")
        return jsonify({"ok": False, "error": str(e)}), 400

