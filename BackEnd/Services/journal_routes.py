# BackEnd/Services/journal_routes.py

from flask import Blueprint, request, jsonify
from flask_cors import cross_origin

from BackEnd.Services.db_service import db_service

journal_bp = Blueprint("journal", __name__, url_prefix="/api/journal")


@journal_bp.route("/post-batch", methods=["POST", "OPTIONS"])
@cross_origin()  # you can restrict: origins=["http://127.0.0.1:5500", "http://localhost:5500"]
def post_batch():
    """
    POST /api/journal/post-batch

    Expected JSON payload from frontend:
      {
        "batchId": "JRN-123456789",
        "lines": [
          {
            "date": "2025-12-05",
            "ref": "JRN-123456789",
            "account": "1000",
            "debit": 1000.00,
            "credit": 0.00,
            "source": "JOURNAL",
            "sourceId": "JRN-123456789",
            "memo": "Something"
          },
          ...
        ]
      }
    """
    
    if request.method == "OPTIONS":
        # CORS preflight
        return ("", 204)

    data = request.get_json(silent=True) or {}
    batch_id = data.get("batchId")
    lines = data.get("lines") or []

    if not lines:
        return jsonify({"error": "No lines in batch"}), 400

    # TODO: real DB insert:
    # - insert a header in a journals table
    # - insert ledger rows
    # - update trial balance, etc.
    # For now, just echo back so the frontend stops erroring.

    return jsonify({
        "status": "ok",
        "batchId": batch_id,
        "count": len(lines),
    }), 200

# BackEnd/Services/journal_routes.py

@journal_bp.route("/recent", methods=["GET"])
@cross_origin()
def recent_journals():
    from flask import request
    company_id = request.args.get("company_id")
    if not company_id:
        return jsonify({"error": "company_id is required"}), 400

    try:
        company_id = int(company_id)
    except ValueError:
        return jsonify({"error": "Invalid company_id"}), 400

    schema = db_service.company_schema(company_id)
    sql = f"""
        SELECT
            l.journal_id AS "sourceId",
            j.date,
            j.description AS ref,
            l.debit,
            l.credit
        FROM {schema}.ledger l
        JOIN {schema}.journal j ON j.id = l.journal_id
        ORDER BY j.date DESC, l.journal_id DESC, l.id DESC
        LIMIT 500;
    """
    rows = db_service.fetch_all(sql)
    return jsonify(rows)
