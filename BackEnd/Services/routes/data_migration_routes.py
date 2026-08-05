from datetime import date, datetime

from flask import (
    Blueprint,
    current_app,
    g,
    jsonify,
    make_response,
    request,
)

from BackEnd.Services.auth_middleware import (
    _corsify,
    require_auth,
)

from BackEnd.Services.db_service import db_service

from BackEnd.Services.routes.invoice_routes import (
    _deny_if_wrong_company,
)


data_migration_bp = Blueprint(
    "data_migration",
    __name__,
)


def _options():
    return _corsify(
        make_response(
            "",
            204,
        )
    )


def _body() -> dict:
    value = request.get_json(
        silent=True,
    )

    if value is None:
        return {}

    if not isinstance(value, dict):
        raise ValueError(
            "JSON body must be an object."
        )

    return value


def _user_id() -> int | None:
    payload = getattr(
        request,
        "jwt_payload",
        {},
    ) or {}

    user = getattr(
        g,
        "current_user",
        {},
    ) or {}

    value = (
        payload.get("user_id")
        or payload.get("sub")
        or user.get("id")
    )

    try:
        return int(value) if value is not None else None
    except Exception:
        return None


def _guard(company_id: int):
    payload = getattr(
        request,
        "jwt_payload",
        {},
    ) or {}

    return _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )


def _json_safe(value):
    if isinstance(value, dict):
        return {
            key: _json_safe(item)
            for key, item in value.items()
        }

    if isinstance(value, list):
        return [
            _json_safe(item)
            for item in value
        ]

    if isinstance(value, tuple):
        return [
            _json_safe(item)
            for item in value
        ]

    if isinstance(value, (date, datetime)):
        return value.isoformat()

    return value


def _error(
    message: str,
    error: Exception,
    *,
    status: int = 400,
):
    current_app.logger.exception(
        "%s",
        message,
    )

    return jsonify({
        "ok": False,
        "error": message,
        "detail": str(error),
    }), status


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def migration_projects(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    db_service.ensure_company_schema(
        company_id,
    )

    if request.method == "GET":
        status = (
            request.args.get("status")
            or ""
        ).strip()

        search = (
            request.args.get("search")
            or ""
        ).strip()

        try:
            limit = int(
                request.args.get("limit")
                or 200
            )
        except Exception:
            limit = 200

        try:
            rows = db_service.migration_projects_list(
                company_id,
                status=status or None,
                search=search or None,
                limit=limit,
            )

            return jsonify({
                "ok": True,
                "projects": _json_safe(rows),
            }), 200

        except Exception as error:
            return _error(
                "Migration project list failed",
                error,
                status=500,
            )

    try:
        body = _body()
        user_id = _user_id()

        with db_service._conn_cursor() as (conn, cur):
            try:
                project = db_service.migration_project_create(
                    company_id,
                    body,
                    user_id=user_id,
                    cur=cur,
                )

                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok": True,
            "project": _json_safe(project),
        }), 201

    except ValueError as error:
        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400

    except Exception as error:
        return _error(
            "Migration project creation failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>",
    methods=["GET", "PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def migration_project(
    company_id: int,
    project_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    db_service.ensure_company_schema(
        company_id,
    )

    if request.method == "GET":
        try:
            project = db_service.migration_project_get(
                company_id,
                project_id,
            )

            if not project:
                return jsonify({
                    "ok": False,
                    "error": "Migration project not found",
                }), 404

            return jsonify({
                "ok": True,
                "project": _json_safe(project),
            }), 200

        except Exception as error:
            return _error(
                "Migration project retrieval failed",
                error,
                status=500,
            )

    if request.method == "DELETE":
        try:
            body = _body()
            user_id = _user_id()

            with db_service._conn_cursor() as (conn, cur):
                try:
                    project = db_service.migration_project_cancel(
                        company_id,
                        project_id,
                        reason=body.get("reason"),
                        user_id=user_id,
                        cur=cur,
                    )

                    conn.commit()

                except Exception:
                    conn.rollback()
                    raise

            return jsonify({
                "ok": True,
                "project": _json_safe(project),
            }), 200

        except ValueError as error:
            return jsonify({
                "ok": False,
                "error": str(error),
            }), 409

        except Exception as error:
            return _error(
                "Migration project cancellation failed",
                error,
                status=500,
            )

    try:
        body = _body()
        user_id = _user_id()

        with db_service._conn_cursor() as (conn, cur):
            try:
                project = db_service.migration_project_update(
                    company_id,
                    project_id,
                    body,
                    user_id=user_id,
                    cur=cur,
                )

                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok": True,
            "project": _json_safe(project),
        }), 200

    except ValueError as error:
        return jsonify({
            "ok": False,
            "error": str(error),
        }), 409

    except Exception as error:
        return _error(
            "Migration project update failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/status",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def migration_project_status(
    company_id: int,
    project_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        body = _body()
        new_status = str(
            body.get("status")
            or ""
        ).strip().lower()

        if not new_status:
            return jsonify({
                "ok": False,
                "error": "status is required",
            }), 400

        user_id = _user_id()

        with db_service._conn_cursor() as (conn, cur):
            try:
                project = db_service.migration_project_status_set(
                    company_id,
                    project_id,
                    new_status,
                    reason=body.get("reason"),
                    details=body.get("details"),
                    user_id=user_id,
                    cur=cur,
                )

                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok": True,
            "project": _json_safe(project),
        }), 200

    except ValueError as error:
        return jsonify({
            "ok": False,
            "error": str(error),
        }), 409

    except Exception as error:
        return _error(
            "Migration project status update failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/source",
    methods=["GET", "PUT", "OPTIONS"],
)
@require_auth
def migration_project_source(
    company_id: int,
    project_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    if request.method == "GET":
        try:
            source = db_service.migration_project_source_get(
                company_id,
                project_id,
            )

            if not source:
                return jsonify({
                    "ok": True,
                    "source": None,
                }), 200

            return jsonify({
                "ok": True,
                "source": _json_safe(source),
            }), 200

        except Exception as error:
            return _error(
                "Migration source retrieval failed",
                error,
                status=500,
            )

    try:
        body = _body()
        user_id = _user_id()

        with db_service._conn_cursor() as (conn, cur):
            try:
                source = db_service.migration_project_source_save(
                    company_id,
                    project_id,
                    body,
                    user_id=user_id,
                    cur=cur,
                )

                project = db_service.migration_project_get(
                    company_id,
                    project_id,
                    cur=cur,
                )

                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok": True,
            "source": _json_safe(source),
            "project": _json_safe(project),
        }), 200

    except ValueError as error:
        return jsonify({
            "ok": False,
            "error": str(error),
        }), 409

    except Exception as error:
        return _error(
            "Migration source update failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/source-profiles",
    methods=["GET", "OPTIONS"],
)
@require_auth
def migration_source_profiles(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    include_inactive = str(
        request.args.get("include_inactive")
        or ""
    ).strip().lower() in {
        "1",
        "true",
        "yes",
    }

    try:
        profiles = db_service.migration_source_profiles_list(
            company_id,
            include_inactive=include_inactive,
        )

        return jsonify({
            "ok": True,
            "profiles": _json_safe(profiles),
        }), 200

    except Exception as error:
        return _error(
            "Migration source profile list failed",
            error,
            status=500,
        )