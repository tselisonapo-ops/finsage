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
    customer_id = request.args.get("customer_id", type=int)

    limit = int(request.args.get("limit") or 50)
    offset = int(request.args.get("offset") or 0)

    rows = db_service.list_projects(
        company_id,
        q=q,
        status=status,
        customer_id=customer_id,
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