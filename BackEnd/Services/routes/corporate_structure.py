from flask import Blueprint, current_app, g, jsonify, request
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service

corporate_structure_bp = Blueprint("corporate_structure", __name__)


def _authorise_company(company_id: int):
    user = getattr(g, "current_user", None)
    if not user:
        return None, (jsonify({"message": "Not authenticated"}), 401)

    if int(user.get("company_id") or 0) != int(company_id):
        return user, (jsonify({"message": "Not authorised for this company"}), 403)

    return user, None

@corporate_structure_bp.route(
    "/api/companies/<int:company_id>/corporate-structure/profile",
    methods=["GET"],
)
@require_auth
def api_get_group_reporting_profile(company_id: int):
    _, deny = _authorise_company(company_id)
    if deny:
        return deny

    try:
        profile = db_service.get_group_reporting_profile(company_id)
        return jsonify({"profile": profile}), 200
    except Exception as e:
        current_app.logger.exception("api_get_group_reporting_profile failed")
        return jsonify({"message": str(e)}), 500

@corporate_structure_bp.route(
    "/api/companies/<int:company_id>/corporate-structure/profile",
    methods=["PATCH", "POST"],
)
@require_auth
def api_save_group_reporting_profile(company_id: int):
    user, deny = _authorise_company(company_id)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    try:
        month = data.get("financial_year_end_month")
        day = data.get("financial_year_end_day")

        if month not in (None, ""):
            month = int(month)
            if month < 1 or month > 12:
                return jsonify({"message": "financial_year_end_month must be between 1 and 12"}), 400
        else:
            month = None

        if day not in (None, ""):
            day = int(day)
            if day < 1 or day > 31:
                return jsonify({"message": "financial_year_end_day must be between 1 and 31"}), 400
        else:
            day = None

        profile = db_service.save_group_reporting_profile(
            company_id=company_id,
            profile_name=data.get("profile_name"),
            group_name=data.get("group_name"),
            reporting_currency=data.get("reporting_currency"),
            default_consolidation_method=data.get("default_consolidation_method"),
            financial_year_end_month=month,
            financial_year_end_day=day,
            enable_intercompany=bool(data.get("enable_intercompany", True)),
            enable_fx_translation=bool(data.get("enable_fx_translation", True)),
            enable_nci=bool(data.get("enable_nci", True)),
            enable_equity_method=bool(data.get("enable_equity_method", True)),
            enable_segment_reporting=bool(data.get("enable_segment_reporting", False)),
            created_by_user_id=user.get("id"),
        )

        return jsonify({
            "message": "Group reporting profile saved",
            "profile": profile,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_save_group_reporting_profile failed")
        return jsonify({"message": str(e)}), 500

@corporate_structure_bp.route(
    "/api/companies/<int:company_id>/corporate-structure/relationships",
    methods=["GET"],
)
@require_auth
def api_list_company_relationships(company_id: int):
    _, deny = _authorise_company(company_id)
    if deny:
        return deny

    try:
        relationship_type = (request.args.get("type") or "").strip() or None
        include_inactive = str(
            request.args.get("include_inactive") or ""
        ).strip().lower() in {"1", "true", "yes"}

        rows = db_service.list_company_relationships(
            company_id,
            relationship_type=relationship_type,
            include_inactive=include_inactive,
        )

        return jsonify({
            "items": rows,
            "count": len(rows),
        }), 200

    except Exception as e:
        current_app.logger.exception("api_list_company_relationships failed")
        return jsonify({"message": str(e)}), 500

@corporate_structure_bp.route(
    "/api/companies/<int:company_id>/corporate-structure/relationships/<int:relationship_id>",
    methods=["GET"],
)
@require_auth
def api_get_company_relationship(company_id: int, relationship_id: int):
    _, deny = _authorise_company(company_id)
    if deny:
        return deny

    try:
        row = db_service.get_company_relationship(
            company_id,
            relationship_id,
        )

        if not row:
            return jsonify({"message": "Relationship not found"}), 404

        return jsonify({"relationship": row}), 200

    except Exception as e:
        current_app.logger.exception("api_get_company_relationship failed")
        return jsonify({"message": str(e)}), 500

@corporate_structure_bp.route(
    "/api/companies/<int:company_id>/corporate-structure/relationships",
    methods=["POST"],
)
@require_auth
def api_create_company_relationship(company_id: int):
    _, deny = _authorise_company(company_id)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    try:
        child_company_id = int(data.get("child_company_id") or 0)
    except Exception:
        child_company_id = 0

    if not child_company_id:
        return jsonify({"message": "child_company_id is required"}), 400

    relationship_type = (data.get("relationship_type") or "").strip().lower()

    if relationship_type not in {
        "subsidiary",
        "associate",
        "joint_venture",
        "branch",
    }:
        return jsonify({"message": "Invalid relationship_type"}), 400

    defaults = {
        "subsidiary": ("control", "full"),
        "associate": ("significant_influence", "equity"),
        "joint_venture": ("joint_control", "equity"),
        "branch": ("direct_branch", "full"),
    }

    control_basis, consolidation_method = defaults[relationship_type]

    try:
        row = db_service.create_company_relationship(
            parent_company_id=company_id,
            child_company_id=child_company_id,
            relationship_type=relationship_type,
            ownership_percent=data.get("ownership_percent"),
            voting_percent=data.get("voting_percent"),
            control_basis=data.get("control_basis") or control_basis,
            consolidation_method=data.get("consolidation_method") or consolidation_method,
            effective_from=data.get("effective_from"),
            effective_to=data.get("effective_to"),
            acquisition_date=data.get("acquisition_date"),
            functional_currency=data.get("functional_currency"),
            reporting_currency=data.get("reporting_currency"),
            include_in_group_reporting=bool(data.get("include_in_group_reporting", True)),
            notes=data.get("notes"),
        )

        return jsonify({
            "message": "Company relationship created",
            "relationship": row,
        }), 201

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_create_company_relationship failed")
        return jsonify({"message": str(e)}), 500

@corporate_structure_bp.route(
    "/api/companies/<int:company_id>/corporate-structure/relationships/<int:relationship_id>",
    methods=["PATCH"],
)
@require_auth
def api_update_company_relationship(company_id: int, relationship_id: int):
    user, deny = _authorise_company(company_id)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    try:
        row = db_service.update_company_relationship(
            company_id=company_id,
            relationship_id=relationship_id,
            payload=data,
            reviewed_by_user_id=user.get("id"),
        )

        return jsonify({
            "message": "Relationship updated",
            "relationship": row,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_update_company_relationship failed")
        return jsonify({"message": str(e)}), 500

@corporate_structure_bp.route(
    "/api/companies/<int:company_id>/corporate-structure/relationships/<int:relationship_id>",
    methods=["DELETE"],
)
@require_auth
def api_deactivate_company_relationship(company_id: int, relationship_id: int):
    _, deny = _authorise_company(company_id)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    try:
        row = db_service.deactivate_company_relationship(
            company_id=company_id,
            relationship_id=relationship_id,
            effective_to=data.get("effective_to"),
            disposal_date=data.get("disposal_date"),
        )

        return jsonify({
            "message": "Relationship deactivated",
            "relationship": row,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_deactivate_company_relationship failed")
        return jsonify({"message": str(e)}), 500

@corporate_structure_bp.route(
    "/api/companies/<int:company_id>/corporate-structure/settings",
    methods=["GET"],
)
@require_auth
def api_get_group_reporting_settings(company_id: int):
    _, deny = _authorise_company(company_id)
    if deny:
        return deny

    try:
        settings = db_service.get_group_reporting_settings(company_id)
        return jsonify({"settings": settings}), 200
    except Exception as e:
        current_app.logger.exception("api_get_group_reporting_settings failed")
        return jsonify({"message": str(e)}), 500

@corporate_structure_bp.route(
    "/api/companies/<int:company_id>/corporate-structure/settings/<string:setting_key>",
    methods=["PATCH", "PUT"],
)
@require_auth
def api_save_group_reporting_setting(company_id: int, setting_key: str):
    _, deny = _authorise_company(company_id)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    if "value" not in data:
        return jsonify({"message": "value is required"}), 400

    try:
        row = db_service.save_group_reporting_setting(
            company_id=company_id,
            setting_key=setting_key,
            setting_value=data.get("value"),
        )

        return jsonify({
            "message": "Group reporting setting saved",
            "setting": row,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_save_group_reporting_setting failed")
        return jsonify({"message": str(e)}), 500