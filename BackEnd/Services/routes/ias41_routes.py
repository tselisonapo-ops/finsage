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
    "/api/companies/<int:company_id>/ias41/seasons",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_seasons(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            return _list_response(
                db_service.ias41_seasons_list,
                company_id,
            )

        data = db_service.ias41_season_save(
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
            "IAS 41 season failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/seasons/<int:season_id>",
    methods=["PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def ias41_season(
    company_id: int,
    season_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "DELETE":
            ok = db_service.ias41_season_delete(
                company_id,
                season_id,
                user_id=_user_id(),
            )

            return jsonify({
                "ok": bool(ok),
                "deleted_id": season_id,
            }), 200

        data = db_service.ias41_season_save(
            company_id,
            _body(),
            season_id=season_id,
            user_id=_user_id(),
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 season update failed",
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

# ============================================================
# PHASE 2A — ACQUISITIONS, BIRTHS AND PLANTING
# ============================================================

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/acquisitions",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_acquisitions(company_id: int):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = (
                db_service
                .ias41_acquisitions_list(
                    company_id,
                    status=request.args.get(
                        "status"
                    ),
                    transaction_type=(
                        request.args.get(
                            "transaction_type"
                        )
                    ),
                    date_from=request.args.get(
                        "date_from"
                    ),
                    date_to=request.args.get(
                        "date_to"
                    ),
                )
            )

            return jsonify({
                "ok": True,
                "items": items,
                "count": len(items),
            }), 200

        data = (
            db_service
            .ias41_acquisition_save(
                company_id,
                _body(),
                user_id=_user_id(),
            )
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 201

    except Exception as error:
        return _error(
            "IAS 41 acquisition failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/acquisitions/<int:acquisition_id>",
    methods=[
        "GET",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
)
@require_auth
def ias41_acquisition(
    company_id: int,
    acquisition_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            data = (
                db_service
                .ias41_acquisition_get(
                    company_id,
                    acquisition_id,
                )
            )

            if not data:
                return jsonify({
                    "error":
                        "IAS 41 acquisition not found",
                }), 404

            return jsonify({
                "ok": True,
                "data": data,
            }), 200

        if request.method == "DELETE":
            ok = (
                db_service
                .ias41_acquisition_delete(
                    company_id,
                    acquisition_id,
                )
            )

            if not ok:
                return jsonify({
                    "error":
                        "Only draft acquisitions can be deleted",
                }), 409

            return jsonify({
                "ok": True,
                "deleted_id": acquisition_id,
            }), 200

        data = (
            db_service
            .ias41_acquisition_save(
                company_id,
                _body(),
                acquisition_id=acquisition_id,
                user_id=_user_id(),
            )
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 acquisition update failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/acquisitions/<int:acquisition_id>/preview",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_acquisition_preview(
    company_id: int,
    acquisition_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        data = (
            db_service
            .ias41_acquisition_journal_preview(
                company_id,
                acquisition_id,
                user_id=_user_id(),
                save_preview=(
                    request.method == "POST"
                ),
            )
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 acquisition preview failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/acquisitions/<int:acquisition_id>/approve",
    methods=["POST", "OPTIONS"],
)
@require_auth
def ias41_acquisition_approve(
    company_id: int,
    acquisition_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        data = (
            db_service
            .ias41_acquisition_approve(
                company_id,
                acquisition_id,
                user_id=_user_id(),
            )
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 acquisition approval failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/acquisitions/<int:acquisition_id>/return-to-draft",
    methods=["POST", "OPTIONS"],
)
@require_auth
def ias41_acquisition_return_to_draft(
    company_id: int,
    acquisition_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        data = (
            db_service
            .ias41_acquisition_return_to_draft(
                company_id,
                acquisition_id,
                user_id=_user_id(),
            )
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 return-to-draft failed",
            error,
        )


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/acquisitions/<int:acquisition_id>/cancel",
    methods=["POST", "OPTIONS"],
)
@require_auth
def ias41_acquisition_cancel(
    company_id: int,
    acquisition_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        data = (
            db_service
            .ias41_acquisition_cancel(
                company_id,
                acquisition_id,
                user_id=_user_id(),
            )
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 acquisition cancellation failed",
            error,
        )

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/acquisitions/<int:acquisition_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def ias41_acquisition_post(
    company_id: int,
    acquisition_id: int,
):
    if request.method == "OPTIONS":
        return _options()

    deny = _guard(company_id)
    if deny:
        return deny

    try:
        data = (
            db_service
            .ias41_acquisition_post(
                company_id,
                acquisition_id,
                user_id=_user_id(),
            )
        )

        return jsonify({
            "ok": True,
            "data": data,
        }), 200

    except Exception as error:
        return _error(
            "IAS 41 acquisition posting failed",
            error,
        )

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/events",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def ias41_events(company_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.ias41_events_list(
                company_id,
                event_group=request.args.get("event_group"),
                event_type=request.args.get("event_type"),
                status=request.args.get("status"),
                date_from=request.args.get("date_from"),
                date_to=request.args.get("date_to"),
            )
            return jsonify({"ok": True, "items": items, "count": len(items)}), 200

        data = db_service.ias41_event_save(
            company_id, _body(), user_id=_user_id()
        )
        return jsonify({"ok": True, "data": data}), 201
    except Exception as error:
        return _error("IAS 41 event failed", error)


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/events/<int:event_id>",
    methods=["GET", "PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def ias41_event(company_id, event_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            data = db_service.ias41_event_get(company_id, event_id)
            return (
                jsonify({"ok": True, "data": data}), 200
            ) if data else (
                jsonify({"error": "Biological event not found"}), 404
            )

        if request.method == "DELETE":
            ok = db_service.ias41_event_delete(company_id, event_id)
            return jsonify({"ok": ok, "deleted_id": event_id}), 200

        data = db_service.ias41_event_save(
            company_id, _body(), event_id=event_id, user_id=_user_id()
        )
        return jsonify({"ok": True, "data": data}), 200
    except Exception as error:
        return _error("IAS 41 event update failed", error)


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/events/<int:event_id>/<action>",
    methods=["POST", "OPTIONS"],
)
@require_auth
def ias41_event_action(company_id, event_id, action):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny

    try:
        actions = {
            "preview": lambda: db_service.ias41_event_journal_preview(
                company_id, event_id, user_id=_user_id()
            ),
            "approve": lambda: db_service.ias41_event_approve(
                company_id, event_id, user_id=_user_id()
            ),
            "post": lambda: db_service.ias41_event_post(
                company_id, event_id, user_id=_user_id()
            ),
            "cancel": lambda: db_service.ias41_event_cancel(
                company_id, event_id, user_id=_user_id()
            ),
        }

        if action not in actions:
            return jsonify({"error": "Unsupported IAS 41 event action"}), 404

        return jsonify({"ok": True, "data": actions[action]()}), 200
    except Exception as error:
        return _error(f"IAS 41 event {action} failed", error)

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/valuations",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def ias41_valuations(company_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.ias41_valuations_list(
                company_id,
                status=request.args.get("status"),
                date_from=request.args.get("date_from"),
                date_to=request.args.get("date_to"),
            )
            return jsonify({"ok": True, "items": items, "count": len(items)}), 200

        data = db_service.ias41_valuation_save(
            company_id, _body(), user_id=_user_id()
        )
        return jsonify({"ok": True, "data": data}), 201
    except Exception as error:
        return _error("IAS 41 valuation failed", error)


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/valuations/<int:valuation_id>",
    methods=["GET","PATCH","OPTIONS"],
)
@require_auth
def ias41_valuation(company_id, valuation_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            data = db_service.ias41_valuation_get(company_id, valuation_id)
            return (
                jsonify({"ok": True, "data": data}), 200
            ) if data else (
                jsonify({"error": "Valuation not found"}), 404
            )

        data = db_service.ias41_valuation_save(
            company_id, _body(),
            valuation_id=valuation_id,
            user_id=_user_id(),
        )
        return jsonify({"ok": True, "data": data}), 200
    except Exception as error:
        return _error("IAS 41 valuation update failed", error)


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/valuations/<int:valuation_id>/<action>",
    methods=["POST","OPTIONS"],
)
@require_auth
def ias41_valuation_action(company_id, valuation_id, action):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny

    try:
        actions = {
            "preview": lambda: db_service.ias41_valuation_preview(
                company_id, valuation_id, user_id=_user_id()
            ),
            "approve": lambda: db_service.ias41_valuation_approve(
                company_id, valuation_id, user_id=_user_id()
            ),
            "post": lambda: db_service.ias41_valuation_post(
                company_id, valuation_id, user_id=_user_id()
            ),
        }

        if action not in actions:
            return jsonify({"error": "Unsupported valuation action"}), 404

        return jsonify({"ok": True, "data": actions[action]()}), 200
    except Exception as error:
        return _error(f"IAS 41 valuation {action} failed", error)

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/harvests",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def ias41_harvests(company_id):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            items=db_service.ias41_harvests_list(
                company_id,
                status=request.args.get("status"),
                date_from=request.args.get("date_from"),
                date_to=request.args.get("date_to"),
            )
            return jsonify({
                "ok":True,
                "items":items,
                "count":len(items),
            }),200

        data=db_service.ias41_harvest_save(
            company_id,
            _body(),
            user_id=_user_id(),
        )
        return jsonify({"ok":True,"data":data}),201
    except Exception as error:
        return _error("IAS 41 harvest failed",error)


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/harvests/<int:harvest_id>",
    methods=["GET","PATCH","DELETE","OPTIONS"],
)
@require_auth
def ias41_harvest(company_id,harvest_id):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            data=db_service.ias41_harvest_get(
                company_id,
                harvest_id,
            )
            return (
                jsonify({"ok":True,"data":data}),200
            ) if data else (
                jsonify({"error":"Harvest not found"}),404
            )

        if request.method=="DELETE":
            ok=db_service.ias41_harvest_delete(
                company_id,
                harvest_id,
            )
            return jsonify({
                "ok":ok,
                "deleted_id":harvest_id,
            }),200

        data=db_service.ias41_harvest_save(
            company_id,
            _body(),
            harvest_id=harvest_id,
            user_id=_user_id(),
        )
        return jsonify({"ok":True,"data":data}),200
    except Exception as error:
        return _error("IAS 41 harvest update failed",error)


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/harvests/<int:harvest_id>/<action>",
    methods=["POST","OPTIONS"],
)
@require_auth
def ias41_harvest_action(company_id,harvest_id,action):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:
        return deny

    try:
        actions={
            "preview":lambda:db_service.ias41_harvest_preview(
                company_id,
                harvest_id,
                user_id=_user_id(),
            ),
            "approve":lambda:db_service.ias41_harvest_approve(
                company_id,
                harvest_id,
                user_id=_user_id(),
            ),
            "post":lambda:db_service.ias41_harvest_post(
                company_id,
                harvest_id,
                user_id=_user_id(),
            ),
            "cancel":lambda:db_service.ias41_harvest_cancel(
                company_id,
                harvest_id,
                user_id=_user_id(),
            ),
        }

        if action not in actions:
            return jsonify({
                "error":"Unsupported harvest action",
            }),404

        return jsonify({
            "ok":True,
            "data":actions[action](),
        }),200
    except Exception as error:
        return _error(
            f"IAS 41 harvest {action} failed",
            error,
        )

@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/grants",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def ias41_grants(company_id):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            items=db_service.ias41_grants_list(
                company_id,
                status=request.args.get("status"),
                date_from=request.args.get("date_from"),
                date_to=request.args.get("date_to"),
            )
            return jsonify({"ok":True,"items":items,"count":len(items)}),200

        data=db_service.ias41_grant_save(
            company_id,_body(),user_id=_user_id()
        )
        return jsonify({"ok":True,"data":data}),201
    except Exception as error:
        return _error("IAS 41 government grant failed",error)


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/grants/<int:grant_id>",
    methods=["GET","PATCH","DELETE","OPTIONS"],
)
@require_auth
def ias41_grant(company_id,grant_id):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            data=db_service.ias41_grant_get(company_id,grant_id)
            return (
                jsonify({"ok":True,"data":data}),200
            ) if data else (
                jsonify({"error":"Government grant not found"}),404
            )

        if request.method=="DELETE":
            ok=db_service.ias41_grant_delete(company_id,grant_id)
            return jsonify({"ok":ok,"deleted_id":grant_id}),200

        data=db_service.ias41_grant_save(
            company_id,_body(),
            grant_id=grant_id,
            user_id=_user_id(),
        )
        return jsonify({"ok":True,"data":data}),200
    except Exception as error:
        return _error("IAS 41 government grant update failed",error)


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/grants/<int:grant_id>/<action>",
    methods=["POST","OPTIONS"],
)
@require_auth
def ias41_grant_action(company_id,grant_id,action):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:
        return deny

    try:
        actions={
            "approve":lambda:db_service.ias41_grant_approve(
                company_id,grant_id,user_id=_user_id()
            ),
            "preview":lambda:db_service.ias41_grant_recognition_preview(
                company_id,grant_id,user_id=_user_id()
            ),
            "recognise":lambda:db_service.ias41_grant_recognise(
                company_id,grant_id,user_id=_user_id()
            ),
            "cancel":lambda:db_service.ias41_grant_cancel(
                company_id,grant_id,user_id=_user_id()
            ),
        }

        if action not in actions:
            return jsonify({"error":"Unsupported grant action"}),404

        return jsonify({"ok":True,"data":actions[action]()}),200
    except Exception as error:
        return _error(f"IAS 41 grant {action} failed",error)


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/grants/<int:grant_id>/receipts",
    methods=["POST","OPTIONS"],
)
@require_auth
def ias41_grant_receipt_create(company_id,grant_id):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:
        return deny

    try:
        data=db_service.ias41_grant_receipt_save(
            company_id,grant_id,_body(),user_id=_user_id()
        )
        return jsonify({"ok":True,"data":data}),201
    except Exception as error:
        return _error("IAS 41 grant receipt failed",error)


@ias41_bp.route(
    "/api/companies/<int:company_id>/ias41/grant-receipts/<int:receipt_id>/<action>",
    methods=["POST","OPTIONS"],
)
@require_auth
def ias41_grant_receipt_action(company_id,receipt_id,action):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:
        return deny

    try:
        actions={
            "preview":lambda:db_service.ias41_grant_receipt_preview(
                company_id,receipt_id,user_id=_user_id()
            ),
            "post":lambda:db_service.ias41_grant_receipt_post(
                company_id,receipt_id,user_id=_user_id()
            ),
        }

        if action not in actions:
            return jsonify({"error":"Unsupported grant receipt action"}),404

        return jsonify({"ok":True,"data":actions[action]()}),200
    except Exception as error:
        return _error(f"IAS 41 grant receipt {action} failed",error)