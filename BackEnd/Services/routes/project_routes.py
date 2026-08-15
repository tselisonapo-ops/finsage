from __future__ import annotations

from flask import Blueprint, jsonify, request, current_app

from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth, _company_auth_or_403

projects_bp = Blueprint("projects", __name__)


def _payload() -> dict:
    return request.get_json(silent=True) or {}


def _current_user_id(user) -> int | None:
    try:
        return int(user.get("id"))
    except Exception:
        return None


# ============================================================
# PROJECTS
# ============================================================

@projects_bp.route("/api/companies/<int:cid>/projects", methods=["GET"])
@require_auth
def list_projects_route(cid: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    q = (request.args.get("q") or "").strip()
    status = (request.args.get("status") or "").strip()
    project_type = (request.args.get("project_type") or "").strip()
    accounting_mode = (request.args.get("accounting_mode") or "").strip()
    customer_id = request.args.get("customer_id", type=int)

    limit = int(request.args.get("limit") or 50)
    offset = int(request.args.get("offset") or 0)

    rows = db_service.list_projects(
        company_id,
        q=q,
        status=status,
        customer_id=customer_id,
        project_type=project_type,
        accounting_mode=accounting_mode,
        limit=limit,
        offset=offset,
    )

    return jsonify({
        "items": rows,
        "limit": limit,
        "offset": offset,
    }), 200


@projects_bp.route("/api/companies/<int:cid>/projects", methods=["POST"])
@require_auth
def create_project_route(cid: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    data = _payload()
    data["created_by"] = _current_user_id(user)

    try:
        project_id = db_service.create_project(company_id, data)

        return jsonify({
            "ok": True,
            "id": project_id,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception("[PROJECT CREATE] FAILED | company_id=%s", company_id)
        return jsonify({
            "error": "failed_to_create_project",
            "details": str(e),
        }), 500


@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>", methods=["GET"])
@require_auth
def get_project_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    row = db_service.get_project(company_id, int(project_id))

    if not row:
        return jsonify({"error": "project_not_found"}), 404

    return jsonify(row), 200


@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>", methods=["PATCH"])
@require_auth
def update_project_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        ok = db_service.update_project(company_id, int(project_id), _payload())

        if not ok:
            return jsonify({"error": "project_not_found_or_no_changes"}), 404

        return jsonify({
            "ok": True,
            "id": int(project_id),
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "[PROJECT UPDATE] FAILED | company_id=%s | project_id=%s",
            company_id,
            project_id,
        )
        return jsonify({
            "error": "failed_to_update_project",
            "details": str(e),
        }), 500

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/team",
    methods=["GET"],
)
@require_auth
def list_project_team_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    rows = db_service.list_project_team(
        company_id,
        int(project_id),
    )

    return jsonify({"items": rows}), 200


@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/team",
    methods=["POST"],
)
@require_auth
def add_project_team_member_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        member_id = db_service.add_project_team_member(
            company_id,
            int(project_id),
            _payload(),
        )

        return jsonify({
            "ok": True,
            "id": member_id,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/team/<int:member_id>",
    methods=["DELETE"],
)
@require_auth
def remove_project_team_member_route(
    cid: int,
    project_id: int,
    member_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    ok = db_service.remove_project_team_member(
        company_id,
        int(project_id),
        int(member_id),
    )

    if not ok:
        return jsonify({"error": "project_team_member_not_found"}), 404

    return jsonify({"ok": True}), 200

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/task-assignments",
    methods=["GET"],
)
@require_auth
def list_project_task_assignments_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    rows = db_service.list_project_task_assignments(
        company_id,
        int(project_id),
    )

    return jsonify({"items": rows}), 200


@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/tasks/<int:task_id>/assign",
    methods=["POST"],
)
@require_auth
def assign_project_task_route(
    cid: int,
    project_id: int,
    task_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    data = _payload()
    data["assigned_by"] = _current_user_id(user)

    try:
        assignment_id = db_service.assign_project_task(
            company_id,
            int(project_id),
            int(task_id),
            data,
        )

        return jsonify({
            "ok": True,
            "id": assignment_id,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/dependencies",
    methods=["GET"],
)
@require_auth
def list_project_dependencies_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    rows = db_service.list_project_task_dependencies(
        company_id,
        int(project_id),
    )

    return jsonify({"items": rows}), 200


@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/dependencies",
    methods=["POST"],
)
@require_auth
def create_project_dependency_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        dependency_id = db_service.create_project_task_dependency(
            company_id,
            int(project_id),
            _payload(),
        )

        return jsonify({
            "ok": True,
            "id": dependency_id,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/time",
    methods=["GET"],
)
@require_auth
def project_time_list_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    rows = db_service.list_project_time_entries(
        company_id,
        project_id,
    )

    return jsonify({
        "items": rows,
    }), 200

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/time",
    methods=["POST"],
)
@require_auth
def project_time_create_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    data = _payload()
    data["created_by"] = _current_user_id(user)

    try:
        entry_id = db_service.create_project_time_entry(
            company_id,
            project_id,
            data,
        )

        return jsonify({
            "ok": True,
            "id": entry_id,
        }), 201

    except ValueError as e:
        return jsonify({
            "error": str(e),
        }), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/time/<int:entry_id>",
    methods=["PATCH"],
)
@require_auth
def project_time_update_route(
    cid: int,
    project_id: int,
    entry_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    try:
        ok = db_service.update_project_time_entry(
            company_id,
            project_id,
            entry_id,
            _payload(),
        )

        if not ok:
            return jsonify({
                "error": "time_entry_not_found",
            }), 404

        return jsonify({
            "ok": True,
        }), 200

    except ValueError as e:
        return jsonify({
            "error": str(e),
        }), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/time/<int:entry_id>/<action>",
    methods=["POST"],
)
@require_auth
def project_time_action_route(
    cid: int,
    project_id: int,
    entry_id: int,
    action: str,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    data = _payload()

    try:
        ok = db_service.set_project_time_status(
            company_id,
            project_id,
            entry_id,
            action=action,
            user_id=_current_user_id(user),
            reason=data.get("reason"),
        )

        if not ok:
            return jsonify({
                "error": "time_entry_not_found",
            }), 404

        return jsonify({
            "ok": True,
        }), 200

    except ValueError as e:
        return jsonify({
            "error": str(e),
        }), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/expenses",
    methods=["GET"],
)
@require_auth
def project_expenses_list_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    rows = db_service.list_project_expenses(
        company_id,
        project_id,
    )

    return jsonify({
        "items": rows,
    }), 200

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/expenses",
    methods=["POST"],
)
@require_auth
def project_expense_create_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    data = _payload()
    data["created_by"] = _current_user_id(user)

    try:
        expense_id = db_service.create_project_expense(
            company_id,
            project_id,
            data,
        )

        return jsonify({
            "ok": True,
            "id": expense_id,
        }), 201

    except ValueError as e:
        return jsonify({
            "error": str(e),
        }), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/expenses/<int:expense_id>/approve",
    methods=["POST"],
)
@require_auth
def project_expense_approve_route(
    cid: int,
    project_id: int,
    expense_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    ok = db_service.approve_project_expense(
        company_id,
        project_id,
        expense_id,
        _current_user_id(user),
    )

    if not ok:
        return jsonify({
            "error": "expense_not_found_or_not_draft",
        }), 404

    return jsonify({
        "ok": True,
    }), 200

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/commitments",
    methods=["GET"],
)
@require_auth
def project_commitments_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    rows = db_service.list_project_commitments(
        company_id,
        project_id,
    )

    return jsonify({
        "items": rows,
    }), 200

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/changes",
    methods=["GET"],
)
@require_auth
def project_changes_list_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    rows = db_service.list_project_changes(
        company_id,
        project_id,
    )

    return jsonify({
        "items": rows,
    }), 200

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/changes",
    methods=["POST"],
)
@require_auth
def project_change_create_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    data = _payload()
    data["requested_by"] = (
        _current_user_id(user)
    )

    try:
        change_id = db_service.create_project_change(
            company_id,
            project_id,
            data,
        )

        return jsonify({
            "ok": True,
            "id": change_id,
        }), 201

    except ValueError as e:
        return jsonify({
            "error": str(e),
        }), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/changes/<int:change_id>/<action>",
    methods=["POST"],
)
@require_auth
def project_change_action_route(
    cid: int,
    project_id: int,
    change_id: int,
    action: str,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    data = _payload()
    user_id = _current_user_id(user)

    try:
        if action == "apply":
            ok = db_service.apply_project_change(
                company_id,
                project_id,
                change_id,
                user_id,
            )
        else:
            ok = db_service.set_project_change_status(
                company_id,
                project_id,
                change_id,
                action=action,
                user_id=user_id,
                reason=data.get("reason"),
            )

        if not ok:
            return jsonify({
                "error": "change_not_found",
            }), 404

        return jsonify({
            "ok": True,
        }), 200

    except ValueError as e:
        return jsonify({
            "error": str(e),
        }), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/risks",
    methods=["GET", "POST"],
)
@require_auth
def project_risks_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    if request.method == "GET":
        rows = db_service.list_project_risks(
            company_id,
            project_id,
        )

        return jsonify({
            "items": rows,
        }), 200

    data = _payload()
    data["created_by"] = _current_user_id(user)

    try:
        risk_id = db_service.create_project_risk(
            company_id,
            project_id,
            data,
        )

        return jsonify({
            "ok": True,
            "id": risk_id,
        }), 201

    except ValueError as e:
        return jsonify({
            "error": str(e),
        }), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/risks/<int:risk_id>",
    methods=["PATCH"],
)
@require_auth
def project_risk_update_route(
    cid: int,
    project_id: int,
    risk_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    ok = db_service.update_project_risk(
        company_id,
        project_id,
        risk_id,
        _payload(),
    )

    if not ok:
        return jsonify({
            "error": "risk_not_found",
        }), 404

    return jsonify({
        "ok": True,
    }), 200

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/issues",
    methods=["GET", "POST"],
)
@require_auth
def project_issues_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    if request.method == "GET":
        rows = db_service.list_project_issues(
            company_id,
            project_id,
        )

        return jsonify({
            "items": rows,
        }), 200

    data = _payload()
    data["created_by"] = _current_user_id(user)

    try:
        issue_id = db_service.create_project_issue(
            company_id,
            project_id,
            data,
        )

        return jsonify({
            "ok": True,
            "id": issue_id,
        }), 201

    except ValueError as e:
        return jsonify({
            "error": str(e),
        }), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/issues/<int:issue_id>",
    methods=["PATCH"],
)
@require_auth
def project_issue_update_route(
    cid: int,
    project_id: int,
    issue_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    ok = db_service.update_project_issue(
        company_id,
        project_id,
        issue_id,
        _payload(),
    )

    if not ok:
        return jsonify({
            "error": "issue_not_found",
        }), 404

    return jsonify({
        "ok": True,
    }), 200

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/documents",
    methods=["GET", "POST"],
)
@require_auth
def project_documents_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    if request.method == "GET":
        rows = db_service.list_project_documents(
            company_id,
            project_id,
        )

        return jsonify({
            "items": rows,
        }), 200

    data = _payload()
    data["uploaded_by"] = _current_user_id(user)

    try:
        document_id = db_service.create_project_document(
            company_id,
            project_id,
            data,
        )

        return jsonify({
            "ok": True,
            "id": document_id,
        }), 201

    except ValueError as e:
        return jsonify({
            "error": str(e),
        }), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/activity",
    methods=["GET"],
)
@require_auth
def project_activity_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    rows = db_service.list_project_activity(
        company_id,
        project_id,
        limit=int(
            request.args.get("limit") or 100
        ),
    )

    return jsonify({
        "items": rows,
    }), 200

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/revenue",
    methods=["GET"],
)
@require_auth
def project_revenue_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(
        company_id
    )
    if err:
        return err

    project = db_service.get_project(
        company_id,
        project_id,
    )

    if not project:
        return jsonify({
            "error": "project_not_found",
        }), 404

    return jsonify({
        "contracts":
            project.get(
                "revenue_contracts"
            ) or [],

        "obligations":
            project.get(
                "revenue_obligations"
            ) or [],

        "summary":
            project.get(
                "revenue_summary"
            ) or {},
    }), 200

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/performance",
    methods=["GET"],
)
@require_auth
def project_performance_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        data = db_service.get_project_performance(company_id, project_id)
        return jsonify({"data": data}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/forecasts",
    methods=["GET", "POST"],
)
@require_auth
def project_forecasts_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    if request.method == "GET":
        rows = db_service.list_project_forecasts(company_id, project_id)
        return jsonify({"items": rows}), 200

    data = _payload()
    data["created_by"] = _current_user_id(user)

    try:
        forecast_id = db_service.create_project_forecast(
            company_id,
            project_id,
            data,
        )

        return jsonify({
            "ok": True,
            "id": forecast_id,
        }), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/capitalisations",
    methods=["GET", "POST"],
)
@require_auth
def project_capitalisations_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    if request.method == "GET":
        rows = db_service.list_project_capitalisations(company_id, project_id)
        return jsonify({"items": rows}), 200

    data = _payload()
    data["requested_by"] = _current_user_id(user)

    try:
        capitalisation_id = db_service.create_project_capitalisation(
            company_id,
            project_id,
            data,
        )

        return jsonify({
            "ok": True,
            "id": capitalisation_id,
        }), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/capitalisations/<int:capitalisation_id>/<action>",
    methods=["POST"],
)
@require_auth
def project_capitalisation_action_route(
    cid: int,
    project_id: int,
    capitalisation_id: int,
    action: str,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        ok = db_service.set_project_capitalisation_status(
            company_id,
            project_id,
            capitalisation_id,
            action=action,
            user_id=_current_user_id(user),
        )

        if not ok:
            return jsonify({"error": "capitalisation_not_found"}), 404

        return jsonify({"ok": True}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/internal-summary",
    methods=["GET"],
)
@require_auth
def project_internal_summary_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        data = db_service.get_internal_project_summary(company_id, project_id)
        return jsonify({"data": data}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/assets",
    methods=["GET", "POST"],
)
@require_auth
def project_assets_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    if request.method == "GET":
        rows = db_service.list_project_asset_links(company_id, project_id)
        return jsonify({"items": rows}), 200

    data = _payload()

    try:
        link_id = db_service.link_project_asset(
            company_id,
            project_id,
            int(data.get("asset_id") or 0),
            {
                **data,
                "linked_by": _current_user_id(user),
            },
        )

        return jsonify({
            "ok": True,
            "id": link_id,
        }), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/<int:project_id>/capital-position",
    methods=["GET"],
)
@require_auth
def project_capital_position_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        data = db_service.get_project_capital_position(company_id, project_id)
        return jsonify({"data": data}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.get(
    "/api/companies/<int:cid>/projects/"
    "<int:project_id>/borrowing-options"
)
@require_auth
def project_borrowing_options(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        rows = db_service.list_project_borrowing_options(
            company_id,
            project_id,
        )

        return jsonify({"items": rows}), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.route(
    "/api/companies/<int:cid>/projects/"
    "<int:project_id>/borrowing-links",
    methods=["GET", "POST"],
)
@require_auth
def project_borrowing_links(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    if request.method == "GET":
        rows = db_service.list_project_borrowing_links(
            company_id,
            project_id,
        )

        return jsonify({"items": rows}), 200

    try:
        link_id = db_service.save_project_borrowing_link(
            company_id,
            project_id,
            _payload(),
        )

        return jsonify({
            "ok": True,
            "id": link_id,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.post(
    "/api/companies/<int:cid>/projects/"
    "<int:project_id>/borrowing-links/"
    "<int:link_id>/stop"
)
@require_auth
def project_borrowing_link_stop(
    cid: int,
    project_id: int,
    link_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        data = _payload()

        db_service.stop_project_borrowing_link(
            company_id,
            project_id,
            link_id,
            data.get("end_date"),
        )

        return jsonify({"ok": True}), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.get(
    "/api/companies/<int:cid>/projects/"
    "<int:project_id>/closeout-assessment"
)
@require_auth
def project_closeout_assessment_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        data = db_service.get_project_closeout_assessment(
            company_id,
            project_id,
        )

        return jsonify({"data": data}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.post(
    "/api/companies/<int:cid>/projects/"
    "<int:project_id>/commissioning-complete"
)
@require_auth
def project_commissioning_complete_route(
    cid: int,
    project_id: int,
):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        db_service.record_project_commissioning(
            company_id,
            project_id,
            _payload(),
        )

        return jsonify({"ok": True}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.post(
    "/api/companies/<int:cid>/projects/"
    "<int:project_id>/close"
)
@require_auth
def project_close_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        db_service.close_project(
            company_id,
            project_id,
            _payload(),
            _current_user_id(user),
        )

        return jsonify({"ok": True}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@projects_bp.post(
    "/api/companies/<int:cid>/projects/"
    "<int:project_id>/reopen"
)
@require_auth
def project_reopen_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    data = _payload()

    try:
        db_service.reopen_project(
            company_id,
            project_id,
            data.get("reason"),
            _current_user_id(user),
        )

        return jsonify({"ok": True}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
# ============================================================
# PROJECT TASKS
# ============================================================

@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>/tasks", methods=["GET"])
@require_auth
def list_project_tasks_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    rows = db_service.list_project_tasks(company_id, int(project_id))

    return jsonify({
        "items": rows,
    }), 200


@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>/tasks", methods=["POST"])
@require_auth
def create_project_task_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    data = _payload()
    data["project_id"] = int(project_id)

    try:
        task_id = db_service.create_project_task(company_id, data)

        return jsonify({
            "ok": True,
            "id": task_id,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "[PROJECT TASK CREATE] FAILED | company_id=%s | project_id=%s",
            company_id,
            project_id,
        )
        return jsonify({
            "error": "failed_to_create_project_task",
            "details": str(e),
        }), 500

@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>/tasks/<int:task_id>", methods=["PATCH"])
@require_auth
def update_project_task_route(cid: int, project_id: int, task_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    data = _payload()
    data["project_id"] = int(project_id)

    try:
        ok = db_service.update_project_task(company_id, int(project_id), int(task_id), data)

        if not ok:
            return jsonify({"error": "project_task_not_found_or_no_changes"}), 404

        return jsonify({
            "ok": True,
            "id": int(task_id),
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception:
        current_app.logger.exception(
            "[PROJECT TASK UPDATE] FAILED | company_id=%s | project_id=%s | task_id=%s",
            company_id,
            project_id,
            task_id,
        )
        return jsonify({
            "error": "failed_to_update_project_task",
        }), 500
    
# ============================================================
# PROJECT COST CODES
# ============================================================

@projects_bp.route("/api/companies/<int:cid>/projects/cost-codes", methods=["GET"])
@require_auth
def list_project_cost_codes_route(cid: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    active_raw = request.args.get("active", "1")

    if str(active_raw).lower() in ("all", ""):
        active = None
    else:
        active = str(active_raw).lower() not in ("0", "false", "no", "inactive")

    rows = db_service.list_project_cost_codes(company_id, active=active)

    return jsonify({
        "items": rows,
    }), 200


@projects_bp.route("/api/companies/<int:cid>/projects/cost-codes", methods=["POST"])
@require_auth
def create_project_cost_code_route(cid: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    try:
        cost_code_id = db_service.create_project_cost_code(company_id, _payload())

        return jsonify({
            "ok": True,
            "id": cost_code_id,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception("[PROJECT COST CODE CREATE] FAILED | company_id=%s", company_id)
        return jsonify({
            "error": "failed_to_create_project_cost_code",
            "details": str(e),
        }), 500


# ============================================================
# PROJECT BUDGET LINES
# ============================================================

@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>/budget-lines", methods=["GET"])
@require_auth
def list_project_budget_lines_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    rows = db_service.list_project_budget_lines(company_id, int(project_id))

    return jsonify({
        "items": rows,
    }), 200


@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>/budget-lines", methods=["POST"])
@require_auth
def create_project_budget_line_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    data = _payload()
    data["project_id"] = int(project_id)

    try:
        line_id = db_service.create_project_budget_line(company_id, data)

        return jsonify({
            "ok": True,
            "id": line_id,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "[PROJECT BUDGET LINE CREATE] FAILED | company_id=%s | project_id=%s",
            company_id,
            project_id,
        )
        return jsonify({
            "error": "failed_to_create_project_budget_line",
            "details": str(e),
        }), 500

@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>/budget-lines/<int:line_id>", methods=["PATCH"])
@require_auth
def update_project_budget_line_route(cid: int, project_id: int, line_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    data = _payload()
    data["project_id"] = int(project_id)

    try:
        ok = db_service.update_project_budget_line(company_id, int(project_id), int(line_id), data)

        if not ok:
            return jsonify({"error": "project_budget_line_not_found_or_no_changes"}), 404

        return jsonify({
            "ok": True,
            "id": int(line_id),
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception:
        current_app.logger.exception(
            "[PROJECT BUDGET LINE UPDATE] FAILED | company_id=%s | project_id=%s | line_id=%s",
            company_id,
            project_id,
            line_id,
        )
        return jsonify({
            "error": "failed_to_update_project_budget_line",
        }), 500

@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>/tasks/<int:task_id>/archive", methods=["PATCH"])
@require_auth
def archive_project_task_route(cid: int, project_id: int, task_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    ok = db_service.archive_project_task(company_id, int(project_id), int(task_id))

    if not ok:
        return jsonify({"error": "project_task_not_found"}), 404

    return jsonify({"ok": True, "id": int(task_id)}), 200

@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>/budget-lines/<int:line_id>/archive", methods=["PATCH"])
@require_auth
def archive_project_budget_line_route(cid: int, project_id: int, line_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    ok = db_service.archive_project_budget_line(company_id, int(project_id), int(line_id))

    if not ok:
        return jsonify({"error": "project_budget_line_not_found"}), 404

    return jsonify({"ok": True, "id": int(line_id)}), 200

# ============================================================
# PROJECT MATERIAL ISSUE
# ============================================================

@projects_bp.route("/api/companies/<int:cid>/projects/<int:project_id>/issue-materials", methods=["POST"])
@require_auth
def issue_materials_to_project_route(cid: int, project_id: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    data = _payload()

    try:
        out = db_service.issue_inventory_to_project(
            company_id,
            project_id=int(project_id),
            tx_date=data.get("tx_date") or data.get("date"),
            lines=data.get("lines") or [],
            task_id=data.get("task_id") or data.get("taskId"),
            cost_code_id=data.get("cost_code_id") or data.get("costCodeId"),
            usage_type=data.get("usage_type") or data.get("usageType") or "consumed",
            ref=data.get("ref"),
            notes=data.get("notes"),
            created_by=_current_user_id(user),
            post_now=bool(data.get("post_now", True)),
        )

        return jsonify(out), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "[PROJECT ISSUE MATERIALS] FAILED | company_id=%s | project_id=%s",
            company_id,
            project_id,
        )
        return jsonify({
            "error": "failed_to_issue_materials_to_project",
            "details": str(e),
        }), 500
    
@projects_bp.route("/api/companies/<int:cid>/projects/budget-lines", methods=["GET"])
@require_auth
def list_all_project_budget_lines_route(cid: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    project_id = request.args.get("project_id", type=int)
    q = (request.args.get("q") or "").strip()
    limit = int(request.args.get("limit") or 100)
    offset = int(request.args.get("offset") or 0)

    rows = db_service.list_project_budget_lines_all(
        company_id,
        project_id=project_id,
        q=q,
        limit=limit,
        offset=offset,
    )

    return jsonify({
        "items": rows,
        "limit": limit,
        "offset": offset,
    }), 200

@projects_bp.route("/api/companies/<int:cid>/projects/material-issues", methods=["GET"])
@require_auth
def list_project_material_issues_route(cid: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    project_id = request.args.get("project_id", type=int)
    q = (request.args.get("q") or "").strip()
    date_from = request.args.get("from") or request.args.get("date_from")
    date_to = request.args.get("to") or request.args.get("date_to")

    limit = int(request.args.get("limit") or 100)
    offset = int(request.args.get("offset") or 0)

    rows = db_service.list_project_material_issues(
        company_id,
        project_id=project_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )

    return jsonify({
        "items": rows,
        "limit": limit,
        "offset": offset,
    }), 200

@projects_bp.route("/api/companies/<int:cid>/projects/profitability", methods=["GET"])
@require_auth
def project_profitability_route(cid: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    project_id = request.args.get("project_id", type=int)
    limit = int(request.args.get("limit") or 100)

    rows = db_service.get_project_profitability(
        company_id,
        project_id=project_id,
        limit=limit,
    )

    return jsonify({
        "items": rows,
    }), 200

@projects_bp.route("/api/companies/<int:cid>/inventory/items-lite", methods=["GET"])
@require_auth
def inventory_items_lite_route(cid: int):
    company_id = int(cid)

    user, err = _company_auth_or_403(company_id)
    if err:
        return err

    rows = db_service.fetch_all(
        f"""
        SELECT
            id,
            sku,
            name,
            inventory_account,
            valuation_method,
            on_hand_qty
        FROM {db_service.company_schema(company_id)}.inventory_items
        WHERE company_id = %s
        AND is_active = TRUE
        ORDER BY name ASC
        """,
        (company_id,),
    ) or []

    return jsonify({
        "items": rows,
    }), 200