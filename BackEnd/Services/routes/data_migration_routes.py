from datetime import date, datetime
import hashlib
import os
import re
import uuid
from pathlib import Path
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

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/scope",
    methods=["GET", "PUT", "OPTIONS"],
)
@require_auth
def migration_project_scope(
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
            scope = db_service.migration_scope_get(
                company_id,
                project_id,
            )

            return jsonify({
                "ok": True,
                "scope": _json_safe(scope),
            }), 200

        except ValueError as error:
            return jsonify({
                "ok": False,
                "error": str(error),
            }), 404

        except Exception as error:
            return _error(
                "Migration scope retrieval failed",
                error,
                status=500,
            )

    try:
        body = _body()
        entities = body.get("entities")

        if not isinstance(entities, list):
            return jsonify({
                "ok": False,
                "error": "entities must be a list",
            }), 400

        user_id = _user_id()

        with db_service._conn_cursor() as (conn, cur):
            try:
                scope = db_service.migration_scope_save(
                    company_id,
                    project_id,
                    entities,
                    user_id=user_id,
                    cur=cur,
                )

                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok": True,
            "scope": _json_safe(scope),
        }), 200

    except ValueError as error:
        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400

    except Exception as error:
        return _error(
            "Migration scope update failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/files",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def migration_project_files(
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
            rows = db_service.migration_files_list(
                company_id,
                project_id,
            )

            return jsonify({
                "ok": True,
                "files": _json_safe(rows),
            }), 200

        except ValueError as error:
            return jsonify({
                "ok": False,
                "error": str(error),
            }), 404

        except Exception as error:
            return _error(
                "Migration source file list failed",
                error,
                status=500,
            )

    uploaded_files = request.files.getlist(
        "files"
    )

    if not uploaded_files:
        single = request.files.get(
            "file"
        )

        if single:
            uploaded_files = [single]

    if not uploaded_files:
        return jsonify({
            "ok": False,
            "error": "No migration files were supplied.",
        }), 400

    allowed_extensions = {
        "csv",
        "xlsx",
        "xls",
        "json",
        "xml",
        "sql",
        "txt",
    }

    max_file_size = int(
        current_app.config.get(
            "MIGRATION_MAX_FILE_SIZE",
            50 * 1024 * 1024,
        )
    )

    user_id = _user_id()
    saved_paths: list[str] = []
    results: list[dict] = []

    try:
        upload_dir = (
            db_service.migration_project_upload_dir(
                company_id,
                project_id,
            )
        )

        with db_service._conn_cursor() as (conn, cur):
            try:
                for uploaded in uploaded_files:
                    original_name = (
                        uploaded.filename
                        or ""
                    ).strip()

                    if not original_name:
                        raise ValueError(
                            "One uploaded file has no filename."
                        )

                    extension = (
                        db_service.migration_file_extension(
                            original_name
                        )
                    )

                    if extension not in allowed_extensions:
                        raise ValueError(
                            f"Unsupported file type: "
                            f"{original_name}"
                        )

                    safe_name = (
                        db_service.migration_safe_filename(
                            original_name
                        )
                    )

                    stored_name = (
                        f"{uuid.uuid4().hex}_"
                        f"{safe_name}"
                    )

                    storage_path = (
                        upload_dir
                        / stored_name
                    )

                    uploaded.save(
                        str(storage_path)
                    )

                    saved_paths.append(
                        str(storage_path)
                    )

                    size_bytes = (
                        storage_path.stat().st_size
                    )

                    if size_bytes <= 0:
                        raise ValueError(
                            f"{original_name} is empty."
                        )

                    if size_bytes > max_file_size:
                        raise ValueError(
                            f"{original_name} exceeds the "
                            f"{max_file_size // (1024 * 1024)} MB limit."
                        )

                    sha256_hash = (
                        db_service.migration_file_sha256(
                            storage_path
                        )
                    )

                    row = (
                        db_service.migration_source_file_create(
                            company_id,
                            project_id,
                            original_name=original_name,
                            stored_name=stored_name,
                            storage_path=str(
                                storage_path
                            ),
                            mime_type=(
                                uploaded.mimetype
                                or None
                            ),
                            size_bytes=size_bytes,
                            sha256_hash=sha256_hash,
                            user_id=user_id,
                            cur=cur,
                        )
                    )

                    results.append(row)

                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok": True,
            "files": _json_safe(results),
        }), 201

    except ValueError as error:
        for path in saved_paths:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                current_app.logger.exception(
                    "Could not clean failed "
                    "migration upload"
                )

        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400

    except Exception as error:
        for path in saved_paths:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                current_app.logger.exception(
                    "Could not clean failed "
                    "migration upload"
                )

        return _error(
            "Migration source file upload failed",
            error,
            status=500,
        )   

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/files/<int:file_id>",
    methods=["GET", "DELETE", "OPTIONS"],
)
@require_auth
def migration_project_file(
    company_id: int,
    project_id: int,
    file_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    if request.method == "GET":
        try:
            row = db_service.migration_source_file_get(
                company_id,
                project_id,
                file_id,
            )

            if not row:
                return jsonify({
                    "ok": False,
                    "error": "Migration source file not found.",
                }), 404

            return jsonify({
                "ok": True,
                "file": _json_safe(row),
            }), 200

        except Exception as error:
            return _error(
                "Migration source file retrieval failed",
                error,
                status=500,
            )

    try:
        user_id = _user_id()

        with db_service._conn_cursor() as (conn, cur):
            try:
                result = (
                    db_service.migration_source_file_remove(
                        company_id,
                        project_id,
                        file_id,
                        user_id=user_id,
                        cur=cur,
                    )
                )

                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok": True,
            "result": _json_safe(result),
        }), 200

    except ValueError as error:
        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400

    except Exception as error:
        return _error(
            "Migration source file removal failed",
            error,
            status=500,
        )   

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets",
    methods=["GET", "OPTIONS"],
)
@require_auth
def migration_project_datasets(
    company_id: int,
    project_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        rows = db_service.migration_datasets_list(
            company_id,
            project_id,
        )

        return jsonify({
            "ok": True,
            "datasets": _json_safe(rows),
        }), 200

    except Exception as error:
        return _error(
            "Migration dataset list failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def migration_project_dataset(
    company_id: int,
    project_id: int,
    dataset_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        body = _body()
        user_id = _user_id()

        with db_service._conn_cursor() as (conn, cur):
            try:
                row = db_service.migration_dataset_update(
                    company_id,
                    project_id,
                    dataset_id,
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
            "dataset": _json_safe(row),
        }), 200

    except ValueError as error:
        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400

    except Exception as error:
        return _error(
            "Migration dataset update failed",
            error,
            status=500,
        )

@data_migration_bp.route("/api/companies/<int:company_id>/migrations/projects/<int:project_id>/detection",methods=["GET","POST","OPTIONS"])
@require_auth
def migration_detection(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        if request.method=="GET":
            result=db_service.migration_detection_get(company_id,project_id)
            return jsonify({"ok":True,"detection":_json_safe(result)}),200
        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_detection_run(company_id,project_id,user_id=_user_id(),cur=cur)
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return jsonify({"ok":True,"detection":_json_safe(result)}),200
    except ValueError as error:return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:return _error("Migration detection failed",error,status=500)
    