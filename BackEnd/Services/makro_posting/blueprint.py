"""
Flask Blueprint for the Makro Marketplace posting extension.

Provides one endpoint that accepts a remittance PDF (or .txt) upload,
extracts the text via `pdftotext -layout`, runs the full
MakroPostingService pipeline (parse → generate → post → reconcile),
and returns the result as JSON.

Registration in api_server.py:

    from BackEnd.Services.makro_posting.blueprint import makro_bp
    app.register_blueprint(makro_bp)

Two query modes:

    dry_run=true   → parse + generate + reconcile, NO database writes.
                     Used by the "Preview" button on the frontend.

    dry_run=false  → parse + generate + post + reconcile + audit log.
                     Used by the "Post Journals" button.

The frontend sends the remittance PDF as a multipart form upload.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import traceback
from dataclasses import asdict
from flask import Blueprint, request, jsonify, current_app, g
from BackEnd.Services.auth_middleware import require_auth
from .posting_service import MakroPostingService, PostingResult

makro_bp = Blueprint("makro_marketplace", __name__)

ALLOWED_EXTS = {".pdf", ".txt"}


def _result_to_dict(result: PostingResult) -> dict:
    """Convert PostingResult to a JSON-serializable dict."""
    posted = []
    for pj in result.posted_journals:
        d = {
            "reference": pj.reference,
            "journal_date": pj.journal_date,
            "description": pj.description,
            "balanced": pj.balanced,
            "line_count": pj.line_count,
            "journal_id": pj.journal_id,
            "status": pj.status,
            "error": pj.error,
        }
        # Include the entry payload for dry-run previews so the
        # frontend can show journal lines.
        if pj.entry:
            d["entry"] = pj.entry
        posted.append(d)

    failed = []
    for fj in result.failed_journals:
        failed.append({
            "reference": fj.reference,
            "journal_date": fj.journal_date,
            "description": fj.description,
            "balanced": fj.balanced,
            "line_count": fj.line_count,
            "journal_id": fj.journal_id,
            "status": fj.status,
            "error": fj.error,
            "entry": fj.entry,
        })

    return {
        "ok": result.ok,
        "dry_run": result.dry_run,
        "company_id": result.company_id,
        "payment_reference_no": result.payment_reference_no,
        "payment_date": result.payment_date,
        "parsed_line_count": result.parsed_line_count,
        "sales_count": result.sales_count,
        "return_count": result.return_count,
        "header_info": result.header_info,
        "parsed_totals": result.parsed_totals,
        "totals_cross_check": result.totals_cross_check,
        "journal_count": len(result.posted_journals) + len(result.failed_journals),
        "posted_count": sum(1 for j in result.posted_journals if j.status == "posted"),
        "dry_run_count": sum(1 for j in result.posted_journals if j.status == "dry_run"),
        "failed_count": len(result.failed_journals),
        "posted_journals": posted[:10],    # first 10 for preview
        "failed_journals": failed,
        "reconciliation": result.reconciliation,
        "idempotency_hash": result.idempotency_hash,
        "summary": result.summary(),
    }


@makro_bp.route(
    "/api/companies/<int:company_id>/makro/remittance/upload",
    methods=["POST", "OPTIONS"],
)
@require_auth
def upload_makro_remittance(company_id: int):
    """Accept a remittance PDF/txt upload and process it.

    Form fields:
        file     — the PDF or .txt file (required)
        dry_run  — "true" for preview, "false" to actually post

    Returns JSON with the full PostingResult.
    """
    if request.method == "OPTIONS":
        return "", 204

    # Auth — same pattern as every other company-scoped route.
    user = getattr(g, "current_user", {}) or {}
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    if int(user.get("company_id") or 0) != int(company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    # Get the uploaded file.
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "No file uploaded. Use form field 'file'."}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        return jsonify({
            "error": f"Unsupported file type '{ext}'. Use .pdf or .txt.",
        }), 400

    dry_run = request.form.get("dry_run", "true").lower() == "true"

    # Save to a temp file.
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        # Extract text.
        if ext == ".pdf":
            try:
                proc = subprocess.run(
                    ["pdftotext", "-layout", tmp_path, "-"],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    check=False,
                )
            except FileNotFoundError:
                return jsonify({
                    "error": "PDF processing is unavailable because pdftotext is not installed on the server.",
                    "type": "missing_dependency",
                    "dependency": "poppler-utils",
                }), 500
            except subprocess.TimeoutExpired:
                return jsonify({
                    "error": "PDF text extraction timed out. Please try a smaller PDF.",
                    "type": "pdf_extraction_timeout",
                }), 500
            if proc.returncode != 0:
                return jsonify({
                    "error": "pdftotext failed to extract text from the PDF.",
                    "detail": proc.stderr[:500],
                }), 500
            text = proc.stdout
        else:
            with open(tmp_path, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()

        if not text.strip():
            return jsonify({"error": "The uploaded file contains no readable text."}), 400

        # Run the posting service.
        db = current_app.config.get("DB_SERVICE") or current_app.config.get("db_service")
        if not db:
            return jsonify({"error": "Database service not configured."}), 500

        service = MakroPostingService(
            db_service=db,
            company_id=company_id,
            actor_user_id=user.get("id"),
        )

        result = service.post_remittance_text(text, dry_run=dry_run)
        return jsonify(_result_to_dict(result)), 200 if result.ok else 500

    except ValueError as e:
        # Parser / validation errors.
        return jsonify({
            "error": str(e),
            "type": "validation_error",
        }), 400

    except Exception as e:
        current_app.logger.exception(
            "Makro remittance posting failed for company %s", company_id
        )
        return jsonify({
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()[:2000],
        }), 500

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
