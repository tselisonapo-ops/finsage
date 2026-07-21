from __future__ import annotations

from datetime import date, datetime

from flask import Blueprint, current_app, g, jsonify, make_response, request

from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.db_service import db_service

from .lessor_lease_engine import (
    build_lessor_billing_schedule,
    lessor_lease_engine,
)


lessor_bp = Blueprint("lessor_leases", __name__)


def _auth(company_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}

    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )

    if deny:
        return None, deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None

    if not user_id:
        return None, (jsonify({"error": "AUTH|missing_user_id"}), 401)

    g.company_id = int(company_id)
    g.user_id = user_id

    return user_id, None

def _json_error(message, status=400, **extra):
    body = {"ok": False, "error": message}
    if extra:
        body.update(extra)
    return _corsify(make_response(jsonify(body), status))


def _opt():
    return _corsify(make_response("", 204))


def _date(value, name: str, required: bool = True):
    if value in (None, ""):
        if required:
            raise ValueError(f"{name} is required")
        return None

    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except Exception:
        raise ValueError(f"{name} must be YYYY-MM-DD")

def _lease_term_months(
    start_date,
    end_date,
) -> int:
    if not start_date or not end_date:
        return 0

    if isinstance(start_date, str):
        start_date = _date(
            start_date,
            "start_date",
        )

    if isinstance(end_date, str):
        end_date = _date(
            end_date,
            "end_date",
        )

    if end_date < start_date:
        return 0

    months = (
        (end_date.year - start_date.year) * 12
        + end_date.month
        - start_date.month
    )

    if end_date.day > start_date.day:
        months += 1

    return max(months, 0)

def _lessor_payload(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError(
            "JSON body must be an object"
        )

    start_date = _date(
        data.get("start_date"),
        "start_date",
    )

    end_date = _date(
        data.get("end_date"),
        "end_date",
        False,
    )

    lease_term_months = int(
        data.get("lease_term_months")
        or _lease_term_months(
            start_date,
            end_date,
        )
        or 0
    )

    if end_date and lease_term_months <= 0:
        raise ValueError(
            "lease_term_months must be greater than zero"
        )

    contract_name = (
        data.get("contract_name") or ""
    ).strip()

    if not contract_name:
        raise ValueError("contract_name is required")

    customer_id = int(data.get("customer_id") or 0)

    if not customer_id:
        raise ValueError("customer_id is required")

    amount = round(float(data.get("billing_amount") or 0.0), 2)

    if amount <= 0:
        raise ValueError("billing_amount must be greater than zero")

    frequency = (data.get("billing_frequency") or "monthly").lower()

    if frequency not in {
        "weekly",
        "monthly",
        "quarterly",
        "annually",
    }:
        raise ValueError("Unsupported billing_frequency")

    basis = (data.get("billing_basis") or "gross").lower()

    if basis not in {"gross", "net"}:
        raise ValueError("billing_basis must be gross or net")

    timing = (data.get("billing_timing") or "arrears").lower()

    if timing not in {"arrears", "advance"}:
        raise ValueError("billing_timing must be arrears or advance")

    classification = (
        data.get("lease_classification") or "operating"
    ).lower()

    if classification not in {"operating", "finance"}:
        raise ValueError("Invalid lease_classification")

    return {
        "contract_no": (data.get("contract_no") or "").strip() or None,
        "contract_name": contract_name,
        "customer_id": customer_id,
        "asset_id": int(data["asset_id"]) if data.get("asset_id") else None,
        "start_date": start_date,
        "end_date": end_date,
        "lease_term_months": lease_term_months,
        "billing_amount": amount,
        "billing_basis": basis,
        "vat_rate": float(data.get("vat_rate") or 0.0),
        "billing_frequency": frequency,
        "billing_timing": timing,
        "bill_day_of_month": (
            int(data["bill_day_of_month"])
            if data.get("bill_day_of_month")
            else None
        ),
        "notes": (data.get("notes") or "").strip() or None,
        "revenue_account_code": (
            data.get("revenue_account_code") or ""
        ).strip() or None,
        "finance_income_account_code": (
            data.get("finance_income_account_code") or ""
        ).strip() or None,

        "net_investment_current_account_code": (
            data.get(
                "net_investment_current_account_code"
            ) or ""
        ).strip() or None,

        "net_investment_noncurrent_account_code": (
            data.get(
                "net_investment_noncurrent_account_code"
            ) or ""
        ).strip() or None,
        "vat_output_account_code": (
            data.get("vat_output_account_code") or ""
        ).strip() or None,
        "ar_account_code": (
            data.get("ar_account_code") or ""
        ).strip() or None,
        "bank_account_code": (
            data.get("bank_account_code") or ""
        ).strip() or None,
        "bank_account_id": (
            int(data["bank_account_id"])
            if data.get("bank_account_id")
            else None
        ),
        "lease_classification": classification,
        "currency": (data.get("currency") or "").strip() or None,
        "payment_terms_days": int(data.get("payment_terms_days") or 0),
        "security_deposit_amount": float(
            data.get("security_deposit_amount") or 0.0
        ),
        "security_deposit_account_code": (
            data.get("security_deposit_account_code") or ""
        ).strip() or None,
    }


@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def lessor_leases(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user_id, deny = _auth(company_id)

    if deny:
        return deny

    try:
        if request.method == "GET":
            return jsonify(
                db_service.list_lessor_leases(
                    company_id,
                    status=(request.args.get("status") or "").strip() or None,
                    q=(request.args.get("q") or "").strip(),
                    limit=request.args.get("limit", 200, type=int),
                    offset=request.args.get("offset", 0, type=int),
                )
            )

        payload = _lessor_payload(request.get_json(silent=True) or {})

        customer = db_service.fetch_one(
            f"""
            SELECT id
            FROM company_{int(company_id)}.customers
            WHERE company_id=%s
              AND id=%s
              AND is_active=TRUE
            """,
            (int(company_id), int(payload["customer_id"])),
        )

        if not customer:
            return jsonify({"error": "Customer not found"}), 404

        with db_service._conn_cursor() as (conn, cur):
            lease = db_service.create_lessor_lease(
                company_id,
                payload,
                created_by_user_id=user_id,
                cur=cur,
            )

            conn.commit()

        return jsonify({"ok": True, "item": lease}), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception("lessor_leases failed")
        return jsonify({"error": str(e)}), 500
    
@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def lessor_lease_detail(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, deny = _auth(company_id)

    if deny:
        return deny

    lease = db_service.get_lessor_lease(company_id, lease_id)

    if not lease:
        return jsonify({"error": "Lessor lease not found"}), 404

    bills = db_service.fetch_all(
        f"""
        SELECT
            b.*,
            i.number AS invoice_number,
            i.status AS invoice_status
        FROM company_{int(company_id)}.lessor_lease_bills b
        LEFT JOIN company_{int(company_id)}.invoices i
          ON i.id=b.invoice_id
        WHERE b.company_id=%s
          AND b.lessor_lease_id=%s
        ORDER BY b.bill_period_start
        """,
        (int(company_id), int(lease_id)),
    ) or []

    return jsonify({
        "ok": True,
        "item": lease,
        "bills": bills,
    })

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/classify",
    methods=["POST", "OPTIONS"],
)
@require_auth
def classify_lessor_lease(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, deny = _auth(company_id)

    if deny:
        return deny

    try:
        data = request.get_json(
            silent=True
        ) or {}

        start_date = _date(
            data.get("start_date"),
            "start_date",
        )

        end_date = _date(
            data.get("end_date"),
            "end_date",
            False,
        )

        data["lease_term_months"] = int(
            data.get("lease_term_months")
            or _lease_term_months(
                start_date,
                end_date,
            )
            or 0
        )

        if data["lease_term_months"] <= 0:
            raise ValueError(
                "lease_term_months must be greater than zero"
            )

        result = (
            lessor_lease_engine
            .classify_and_validate(data)
        )

        return jsonify({
            "ok": True,
            "data": result,
        }), 200

    except ValueError as e:
        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400

    except Exception as e:
        current_app.logger.exception(
            "classify_lessor_lease failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 500
    
@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/schedule/preview",
    methods=["POST", "OPTIONS"],
)
@require_auth
def preview_lessor_schedule(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, deny = _auth(company_id)

    if deny:
        return deny

    try:
        lease = db_service.get_lessor_lease(company_id, lease_id)

        if not lease:
            return jsonify({"error": "Lessor lease not found"}), 404

        raw = request.get_json(silent=True) or {}
        through_date = _date(
            raw.get("through_date"),
            "through_date",
            required=False,
        )

        rows = build_lessor_billing_schedule(
            lease,
            through_date=through_date,
        )

        return jsonify({
            "ok": True,
            "lease": lease,
            "schedule": rows,
            "totals": {
                "net": round(sum(x["amount_net"] for x in rows), 2),
                "vat": round(sum(x["vat_amount"] for x in rows), 2),
                "gross": round(sum(x["amount_gross"] for x in rows), 2),
            },
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    
@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/schedule/generate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def generate_lessor_schedule(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, deny = _auth(company_id)

    if deny:
        return deny

    try:
        lease = db_service.get_lessor_lease(company_id, lease_id)

        if not lease:
            return jsonify({"error": "Lessor lease not found"}), 404

        raw = request.get_json(silent=True) or {}
        through_date = _date(
            raw.get("through_date"),
            "through_date",
            required=False,
        )

        rows = build_lessor_billing_schedule(
            lease,
            through_date=through_date,
        )

        for row in rows:
            row["vat_rate"] = float(lease.get("vat_rate") or 0.0)

        with db_service._conn_cursor() as (conn, cur):
            saved = db_service.save_lessor_billing_schedule(
                company_id,
                lease_id,
                rows,
                cur=cur,
            )

            conn.commit()

        return jsonify({
            "ok": True,
            "created": len(saved),
            "items": saved,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "generate_lessor_schedule failed"
        )
        return jsonify({"error": str(e)}), 500
    
@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/classify",
    methods=["POST", "OPTIONS"],
)
@require_auth
def classify_existing_lessor_lease(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user_id, deny = _auth(company_id)

    if deny:
        return deny

    try:
        lease = db_service.get_lessor_lease(
            company_id,
            lease_id,
        )

        if not lease:
            return jsonify({
                "error": "Lessor lease not found"
            }), 404

        overrides = request.get_json(
            silent=True
        ) or {}

        result = (
            lessor_lease_engine.classify_lessor_lease({
                **lease,
                **overrides,
            })
        )

        with db_service._conn_cursor() as (
            conn,
            cur,
        ):
            updated = (
                db_service.update_lessor_classification(
                    company_id,
                    lease_id,
                    result,
                    user_id=user_id,
                    cur=cur,
                )
            )

            conn.commit()

        return jsonify({
            "ok": True,
            "item": updated,
            "classification": result,
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "classify_existing_lessor_lease failed"
        )
        return jsonify({"error": str(e)}), 500
    
@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/accounting-schedule/preview",
    methods=["POST", "OPTIONS"],
)
@require_auth
def preview_lessor_accounting_schedule(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, deny = _auth(company_id)

    if deny:
        return deny

    try:
        lease = db_service.get_lessor_lease(
            company_id,
            lease_id,
        )

        if not lease:
            return jsonify({
                "error": "Lessor lease not found"
            }), 404

        overrides = request.get_json(
            silent=True
        ) or {}

        result = (
            lessor_lease_engine.build_accounting_schedule({
                **lease,
                **overrides,
            })
        )

        return jsonify({
            "ok": True,
            "lease": lease,
            "result": result,
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "preview_lessor_accounting_schedule failed"
        )
        return jsonify({"error": str(e)}), 500

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/accounting-schedule/generate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def generate_lessor_accounting_schedule(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, deny = _auth(company_id)

    if deny:
        return deny

    try:
        lease = db_service.get_lessor_lease(
            company_id,
            lease_id,
        )

        if not lease:
            return jsonify({
                "error": "Lessor lease not found"
            }), 404

        overrides = request.get_json(
            silent=True
        ) or {}

        result = (
            lessor_lease_engine.build_accounting_schedule({
                **lease,
                **overrides,
            })
        )

        classification = result[
            "classification"
        ]

        with db_service._conn_cursor() as (
            conn,
            cur,
        ):
            saved = (
                db_service.save_lessor_accounting_schedule(
                    company_id,
                    lease_id,
                    classification,
                    result["schedule"],
                    cur=cur,
                )
            )

            conn.commit()

        return jsonify({
            "ok": True,
            "classification": classification,
            "created_or_updated": len(saved),
            "items": saved,
            "summary": {
                key: value
                for key, value in result.items()
                if key != "schedule"
            },
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "generate_lessor_accounting_schedule failed"
        )
        return jsonify({"error": str(e)}), 500   
    
@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/accounting-schedule",
    methods=["GET", "OPTIONS"],
)
@require_auth
def get_lessor_accounting_schedule(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, deny = _auth(company_id)

    if deny:
        return deny

    lease = db_service.get_lessor_lease(
        company_id,
        lease_id,
    )

    if not lease:
        return jsonify({
            "error": "Lessor lease not found"
        }), 404

    rows = (
        db_service.list_lessor_accounting_schedule(
            company_id,
            lease_id,
        )
    )

    return jsonify({
        "ok": True,
        "lease": lease,
        "items": rows,
    })

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/modifications/preview",
    methods=["POST", "OPTIONS"],
)
@require_auth
def preview_lessor_modification(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, deny = _auth(company_id)

    if deny:
        return deny

    try:
        lease = db_service.get_lessor_lease(
            company_id,
            lease_id,
        )

        if not lease:
            return jsonify({
                "error": "Lessor lease not found"
            }), 404

        payload = request.get_json(
            silent=True
        ) or {}

        payload["effective_date"] = _date(
            payload.get("effective_date"),
            "effective_date",
        )

        result = (
            lessor_lease_engine.preview_modification(
                lease,
                payload,
            )
        )

        return jsonify({
            "ok": True,
            "preview": result,
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "preview_lessor_modification failed"
        )
        return jsonify({"error": str(e)}), 500

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/modifications",
    methods=["POST", "OPTIONS"],
)
@require_auth
def create_lessor_modification(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user_id, deny = _auth(company_id)

    if deny:
        return deny

    try:
        lease = db_service.get_lessor_lease(
            company_id,
            lease_id,
        )

        if not lease:
            return jsonify({
                "error": "Lessor lease not found"
            }), 404

        payload = request.get_json(
            silent=True
        ) or {}

        payload["effective_date"] = _date(
            payload.get("effective_date"),
            "effective_date",
        )

        preview = (
            lessor_lease_engine.preview_modification(
                lease,
                payload,
            )
        )

        with db_service._conn_cursor() as (
            conn,
            cur,
        ):
            item = db_service.create_lessor_modification(
                company_id,
                lease_id,
                payload,
                preview,
                user_id=user_id,
                cur=cur,
            )

            conn.commit()

        return jsonify({
            "ok": True,
            "item": item,
            "preview": preview,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "create_lessor_modification failed"
        )
        return jsonify({"error": str(e)}), 500

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/termination/preview",
    methods=["POST", "OPTIONS"],
)
@require_auth
def preview_lessor_termination(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, deny = _auth(company_id)

    if deny:
        return deny

    try:
        lease = db_service.get_lessor_lease(
            company_id,
            lease_id,
        )

        if not lease:
            return jsonify({
                "error": "Lessor lease not found"
            }), 404

        payload = request.get_json(
            silent=True
        ) or {}

        payload["termination_date"] = _date(
            payload.get("termination_date"),
            "termination_date",
        )

        preview = (
            lessor_lease_engine.preview_termination(
                lease,
                payload,
            )
        )

        return jsonify({
            "ok": True,
            "preview": preview,
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "preview_lessor_termination failed"
        )
        return jsonify({"error": str(e)}), 500

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/termination",
    methods=["POST", "OPTIONS"],
)
@require_auth
def create_lessor_termination(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user_id, deny = _auth(company_id)

    if deny:
        return deny

    try:
        lease = db_service.get_lessor_lease(
            company_id,
            lease_id,
        )

        if not lease:
            return jsonify({
                "error": "Lessor lease not found"
            }), 404

        payload = request.get_json(
            silent=True
        ) or {}

        payload["termination_date"] = _date(
            payload.get("termination_date"),
            "termination_date",
        )

        preview = (
            lessor_lease_engine.preview_termination(
                lease,
                payload,
            )
        )

        with db_service._conn_cursor() as (
            conn,
            cur,
        ):
            item = db_service.create_lessor_termination(
                company_id,
                lease_id,
                payload,
                preview,
                user_id=user_id,
                cur=cur,
            )

            conn.commit()

        return jsonify({
            "ok": True,
            "item": item,
            "preview": preview,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "create_lessor_termination failed"
        )
        return jsonify({"error": str(e)}), 500

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/reconciliation",
    methods=["GET", "OPTIONS"],
)
@require_auth
def lessor_lease_reconciliation(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, deny = _auth(company_id)

    if deny:
        return deny

    try:
        lease = db_service.get_lessor_lease(
            company_id,
            lease_id,
        )

        if not lease:
            return jsonify({
                "error": "Lessor lease not found"
            }), 404

        schema = f"company_{int(company_id)}"

        totals = db_service.fetch_one(
            f"""
            SELECT
                COALESCE(SUM(
                    CASE
                        WHEN b.status <> 'void'
                        THEN b.amount_gross
                        ELSE 0
                    END
                ), 0) AS total_billed,

                COALESCE(SUM(
                    CASE
                        WHEN b.status <> 'void'
                        THEN b.vat_amount
                        ELSE 0
                    END
                ), 0) AS total_vat,

                COALESCE(SUM(
                    CASE
                        WHEN b.status <> 'void'
                        THEN b.amount_net
                        ELSE 0
                    END
                ), 0) AS total_net,

                COALESCE(SUM(
                    b.received_amount
                ), 0) AS total_received,

                COALESCE(SUM(
                    CASE
                        WHEN b.status <> 'void'
                        THEN b.amount_gross
                             - COALESCE(
                                 b.received_amount,
                                 0
                             )
                        ELSE 0
                    END
                ), 0) AS outstanding
            FROM {schema}.lessor_lease_bills b
            WHERE b.company_id=%s
            AND b.lessor_lease_id=%s
            """,
            (
                int(company_id),
                int(lease_id),
            ),
        ) or {}

        schedule = (
            db_service.list_lessor_accounting_schedule(
                company_id,
                lease_id,
            )
        )

        return jsonify({
            "ok": True,
            "lease": lease,
            "billing": totals,
            "accounting_schedule": schedule,
        })

    except Exception as e:
        current_app.logger.exception(
            "lessor_lease_reconciliation failed"
        )
        return jsonify({"error": str(e)}), 500

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/"
    "<int:lease_id>/commence",
    methods=["POST", "OPTIONS"],
)
@require_auth
def commence_lessor_lease_route(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user_id, deny = _auth(company_id)

    if deny:
        return deny

    try:
        data = request.get_json(silent=True) or {}

        commencement_date = _date(
            data.get("commencement_date"),
            "commencement_date",
            required=False,
        )

        result = db_service.post_lessor_day_one_journal(
            company_id,
            lease_id,
            commencement_date=commencement_date,
            user_id=user_id,
        )

        return jsonify({
            "ok": True,
            **result,
        }), 201

    except ValueError as e:
        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400

    except Exception as e:
        current_app.logger.exception(
            "commence_lessor_lease_route failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 500
    
@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/"
    "<int:lease_id>/accounting-schedule/post-through",
    methods=["POST", "OPTIONS"],
)
@require_auth
def post_lessor_schedule_through(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user_id, deny = _auth(company_id)

    if deny:
        return deny

    try:
        data = request.get_json(silent=True) or {}

        through_date = _date(
            data.get("through_date"),
            "through_date",
        )

        result = db_service.post_lessor_periods_through(
            company_id,
            lease_id,
            through_date,
            user_id=user_id,
        )

        return jsonify({
            "ok": True,
            **result,
        }), 201

    except ValueError as e:
        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400

    except Exception as e:
        current_app.logger.exception(
            "post_lessor_schedule_through failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 500

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/"
    "<int:lessor_lease_id>/schedule/"
    "<int:schedule_id>/invoice-preview",
    methods=["GET", "OPTIONS"],
)
@require_auth
def lessor_schedule_invoice_preview(
    company_id,
    lessor_lease_id,
    schedule_id,
):
    if request.method == "OPTIONS":
        return _opt()

    deny = _deny_if_wrong_company(
        request.jwt_payload or {},
        company_id,
        db_service=db_service,
    )

    if deny:
        return deny

    try:
        result = (
            db_service.preview_lessor_schedule_invoice(
                company_id,
                lessor_lease_id,
                schedule_id,
            )
        )

        return jsonify(result), 200

    except ValueError as exc:
        return _json_error(str(exc), 400)

    except Exception as exc:
        current_app.logger.exception(
            "lessor_schedule_invoice_preview failed"
        )

        return _json_error(str(exc), 500)

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/"
    "<int:lessor_lease_id>/schedule/"
    "<int:schedule_id>/invoice",
    methods=["POST", "OPTIONS"],
)
@require_auth
def lessor_schedule_create_invoice(
    company_id,
    lessor_lease_id,
    schedule_id,
):
    if request.method == "OPTIONS":
        return _opt()

    deny = _deny_if_wrong_company(
        request.jwt_payload or {},
        company_id,
        db_service=db_service,
    )

    if deny:
        return deny

    try:
        payload = request.jwt_payload or {}

        user_id = (
            payload.get("user_id")
            or payload.get("sub")
        )

        result = (
            db_service.create_lessor_schedule_invoice(
                company_id,
                lessor_lease_id,
                schedule_id,
                user_id=user_id,
            )
        )

        return jsonify(result), 201

    except ValueError as exc:
        return _json_error(str(exc), 400)

    except Exception as exc:
        current_app.logger.exception(
            "lessor_schedule_create_invoice failed"
        )

        return _json_error(str(exc), 500)
    
@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/"
    "<int:lessor_lease_id>/invoices/create-through",
    methods=["POST", "OPTIONS"],
)
@require_auth
def lessor_create_invoices_through(
    company_id,
    lessor_lease_id,
):
    if request.method == "OPTIONS":
        return _opt()

    deny = _deny_if_wrong_company(
        request.jwt_payload or {},
        company_id,
        db_service=db_service,
    )

    if deny:
        return deny

    try:
        body = request.get_json(silent=True) or {}

        through_date = body.get("through_date")

        if not through_date:
            return _json_error(
                "through_date is required",
                400,
            )

        jwt_payload = request.jwt_payload or {}

        user_id = (
            jwt_payload.get("user_id")
            or jwt_payload.get("sub")
        )

        result = (
            db_service.create_lessor_invoices_through(
                company_id,
                lessor_lease_id,
                through_date,
                user_id=user_id,
            )
        )

        status = (
            200
            if result.get("failed_count") == 0
            else 207
        )

        return jsonify(result), status

    except ValueError as exc:
        return _json_error(str(exc), 400)

    except Exception as exc:
        current_app.logger.exception(
            "lessor_create_invoices_through failed"
        )

        return _json_error(str(exc), 500)
    
