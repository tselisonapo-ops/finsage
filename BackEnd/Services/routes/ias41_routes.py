from __future__ import annotations

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


ias41_bp = Blueprint(
    "ias41_bp",
    __name__,
)


def _options():
    return _corsify(
        make_response("", 204)
    )


def _body() -> dict:
    return request.get_json(
        silent=True
    ) or {}


def _jwt_payload() -> dict:
    return (
        getattr(
            request,
            "jwt_payload",
            {},
        )
        or {}
    )


def _user() -> dict:
    return (
        getattr(
            g,
            "current_user",
            {},
        )
        or {}
    )


def _user_id() -> int | None:
    payload = _jwt_payload()
    user = _user()

    value = (
        payload.get("user_id")
        or payload.get("sub")
        or user.get("id")
    )

    if value in (None, ""):
        return None

    return int(value)


def _guard(company_id: int):
    company_id = int(company_id)
    payload = _jwt_payload()
    user = _user()

    selected_company_id = (
        payload.get("company_id")
        or user.get("company_id")
    )

    if selected_company_id is None:
        return jsonify({
            "error": "No company selected",
        }), 400

    deny = _deny_if_wrong_company(
        payload,
        company_id,
        db_service=db_service,
    )

    if deny:
        return deny

    if int(selected_company_id) != company_id:
        return jsonify({
            "error": "Not authorised for this company",
        }), 403

    return None


def _error(
    message: str,
    error: Exception,
    *,
    status: int | None = None,
):
    current_app.logger.exception(
        "%s: %s",
        message,
        error,
    )

    if status is None:
        status = (
            400
            if isinstance(
                error,
                (
                    ValueError,
                    TypeError,
                ),
            )
            else 500
        )

    return jsonify({
        "ok": False,
        "error": str(error),
        "type": type(error).__name__,
    }), status

def _list_response(
    loader,
    company_id: int,
):
    items = loader(
        company_id,
        active_only=False,
    )

    return jsonify({
        "ok": True,
        "items": items,
        "count": len(items),
    }), 200


def _save_response(
    saver,
    company_id: int,
    *,
    record_id: int | None = None,
):
    kwargs = {
        "user_id": _user_id(),
    }

    if record_id is not None:
        return jsonify({
            "ok": True,
            "data": saver(
                company_id,
                _body(),
                record_id,
                **kwargs,
            ),
        }), 200

    return jsonify({
        "ok": True,
        "data": saver(
            company_id,
            _body(),
            **kwargs,
        ),
    }), 201
# ============================================================
# Setup and dashboard
# ============================================================

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/setup",
    methods=["GET", "OPTIONS"],
)
@require_auth
def ias41_setup(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        data = db_service.ias41_setup_payload(
            company_id,
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 setup load failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/dashboard",
    methods=["GET", "OPTIONS"],
)
@require_auth
def ias41_dashboard(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        data = db_service.ias41_dashboard(
            company_id,
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 dashboard load failed",
            error,
        )


# ============================================================
# Settings
# ============================================================

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/settings",
    methods=["GET", "PATCH", "OPTIONS"],
)
@require_auth
def ias41_settings(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            data = db_service.ias41_settings_get(
                company_id,
            )
        else:
            data = db_service.ias41_settings_save(
                company_id,
                _body(),
                user_id=_user_id(),
            )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 settings failed",
            error,
        )


# ============================================================
# COA and account mappings
# ============================================================

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/accounts",
    methods=["GET", "OPTIONS"],
)
@require_auth
def ias41_accounts(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        data = db_service.ias41_posting_accounts(
            company_id,
        )

        return jsonify({
            "ok": True,
            "items": data,
            "count": len(data),
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 account load failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/account-mappings",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_account_mappings(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = (
                db_service
                .ias41_account_mappings_list(
                    company_id,
                )
            )

            return jsonify({
                "ok": True,
                "items": items,
                "count": len(items),
            }), 200

        data = db_service.ias41_account_mapping_save(
            company_id,
            _body(),
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 201

    except Exception as error:
        return _error(
            "IAS 41 account mapping failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/account-mappings/<int:mapping_id>",
    methods=["PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def ias41_account_mapping(
    company_id: int,
    mapping_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "DELETE":
            ok = (
                db_service
                .ias41_account_mapping_delete(
                    company_id,
                    mapping_id,
                )
            )

            if not ok:
                return jsonify({
                    "error": "Account mapping not found",
                }), 404

            return jsonify({
                "ok": True,
                "deleted_id": mapping_id,
            }), 200

        data = db_service.ias41_account_mapping_save(
            company_id,
            _body(),
            mapping_id=mapping_id,
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 account mapping update failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/account-mappings/validate",
    methods=["GET", "OPTIONS"],
)
@require_auth
def ias41_mapping_validate(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        data = db_service.ias41_mapping_validate(
            company_id,
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 mapping validation failed",
            error,
        )

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/locations",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_locations(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            return _list_response(
                db_service.ias41_locations_list,
                company_id,
            )

        data = db_service.ias41_location_save(
            company_id,
            _body(),
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 201

    except Exception as error:
        return _error(
            "IAS 41 location failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/locations/<int:location_id>",
    methods=["GET", "PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def ias41_location(
    company_id: int,
    location_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            data = db_service.ias41_location_get(
                company_id,
                location_id,
            )

            if not data:
                return jsonify({
                    "error": "Location not found",
                }), 404

            return jsonify({
                "ok": True,
                "data": data,
            }), 200

        if request.method == "DELETE":
            ok = db_service.ias41_location_delete(
                company_id,
                location_id,
                user_id=_user_id(),
            )

            return jsonify({
                "ok": bool(ok),
                "deleted_id": location_id,
            }), 200

        data = db_service.ias41_location_save(
            company_id,
            _body(),
            location_id=location_id,
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 location update failed",
            error,
        )

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/locations",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_locations(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            return _list_response(
                db_service.ias41_locations_list,
                company_id,
            )

        data = db_service.ias41_location_save(
            company_id,
            _body(),
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 201

    except Exception as error:
        return _error(
            "IAS 41 location failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/locations/<int:location_id>",
    methods=["GET", "PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def ias41_location(
    company_id: int,
    location_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            data = db_service.ias41_location_get(
                company_id,
                location_id,
            )

            if not data:
                return jsonify({
                    "error": "Location not found",
                }), 404

            return jsonify({
                "ok": True,
                "data": data,
            }), 200

        if request.method == "DELETE":
            ok = db_service.ias41_location_delete(
                company_id,
                location_id,
                user_id=_user_id(),
            )

            return jsonify({
                "ok": bool(ok),
                "deleted_id": location_id,
            }), 200

        data = db_service.ias41_location_save(
            company_id,
            _body(),
            location_id=location_id,
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 location update failed",
            error,
        )

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/asset-classes",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_asset_classes(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            return _list_response(
                db_service.ias41_asset_classes_list,
                company_id,
            )

        data = db_service.ias41_asset_class_save(
            company_id,
            _body(),
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 201

    except Exception as error:
        return _error(
            "IAS 41 asset class failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/asset-classes/<int:asset_class_id>",
    methods=["PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def ias41_asset_class(
    company_id: int,
    asset_class_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "DELETE":
            ok = db_service.ias41_asset_class_delete(
                company_id,
                asset_class_id,
                user_id=_user_id(),
            )

            return jsonify({
                "ok": bool(ok),
                "deleted_id": asset_class_id,
            }), 200

        data = db_service.ias41_asset_class_save(
            company_id,
            _body(),
            asset_class_id=asset_class_id,
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 asset class update failed",
            error,
        )

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/products",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_products(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            return _list_response(
                db_service.ias41_products_list,
                company_id,
            )

        data = db_service.ias41_product_save(
            company_id,
            _body(),
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 201

    except Exception as error:
        return _error(
            "IAS 41 product failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/products/<int:product_id>",
    methods=["PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def ias41_product(
    company_id: int,
    product_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "DELETE":
            ok = db_service.ias41_product_delete(
                company_id,
                product_id,
                user_id=_user_id(),
            )

            return jsonify({
                "ok": bool(ok),
                "deleted_id": product_id,
            }), 200

        data = db_service.ias41_product_save(
            company_id,
            _body(),
            product_id=product_id,
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 product update failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/inventory-items",
    methods=["GET", "OPTIONS"],
)
@require_auth
def ias41_inventory_items(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        items = db_service.ias41_inventory_items(
            company_id,
        )

        return jsonify({
            "ok": True,
            "items": items,
            "count": len(items),
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 inventory-item load failed",
            error,
        )

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/batches",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_batches(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            return _list_response(
                db_service.ias41_batches_list,
                company_id,
            )

        data = db_service.ias41_batch_save(
            company_id,
            _body(),
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 201

    except Exception as error:
        return _error(
            "IAS 41 batch failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/batches/<int:batch_id>",
    methods=["PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def ias41_batch(
    company_id: int,
    batch_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "DELETE":
            ok = db_service.ias41_batch_delete(
                company_id,
                batch_id,
                user_id=_user_id(),
            )

            return jsonify({
                "ok": bool(ok),
                "deleted_id": batch_id,
            }), 200

        data = db_service.ias41_batch_save(
            company_id,
            _body(),
            batch_id=batch_id,
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 batch update failed",
            error,
        )

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/biological-assets",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_biological_assets(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            return _list_response(
                db_service.ias41_biological_assets_list,
                company_id,
            )

        data = db_service.ias41_biological_asset_save(
            company_id,
            _body(),
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 201

    except Exception as error:
        return _error(
            "IAS 41 biological asset failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/biological-assets/<int:asset_id>",
    methods=["PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def ias41_biological_asset(
    company_id: int,
    asset_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "DELETE":
            ok = (
                db_service
                .ias41_biological_asset_delete(
                    company_id,
                    asset_id,
                    user_id=_user_id(),
                )
            )

            return jsonify({
                "ok": bool(ok),
                "deleted_id": asset_id,
            }), 200

        data = db_service.ias41_biological_asset_save(
            company_id,
            _body(),
            asset_id=asset_id,
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 biological asset update failed",
            error,
        )

