# BackEnd/Routes/pos_routes.py

from __future__ import annotations

from flask import Blueprint, jsonify, request, g, current_app, make_response

from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company


pos_bp = Blueprint("pos_bp", __name__)


def _body() -> dict:
    return request.get_json(silent=True) or {}


def _user_id(payload: dict | None = None) -> int | None:
    payload = payload or getattr(request, "jwt_payload", {}) or {}
    user = getattr(g, "current_user", None) or {}
    uid = payload.get("user_id") or payload.get("sub") or user.get("id")
    try:
        return int(uid) if uid is not None else None
    except Exception:
        return None


def _authorise_company(cid: int):
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(cid), db_service=db_service)
    return deny


def _ok(data=None, status=200):
    payload = {"ok": True}
    if data is not None:
        payload.update(data if isinstance(data, dict) else {"data": data})
    return jsonify(payload), status


def _err(message, status=400, detail=None):
    out = {"ok": False, "error": str(message)}
    if detail:
        out["detail"] = str(detail)
    return jsonify(out), status


@pos_bp.route("/api/companies/<int:cid>/pos/items/search", methods=["GET", "OPTIONS"])
@require_auth
def api_pos_search_items(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        q = request.args.get("q", "")
        limit = int(request.args.get("limit", 20))
        items = db_service.pos_search_items(cid, q=q, limit=limit)
        return jsonify({"ok": True, "items": items, "count": len(items)}), 200
    except Exception as ex:
        current_app.logger.exception("api_pos_search_items failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/items/barcode/<path:barcode>", methods=["GET", "OPTIONS"])
@require_auth
def api_pos_item_by_barcode(cid: int, barcode: str):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        item = db_service.pos_get_item_by_barcode(cid, barcode)
        if not item:
            return _err("Item not found", 404)
        return jsonify({"ok": True, "item": item}), 200
    except Exception as ex:
        current_app.logger.exception("api_pos_item_by_barcode failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/shifts/open", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_open_shift(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    body = _body()
    payload = getattr(request, "jwt_payload", {}) or {}

    try:
        terminal_id = int(body.get("terminal_id") or 0)
        cashier_user_id = int(body.get("cashier_user_id") or _user_id(payload) or 0)

        if terminal_id <= 0:
            return _err("terminal_id is required", 400)
        if cashier_user_id <= 0:
            return _err("cashier_user_id is required", 400)

        shift_id = db_service.pos_open_shift(
            cid,
            terminal_id=terminal_id,
            cashier_user_id=cashier_user_id,
            opening_float=float(body.get("opening_float") or 0),
        )

        return _ok({"shift_id": int(shift_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_open_shift failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/sales", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_create_sale(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    body = _body()
    payload = getattr(request, "jwt_payload", {}) or {}

    try:
        sale_no = (body.get("sale_no") or "").strip()
        if not sale_no:
            return _err("sale_no is required", 400)

        sale_id = db_service.pos_create_sale_draft(
            cid,
            sale_no=sale_no,
            terminal_id=int(body.get("terminal_id") or 0),
            shift_id=int(body.get("shift_id") or 0),
            cashier_user_id=int(body.get("cashier_user_id") or _user_id(payload) or 0),
            customer_id=body.get("customer_id"),
            customer_name=body.get("customer_name"),
            customer_account_id=body.get("customer_account_id"),
            source_quote_id=body.get("source_quote_id"),
        )

        return _ok({"sale_id": int(sale_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_create_sale failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/sales/<int:sale_id>/lines", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_add_sale_line(cid: int, sale_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        line = _body()
        line_id = db_service.pos_add_sale_line(cid, sale_id, line)
        return _ok({"line_id": int(line_id)}, 201)
    except Exception as ex:
        current_app.logger.exception("api_pos_add_sale_line failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/sales/<int:sale_id>/payments", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_record_payment(cid: int, sale_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    body = _body()

    try:
        payment_method = (body.get("payment_method") or "").strip().lower()
        if not payment_method:
            return _err("payment_method is required", 400)

        payment_id = db_service.pos_record_payment(
            cid,
            sale_id=sale_id,
            shift_id=body.get("shift_id"),
            payment_method=payment_method,
            amount=float(body.get("amount") or 0),
            reference=body.get("reference"),
            received_amount=body.get("received_amount"),
            change_amount=body.get("change_amount"),
        )

        return _ok({"payment_id": int(payment_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_record_payment failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/sales/<int:sale_id>/complete", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_complete_sale(cid: int, sale_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        result = db_service.pos_complete_sale(
            cid,
            sale_id,
            user_id=_user_id(),
        )
        return _ok(result, 200)
    except Exception as ex:
        current_app.logger.exception("api_pos_complete_sale failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/quotes", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_create_quote(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    body = _body()

    try:
        quote_no = (body.get("quote_no") or "").strip()
        if not quote_no:
            return _err("quote_no is required", 400)

        quote_id = db_service.pos_create_quote(
            cid,
            quote_no=quote_no,
            terminal_id=body.get("terminal_id"),
            cashier_user_id=body.get("cashier_user_id") or _user_id(),
            customer_id=body.get("customer_id"),
            customer_name=body.get("customer_name"),
            valid_until=body.get("valid_until"),
            notes=body.get("notes"),
            lines=body.get("lines") or [],
        )

        return _ok({"quote_id": int(quote_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_create_quote failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/barcodes/generate", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_generate_barcode(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    body = _body()

    try:
        item_id = int(body.get("item_id") or 0)
        if item_id <= 0:
            return _err("item_id is required", 400)

        barcode = db_service.pos_generate_barcode(cid, item_id)

        return _ok({
            "item_id": item_id,
            "barcode": barcode,
        }, 200)

    except Exception as ex:
        current_app.logger.exception("api_pos_generate_barcode failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/barcodes/labels", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_queue_barcode_label(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    body = _body()

    try:
        item_id = int(body.get("item_id") or 0)
        barcode = (body.get("barcode") or "").strip()

        if item_id <= 0:
            return _err("item_id is required", 400)
        if not barcode:
            return _err("barcode is required", 400)

        label_id = db_service.pos_queue_barcode_label(
            cid,
            item_id=item_id,
            barcode=barcode,
            copies=int(body.get("copies") or 1),
            printed_by=body.get("printed_by") or _user_id(),
        )

        return _ok({"label_id": int(label_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_queue_barcode_label failed")
        return _err("Server error", 500, ex)
    
@pos_bp.route("/api/companies/<int:cid>/pos/orders", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_orders(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            status = request.args.get("status", "")
            order_type = request.args.get("order_type", "")
            limit = int(request.args.get("limit", 50))

            rows = db_service.pos_list_orders(
                cid,
                status=status,
                order_type=order_type,
                limit=limit,
            )

            return jsonify({"ok": True, "orders": rows, "count": len(rows)}), 200

        body = _body()

        order_id = db_service.pos_create_order(
            cid,
            order_no=body["order_no"],
            order_type=body.get("order_type") or "table",
            table_no=body.get("table_no"),
            waiter_user_id=body.get("waiter_user_id") or _user_id(),
            cashier_user_id=body.get("cashier_user_id"),
            customer_id=body.get("customer_id"),
            customer_name=body.get("customer_name"),
            customer_phone=body.get("customer_phone"),
            delivery_address=body.get("delivery_address"),
            delivery_notes=body.get("delivery_notes"),
            driver_user_id=body.get("driver_user_id"),
            delivery_fee=float(body.get("delivery_fee") or 0),
        )

        return _ok({"order_id": int(order_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_orders failed")
        return _err("Server error", 500, ex)

@pos_bp.route("/api/companies/<int:cid>/pos/orders/<int:order_id>", methods=["GET", "OPTIONS"])
@require_auth
def api_pos_get_order(cid: int, order_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        order = db_service.pos_get_order(cid, order_id)
        if not order:
            return _err("Order not found", 404)

        return jsonify({"ok": True, "order": order}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_get_order failed")
        return _err("Server error", 500, ex)
    
@pos_bp.route("/api/companies/<int:cid>/pos/orders/<int:order_id>/lines", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_add_order_line(cid: int, order_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        line_id = db_service.pos_add_order_line(cid, order_id, _body())
        return _ok({"line_id": int(line_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_add_order_line failed")
        return _err("Server error", 500, ex)

@pos_bp.route("/api/companies/<int:cid>/pos/orders/<int:order_id>/status", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_update_order_status(cid: int, order_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        data = _body()
        status = (data.get("status") or "").strip().lower()

        ok = db_service.pos_update_order_status(
            cid,
            order_id,
            status=status,
            driver_user_id=data.get("driver_user_id"),
        )

        if not ok:
            return _err("Order not found", 404)

        order = db_service.pos_get_order(cid, order_id)

        return jsonify({"ok": True, "order": order}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_update_order_status failed")
        return _err("Server error", 500, ex)
     
# =========================
# TERMINALS
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/terminals", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_terminals(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            rows = db_service.pos_list_terminals(cid)
            return jsonify({"ok": True, "terminals": rows, "count": len(rows)}), 200

        terminal_id = db_service.pos_create_terminal(cid, _body())
        return _ok({"terminal_id": int(terminal_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_terminals failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/terminals/<int:terminal_id>", methods=["PATCH", "OPTIONS"])
@require_auth
def api_pos_update_terminal(cid: int, terminal_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        row = db_service.pos_update_terminal(cid, terminal_id, _body())
        if not row:
            return _err("Terminal not found", 404)
        return jsonify({"ok": True, "terminal": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_update_terminal failed")
        return _err("Server error", 500, ex)
    
# =========================
# SHIFTS / CASH MOVEMENTS
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/shifts", methods=["GET", "OPTIONS"])
@require_auth
def api_pos_list_shifts(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        rows = db_service.pos_list_shifts(
            cid,
            status=request.args.get("status", ""),
            limit=int(request.args.get("limit", 50)),
        )
        return jsonify({"ok": True, "shifts": rows, "count": len(rows)}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_list_shifts failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/shifts/<int:shift_id>/close", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_close_shift(cid: int, shift_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    body = _body()

    try:
        row = db_service.pos_close_shift(
            cid,
            shift_id,
            counted_cash=float(body.get("counted_cash") or 0),
            manager_user_id=body.get("manager_user_id") or _user_id(),
            notes=body.get("notes"),
        )
        return jsonify({"ok": True, "shift": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_close_shift failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/cash-movements", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_cash_movements(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            shift_id = int(request.args.get("shift_id") or 0)
            if shift_id <= 0:
                return _err("shift_id is required", 400)

            rows = db_service.pos_list_cash_movements(cid, shift_id)
            return jsonify({"ok": True, "movements": rows, "count": len(rows)}), 200

        body = _body()
        body.setdefault("created_by", _user_id())

        movement_id = db_service.pos_add_cash_movement(cid, body)
        return _ok({"movement_id": int(movement_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_cash_movements failed")
        return _err("Server error", 500, ex)
    
# =========================
# CUSTOMERS / PRICING
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/customers", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_customers(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            rows = db_service.pos_list_customer_profiles(
                cid,
                q=request.args.get("q", ""),
                limit=int(request.args.get("limit", 50)),
            )
            return jsonify({"ok": True, "customers": rows, "count": len(rows)}), 200

        profile_id = db_service.pos_create_customer_profile(cid, _body())
        return _ok({"profile_id": int(profile_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_customers failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/price-levels", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_price_levels(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            rows = db_service.pos_list_price_levels(cid)
            return jsonify({"ok": True, "price_levels": rows, "count": len(rows)}), 200

        price_level_id = db_service.pos_create_price_level(cid, _body())
        return _ok({"price_level_id": int(price_level_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_price_levels failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/item-prices", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_item_prices(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            item_id = request.args.get("item_id")
            rows = db_service.pos_list_item_prices(
                cid,
                item_id=int(item_id) if item_id else None,
            )
            return jsonify({"ok": True, "prices": rows, "count": len(rows)}), 200

        price_id = db_service.pos_set_item_price(cid, _body())
        return _ok({"price_id": int(price_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_item_prices failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/bulk-discounts", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_bulk_discounts(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            rows = db_service.pos_list_bulk_discounts(cid)
            return jsonify({"ok": True, "discounts": rows, "count": len(rows)}), 200

        discount_id = db_service.pos_create_bulk_discount(cid, _body())
        return _ok({"discount_id": int(discount_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_bulk_discounts failed")
        return _err("Server error", 500, ex)
    
# =========================
# RETURNS
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/returns", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_returns(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            rows = db_service.pos_list_returns(cid, limit=int(request.args.get("limit", 50)))
            return jsonify({"ok": True, "returns": rows, "count": len(rows)}), 200

        return_id = db_service.pos_create_return(cid, _body())
        return _ok({"return_id": int(return_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_returns failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/returns/<int:return_id>", methods=["GET", "OPTIONS"])
@require_auth
def api_pos_get_return(cid: int, return_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        row = db_service.pos_get_return(cid, return_id)
        if not row:
            return _err("Return not found", 404)
        return jsonify({"ok": True, "return": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_get_return failed")
        return _err("Server error", 500, ex)
    
# =========================
# APPROVALS / OVERRIDES / PROMOTIONS
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/discount-approvals", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_discount_approvals(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            rows = db_service.pos_list_discount_approvals(
                cid,
                status=request.args.get("status", "pending"),
            )
            return jsonify({"ok": True, "approvals": rows, "count": len(rows)}), 200

        body = _body()
        body.setdefault("requested_by", _user_id())

        approval_id = db_service.pos_request_discount_approval(cid, body)
        return _ok({"approval_id": int(approval_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_discount_approvals failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/discount-approvals/<int:approval_id>/decision", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_discount_approval_decision(cid: int, approval_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    body = _body()

    try:
        row = db_service.pos_decide_discount_approval(
            cid,
            approval_id,
            status=body.get("status"),
            approved_by=body.get("approved_by") or _user_id(),
        )
        if not row:
            return _err("Approval not found", 404)

        return jsonify({"ok": True, "approval": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_discount_approval_decision failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/price-overrides", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_price_override(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        body = _body()
        body.setdefault("created_by", _user_id())

        override_id = db_service.pos_create_price_override(cid, body)
        return _ok({"override_id": int(override_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_price_override failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/promotions", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_promotions(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            active_only = request.args.get("active_only", "0") in {"1", "true", "yes"}
            rows = db_service.pos_list_promotions(cid, active_only=active_only)
            return jsonify({"ok": True, "promotions": rows, "count": len(rows)}), 200

        promo_id = db_service.pos_create_promotion(cid, _body())
        return _ok({"promotion_id": int(promo_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_promotions failed")
        return _err("Server error", 500, ex)
    
# =========================
# LOYALTY / VOUCHERS / OFFLINE
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/loyalty", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_create_loyalty(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        loyalty_id = db_service.pos_create_loyalty_account(cid, _body())
        return _ok({"loyalty_id": int(loyalty_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_create_loyalty failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/loyalty/<path:loyalty_no>", methods=["GET", "OPTIONS"])
@require_auth
def api_pos_get_loyalty(cid: int, loyalty_no: str):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        row = db_service.pos_get_loyalty_account(cid, loyalty_no)
        if not row:
            return _err("Loyalty account not found", 404)

        return jsonify({"ok": True, "loyalty": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_get_loyalty failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/vouchers", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_create_voucher(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        voucher_id = db_service.pos_create_gift_voucher(cid, _body())
        return _ok({"voucher_id": int(voucher_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_create_voucher failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/vouchers/<path:voucher_no>", methods=["GET", "OPTIONS"])
@require_auth
def api_pos_get_voucher(cid: int, voucher_no: str):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        row = db_service.pos_get_gift_voucher(cid, voucher_no)
        if not row:
            return _err("Voucher not found", 404)

        return jsonify({"ok": True, "voucher": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_get_voucher failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/offline-batches", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_offline_batches(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            rows = db_service.pos_list_offline_batches(
                cid,
                status=request.args.get("status", "pending"),
            )
            return jsonify({"ok": True, "batches": rows, "count": len(rows)}), 200

        batch_id = db_service.pos_save_offline_batch(cid, _body())
        return _ok({"batch_id": int(batch_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_offline_batches failed")
        return _err("Server error", 500, ex)
    
# =========================
# RECIPES / MENU COSTING
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/recipes", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_recipes(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            rows = db_service.pos_list_recipes(cid)
            return jsonify({"ok": True, "recipes": rows, "count": len(rows)}), 200

        recipe_id = db_service.pos_create_recipe(cid, _body())
        return _ok({"recipe_id": int(recipe_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_recipes failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/recipes/item/<int:item_id>", methods=["GET", "OPTIONS"])
@require_auth
def api_pos_get_recipe_by_item(cid: int, item_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        recipe = db_service.pos_get_active_recipe_for_item(cid, item_id)
        if not recipe:
            return _err("Recipe not found", 404)

        return jsonify({"ok": True, "recipe": recipe}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_get_recipe_by_item failed")
        return _err("Server error", 500, ex)
    
# =========================
# HOSPITALITY COST POOLS
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/cost-pools", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_cost_pools(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            rows = db_service.pos_list_cost_pools(cid)
            return jsonify({"ok": True, "cost_pools": rows, "count": len(rows)}), 200

        pool_id = db_service.pos_create_cost_pool(cid, _body())
        return _ok({"cost_pool_id": int(pool_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_cost_pools failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/menu-cost-allocations", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_menu_cost_allocations(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            item_id = request.args.get("item_id")
            rows = db_service.pos_list_menu_cost_allocations(
                cid,
                menu_item_id=int(item_id) if item_id else None,
            )
            return jsonify({"ok": True, "allocations": rows, "count": len(rows)}), 200

        allocation_id = db_service.pos_create_menu_cost_allocation(cid, _body())
        return _ok({"allocation_id": int(allocation_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_menu_cost_allocations failed")
        return _err("Server error", 500, ex)

# =========================
# RECEIPT SETTINGS
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/receipt-settings", methods=["GET", "POST", "PATCH", "OPTIONS"])
@require_auth
def api_pos_receipt_settings(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            settings = db_service.pos_get_receipt_settings(cid)
            return jsonify({
                "ok": True,
                "receipt_settings": settings or {},
            }), 200

        if request.method == "PATCH":
            settings = db_service.pos_update_receipt_settings(cid, _body())
            return jsonify({
                "ok": True,
                "receipt_settings": settings or {},
            }), 200

        settings = db_service.pos_save_receipt_settings(cid, _body())
        return jsonify({
            "ok": True,
            "receipt_settings": settings or {},
        }), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_receipt_settings failed")
        return _err("Server error", 500, ex)
    
@pos_bp.route("/api/companies/<int:cid>/pos/returns/<int:return_id>/approval", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_decide_return_approval(cid: int, return_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    body = _body()

    try:
        row = db_service.pos_decide_return_approval(
            cid,
            return_id,
            status=body.get("status"),
            approved_by=body.get("approved_by") or _user_id(),
            approval_note=body.get("approval_note"),
        )

        if not row:
            return _err("Return not found", 404)

        return jsonify({"ok": True, "return": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_decide_return_approval failed")
        return _err("Server error", 500, ex)
    
# =========================
# RESTAURANT TABLE SECTIONS
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/table-sections", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_table_sections(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            active_only = request.args.get("active_only", "0") in {"1", "true", "yes"}
            rows = db_service.pos_list_table_sections(cid, active_only=active_only)
            return jsonify({"ok": True, "sections": rows, "count": len(rows)}), 200

        section_id = db_service.pos_create_table_section(cid, _body())
        return _ok({"section_id": int(section_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_table_sections failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/table-sections/<int:section_id>", methods=["PATCH", "OPTIONS"])
@require_auth
def api_pos_update_table_section(cid: int, section_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        row = db_service.pos_update_table_section(cid, section_id, _body())
        if not row:
            return _err("Table section not found", 404)

        return jsonify({"ok": True, "section": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_update_table_section failed")
        return _err("Server error", 500, ex)


# =========================
# RESTAURANT TABLES
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/tables", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_tables(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            active_only = request.args.get("active_only", "0") in {"1", "true", "yes"}
            section_id_raw = request.args.get("section_id")
            section_id = int(section_id_raw) if section_id_raw else None

            rows = db_service.pos_list_tables(
                cid,
                active_only=active_only,
                section_id=section_id,
            )

            return jsonify({"ok": True, "tables": rows, "count": len(rows)}), 200

        table_id = db_service.pos_create_table(cid, _body())
        return _ok({"table_id": int(table_id)}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_tables failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/tables/<int:table_id>", methods=["PATCH", "OPTIONS"])
@require_auth
def api_pos_update_table(cid: int, table_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        row = db_service.pos_update_table(cid, table_id, _body())
        if not row:
            return _err("Table not found", 404)

        return jsonify({"ok": True, "table": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_update_table failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/tables/<int:table_id>/delete", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_delete_table(cid: int, table_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        row = db_service.pos_delete_table(cid, table_id)
        if not row:
            return _err("Table not found", 404)

        return jsonify({"ok": True, "table": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_delete_table failed")
        return _err("Server error", 500, ex)

@pos_bp.route("/api/companies/<int:cid>/pos/staff", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_staff_members(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            rows = db_service.pos_list_staff_members(cid)
            return jsonify({"ok": True, "staff": rows, "count": len(rows)}), 200

        staff = db_service.pos_create_staff_member(cid, _body())
        return _ok({"staff": staff}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_staff_members failed")
        return _err("Server error", 500, ex)
    
# =========================
# RESTAURANT MENU ITEMS
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/menu-items", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_menu_items(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            active_only = str(request.args.get("active_only", "1")).lower() not in {"0", "false", "no"}
            rows = db_service.pos_list_menu_items(cid, active_only=active_only)
            return jsonify({"ok": True, "menu_items": rows, "count": len(rows)}), 200

        menu_item_id = db_service.pos_create_menu_item(cid, _body())
        item = db_service.pos_get_menu_item(cid, menu_item_id)
        return _ok({"menu_item_id": int(menu_item_id), "menu_item": item}, 201)

    except Exception as ex:
        current_app.logger.exception("api_pos_menu_items failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/menu-items/<int:item_id>", methods=["GET", "PATCH", "OPTIONS"])
@require_auth
def api_pos_menu_item(cid: int, item_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            item = db_service.pos_get_menu_item(cid, item_id)
            if not item:
                return _err("Menu item not found", 404)
            return jsonify({"ok": True, "menu_item": item}), 200

        row = db_service.pos_update_menu_item(cid, item_id, _body())
        if not row:
            return _err("Menu item not found", 404)

        item = db_service.pos_get_menu_item(cid, item_id)
        return jsonify({"ok": True, "menu_item": item}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_menu_item failed")
        return _err("Server error", 500, ex)


# =========================
# MENU DISPLAY SETTINGS
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/menu-display/settings", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_pos_menu_display_settings(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        if request.method == "GET":
            settings = db_service.pos_get_menu_display_settings(cid)
            return jsonify({"ok": True, "settings": settings}), 200

        settings = db_service.pos_save_menu_display_settings(cid, _body())
        return jsonify({"ok": True, "settings": settings}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_menu_display_settings failed")
        return _err("Server error", 500, ex)


# =========================
# PACKING QUEUE
# =========================

@pos_bp.route("/api/companies/<int:cid>/pos/packing-queue", methods=["GET", "OPTIONS"])
@require_auth
def api_pos_packing_queue(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        status = (request.args.get("status") or "").strip()
        rows = db_service.pos_list_packing_queue(cid, status=status)
        return jsonify({"ok": True, "queue": rows, "count": len(rows)}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_packing_queue failed")
        return _err("Server error", 500, ex)


@pos_bp.route("/api/companies/<int:cid>/pos/packing-queue/<int:queue_id>/status", methods=["POST", "OPTIONS"])
@require_auth
def api_pos_packing_queue_status(cid: int, queue_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _authorise_company(cid)
    if deny:
        return deny

    try:
        data = _body()
        user_id = getattr(g, "user_id", None)

        row = db_service.pos_update_packing_queue_status(
            cid,
            queue_id,
            status=data.get("status"),
            user_id=user_id,
            notes=data.get("notes"),
        )

        if not row:
            return _err("Packing queue item not found", 404)

        return jsonify({"ok": True, "queue_item": row}), 200

    except Exception as ex:
        current_app.logger.exception("api_pos_packing_queue_status failed")
        return _err("Server error", 500, ex)