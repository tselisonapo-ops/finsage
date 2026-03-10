# BackEnd/Services/routes/bank_routes.py
from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service
from BackEnd.Services.bank_service import BankService
from BackEnd.Services.company_context import get_company_context


bank_bp = Blueprint("bank_bp", __name__)
bank_service = BankService(db_service)


def _deny_if_wrong_company(payload, company_id: int):
    role = (payload.get("role") or "").strip().lower()

    if role == "admin":
        return None

    allowed_company_ids = payload.get("allowed_company_ids") or []
    try:
        allowed_company_ids = [int(x) for x in allowed_company_ids]
    except Exception:
        allowed_company_ids = []

    token_company_id = payload.get("company_id")
    try:
        token_company_id = int(token_company_id) if token_company_id is not None else None
    except Exception:
        token_company_id = None

    target_company_id = int(company_id)

    if target_company_id in allowed_company_ids:
        return None

    if token_company_id == target_company_id:
        return None

    return jsonify({"ok": False, "error": "Access denied for this company"}), 403


def _company_currency(company_id: int) -> str:
    ctx = get_company_context(db_service, company_id) or {}
    return (ctx.get("currency") or "ZAR").strip()


@bank_bp.route("/api/companies/<int:company_id>/bank_statements/preview", methods=["POST"])
@require_auth
def preview_bank_statement(company_id: int):
    payload = request.jwt_payload
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    f = request.files.get("file")
    if not f:
        return jsonify({"error": "file is required"}), 400

    data = f.read()
    preview = bank_service.preview_csv(data)

    # helpful for UI: tell frontend what currency will be used on import
    preview["currency"] = _company_currency(company_id)

    return jsonify(preview), 200


@bank_bp.route("/api/companies/<int:company_id>/bank_statements/import", methods=["POST"])
@require_auth
def import_bank_statement(company_id: int):
    payload = request.jwt_payload
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    user_id = payload.get("user_id")

    f = request.files.get("file")
    if not f:
        return jsonify({"error": "file is required"}), 400

    bank_account_id = request.form.get("bank_account_id")
    bank_account_id = int(bank_account_id) if bank_account_id else None
    if not bank_account_id:
        return jsonify({"error": "bank_account_id is required"}), 400

    mapping_json = request.form.get("mapping")  # JSON string (optional)

    file_name = f.filename or "statement.csv"
    data = f.read()
    ext = ("." + file_name.rsplit(".", 1)[-1].lower()) if "." in file_name else ""
    if ext != ".csv":
        return jsonify({"error": "Only CSV supported for now"}), 400

    # ✅ Let the service decide currency (explicit -> bank account -> company -> fallback)
    import_id = bank_service.ingest_statement_csv(
        company_id=company_id,
        bank_account_id=bank_account_id,
        file_name=file_name,
        file_bytes=data,
        uploaded_by=user_id,
        mapping_json=mapping_json,
        currency=None,  # ✅ IMPORTANT: don't override
    )

    # Option A (best): fetch the import to return actual currency used
    imp = db_service.fetch_one(
        "SELECT id, currency FROM public.bank_statement_imports WHERE id=%s AND company_id=%s",
        (import_id, company_id),
    ) or {}

    imp = db_service.fetch_one(
        "SELECT id, currency FROM public.bank_statement_imports WHERE id=%s AND company_id=%s",
        (import_id, company_id),
    ) or {}

    # ✅ AUDIT (bank statement import)
    try:
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(user_id or 0),
            module="bank",
            action="import",
            severity="info",
            entity_type="bank_statement_import",
            entity_id=str(import_id),
            entity_ref=str(file_name or f"import-{import_id}"),
            before_json={},
            after_json={
                "bank_account_id": int(bank_account_id),
                "file_name": file_name,
                "currency": imp.get("currency"),
                "mapping_present": bool(mapping_json),
            },
            message="Bank statement imported",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (import_bank_statement)")

    return jsonify({
        "import_id": import_id,
        "currency": imp.get("currency"),  # actual used
    }), 201


@bank_bp.route("/api/companies/<int:company_id>/bank_reconciliations", methods=["POST"])
@require_auth
def create_bank_recon(company_id: int):
    payload = request.jwt_payload
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    data = request.get_json() or {}

    try:
        bank_account_id = int(data["bank_account_id"])
    except Exception:
        return jsonify({"error": "bank_account_id is required"}), 400

    period_start = data.get("period_start")
    period_end = data.get("period_end")
    if not period_start or not period_end:
        return jsonify({"error": "period_start and period_end are required"}), 400

    recon_id = db_service.create_bank_reconciliation(
        company_id, bank_account_id, period_start, period_end, payload.get("user_id")
    )
    seeded = db_service.seed_recon_items_from_lines(company_id, recon_id, payload.get("user_id"))

    # ✅ AUDIT (create reconciliation)
    try:
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(payload.get("user_id") or 0),
            module="bank",
            action="create",
            severity="info",
            entity_type="bank_reconciliation",
            entity_id=str(recon_id),
            entity_ref=f"bank_account:{bank_account_id}",
            before_json={},
            after_json={
                "bank_account_id": int(bank_account_id),
                "period_start": period_start,
                "period_end": period_end,
                "seeded": seeded,
            },
            message="Bank reconciliation created",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (create_bank_recon)")

    return jsonify({"reconciliation_id": recon_id, "seeded": seeded}), 201


@bank_bp.route("/api/companies/<int:company_id>/bank_reconciliations/<int:recon_id>/items", methods=["GET"])
@require_auth
def list_recon_items(company_id: int, recon_id: int):
    payload = request.jwt_payload
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    status = request.args.get("status")  # optional: unmatched|matched|partial|excluded
    items = db_service.list_recon_items(company_id, recon_id, status=status)
    return jsonify(items), 200

@bank_bp.route("/api/companies/<int:company_id>/bank_reconciliations/items/<int:recon_item_id>/exclude", methods=["POST"])
@require_auth
def exclude_recon_item(company_id: int, recon_item_id: int):
    payload = request.jwt_payload
    if payload.get("company_id") not in (None, company_id):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json() or {}
    reason = (data.get("reason") or "").strip()

    before_item = db_service.fetch_one(
        "SELECT * FROM public.bank_recon_items WHERE company_id=%s AND id=%s LIMIT 1;",
        (company_id, int(recon_item_id)),
    ) or {}

    db_service.exclude_recon_item(
        company_id=company_id,
        recon_item_id=recon_item_id,
        reason=reason,
        user_id=payload.get("user_id"),
    )

    after_item = db_service.fetch_one(
        "SELECT * FROM public.bank_recon_items WHERE company_id=%s AND id=%s LIMIT 1;",
        (company_id, int(recon_item_id)),
    ) or {}

    # ✅ AUDIT (exclude recon item)
    try:
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(payload.get("user_id") or 0),
            module="bank",
            action="exclude",
            severity="info",
            entity_type="bank_recon_item",
            entity_id=str(recon_item_id),
            entity_ref=str(reason or ""),
            before_json=before_item if isinstance(before_item, dict) else {},
            after_json=after_item if isinstance(after_item, dict) else {},
            message="Recon item excluded",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (exclude_recon_item)")

    return jsonify({"ok": True}), 200


@bank_bp.route("/api/companies/<int:company_id>/bank_reconciliations/items/<int:recon_item_id>/attach_journal", methods=["POST"])
@require_auth
def attach_journal_to_recon_item(company_id: int, recon_item_id: int):
    payload = request.jwt_payload
    if payload.get("company_id") not in (None, company_id):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json() or {}
    journal_id = int(data["journal_id"])
    match_type = (data.get("match_type") or "").strip() or "other"

    db_service.attach_journal_to_recon_item(
        company_id=company_id,
        recon_item_id=recon_item_id,
        journal_id=journal_id,
        match_type=match_type,
        user_id=payload.get("user_id"),
    )

    # ✅ AUDIT (attach existing journal to recon item)
    try:
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(payload.get("user_id") or 0),
            module="bank",
            action="attach",
            severity="info",
            entity_type="bank_recon_item",
            entity_id=str(recon_item_id),
            entity_ref=f"journal:{journal_id}",
            before_json={},
            after_json={
                "journal_id": int(journal_id),
                "match_type": match_type,
            },
            message="Journal attached to recon item",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (attach_journal_to_recon_item)")

    return jsonify({"ok": True}), 200


@bank_bp.route("/api/companies/<int:company_id>/bank_reconciliations/<int:recon_id>/items/<int:item_id>/match", methods=["POST"])
@require_auth
def manual_match_recon_item(company_id: int, recon_id: int, item_id: int):
    payload = request.jwt_payload
    if payload.get("company_id") not in (None, company_id):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json() or {}
    match_type = data.get("match_type")              # receipt|payment|fee|interest|transfer|other
    obj_type   = data.get("matched_object_type")     # invoice|bill|journal|transfer
    obj_id     = data.get("matched_object_id")

    if not match_type or not obj_type or not obj_id:
        return jsonify({"error": "match_type, matched_object_type, matched_object_id required"}), 400

    row = db_service.fetch_one("""
        UPDATE public.bank_recon_items
        SET match_status='matched',
            match_type=%s,
            matched_object_type=%s,
            matched_object_id=%s
        WHERE company_id=%s AND reconciliation_id=%s AND id=%s
        RETURNING id;
    """, (match_type, obj_type, int(obj_id), company_id, recon_id, item_id))

    ok = bool(row)

    # ✅ AUDIT (manual match)
    if ok:
        try:
            db_service.audit_log(
                company_id=company_id,
                actor_user_id=int(payload.get("user_id") or 0),
                module="bank",
                action="match",
                severity="info",
                entity_type="bank_recon_item",
                entity_id=str(item_id),
                entity_ref=f"{obj_type}:{int(obj_id)}",
                before_json={},
                after_json={
                    "match_status": "matched",
                    "match_type": match_type,
                    "matched_object_type": obj_type,
                    "matched_object_id": int(obj_id),
                    "reconciliation_id": int(recon_id),
                },
                message="Recon item manually matched",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (manual_match_recon_item)")

    return jsonify({"ok": ok}), 200

@bank_bp.route("/api/companies/<int:company_id>/bank_statements", methods=["GET"])
@require_auth
def list_bank_statements(company_id: int):
    payload = request.jwt_payload
    if payload.get("company_id") not in (None, company_id):
        return jsonify({"error": "Forbidden"}), 403

    bank_account_id = request.args.get("bank_account_id")
    bank_account_id = int(bank_account_id) if bank_account_id else None

    rows = db_service.list_bank_imports(company_id, bank_account_id=bank_account_id)
    return jsonify(rows), 200

@bank_bp.route("/api/companies/<int:company_id>/bank_statements/<int:import_id>/create_reconciliation", methods=["POST"])
@require_auth
def create_recon_from_import(company_id: int, import_id: int):
    payload = request.jwt_payload
    if payload.get("company_id") not in (None, company_id):
        return jsonify({"error": "Forbidden"}), 403

    imp = db_service.fetch_one("""
      SELECT bank_account_id
      FROM public.bank_statement_imports
      WHERE company_id=%s AND id=%s
      LIMIT 1;
    """, (company_id, import_id))

    if not imp or not imp.get("bank_account_id"):
        return jsonify({"error": "Import not found or missing bank_account_id"}), 404

    rng = db_service.get_import_date_range(company_id, import_id) or {}
    start_date = rng.get("start_date")
    end_date = rng.get("end_date")
    if not start_date or not end_date:
        return jsonify({"error": "No dated lines found in this import"}), 400

    recon_id = db_service.create_bank_reconciliation(
        company_id, int(imp["bank_account_id"]), start_date, end_date, payload.get("user_id")
    )
    seeded = db_service.seed_recon_items_from_lines(company_id, recon_id, payload.get("user_id"))

    # ✅ AUDIT (recon created from import)
    try:
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(payload.get("user_id") or 0),
            module="bank",
            action="create",
            severity="info",
            entity_type="bank_reconciliation",
            entity_id=str(recon_id),
            entity_ref=f"import:{import_id}",
            before_json={},
            after_json={
                "import_id": int(import_id),
                "bank_account_id": int(imp["bank_account_id"]),
                "period_start": str(start_date),
                "period_end": str(end_date),
                "seeded": seeded,
            },
            message="Bank reconciliation created from statement import",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (create_recon_from_import)")

    return jsonify({"reconciliation_id": recon_id, "seeded": seeded}), 201

@bank_bp.route("/api/companies/<int:company_id>/bank_reconciliations/<int:recon_id>/auto_match", methods=["POST"])
@require_auth
def auto_match_recon(company_id: int, recon_id: int):
    payload = request.jwt_payload
    if payload.get("company_id") not in (None, company_id):
        return jsonify({"error": "Forbidden"}), 403

    result = bank_service.auto_match_reconciliation(company_id=company_id, reconciliation_id=recon_id)

    # ✅ AUDIT (auto match)
    try:
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(payload.get("user_id") or 0),
            module="bank",
            action="auto_match",
            severity="info",
            entity_type="bank_reconciliation",
            entity_id=str(recon_id),
            entity_ref="auto_match",
            before_json={},
            after_json=result if isinstance(result, dict) else {"result": result},
            message="Auto match reconciliation executed",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (auto_match_recon)")

    return jsonify(result), 200


@bank_bp.route("/api/companies/<int:company_id>/bank_reconciliations/items/<int:recon_item_id>/attach_journal", methods=["POST"])
@require_auth
def attach_recon_journal(company_id: int, recon_item_id: int):
    payload = request.jwt_payload
    if payload.get("company_id") not in (None, company_id):
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json() or {}
    journal_id = int(data["journal_id"])
    match_type = (data.get("match_type") or "other").strip()

    row = db_service.attach_created_journal_to_recon_item(
        company_id, recon_item_id, journal_id, match_type, payload.get("user_id")
    )

    # ✅ AUDIT (attach created journal)
    try:
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(payload.get("user_id") or 0),
            module="bank",
            action="attach",
            severity="info",
            entity_type="bank_recon_item",
            entity_id=str(recon_item_id),
            entity_ref=f"journal:{journal_id}",
            before_json={},
            after_json={
                "journal_id": int(journal_id),
                "match_type": match_type,
                "row_id": int(row.get("id") or 0) if isinstance(row, dict) else None,
            },
            message="Created journal attached to recon item",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (attach_recon_journal)")

    return jsonify({"ok": True, "id": row["id"]}), 200


@bank_bp.route("/api/companies/<int:company_id>/bank_statements/<int:import_id>/create_reconciliation", methods=["POST"])
@require_auth
def create_reconciliation_from_import(company_id: int, import_id: int):
    payload = request.jwt_payload
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    user_id = payload.get("user_id")

    # 1) Load import + bank_account_id
    imp = db_service.fetch_one("""
        SELECT id, bank_account_id
        FROM public.bank_statement_imports
        WHERE company_id=%s AND id=%s
        LIMIT 1;
    """, (company_id, import_id))
    if not imp:
        return jsonify({"error": "Import not found"}), 404
    if not imp["bank_account_id"]:
        return jsonify({"error": "Import has no bank_account_id"}), 400

    # 2) Get date range from lines
    dr = db_service.get_import_date_range(company_id, import_id)
    if not dr or not dr.get("start_date") or not dr.get("end_date"):
        return jsonify({"error": "No statement lines found for this import"}), 400

    period_start = dr["start_date"]
    period_end   = dr["end_date"]

    # 3) Create reconciliation
    recon_id = db_service.create_bank_reconciliation(
        company_id, int(imp["bank_account_id"]), period_start, period_end, payload.get("user_id")
    )
    seeded = db_service.seed_recon_items_from_lines(company_id, recon_id, payload.get("user_id"))

    # ✅ AUDIT (recon created from import)
    try:
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(payload.get("user_id") or 0),
            module="bank",
            action="create",
            severity="info",
            entity_type="bank_reconciliation",
            entity_id=str(recon_id),
            entity_ref=f"import:{import_id}",
            before_json={},
            after_json={
                "import_id": int(import_id),
                "bank_account_id": int(imp["bank_account_id"]),
                "period_start": str(period_start),
                "period_end": str(period_end),
                "seeded": seeded,
            },
            message="Bank reconciliation created from statement import",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (create_recon_from_import)")

    return jsonify({
        "reconciliation_id": recon_id,
        "seeded": seeded,
        "period_start": str(period_start),
        "period_end": str(period_end),
    }), 201
