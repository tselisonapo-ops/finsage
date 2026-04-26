from flask import Blueprint, request, jsonify, current_app
from datetime import datetime
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.period_core import resolve_company_period
from BackEnd.Services.db_service import db_service

bp_ifrs16 = Blueprint("ifrs16", __name__)


class IFRS16DisclosureRequestProxy:
    def __init__(self, original_request, preset):
        self._request = original_request
        self.args = original_request.args.copy()
        self.args["preset"] = preset

@bp_ifrs16.route("/api/companies/<int:company_id>/ifrs16/disclosure", methods=["GET", "OPTIONS"])
@require_auth
def ifrs16_disclosure(company_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    def parse_date(param_name: str, default=None):
        raw = (request.args.get(param_name) or "").strip()
        if not raw:
            return default
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date()
        except Exception:
            raise ValueError(f"Invalid {param_name} date. Use YYYY-MM-DD.")

    try:
        preset_raw = (request.args.get("preset") or "").strip().lower()

        preset_map = {
            "previous financial year": "prev_year",
            "previous_financial_year": "prev_year",
            "prev financial year": "prev_year",
            "prev_year": "prev_year",
            "last_year": "prev_year",

            "this financial year": "this_year",
            "current financial year": "this_year",
            "this_year": "this_year",
            "current_year": "this_year",

            "ytd": "ytd",
            "this_month": "this_month",
            "prev_month": "prev_month",
            "this_quarter": "this_quarter",
            "prev_quarter": "prev_quarter",
        }

        preset = preset_map.get(preset_raw, preset_raw or "this_year")
        req_for_period = IFRS16DisclosureRequestProxy(request, preset)

        from_d, to_d, meta = resolve_company_period(
            db_service,
            int(company_id),
            req_for_period,
            mode="range",
        )

        if not from_d or not to_d:
            return jsonify({"ok": False, "error": "Unable to resolve period."}), 400

        as_of = parse_date("as_of", default=to_d)

        if from_d > to_d:
            return jsonify({"ok": False, "error": "from must be <= to"}), 400

        if as_of < from_d:
            return jsonify({"ok": False, "error": "as_of must be >= from"}), 400

        include_terminated = (
            (request.args.get("include_terminated") or "1")
            .strip()
            .lower()
            in ("1", "true", "yes", "y")
        )

        current_app.logger.warning({
            "ifrs16_disclosure_period": {
                "preset_in": preset_raw,
                "preset_used": preset,
                "from": from_d.isoformat(),
                "to": to_d.isoformat(),
                "as_of": as_of.isoformat(),
            }
        })

        out = db_service.get_ifrs16_disclosure_strict(
            int(company_id),
            from_date=from_d,
            to_date=to_d,
            as_of=as_of,
            include_terminated=include_terminated,
        )

        return jsonify({"ok": True, "meta": meta, **out}), 200

    except ValueError as ve:
        return jsonify({"ok": False, "error": str(ve)}), 400
    except Exception:
        current_app.logger.exception("ifrs16 disclosure failed")
        return jsonify({"ok": False, "error": "Internal server error"}), 500