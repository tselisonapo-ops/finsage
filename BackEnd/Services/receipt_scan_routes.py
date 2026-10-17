"""
BackEnd/Services/receipt_scan_routes.py

Receipt-scan → AI draft journal → review → post.

Distinct from BackEnd/Services/routes/receipt_routes.py (customer payment
receipts / AR allocation). This blueprint handles SUPPLIER documents
(receipts / tax invoices) uploaded on the General Journal screen:

    POST   /api/companies/<cid>/receipt-scan/upload                     multipart 'file'
    GET    /api/companies/<cid>/receipt-scan/documents?status=&limit=
    GET    /api/companies/<cid>/receipt-scan/documents/<id>
    GET    /api/companies/<cid>/receipt-scan/documents/<id>/file        (auth'd preview)
    POST   /api/companies/<cid>/receipt-scan/documents/<id>/extract     OCR/AI → draft
    PUT    /api/companies/<cid>/receipt-scan/documents/<id>/draft       save edited draft
    POST   /api/companies/<cid>/receipt-scan/documents/<id>/post        → REAL posting engine
    POST   /api/companies/<cid>/receipt-scan/documents/<id>/discard

Posting REUSES db_service.post_journal_with_overdraft() — no second posting
engine. Journals are stamped source="receipt_scan", source_id=<doc id> so the
audit trail links GL → document → file.

Storage convention mirrors pos_imports: files under
<app root>/uploads/receipt_scans/company_<cid>/, DB rows in the per-company
schema (company_<cid>.receipt_scan_documents).
"""

import hashlib
import os
import re
from datetime import date

import psycopg2
from psycopg2 import errors as pg_errors
from psycopg2.extras import Json
from flask import Blueprint, request, jsonify, current_app, send_file, g
from flask_cors import cross_origin
from werkzeug.utils import secure_filename

from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services import receipt_scan_ai

receipt_scan_bp = Blueprint("receipt_scan", __name__)

ALLOWED_SCAN_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".pdf"}
MAX_SCAN_BYTES = 15 * 1024 * 1024  # 15 MB

DOC_STATUSES = ("uploaded", "draft_ready", "posted", "discarded")


# ────────────────────────────────────────────────────────────────
# Table + helpers
# ────────────────────────────────────────────────────────────────

def _ensure_table(company_id: int) -> None:
    schema = f"company_{int(company_id)}"
    db_service.execute_sql(
        f"""
        CREATE TABLE IF NOT EXISTS {schema}.receipt_scan_documents (
            id             SERIAL PRIMARY KEY,
            company_id     INTEGER NOT NULL,
            status         VARCHAR(24) NOT NULL DEFAULT 'uploaded',
            doc_type       VARCHAR(24) DEFAULT 'supplier_receipt',
            original_name  VARCHAR(255),
            stored_name    VARCHAR(255),
            file_path      VARCHAR(500),
            mime_type      VARCHAR(120),
            file_size      BIGINT DEFAULT 0,
            file_sha256    CHAR(64),
            extracted      JSONB DEFAULT '{{}}'::jsonb,
            draft_journal  JSONB DEFAULT '{{}}'::jsonb,
            journal_id     INTEGER,
            duplicate_of   INTEGER,
            uploaded_by    INTEGER,
            extracted_at   TIMESTAMPTZ,
            posted_at      TIMESTAMPTZ,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )


def _scan_root(company_id: int) -> str:
    return os.path.join(
        current_app.root_path, "uploads", "receipt_scans", f"company_{int(company_id)}"
    )


def _get_doc(company_id: int, doc_id: int) -> dict:
    return db_service.fetch_one(
        f"""
        SELECT *
        FROM company_{int(company_id)}.receipt_scan_documents
        WHERE id = %s AND company_id = %s
        LIMIT 1
        """,
        (int(doc_id), int(company_id)),
    ) or {}


def _doc_summary(row: dict) -> dict:
    """Compact representation for lists / cards."""
    ex = row.get("extracted") or {}
    if not isinstance(ex, dict):
        ex = {}
    facts = ex.get("facts") or {}
    dj = row.get("draft_journal") or {}
    if not isinstance(dj, dict):
        dj = {}

    return {
        "id": row.get("id"),
        "status": row.get("status"),
        "doc_type": row.get("doc_type"),
        "original_name": row.get("original_name"),
        "file_size": row.get("file_size"),
        "mime_type": row.get("mime_type"),
        "file_url": f"/api/companies/{row.get('company_id')}/receipt-scan/documents/{row.get('id')}/file",
        "vendor": facts.get("vendor") or "",
        "doc_no": facts.get("doc_no") or "",
        "doc_date": facts.get("doc_date") or "",
        "total_amount": facts.get("total_amount") or 0.0,
        "tax_amount": facts.get("tax_amount") or 0.0,
        "confidence": ex.get("confidence"),
        "engine": ex.get("engine"),
        "duplicate_of": row.get("duplicate_of"),
        "journal_id": row.get("journal_id"),
        "ref": dj.get("ref") or "",
        "created_at": str(row.get("created_at") or ""),
        "posted_at": str(row.get("posted_at") or ""),
    }


def _audit(company_id: int, action: str, entity_id: str, message: str,
           before=None, after=None,
           amount: float = 0.0, currency=None,
           entity_ref=None, journal_id=None) -> None:
    try:
        db_service.audit_log(
            company_id=int(company_id),
            actor_user_id=int((getattr(g, "current_user", None) or {}).get("id") or 0),
            module="gl",
            action=action,
            severity="info",
            entity_type="receipt_scan_document",
            entity_id=str(entity_id),
            entity_ref=entity_ref,
            journal_id=journal_id,
            amount=float(amount or 0.0),
            currency=currency,
            before_json=before or {},
            after_json=after or {},
            message=message,
            source="api",
        )
    except Exception:
        current_app.logger.exception("receipt-scan audit_log failed")


def _map_journal_error(msg: str):
    """Mirror api_server.py /journal error mapping so the frontend sees
    identical codes (PERIOD_LOCKED, DUPLICATE_JOURNAL_REF, ...)."""
    low = str(msg or "").lower()

    if str(msg).startswith("PERIOD_LOCKED|"):
        parts = str(msg).split("|")
        return jsonify({
            "ok": False,
            "error": "Period is locked",
            "message": (
                f"The receipt cannot be posted because the accounting period "
                f"for {parts[2] if len(parts) > 2 else 'this date'} is locked."
            ),
            "code": "PERIOD_LOCKED",
            "module": parts[1] if len(parts) > 1 else "gl",
            "date": parts[2] if len(parts) > 2 else None,
        }), 409

    if str(msg).startswith("DUPLICATE_JOURNAL_REF|"):
        parts = str(msg).split("|")
        dup_ref = parts[1] if len(parts) > 1 else None
        return jsonify({
            "ok": False,
            "error": f"Duplicate journal reference: {dup_ref}" if dup_ref else "Duplicate journal reference",
            "message": (
                f'A journal with reference "{dup_ref}" has already been posted.'
                if dup_ref else "A journal with this reference has already been posted."
            ),
            "code": "DUPLICATE_JOURNAL_REF",
            "ref": dup_ref,
        }), 409

    if str(msg).startswith("Unbalanced journal:"):
        return jsonify({
            "ok": False,
            "error": "Unbalanced journal",
            "message": str(msg),
            "code": "UNBALANCED_JOURNAL",
        }), 400

    if "at least one line" in low:
        return jsonify({
            "ok": False,
            "error": "Journal has no lines",
            "message": str(msg),
            "code": "MISSING_JOURNAL_LINES",
        }), 400

    return None


# ────────────────────────────────────────────────────────────────
# 1) Upload — ALWAYS stores the document (audit trail survives
#    even if extraction later fails)
# ────────────────────────────────────────────────────────────────

@receipt_scan_bp.route("/api/companies/<int:company_id>/receipt-scan/upload",
                       methods=["POST", "OPTIONS"])
@cross_origin()
@require_auth
def upload_receipt_document(company_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    user = getattr(g, "current_user", None) or {}
    if user.get("company_id") not in (None, company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    _ensure_table(company_id)

    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "Missing file (field name must be 'file')"}), 400

    original = secure_filename(f.filename)
    ext = os.path.splitext(original)[1].lower()
    if ext not in ALLOWED_SCAN_EXTS:
        return jsonify({
            "error": f"Unsupported file type {ext}",
            "allowed": sorted(ALLOWED_SCAN_EXTS),
        }), 400

    # hash (dedupe) — same convention as pos_imports
    sha = hashlib.sha256()
    f.stream.seek(0)
    for chunk in iter(lambda: f.stream.read(1024 * 1024), b""):
        sha.update(chunk)
    file_hash = sha.hexdigest()
    f.stream.seek(0)

    mime = (f.mimetype or "").lower() or (
        "application/pdf" if ext == ".pdf" else "image/jpeg"
    )

    # exact duplicate check (same file already uploaded, not discarded)
    dup = db_service.fetch_one(
        f"""
        SELECT id, status
        FROM company_{int(company_id)}.receipt_scan_documents
        WHERE file_sha256 = %s
          AND status IN ('uploaded', 'draft_ready', 'posted')
        ORDER BY id DESC
        LIMIT 1
        """,
        (file_hash,),
    )

    # save file
    folder = _scan_root(company_id)
    os.makedirs(folder, exist_ok=True)
    stored_name = f"scan_{int(company_id)}_{int(date.today().strftime('%Y%m%d'))}_{file_hash[:12]}{ext}"
    path = os.path.join(folder, stored_name)
    f.save(path)
    file_size = os.path.getsize(path)

    if file_size > MAX_SCAN_BYTES:
        try:
            os.remove(path)
        except OSError:
            pass
        return jsonify({"error": "File too large (max 15 MB)"}), 400

    doc_id = db_service.execute_sql(
        f"""
        INSERT INTO company_{int(company_id)}.receipt_scan_documents
            (company_id, status, doc_type, original_name, stored_name, file_path,
             mime_type, file_size, file_sha256, duplicate_of, uploaded_by)
        VALUES
            (%s, 'uploaded', %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (
            int(company_id),
            "supplier_invoice" if "invoice" in original.lower() else "supplier_receipt",
            original,
            stored_name,
            path,
            mime,
            int(file_size),
            file_hash,
            int(dup["id"]) if dup else None,
            user.get("id"),
        ),
    )

    _audit(
        company_id, "upload_receipt_scan", str(doc_id), "Receipt/invoice uploaded",
        after={
            "doc_id": int(doc_id),
            "original_name": original,
            "file_sha256": file_hash,
            "duplicate_of": int(dup["id"]) if dup else None,
        },
        entity_ref=original,
    )

    return jsonify({
        "ok": True,
        "doc_id": int(doc_id),
        "status": "uploaded",
        "file_url": f"/api/companies/{company_id}/receipt-scan/documents/{doc_id}/file",
        "duplicate_of": int(dup["id"]) if dup else None,
        "is_duplicate": bool(dup),
    }), 201


# ────────────────────────────────────────────────────────────────
# 2) List / detail / file (company-scoped access only)
# ────────────────────────────────────────────────────────────────

@receipt_scan_bp.route("/api/companies/<int:company_id>/receipt-scan/documents",
                       methods=["GET", "OPTIONS"])
@cross_origin()
@require_auth
def list_receipt_documents(company_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    user = getattr(g, "current_user", None) or {}
    if user.get("company_id") not in (None, company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    _ensure_table(company_id)

    status = (request.args.get("status") or "").strip().lower()
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except ValueError:
        limit = 50

    where = "company_id = %s"
    params = [int(company_id)]
    if status in DOC_STATUSES:
        where += " AND status = %s"
        params.append(status)

    rows = db_service.fetch_all(
        f"""
        SELECT *
        FROM company_{int(company_id)}.receipt_scan_documents
        WHERE {where}
        ORDER BY id DESC
        LIMIT %s
        """,
        tuple(params + [limit]),
    ) or []

    return jsonify({"ok": True, "documents": [_doc_summary(r) for r in rows]}), 200


@receipt_scan_bp.route("/api/companies/<int:company_id>/receipt-scan/documents/<int:doc_id>",
                       methods=["GET", "OPTIONS"])
@cross_origin()
@require_auth
def get_receipt_document(company_id: int, doc_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    user = getattr(g, "current_user", None) or {}
    if user.get("company_id") not in (None, company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    row = _get_doc(company_id, doc_id)
    if not row:
        return jsonify({"error": "Document not found"}), 404

    out = _doc_summary(row)
    out["extracted"] = row.get("extracted") or {}
    out["draft_journal"] = row.get("draft_journal") or {}
    return jsonify(out), 200


@receipt_scan_bp.route("/api/companies/<int:company_id>/receipt-scan/documents/<int:doc_id>/file",
                       methods=["GET", "OPTIONS"])
@cross_origin()
@require_auth
def get_receipt_file(company_id: int, doc_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    user = getattr(g, "current_user", None) or {}
    if user.get("company_id") not in (None, company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    row = _get_doc(company_id, doc_id)
    if not row:
        return jsonify({"error": "Document not found"}), 404

    path = str(row.get("file_path") or "")
    root = os.path.abspath(_scan_root(company_id))
    full = os.path.abspath(path)

    # hard company-scope check: the file MUST live inside this company's folder
    if not full.startswith(root + os.sep) or not os.path.isfile(full):
        return jsonify({"error": "File missing on disk"}), 404

    return send_file(full, mimetype=row.get("mime_type") or "application/octet-stream",
                     conditional=True)


# ────────────────────────────────────────────────────────────────
# 3) Extract — OCR/AI reads facts; draft builder decides accounts
# ────────────────────────────────────────────────────────────────

@receipt_scan_bp.route("/api/companies/<int:company_id>/receipt-scan/documents/<int:doc_id>/extract",
                       methods=["POST", "OPTIONS"])
@cross_origin()
@require_auth
def extract_receipt_document(company_id: int, doc_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    user = getattr(g, "current_user", None) or {}
    if user.get("company_id") not in (None, company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    row = _get_doc(company_id, doc_id)
    if not row:
        return jsonify({"error": "Document not found"}), 404

    if row.get("status") == "posted":
        return jsonify({"error": "Document already posted"}), 409

    payload = request.get_json(silent=True) or {}
    credit_hint = "bank" if str(payload.get("credit_hint") or "").lower() == "bank" else "ap"

    path = str(row.get("file_path") or "")
    if not path or not os.path.isfile(path):
        return jsonify({"error": "File missing on disk"}), 404

    # ── extraction (facts only — never accounting) ──
    try:
        result = receipt_scan_ai.extract_document(path, row.get("mime_type") or "")
    except Exception:
        current_app.logger.exception("receipt-scan extraction crashed")
        result = {
            "facts": receipt_scan_ai._normalise_facts({}),
            "confidence": 0.0,
            "field_confidence": {},
            "engine": "none",
            "needs_review": True,
        }

    facts = result["facts"]
    facts["_engine"] = result["engine"]
    facts["_confidence"] = result["confidence"]

    # ── draft builder (the ONLY accounting decision point) ──
    try:
        draft = receipt_scan_ai.build_draft_journal(
            db_service, int(company_id), facts, int(doc_id),
            credit_hint=credit_hint,
            field_confidence=result.get("field_confidence") or {},
        )
    except Exception:
        current_app.logger.exception("receipt-scan draft build failed")
        return jsonify({"ok": False, "error": "Draft builder failed",
                        "code": "DRAFT_BUILD_FAILED"}), 500

    # ── soft duplicate check: same vendor + doc_no + total already captured ──
    duplicate_of = None
    vendor = (facts.get("vendor") or "").strip().lower()
    doc_no = (facts.get("doc_no") or "").strip().lower()
    total = float(facts.get("total_amount") or 0.0)
    if doc_no and total:
        try:
            soft = db_service.fetch_all(
                f"""
                SELECT id FROM company_{int(company_id)}.receipt_scan_documents
                WHERE id <> %s
                  AND status IN ('uploaded', 'draft_ready', 'posted')
                  AND extracted->'facts'->>'doc_no' = %s
                  AND ABS(COALESCE((extracted->'facts'->>'total_amount')::numeric, 0) - %s) < 0.01
                ORDER BY id DESC LIMIT 1
                """,
                (int(doc_id), doc_no, total),
            ) or []
            if vendor:
                soft = [s for s in soft]  # doc_no+total match is strong enough
            duplicate_of = int(soft[0]["id"]) if soft else None
        except Exception:
            duplicate_of = None

    extracted_payload = {
        "facts": facts,
        "confidence": result["confidence"],
        "field_confidence": result.get("field_confidence") or {},
        "engine": result["engine"],
        "needs_review": result["needs_review"],
    }

    db_service.execute_sql(
        f"""
        UPDATE company_{int(company_id)}.receipt_scan_documents
        SET status = %s,
            doc_type = %s,
            extracted = %s,
            draft_journal = %s,
            duplicate_of = %s,
            extracted_at = NOW(),
            updated_at = NOW()
        WHERE id = %s AND company_id = %s;
        """,
        (
            "draft_ready",
            facts.get("doc_type") or row.get("doc_type") or "supplier_receipt",
            Json(extracted_payload),
            Json(draft),
            duplicate_of,
            int(doc_id),
            int(company_id),
        ),
    )

    _audit(
        company_id, "extract_receipt_scan", str(doc_id),
        f"Receipt extracted via {result['engine']} (confidence {result['confidence']:.2f})",
        before={"status": row.get("status")},
        after={"status": "draft_ready", "engine": result["engine"],
               "confidence": result["confidence"], "duplicate_of": duplicate_of},
        amount=total, currency=facts.get("currency"),
        entity_ref=(facts.get("doc_no") or row.get("original_name") or "")[:60],
    )

    out = _doc_summary(_get_doc(company_id, doc_id))
    out["extracted"] = extracted_payload
    out["draft_journal"] = draft
    out["is_duplicate"] = duplicate_of is not None
    return jsonify(out), 200


# ────────────────────────────────────────────────────────────────
# 4) Save edited draft (review screen)
# ────────────────────────────────────────────────────────────────

@receipt_scan_bp.route("/api/companies/<int:company_id>/receipt-scan/documents/<int:doc_id>/draft",
                       methods=["PUT", "OPTIONS"])
@cross_origin()
@require_auth
def save_receipt_draft(company_id: int, doc_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    user = getattr(g, "current_user", None) or {}
    if user.get("company_id") not in (None, company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    row = _get_doc(company_id, doc_id)
    if not row:
        return jsonify({"error": "Document not found"}), 404
    if row.get("status") == "posted":
        return jsonify({"error": "Document already posted"}), 409

    body = request.get_json(silent=True) or {}
    draft_in = body.get("draft") or {}

    lines = draft_in.get("lines") or []
    if not isinstance(lines, list) or not lines:
        return jsonify({"error": "Draft must include at least one line"}), 400

    clean_lines = []
    for i, ln in enumerate(lines):
        code = str((ln or {}).get("account_code") or "").strip()
        debit = round(float(ln.get("debit") or 0.0), 2)
        credit = round(float(ln.get("credit") or 0.0), 2)
        memo = str(ln.get("memo") or "").strip()[:200]

        if debit > 0 and credit > 0:
            return jsonify({"error": f"Line {i + 1} cannot have both debit and credit"}), 400
        if (debit > 0 or credit > 0) and not code:
            return jsonify({"error": f"Line {i + 1} has an amount but no account"}), 400
        if debit == 0 and credit == 0:
            continue

        clean_lines.append({
            "account_code": code,
            "account_name": str(ln.get("account_name") or "")[:160],
            "debit": debit,
            "credit": credit,
            "memo": memo,
        })

    total_dr = round(sum(l["debit"] for l in clean_lines), 2)
    total_cr = round(sum(l["credit"] for l in clean_lines), 2)

    draft = {
        "date": str(draft_in.get("date") or row["extracted"].get("facts", {}).get("doc_date")
                    or date.today().isoformat())[:10],
        "ref": str(draft_in.get("ref") or f"RSCPT-{int(doc_id)}").strip()[:60],
        "description": str(draft_in.get("description") or "").strip()[:180],
        "currency": str(draft_in.get("currency") or "ZAR").strip().upper()[:3],
        "gross_amount": total_dr,
        "net_amount": round(total_dr - float(draft_in.get("vat_amount") or 0.0), 2),
        "vat_amount": round(float(draft_in.get("vat_amount") or 0.0), 2),
        "credit_hint": draft_in.get("credit_hint") or "ap",
        "confidence": (row.get("extracted") or {}).get("confidence"),
        "needs_review": False,   # a human just edited it
        "lines": clean_lines,
        "totals_check": {"debit": total_dr, "credit": total_cr, "balanced": abs(total_dr - total_cr) < 0.01},
    }

    db_service.execute_sql(
        f"""
        UPDATE company_{int(company_id)}.receipt_scan_documents
        SET status = 'draft_ready',
            draft_journal = %s,
            updated_at = NOW()
        WHERE id = %s AND company_id = %s;
        """,
        (Json(draft), int(doc_id), int(company_id)),
    )

    return jsonify({"ok": True, "draft_journal": draft}), 200


# ────────────────────────────────────────────────────────────────
# 5) Post — routes through the REAL posting engine.
#    No posting logic is duplicated here.
# ────────────────────────────────────────────────────────────────

@receipt_scan_bp.route("/api/companies/<int:company_id>/receipt-scan/documents/<int:doc_id>/post",
                       methods=["POST", "OPTIONS"])
@cross_origin()
@require_auth
def post_receipt_document(company_id: int, doc_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    user = getattr(g, "current_user", None) or {}
    if user.get("company_id") not in (None, company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    row = _get_doc(company_id, doc_id)
    if not row:
        return jsonify({"error": "Document not found"}), 404
    if row.get("status") == "posted":
        return jsonify({
            "ok": False, "error": "Document already posted",
            "code": "ALREADY_POSTED", "journal_id": row.get("journal_id"),
        }), 409

    draft = row.get("draft_journal") or {}
    if not isinstance(draft, dict) or not draft.get("lines"):
        return jsonify({
            "ok": False, "error": "No draft journal on document — run extraction first",
            "code": "NO_DRAFT",
        }), 400

    # ── validation before touching the GL ──
    lines = draft.get("lines") or []
    for i, ln in enumerate(lines):
        if not str(ln.get("account_code") or "").strip():
            return jsonify({
                "ok": False,
                "error": f"Line {i + 1} has no account selected. Open the draft and pick an account.",
                "code": "DRAFT_LINE_MISSING_ACCOUNT",
            }), 400

    total_dr = round(sum(float(l.get("debit") or 0.0) for l in lines), 2)
    total_cr = round(sum(float(l.get("credit") or 0.0) for l in lines), 2)
    if abs(total_dr - total_cr) >= 0.01:
        return jsonify({
            "ok": False, "error": "Draft is not balanced",
            "message": f"Debits {total_dr:.2f} ≠ Credits {total_cr:.2f}",
            "code": "UNBALANCED_JOURNAL",
        }), 400

    try:
        doc_date = str(draft.get("date") or date.today().isoformat())[:10]
        date.fromisoformat(doc_date)
    except ValueError:
        return jsonify({"ok": False, "error": "Invalid draft date", "code": "JOURNAL_VALIDATION_FAILED"}), 400

    ref = str(draft.get("ref") or f"RSCPT-{int(doc_id)}").strip()[:60]

    # ── journal entry for the REAL engine ──
    entry = {
        "date": doc_date,
        "ref": ref,
        "description": draft.get("description") or f"Receipt scan doc {doc_id}",
        "gross_amount": float(draft.get("gross_amount") or total_dr),
        "net_amount": float(draft.get("net_amount") or 0.0),
        "vat_amount": float(draft.get("vat_amount") or 0.0),
        "currency": draft.get("currency") or None,   # None → company currency fallback
        "source": "receipt_scan",
        "source_id": int(doc_id),
        "lines": [
            {
                "account_code": str(ln.get("account_code") or "").strip(),
                "debit": float(ln.get("debit") or 0.0),
                "credit": float(ln.get("credit") or 0.0),
                "memo": str(ln.get("memo") or "")[:200],
                "description": str(ln.get("memo") or "")[:200],
            }
            for ln in lines
        ],
    }

    # ── THE posting call (identical engine as manual journals) ──
    try:
        journal_id = db_service.post_journal_with_overdraft(int(company_id), entry)
    except ValueError as e:
        mapped = _map_journal_error(str(e))
        if mapped:
            return mapped
        return jsonify({
            "ok": False, "error": str(e), "message": str(e),
            "code": "JOURNAL_VALIDATION_FAILED",
        }), 400
    except pg_errors.NotNullViolation:
        return jsonify({
            "ok": False, "error": "Missing required journal value",
            "message": "The draft is missing a required field.",
            "code": "JOURNAL_REQUIRED_FIELD_MISSING",
        }), 400
    except pg_errors.ForeignKeyViolation:
        return jsonify({
            "ok": False, "error": "Invalid journal reference",
            "message": "One of the selected accounts does not exist in the chart of accounts.",
            "code": "JOURNAL_FOREIGN_KEY_ERROR",
        }), 400
    except pg_errors.UniqueViolation:
        return jsonify({
            "ok": False, "error": "Duplicate journal record",
            "message": "A journal with this reference already exists.",
            "code": "JOURNAL_DUPLICATE_RECORD",
        }), 409
    except psycopg2.Error:
        current_app.logger.exception("receipt-scan post DB error")
        return jsonify({
            "ok": False, "error": "Journal database error",
            "message": "The receipt could not be posted because of a database error.",
            "code": "JOURNAL_DATABASE_ERROR",
        }), 500
    except Exception as e:
        current_app.logger.exception("receipt-scan post failed")
        return jsonify({
            "ok": False, "error": "Journal posting failed",
            "message": str(e) or "Unexpected error.",
            "code": "JOURNAL_POST_FAILED",
        }), 500

    db_service.execute_sql(
        f"""
        UPDATE company_{int(company_id)}.receipt_scan_documents
        SET status = 'posted',
            journal_id = %s,
            posted_at = NOW(),
            updated_at = NOW()
        WHERE id = %s AND company_id = %s;
        """,
        (int(journal_id), int(doc_id), int(company_id)),
    )

    _audit(
        company_id, "post_receipt_scan", str(doc_id),
        f"Receipt posted as journal {journal_id} (ref {ref})",
        before={"status": row.get("status")},
        after={"status": "posted", "journal_id": int(journal_id), "ref": ref},
        amount=float(draft.get("gross_amount") or total_dr),
        currency=draft.get("currency"),
        entity_ref=ref,
        journal_id=int(journal_id),
    )

    return jsonify({
        "ok": True,
        "journal_id": int(journal_id),
        "doc_id": int(doc_id),
        "ref": ref,
        "status": "posted",
    }), 200


# ────────────────────────────────────────────────────────────────
# 6) Discard
# ────────────────────────────────────────────────────────────────

@receipt_scan_bp.route("/api/companies/<int:company_id>/receipt-scan/documents/<int:doc_id>/discard",
                       methods=["POST", "OPTIONS"])
@cross_origin()
@require_auth
def discard_receipt_document(company_id: int, doc_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    user = getattr(g, "current_user", None) or {}
    if user.get("company_id") not in (None, company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    row = _get_doc(company_id, doc_id)
    if not row:
        return jsonify({"error": "Document not found"}), 404
    if row.get("status") == "posted":
        return jsonify({
            "ok": False, "error": "Posted documents cannot be discarded — reverse the journal instead",
            "code": "ALREADY_POSTED",
        }), 409

    db_service.execute_sql(
        f"""
        UPDATE company_{int(company_id)}.receipt_scan_documents
        SET status = 'discarded', updated_at = NOW()
        WHERE id = %s AND company_id = %s;
        """,
        (int(doc_id), int(company_id)),
    )

    _audit(company_id, "discard_receipt_scan", str(doc_id), "Receipt document discarded",
           before={"status": row.get("status")}, after={"status": "discarded"},
           entity_ref=str(row.get("original_name") or "")[:60])

    return jsonify({"ok": True, "doc_id": int(doc_id), "status": "discarded"}), 200
