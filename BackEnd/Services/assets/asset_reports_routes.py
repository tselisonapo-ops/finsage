from flask import Blueprint, jsonify, request
from BackEnd.Services.auth_middleware import require_auth
from werkzeug.exceptions import MethodNotAllowed
from BackEnd.Services.db_service import db_service
# if your notes live elsewhere, adjust import:
# from Services.notes_service import NOTES_REGISTRY

asset_reports_bp = Blueprint("asset_reports", __name__)

def _to_int(v, default):
    try:
        return int(v)
    except Exception:
        return default

def _clean_str(v):
    return (v or "").strip()

def _clean_date(v):
    s = (v or "").strip()
    return s or None

@asset_reports_bp.route("/api/companies/<int:company_id>/asset-reports/register", methods=["GET"])
@require_auth
def get_asset_register_report(company_id: int):
    try:
        as_of = _clean_date(request.args.get("as_of"))
        asset_class = _clean_str(request.args.get("asset_class"))
        status = _clean_str(request.args.get("status"))
        location = _clean_str(request.args.get("location"))
        q = _clean_str(request.args.get("q"))
        limit = min(_to_int(request.args.get("limit"), 200), 1000)
        offset = max(_to_int(request.args.get("offset"), 0), 0)

        out = db_service.list_asset_register_report(
            company_id,
            as_of=as_of,
            asset_class=asset_class,
            status=status,
            location=location,
            q=q,
            limit=limit,
            offset=offset,
        )
        return jsonify({"ok": True, **out})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    
@asset_reports_bp.route("/api/companies/<int:company_id>/asset-reports/movements", methods=["GET"])
@require_auth
def get_asset_movement_report(company_id: int):
    try:
        date_from = _clean_date(request.args.get("date_from"))
        date_to = _clean_date(request.args.get("date_to"))
        asset_class = _clean_str(request.args.get("asset_class"))
        event_type = _clean_str(request.args.get("event_type"))
        q = _clean_str(request.args.get("q"))
        limit = min(_to_int(request.args.get("limit"), 300), 1000)
        offset = max(_to_int(request.args.get("offset"), 0), 0)

        out = db_service.list_asset_movement_report(
            company_id,
            date_from=date_from,
            date_to=date_to,
            asset_class=asset_class,
            event_type=event_type,
            q=q,
            limit=limit,
            offset=offset,
        )
        return jsonify({"ok": True, **out})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    
@asset_reports_bp.route("/api/companies/<int:company_id>/asset-reports/disposals", methods=["GET"])
@require_auth
def get_asset_disposal_report(company_id: int):
    try:
        date_from = _clean_date(request.args.get("date_from"))
        date_to = _clean_date(request.args.get("date_to"))
        asset_class = _clean_str(request.args.get("asset_class"))
        status = _clean_str(request.args.get("status"))
        q = _clean_str(request.args.get("q"))
        limit = min(_to_int(request.args.get("limit"), 200), 1000)
        offset = max(_to_int(request.args.get("offset"), 0), 0)

        out = db_service.list_asset_disposal_report(
            company_id,
            date_from=date_from,
            date_to=date_to,
            asset_class=asset_class,
            status=status,
            q=q,
            limit=limit,
            offset=offset,
        )
        return jsonify({"ok": True, **out})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@asset_reports_bp.get("/api/companies/<int:company_id>/asset-reports/depreciation")
@require_auth
def get_asset_depreciation_report(company_id: int):
    try:
        date_from = _clean_date(request.args.get("date_from"))
        date_to = _clean_date(request.args.get("date_to"))
        asset_class = _clean_str(request.args.get("asset_class"))
        status = _clean_str(request.args.get("status"))
        q = _clean_str(request.args.get("q"))
        limit = min(max(_to_int(request.args.get("limit"), 200), 1), 1000)
        offset = max(_to_int(request.args.get("offset"), 0), 0)

        out = db_service.list_asset_depreciation_report(
            company_id,
            date_from=date_from,
            date_to=date_to,
            asset_class=asset_class,
            status=status,
            q=q,
            limit=limit,
            offset=offset,
        )

        return jsonify({"ok": True, **out}), 200

    except MethodNotAllowed:
        return jsonify({
            "ok": False,
            "type": "MethodNotAllowed",
            "error": "The method is not allowed for the requested URL.",
        }), 405

    except Exception as e:
        return jsonify({
            "ok": False,
            "type": e.__class__.__name__,
            "error": str(e),
        }), 400