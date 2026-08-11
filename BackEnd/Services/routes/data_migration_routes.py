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

@data_migration_bp.route("/api/companies/<int:company_id>/migrations/projects/<int:project_id>/field-mappings",methods=["GET","OPTIONS"])
@require_auth
def migration_field_mappings(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_field_mappings_get(company_id,project_id)
        return jsonify({"ok":True,"field_mappings":_json_safe(result)}),200
    except ValueError as error:return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:return _error("Migration field mapping retrieval failed",error,status=500)


@data_migration_bp.route("/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/field-mappings",methods=["PUT","OPTIONS"])
@require_auth
def migration_dataset_field_mappings(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny

    try:
        body=_body()
        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_field_mapping_save(
                    company_id,project_id,dataset_id,body.get("mappings") or [],
                    user_id=_user_id(),cur=cur
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return jsonify({"ok":True,"dataset":_json_safe(result)}),200
    except ValueError as error:return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:return _error("Migration field mapping save failed",error,status=500)


@data_migration_bp.route("/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/field-mappings/auto",methods=["POST","OPTIONS"])
@require_auth
def migration_dataset_field_mapping_auto(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny

    try:
        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_field_mapping_auto(company_id,project_id,dataset_id,user_id=_user_id(),cur=cur)
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return jsonify({"ok":True,"dataset":_json_safe(result)}),200
    except ValueError as error:return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:return _error("Automatic field mapping failed",error,status=500)


@data_migration_bp.route("/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/field-mappings/reset",methods=["DELETE","OPTIONS"])
@require_auth
def migration_dataset_field_mapping_reset(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny

    try:
        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_field_mapping_reset(company_id,project_id,dataset_id,cur=cur)
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return jsonify({"ok":True,"dataset":_json_safe(result)}),200
    except Exception as error:return _error("Field mapping reset failed",error,status=500)


@data_migration_bp.route("/api/companies/<int:company_id>/migrations/projects/<int:project_id>/field-mappings/copy",methods=["POST","OPTIONS"])
@require_auth
def migration_field_mapping_copy(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny

    try:
        body=_body()
        source_id=int(body.get("source_dataset_id") or 0)
        target_id=int(body.get("target_dataset_id") or 0)
        if not source_id or not target_id:return jsonify({"ok":False,"error":"source_dataset_id and target_dataset_id are required"}),400

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_field_mapping_copy(
                    company_id,project_id,source_id,target_id,user_id=_user_id(),cur=cur
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return jsonify({"ok":True,"dataset":_json_safe(result)}),200
    except ValueError as error:return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:return _error("Field mapping copy failed",error,status=500)


@data_migration_bp.route("/api/companies/<int:company_id>/migrations/projects/<int:project_id>/field-mappings/validate",methods=["POST","OPTIONS"])
@require_auth
def migration_field_mapping_validation(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_field_mapping_validate(company_id,project_id)
        return jsonify({"ok":True,"validation":_json_safe(result)}),200
    except Exception as error:return _error("Field mapping validation failed",error,status=500) 

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/reference-mappings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_reference_mappings(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            result=db_service.migration_reference_mapping_get(company_id,project_id)
            return jsonify({"ok":True,"reference_mappings":_json_safe(result)}),200

        body=_body()

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_reference_mapping_save(
                    company_id,
                    project_id,
                    body.get("mappings") or [],
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({"ok":True,"reference_mappings":_json_safe(result)}),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error("Migration reference mapping failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/reference-mappings/scan",
    methods=["POST","OPTIONS"],
)
@require_auth
def migration_reference_mapping_scan(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        with db_service._conn_cursor() as (conn,cur):
            try:
                scan=db_service.migration_reference_scan(
                    company_id,
                    project_id,
                    user_id=_user_id(),
                    cur=cur,
                )

                result=db_service.migration_reference_mapping_get(
                    company_id,
                    project_id,
                    cur=cur,
                )

                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "scan":_json_safe(scan),
            "reference_mappings":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error("Migration reference scan failed",error,status=500)
        
@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/reference-mappings/auto",
    methods=["POST","OPTIONS"],
)
@require_auth
def migration_reference_mapping_auto(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_reference_auto(
                    company_id,
                    project_id,
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "reference_mappings":_json_safe(result),
        }),200

    except Exception as error:
        return _error("Automatic reference mapping failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/reference-mappings/validate",
    methods=["POST","OPTIONS"],
)
@require_auth
def migration_reference_mapping_validation(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_reference_mapping_validate(
            company_id,
            project_id,
        )

        return jsonify({
            "ok":True,
            "validation":_json_safe(result),
        }),200

    except Exception as error:
        return _error("Reference mapping validation failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/reference-mappings/reset",
    methods=["DELETE","OPTIONS"],
)
@require_auth
def migration_reference_mapping_reset(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_reference_mapping_reset(
                    company_id,
                    project_id,
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "reference_mappings":_json_safe(result),
        }),200

    except Exception as error:
        return _error("Reference mapping reset failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/ppe",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_ppe(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        datasets=db_service.migration_ppe_datasets(company_id,project_id)

        return jsonify({
            "ok":True,
            "datasets":_json_safe(datasets),
        }),200

    except Exception as error:
        return _error("PPE migration retrieval failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/ppe/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_ppe_settings(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            result=db_service.migration_ppe_settings_get(
                company_id,project_id,dataset_id
            )
            return jsonify({"ok":True,"settings":_json_safe(result)}),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_ppe_settings_save(
                    company_id,project_id,dataset_id,_body(),
                    user_id=_user_id(),cur=cur
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({"ok":True,"settings":_json_safe(result)}),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:
        return _error("PPE migration settings failed",error,status=500)
    
@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/ppe/mapping",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_ppe_mapping(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_ppe_mapping_get(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "mapping":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:
        return _error("PPE migration mapping failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/ppe/classes",
    methods=["PUT","OPTIONS"],
)
@require_auth
def migration_ppe_class_mapping(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        body=_body()
        mappings=body.get("mappings") or []

        if not isinstance(mappings,list):
            return jsonify({"ok":False,"error":"mappings must be a list"}),400

        with db_service._conn_cursor() as (conn,cur):
            try:
                for mapping in mappings:
                    db_service.migration_ppe_class_save(
                        company_id,project_id,dataset_id,mapping,
                        user_id=_user_id(),cur=cur
                    )

                result=db_service.migration_ppe_mapping_get(
                    company_id,project_id,dataset_id,cur=cur
                )

                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "mapping":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:
        return _error("PPE class mapping failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/ppe/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_ppe_preview(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_ppe_payload_preview(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:
        return _error("PPE migration preview failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/leases",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_leases(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        rows=db_service.migration_lease_datasets(
            company_id,project_id
        )

        return jsonify({
            "ok":True,
            "datasets":_json_safe(rows),
        }),200

    except Exception as error:
        return _error(
            "Lease migration retrieval failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/leases/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_lease_settings(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            result=db_service.migration_lease_settings_get(
                company_id,project_id,dataset_id
            )

            return jsonify({
                "ok":True,
                "settings":_json_safe(result),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_lease_settings_save(
                    company_id,project_id,dataset_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:
        return _error("Lease migration settings failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/leases/mapping",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_lease_mapping(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_lease_mapping_get(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "mapping":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:
        return _error("Lease migration mapping failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/leases/references",
    methods=["PUT","OPTIONS"],
)
@require_auth
def migration_lease_references(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        body=_body()

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_lease_reference_save(
                    company_id,project_id,dataset_id,
                    body.get("mappings") or [],
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "references":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:
        return _error("Lease reference mapping failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/leases/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_lease_preview(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_lease_preview(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400
    except Exception as error:
        return _error("Lease migration preview failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/loans",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_loans(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        rows=db_service.migration_loan_datasets(
            company_id,project_id
        )

        return jsonify({
            "ok":True,
            "datasets":_json_safe(rows),
        }),200

    except Exception as error:
        return _error(
            "Loan migration retrieval failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/loans/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_loan_settings(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            result=db_service.migration_loan_settings_get(
                company_id,project_id,dataset_id
            )

            return jsonify({
                "ok":True,
                "settings":_json_safe(result),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_loan_settings_save(
                    company_id,project_id,dataset_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Loan migration settings failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/loans/mapping",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_loan_mapping(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_loan_mapping_get(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "mapping":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Loan migration mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/loans/references",
    methods=["PUT","OPTIONS"],
)
@require_auth
def migration_loan_references(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        body=_body()

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_loan_reference_save(
                    company_id,project_id,dataset_id,
                    body.get("mappings") or [],
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "references":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Loan reference mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/loans/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_loan_preview(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_loan_preview(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Loan migration preview failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/revenue/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_revenue_settings(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            result=db_service.migration_revenue_settings_get(
                company_id,project_id,dataset_id
            )

            return jsonify({
                "ok":True,
                "settings":_json_safe(result),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_revenue_settings_save(
                    company_id,
                    project_id,
                    dataset_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Revenue migration settings failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/revenue/mapping",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_revenue_mapping(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_revenue_mapping_get(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "mapping":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Revenue migration mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/revenue/references",
    methods=["PUT","OPTIONS"],
)
@require_auth
def migration_revenue_references(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        body=_body()

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_revenue_reference_save(
                    company_id,
                    project_id,
                    dataset_id,
                    body.get("mappings") or [],
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "references":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Revenue reference mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/revenue/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_revenue_preview(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_revenue_preview(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Revenue migration preview failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/accrual-deferrals",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_accrual_deferrals(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        rows=db_service.migration_accrual_datasets(
            company_id,project_id
        )

        return jsonify({
            "ok":True,
            "datasets":_json_safe(rows),
        }),200

    except Exception as error:
        return _error(
            "Accrual/deferral migration retrieval failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/accrual-deferrals/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_accrual_settings(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            result=db_service.migration_accrual_settings_get(
                company_id,project_id,dataset_id
            )

            return jsonify({
                "ok":True,
                "settings":_json_safe(result),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_accrual_settings_save(
                    company_id,
                    project_id,
                    dataset_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Accrual migration settings failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/accrual-deferrals/mapping",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_accrual_mapping(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_accrual_mapping_get(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "mapping":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Accrual migration mapping failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/accrual-deferrals/references",
    methods=["PUT","OPTIONS"],
)
@require_auth
def migration_accrual_references(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        body=_body()

        with db_service._conn_cursor() as (conn,cur):
            try:
                result=db_service.migration_accrual_reference_save(
                    company_id,
                    project_id,
                    dataset_id,
                    body.get("mappings") or [],
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "references":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Accrual reference mapping failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/accrual-deferrals/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_accrual_preview(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        result=db_service.migration_accrual_preview(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(result),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Accrual migration preview failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/payroll",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        datasets=db_service.migration_payroll_datasets(
            company_id,
            project_id,
        )

        return jsonify({
            "ok":True,
            "datasets":_json_safe(datasets),
        }),200

    except Exception as error:
        return _error(
            "Payroll migration retrieval failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_payroll_settings(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            settings=db_service.migration_payroll_settings_get(
                company_id,
                project_id,
                dataset_id,
            )

            return jsonify({
                "ok":True,
                "settings":_json_safe(settings),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                settings=db_service.migration_payroll_settings_save(
                    company_id,
                    project_id,
                    dataset_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(settings),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Payroll migration settings failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/mapping",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_mapping(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        mapping=db_service.migration_payroll_mapping_get(
            company_id,
            project_id,
            dataset_id,
        )

        return jsonify({
            "ok":True,
            "mapping":_json_safe(mapping),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Payroll migration mapping failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/references",
    methods=["PUT","OPTIONS"],
)
@require_auth
def migration_payroll_references(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        body=_body()

        with db_service._conn_cursor() as (conn,cur):
            try:
                references=db_service.migration_payroll_reference_save(
                    company_id,
                    project_id,
                    dataset_id,
                    body.get("mappings") or [],
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "references":_json_safe(references),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Payroll reference mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_preview(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        preview=db_service.migration_payroll_preview(
            company_id,
            project_id,
            dataset_id,
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(preview),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Payroll migration preview failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/payroll/items",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_items(
    company_id:int,
    project_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        datasets=db_service.migration_payroll_item_datasets(
            company_id,
            project_id,
        )

        return jsonify({
            "ok":True,
            "datasets":_json_safe(datasets),
        }),200

    except Exception as error:
        return _error(
            "Payroll item migration retrieval failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/items/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_payroll_item_settings(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            settings=db_service.migration_payroll_item_settings_get(
                company_id,
                project_id,
                dataset_id,
            )

            return jsonify({
                "ok":True,
                "settings":_json_safe(settings),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                settings=db_service.migration_payroll_item_settings_save(
                    company_id,
                    project_id,
                    dataset_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(settings),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Payroll item settings failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/items/mapping",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_payroll_item_mapping(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            mapping=db_service.migration_payroll_items_mapping_get(
                company_id,
                project_id,
                dataset_id,
            )

            return jsonify({
                "ok":True,
                "mapping":_json_safe(mapping),
            }),200

        body=_body()

        with db_service._conn_cursor() as (conn,cur):
            try:
                mapping=db_service.migration_payroll_item_mapping_save(
                    company_id,
                    project_id,
                    dataset_id,
                    body.get("mappings") or [],
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "mapping":_json_safe(mapping),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Payroll item mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/items/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_items_preview(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        preview=db_service.migration_payroll_items_preview(
            company_id,
            project_id,
            dataset_id,
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(preview),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Payroll item preview failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/payroll/leave-balances",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_leave_balances(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        datasets=db_service.migration_payroll_leave_datasets(
            company_id,project_id
        )

        return jsonify({
            "ok":True,
            "datasets":_json_safe(datasets),
        }),200

    except Exception as error:
        return _error(
            "Payroll leave migration retrieval failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/payroll/employee-loans",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_employee_loans(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        datasets=db_service.migration_payroll_loan_datasets(
            company_id,project_id
        )

        return jsonify({
            "ok":True,
            "datasets":_json_safe(datasets),
        }),200

    except Exception as error:
        return _error(
            "Employee loan migration retrieval failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/leave-balances/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_payroll_leave_settings(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            settings=db_service.migration_payroll_leave_settings_get(
                company_id,project_id,dataset_id
            )

            return jsonify({
                "ok":True,
                "settings":_json_safe(settings),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                settings=db_service.migration_payroll_leave_settings_save(
                    company_id,
                    project_id,
                    dataset_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(settings),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Payroll leave settings failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/leave-balances/mapping",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_payroll_leave_mapping(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            mapping=db_service.migration_payroll_leave_mapping_get(
                company_id,project_id,dataset_id
            )

            return jsonify({
                "ok":True,
                "mapping":_json_safe(mapping),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                mapping=db_service.migration_payroll_leave_type_mapping_save(
                    company_id,
                    project_id,
                    dataset_id,
                    (_body().get("mappings") or []),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "mapping":_json_safe(mapping),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Payroll leave mapping failed",
            error,
            status=500,
        )



@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/leave-balances/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_leave_preview(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        preview=db_service.migration_payroll_leave_preview(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(preview),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Payroll leave preview failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/employee-loans/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_payroll_employee_loan_settings(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            settings=db_service.migration_payroll_loan_settings_get(
                company_id,project_id,dataset_id
            )

            return jsonify({
                "ok":True,
                "settings":_json_safe(settings),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                settings=db_service.migration_payroll_loan_settings_save(
                    company_id,
                    project_id,
                    dataset_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(settings),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Employee loan settings failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/employee-loans/mapping",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_employee_loan_mapping(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        mapping=db_service.migration_payroll_loan_mapping_get(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "mapping":_json_safe(mapping),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Employee loan mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/employee-loans/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_employee_loan_preview(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        preview=db_service.migration_payroll_employee_loans_preview(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(preview),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Employee loan preview failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/payroll/history",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_history(
    company_id:int,
    project_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        datasets=db_service.migration_payroll_history_datasets(
            company_id,
            project_id,
        )

        return jsonify({
            "ok":True,
            "datasets":_json_safe(datasets),
        }),200

    except Exception as error:
        return _error(
            "Historical payroll migration retrieval failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/history/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_payroll_history_settings(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            settings=db_service.migration_payroll_history_settings_get(
                company_id,
                project_id,
                dataset_id,
            )

            return jsonify({
                "ok":True,
                "settings":_json_safe(settings),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                settings=db_service.migration_payroll_history_settings_save(
                    company_id,
                    project_id,
                    dataset_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(settings),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Historical payroll settings failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/history/mapping",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_history_mapping(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        mapping=db_service.migration_payroll_history_mapping_get(
            company_id,
            project_id,
            dataset_id,
        )

        return jsonify({
            "ok":True,
            "mapping":_json_safe(mapping),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Historical payroll mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/payroll/history/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_history_preview(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        preview=db_service.migration_payroll_history_preview(
            company_id,
            project_id,
            dataset_id,
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(preview),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Historical payroll preview failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/payroll/reconciliation",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def migration_payroll_reconciliation(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            reconciliation=db_service.migration_payroll_reconciliation_get(
                company_id,
                project_id,
            )

            return jsonify({
                "ok":True,
                "reconciliation":_json_safe(reconciliation),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                reconciliation=db_service.migration_payroll_reconciliation_build(
                    company_id,
                    project_id,
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "reconciliation":_json_safe(reconciliation),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Payroll migration reconciliation failed",
            error,
            status=500,
        )


@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/payroll/reconciliation/history",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_payroll_reconciliation_history(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        rows=db_service.migration_payroll_reconciliation_list(
            company_id,
            project_id,
        )

        return jsonify({
            "ok":True,
            "history":_json_safe(rows),
        }),200

    except Exception as error:
        return _error(
            "Payroll reconciliation history failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/products",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_products(
    company_id:int,
    project_id:int,
):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        datasets=db_service.migration_product_datasets(
            company_id,
            project_id,
        )

        return jsonify({
            "ok":True,
            "datasets":_json_safe(datasets),
        }),200

    except Exception as error:
        return _error(
            "Product migration retrieval failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/products/settings",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_product_settings(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            settings=db_service.migration_product_settings_get(
                company_id,
                project_id,
                dataset_id,
            )

            return jsonify({
                "ok":True,
                "settings":_json_safe(settings),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                settings=db_service.migration_product_settings_save(
                    company_id,
                    project_id,
                    dataset_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )

                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(settings),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Product migration settings failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/products/types",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_product_types(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            mapping=db_service.migration_product_types_detect(
                company_id,
                project_id,
                dataset_id,
            )

            return jsonify({
                "ok":True,
                "mapping":_json_safe(mapping),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                mapping=db_service.migration_product_type_mapping_save(
                    company_id,
                    project_id,
                    dataset_id,
                    (_body().get("mappings") or []),
                    user_id=_user_id(),
                    cur=cur,
                )

                conn.commit()

            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "mapping":_json_safe(mapping),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Product type mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/products/mapping",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_product_mapping(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        mapping=db_service.migration_product_mapping_get(
            company_id,
            project_id,
            dataset_id,
        )

        return jsonify({
            "ok":True,
            "mapping":_json_safe(mapping),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Product migration mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/products/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_product_preview(
    company_id:int,
    project_id:int,
    dataset_id:int,
):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        preview=db_service.migration_product_preview(
            company_id,
            project_id,
            dataset_id,
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(preview),
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        return _error(
            "Product migration preview failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/products/accounting",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_product_accounting(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        accounting=db_service.migration_product_accounting_get(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "accounting":_json_safe(accounting),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error("Product accounting mapping failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/products/accounts",
    methods=["PUT","OPTIONS"],
)
@require_auth
def migration_product_accounts(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        with db_service._conn_cursor() as (conn,cur):
            try:
                accounts=db_service.migration_product_account_mappings_save(
                    company_id,project_id,dataset_id,
                    _body().get("mappings") or [],
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "accounts":_json_safe(accounts),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error("Product account mapping failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/products/vat",
    methods=["PUT","OPTIONS"],
)
@require_auth
def migration_product_vat(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        with db_service._conn_cursor() as (conn,cur):
            try:
                vat=db_service.migration_product_vat_mappings_save(
                    company_id,project_id,dataset_id,
                    _body().get("mappings") or [],
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "vat":_json_safe(vat),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error("Product VAT mapping failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/products/accounting/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_product_accounting_preview(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        preview=db_service.migration_product_accounting_preview(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(preview),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error("Product accounting preview failed",error,status=500)

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/inventory/configuration",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_inventory_configuration(company_id:int,project_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            configuration=db_service.migration_inventory_configuration_get(
                company_id,project_id
            )

            return jsonify({
                "ok":True,
                "configuration":_json_safe(configuration),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                settings=db_service.migration_inventory_settings_save(
                    company_id,
                    project_id,
                    _body(),
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "settings":_json_safe(settings),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Inventory migration configuration failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/inventory/locations",
    methods=["GET","PUT","OPTIONS"],
)
@require_auth
def migration_inventory_locations(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        if request.method=="GET":
            mapping=db_service.migration_inventory_locations_detect(
                company_id,project_id,dataset_id
            )

            return jsonify({
                "ok":True,
                "mapping":_json_safe(mapping),
            }),200

        with db_service._conn_cursor() as (conn,cur):
            try:
                mapping=db_service.migration_inventory_location_mappings_save(
                    company_id,
                    project_id,
                    dataset_id,
                    _body().get("mappings") or [],
                    user_id=_user_id(),
                    cur=cur,
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return jsonify({
            "ok":True,
            "mapping":_json_safe(mapping),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Inventory location mapping failed",
            error,
            status=500,
        )

@data_migration_bp.route(
    "/api/companies/<int:company_id>/migrations/projects/<int:project_id>/datasets/<int:dataset_id>/inventory/locations/preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def migration_inventory_locations_preview(company_id:int,project_id:int,dataset_id:int):
    if request.method=="OPTIONS":return _options()

    deny=_guard(company_id)
    if deny:return deny

    try:
        preview=db_service.migration_inventory_locations_preview(
            company_id,project_id,dataset_id
        )

        return jsonify({
            "ok":True,
            "preview":_json_safe(preview),
        }),200

    except ValueError as error:
        return jsonify({"ok":False,"error":str(error)}),400

    except Exception as error:
        return _error(
            "Inventory location preview failed",
            error,
            status=500,
        )