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

def _bool(value) -> bool:
    if isinstance(value, bool):
        return value

    return str(value or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "y",
        "on",
    }

def _assert_asset_available_for_lessor_lease(
    company_id: int,
    asset_id,
    *,
    exclude_lease_id=None,
    cur=None,
):
    asset_id = int(asset_id or 0)
    if not asset_id:
        raise ValueError("asset_id is required")

    schema = db_service.company_schema(company_id)

    existing = db_service.fetch_one(
        f"""
        SELECT id, contract_no, contract_name, status
        FROM {schema}.lessor_leases
        WHERE company_id=%s
          AND asset_id=%s
          AND COALESCE(status, '') NOT IN ('cancelled', 'terminated')
          AND (%s::int IS NULL OR id<>%s::int)
        ORDER BY id DESC
        LIMIT 1
        """,
        (
            int(company_id),
            asset_id,
            exclude_lease_id,
            exclude_lease_id,
        ),
        cur=cur,
    )

    if existing:
        name = (
            existing.get("contract_name")
            or existing.get("contract_no")
            or f"Lease {existing['id']}"
        )

        raise ValueError(
            f"The selected asset is already linked to {name} "
            f"with status {existing.get('status') or 'unknown'}."
        )
    
def _number(
    value,
    name: str,
    *,
    minimum=None,
) -> float:
    try:
        result = float(value or 0)
    except (TypeError, ValueError):
        raise ValueError(
            f"{name} must be a valid number"
        )

    if minimum is not None and result < minimum:
        raise ValueError(
            f"{name} cannot be less than {minimum}"
        )

    return result


def _classification_payload(
    data: dict,
) -> dict:
    if not isinstance(data, dict):
        raise ValueError(
            "JSON body must be an object"
        )

    lease_term_months = int(
        data.get("lease_term_months") or 0
    )

    if lease_term_months <= 0:
        raise ValueError(
            "lease_term_months must be greater than zero"
        )

    override_enabled = _bool(
        data.get("classification_override")
    )

    requested_classification = (
        data.get("lease_classification")
        or ""
    ).strip().lower()

    if (
        requested_classification
        and requested_classification
        not in {"finance", "operating"}
    ):
        raise ValueError(
            "Invalid lease_classification"
        )

    return {
        **data,

        "lease_term_months":
            lease_term_months,

        "economic_life_months": int(
            data.get("economic_life_months")
            or 0
        ),

        "fair_value": _number(
            data.get(
                "underlying_asset_fair_value",
                data.get("fair_value"),
            ),
            "underlying_asset_fair_value",
            minimum=0,
        ),

        "pv_lease_payments": _number(
            data.get(
                "present_value_lease_payments",
                data.get("pv_lease_payments"),
            ),
            "present_value_lease_payments",
            minimum=0,
        ),

        "transfer_of_ownership": _bool(
            data.get(
                "ownership_transfers",
                data.get(
                    "transfer_of_ownership"
                ),
            )
        ),

        "purchase_option_reasonably_certain":
            _bool(
                data.get(
                    "purchase_option_reasonably_certain"
                )
            ),

        "specialised_asset": _bool(
            data.get("specialised_asset")
        ),

        "manufacturer_dealer_lessor":
            _bool(
                data.get(
                    "manufacturer_dealer_lessor"
                )
            ),

        "classification_override": (
            requested_classification
            if override_enabled
            else ""
        ),

        "classification_override_reason": (
            data.get(
                "classification_override_reason"
            )
            or ""
        ).strip() or None,
    }

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

    asset_description = (
        data.get(
            "underlying_asset_description"
        ) or ""
    ).strip()

    if not asset_description:
        raise ValueError(
            "underlying_asset_description is required"
        )

    fair_value = _number(
        data.get(
            "underlying_asset_fair_value"
        ),
        "underlying_asset_fair_value",
        minimum=0,
    )

    if fair_value <= 0:
        raise ValueError(
            "underlying_asset_fair_value "
            "must be greater than zero"
        )

    economic_life_months = int(
        data.get("economic_life_months")
        or 0
    )

    if economic_life_months <= 0:
        raise ValueError(
            "economic_life_months "
            "must be greater than zero"
        )
    return {
        "contract_no": (data.get("contract_no") or "").strip() or None,
        "contract_name": contract_name,
        "customer_id": customer_id,
        "asset_id": int(data["asset_id"]) if data.get("asset_id") else None,
        "underlying_asset_description": (
            data.get(
                "underlying_asset_description"
            ) or ""
        ).strip() or None,

        "underlying_asset_account_code": (
            data.get(
                "underlying_asset_account_code"
            ) or ""
        ).strip() or None,

        "underlying_asset_carrying_amount":
            _number(
                data.get(
                    "underlying_asset_carrying_amount"
                ),
                "underlying_asset_carrying_amount",
                minimum=0,
            ),

        "underlying_asset_fair_value":
            _number(
                data.get(
                    "underlying_asset_fair_value"
                ),
                "underlying_asset_fair_value",
                minimum=0,
            ),

        "fair_value": _number(
            data.get(
                "underlying_asset_fair_value",
                data.get("fair_value"),
            ),
            "fair_value",
            minimum=0,
        ),

        "economic_life_months": int(
            data.get("economic_life_months")
            or 0
        ),

        "guaranteed_residual_value":
            _number(
                data.get(
                    "guaranteed_residual_value"
                ),
                "guaranteed_residual_value",
                minimum=0,
            ),

        "unguaranteed_residual_value":
            _number(
                data.get(
                    "unguaranteed_residual_value"
                ),
                "unguaranteed_residual_value",
                minimum=0,
            ),

        "initial_direct_costs":
            _number(
                data.get(
                    "initial_direct_costs"
                ),
                "initial_direct_costs",
                minimum=0,
            ),

        "interest_rate_implicit":
            _number(
                data.get(
                    "interest_rate_implicit"
                ),
                "interest_rate_implicit",
                minimum=0,
            ),

        "implicit_interest_rate":
            _number(
                data.get(
                    "interest_rate_implicit",
                    data.get(
                        "implicit_interest_rate"
                    ),
                ),
                "implicit_interest_rate",
                minimum=0,
            ),

        "ownership_transfers": _bool(
            data.get("ownership_transfers")
        ),

        "transfer_of_ownership": _bool(
            data.get(
                "ownership_transfers",
                data.get(
                    "transfer_of_ownership"
                ),
            )
        ),

        "purchase_option_reasonably_certain":
            _bool(
                data.get(
                    "purchase_option_reasonably_certain"
                )
            ),

        "specialised_asset": _bool(
            data.get("specialised_asset")
        ),
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
        "manufacturer_dealer_lessor":
            _bool(
                data.get(
                    "manufacturer_dealer_lessor"
                )
            ),

        "classification_override":
            _bool(
                data.get(
                    "classification_override"
                )
            ),

        "classification_override_reason": (
            data.get(
                "classification_override_reason"
            ) or ""
        ).strip() or None,
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
            _assert_asset_available_for_lessor_lease(
                company_id,
                payload.get("asset_id"),
                cur=cur,
            )

            lease = db_service.create_lessor_lease(
                company_id,
                {**payload, "status": "draft"},
                created_by_user_id=user_id,
                cur=cur,
            )

            lease_id = int(lease["id"])
            classification = str(lease.get("lease_classification") or "operating").strip().lower()

            billing_rows = build_lessor_billing_schedule(lease)
            for row in billing_rows:
                row["vat_rate"] = float(lease.get("vat_rate") or 0)

            saved_billing = db_service.save_lessor_billing_schedule(
                company_id,
                lease_id,
                billing_rows,
                cur=cur,
            )

            accounting_result = lessor_lease_engine.build_accounting_schedule(lease)
            accounting_rows = accounting_result.get("schedule") or []

            if not accounting_rows:
                raise ValueError("The lessor accounting schedule could not be generated")

            saved_schedule = db_service.save_lessor_accounting_schedule(
                company_id,
                lease_id,
                classification,
                accounting_rows,
                cur=cur,
            )

            journal = db_service.build_lessor_day_one_journal(
                company_id,
                lease_id,
                cur=cur,
            )

            journal_id = None

            if journal:
                journal.update({
                    "prepared_by_user_id": user_id,
                    "created_by_user_id": user_id,
                    "updated_by_user_id": user_id,
                })

                journal_id = db_service.post_journal(
                    company_id,
                    journal,
                    cur=cur,
                    conn=conn,
                )

            commenced = db_service.commence_lessor_lease(
                company_id,
                lease_id,
                commencement_date=lease.get("commencement_date") or lease.get("start_date"),
                journal_id=journal_id,
                user_id=user_id,
                cur=cur,
            )

            if not commenced:
                raise ValueError("The lessor lease could not be commenced")

            conn.commit()

        return jsonify({
            "ok": True,
            "item": commenced,
            "classification": classification,
            "billing_schedule_count": len(saved_billing),
            "accounting_schedule_count": len(saved_schedule),
            "commencement_journal_id": journal_id,
            "commencement_journal": journal,
            "message": (
                "Finance lease created and Day 1 journal posted"
                if journal_id
                else "Operating lease created and commenced"
            ),
        }), 201

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
        return _corsify(
            make_response("", 204)
        )

    _, deny = _auth(company_id)

    if deny:
        return deny

    try:
        raw = request.get_json(
            silent=True
        ) or {}

        payload = _classification_payload(
            raw
        )

        _assert_asset_available_for_lessor_lease(
            company_id,
            payload.get("asset_id"),
        )

        result = (
            lessor_lease_engine
            .classify_and_validate(payload)
        )

        return jsonify({
            "ok": True,
            "data": result,
        }), 200

    except ValueError as exc:
        return jsonify({
            "ok": False,
            "error": str(exc),
        }), 400

    except Exception as exc:
        current_app.logger.exception(
            "classify_lessor_lease failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc),
        }), 500
    
@lessor_bp.route(
    "/api/companies/<int:company_id>"
    "/lessor-leases/terms/preview",
    methods=["POST", "OPTIONS"],
)
@require_auth
def preview_lessor_terms(
    company_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(
            make_response("", 204)
        )

    _, deny = _auth(company_id)

    if deny:
        return deny

    try:
        raw = request.get_json(
            silent=True
        ) or {}

        payload = _classification_payload(
            raw
        )

        _assert_asset_available_for_lessor_lease(
            company_id,
            payload.get("asset_id"),
        )

        payload.update({
            "underlying_asset_carrying_amount":
                _number(
                    raw.get(
                        "underlying_asset_carrying_amount"
                    ),
                    "underlying_asset_carrying_amount",
                    minimum=0,
                ),
            "billing_amount":
                _number(
                    raw.get("billing_amount"),
                    "billing_amount",
                    minimum=0,
                ),

            "billing_basis": (
                raw.get("billing_basis")
                or "gross"
            ).strip().lower(),

            "vat_rate":
                _number(
                    raw.get("vat_rate"),
                    "vat_rate",
                    minimum=0,
                ),

            "lease_incentives":
                _number(
                    raw.get(
                        "lease_incentives"
                    ),
                    "lease_incentives",
                    minimum=0,
                ),
            "interest_rate_implicit":
                _number(
                    raw.get(
                        "interest_rate_implicit"
                    ),
                    "interest_rate_implicit",
                    minimum=0,
                ),

            "guaranteed_residual_value":
                _number(
                    raw.get(
                        "guaranteed_residual_value"
                    ),
                    "guaranteed_residual_value",
                    minimum=0,
                ),

            "unguaranteed_residual_value":
                _number(
                    raw.get(
                        "unguaranteed_residual_value"
                    ),
                    "unguaranteed_residual_value",
                    minimum=0,
                ),

            "initial_direct_costs":
                _number(
                    raw.get(
                        "initial_direct_costs"
                    ),
                    "initial_direct_costs",
                    minimum=0,
                ),

            "billing_frequency": (
                raw.get("billing_frequency")
                or "monthly"
            ).strip().lower(),

            "billing_timing": (
                raw.get("billing_timing")
                or "arrears"
            ).strip().lower(),

            "manufacturer_dealer_lessor":
                _bool(
                    raw.get(
                        "manufacturer_dealer_lessor"
                    )
                ),
        })

        result = (
            lessor_lease_engine
            .preview_lessor_terms(
                payload
            )
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except ValueError as exc:
        return jsonify({
            "ok": False,
            "error": str(exc),
        }), 400

    except Exception as exc:
        current_app.logger.exception(
            "preview_lessor_terms failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc),
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
    
@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/"
    "<int:lease_id>/subsequent-measurement",
    methods=["GET", "OPTIONS"],
)
@require_auth
def lessor_subsequent_measurement(company_id, lease_id):
    if request.method == "OPTIONS":
        return _opt()

    _, deny = _auth(company_id)
    if deny:
        return deny

    try:
        as_at = _date(
            request.args.get("as_at"),
            "as_at",
            required=False,
        )

        return jsonify({
            "ok": True,
            **db_service.get_lessor_subsequent_measurement_workspace(
                company_id,
                lease_id,
                as_at=as_at,
            ),
        })
    except ValueError as e:
        return _json_error(str(e), 400)
    except Exception as e:
        current_app.logger.exception(
            "lessor_subsequent_measurement failed"
        )
        return _json_error(str(e), 500)

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/"
    "<int:lease_id>/accounting-schedule/"
    "<int:schedule_id>/journal-preview",
    methods=["GET", "OPTIONS"],
)
@require_auth
def lessor_period_journal_preview(
    company_id,
    lease_id,
    schedule_id,
):
    if request.method == "OPTIONS":
        return _opt()

    _, deny = _auth(company_id)
    if deny:
        return deny

    try:
        journal = db_service.build_lessor_period_journal(
            company_id,
            lease_id,
            schedule_id,
        )

        return jsonify({
            "ok": True,
            "journal": journal,
            "message": (
                "Journal preview generated"
                if journal
                else "No accounting adjustment is required"
            ),
        })
    except ValueError as e:
        return _json_error(str(e), 400)
    except Exception as e:
        current_app.logger.exception(
            "lessor_period_journal_preview failed"
        )
        return _json_error(str(e), 500)
    
@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/"
    "<int:lease_id>/accounting-schedule/"
    "<int:schedule_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def post_lessor_schedule_period(
    company_id,
    lease_id,
    schedule_id,
):
    if request.method == "OPTIONS":
        return _opt()

    user_id, deny = _auth(company_id)
    if deny:
        return deny

    try:
        return jsonify({
            "ok": True,
            **db_service.post_lessor_period(
                company_id,
                lease_id,
                schedule_id,
                user_id=user_id,
            ),
        }), 201
    except ValueError as e:
        return _json_error(str(e), 400)
    except Exception as e:
        current_app.logger.exception(
            "post_lessor_schedule_period failed"
        )
        return _json_error(str(e), 500)

@lessor_bp.route(
    "/api/companies/<int:company_id>/lessor-leases/<int:lease_id>/recalculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def recalculate_lessor_lease(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user_id, deny = _auth(company_id)
    if deny:
        return deny

    try:
        raw = request.get_json(silent=True) or {}
        schema = db_service.company_schema(company_id)

        with db_service._conn_cursor() as (conn, cur):
            lease = db_service.get_lessor_lease(company_id, lease_id, cur=cur)
            if not lease:
                return _json_error("Lessor lease not found", 404)

            if str(lease.get("status") or "").lower() != "draft":
                raise ValueError("Only a draft lease can be corrected and recalculated")

            if lease.get("commencement_journal_id"):
                raise ValueError("The lease has already been commenced and cannot be directly corrected")

            consequences = db_service.fetch_one(
                f"""
                SELECT
                    COUNT(*) FILTER (
                        WHERE recognition_journal_id IS NOT NULL
                    ) AS posted_periods,
                    COUNT(*) FILTER (
                        WHERE invoice_id IS NOT NULL
                    ) AS invoiced_periods,
                    COALESCE(SUM(receipt_amount), 0) AS receipts
                FROM {schema}.lessor_lease_schedule
                WHERE company_id=%s
                  AND lessor_lease_id=%s
                """,
                (int(company_id), int(lease_id)),
                cur=cur,
            ) or {}

            if int(consequences.get("posted_periods") or 0) > 0:
                raise ValueError("A schedule period has already been posted")

            if int(consequences.get("invoiced_periods") or 0) > 0:
                raise ValueError("A schedule period has already been invoiced")

            if float(consequences.get("receipts") or 0) > 0:
                raise ValueError("A receipt has already been allocated to this lease")

            billed = db_service.fetch_one(
                f"""
                SELECT COUNT(*) AS n
                FROM {schema}.lessor_lease_bills
                WHERE company_id=%s
                  AND lessor_lease_id=%s
                  AND (
                      invoice_id IS NOT NULL
                      OR status IN ('posted', 'paid')
                  )
                """,
                (int(company_id), int(lease_id)),
                cur=cur,
            ) or {}

            if int(billed.get("n") or 0) > 0:
                raise ValueError("The lease already has posted, paid or invoiced billing records")

            start_date = _date(
                raw.get("start_date") or lease.get("start_date"),
                "start_date",
            )

            end_date = _date(
                raw.get("end_date") or lease.get("end_date"),
                "end_date",
            )

            if end_date < start_date:
                raise ValueError("end_date cannot be before start_date")

            billing_amount = _number(
                raw.get("billing_amount", lease.get("billing_amount")),
                "billing_amount",
                minimum=0,
            )

            if billing_amount <= 0:
                raise ValueError("billing_amount must be greater than zero")

            implicit_rate = _number(
                raw.get(
                    "interest_rate_implicit",
                    lease.get("interest_rate_implicit")
                    or lease.get("implicit_interest_rate")
                    or lease.get("discount_rate"),
                ),
                "interest_rate_implicit",
                minimum=0,
            )

            payment_terms_days = int(
                raw.get(
                    "payment_terms_days",
                    lease.get("payment_terms_days") or 0,
                )
            )

            vat_rate = _number(
                raw.get("vat_rate", lease.get("vat_rate")),
                "vat_rate",
                minimum=0,
            )

            if vat_rate > 1:
                vat_rate /= 100

            lease_term_months = _lease_term_months(start_date, end_date)

            updated = db_service.fetch_one(
                f"""
                UPDATE {schema}.lessor_leases
                SET
                    start_date=%s,
                    end_date=%s,
                    lease_term_months=%s,
                    billing_amount=%s,
                    payment_terms_days=%s,
                    vat_rate=%s,
                    interest_rate_implicit=%s,
                    discount_rate=%s,
                    updated_by_user_id=%s,
                    updated_at=NOW()
                WHERE company_id=%s
                  AND id=%s
                  AND status='draft'
                RETURNING *
                """,
                (
                    start_date,
                    end_date,
                    lease_term_months,
                    billing_amount,
                    payment_terms_days,
                    vat_rate,
                    implicit_rate,
                    implicit_rate,
                    user_id,
                    int(company_id),
                    int(lease_id),
                ),
                cur=cur,
            )

            if not updated:
                raise ValueError("The draft lease could not be updated")

            billing_rows = build_lessor_billing_schedule(updated)
            classification = str(
                updated.get("lease_classification") or "operating"
            ).lower()

            if classification == "finance":
                accounting_rows = lessor_lease_engine.build_finance_lease_schedule(updated)
            elif classification == "operating":
                accounting_rows = lessor_lease_engine.build_operating_lease_schedule(updated)
            else:
                raise ValueError("Invalid lessor lease classification")

            billing_by_period = {
                int(row["period_no"]): row
                for row in billing_rows
            }

            schedule_rows = []

            for accounting in accounting_rows:
                period_no = int(accounting["period_no"])
                billing = billing_by_period.get(period_no)

                if not billing:
                    raise ValueError(
                        f"Billing period {period_no} does not match the accounting schedule"
                    )

                schedule_rows.append({
                    **accounting,
                    "period_no": period_no,
                    "period_start": accounting.get("period_start") or billing["period_start"],
                    "period_end": accounting.get("period_end") or billing["period_end"],
                    "payment_date": accounting.get("payment_date") or billing["bill_date"],
                    "due_date": billing["due_date"],
                    "contractual_net": billing["amount_net"],
                    "vat_amount": billing["vat_amount"],
                    "contractual_gross": billing["amount_gross"],
                    "principal_recovery": accounting.get(
                        "principal_recovery",
                        accounting.get("principal_reduction", 0),
                    ),
                    "accrued_rental_movement": accounting.get(
                        "accrued_rental_movement",
                        accounting.get("accrued_rent_movement", 0),
                    ),
                    "deferred_rental_movement": accounting.get(
                        "deferred_rental_movement",
                        accounting.get("deferred_rent_movement", 0),
                    ),
                })

            db_service.fetch_all(
                f"""
                DELETE FROM {schema}.lessor_lease_bills
                WHERE company_id=%s
                AND lessor_lease_id=%s
                AND invoice_id IS NULL
                AND status='draft'
                RETURNING id
                """,
                (int(company_id), int(lease_id)),
                cur=cur,
            )

            saved = db_service.save_lessor_accounting_schedule(
                company_id,
                lease_id,
                classification,
                schedule_rows,
                cur=cur,
            )

            conn.commit()

        workspace = db_service.get_lessor_subsequent_measurement_workspace(
            company_id,
            lease_id,
        )

        return jsonify({
            "ok": True,
            "message": "Lease updated and schedule recalculated",
            "item": updated,
            "schedule_count": len(saved),
            **workspace,
        })

    except ValueError as exc:
        return _json_error(str(exc), 400)

    except Exception as exc:
        current_app.logger.exception("recalculate_lessor_lease failed")
        return _json_error(str(exc), 500)

@lessor_bp.route(
    "/api/companies/<int:company_id>"
    "/lessor-leases/<int:lease_id>/corrections",
    methods=["POST", "OPTIONS"],
)
@require_auth
def correct_lessor_lease_route(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user_id, deny = _auth(company_id)

    if deny:
        return deny

    try:
        raw = request.get_json(
            silent=True
        ) or {}

        reason = (
            raw.pop("reason", None) or ""
        ).strip()

        if not reason:
            raise ValueError(
                "Correction reason is required"
            )

        result = (
            db_service.correct_lessor_lease(
                company_id,
                lease_id,
                raw,
                reason=reason,
                user_id=user_id,
            )
        )

        return jsonify({
            "ok": True,
            "message": (
                "Lease corrected, recalculated "
                "and recommenced"
            ),
            **result,
        })

    except ValueError as exc:
        return _json_error(
            str(exc),
            400,
        )

    except Exception as exc:
        current_app.logger.exception(
            "correct_lessor_lease_route failed"
        )

        return _json_error(
            str(exc),
            500,
        )

@lessor_bp.route(
    "/api/companies/<int:company_id>"
    "/lessor-leases/<int:lease_id>/schedule-versions",
    methods=["GET", "OPTIONS"],
)
@require_auth
def lessor_schedule_versions(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    _, deny = _auth(company_id)

    if deny:
        return deny

    version_no = request.args.get(
        "version_no",
        type=int,
    )

    return jsonify({
        "ok": True,

        "versions":
            db_service
            .list_lessor_schedule_versions(
                company_id,
                lease_id,
            ),

        "items":
            db_service
            .get_lessor_schedule_version(
                company_id,
                lease_id,
                version_no,
            ),
    })

@lessor_bp.route(
    "/api/companies/<int:company_id>"
    "/lessor-leases/<int:lease_id>/schedule-versions",
    methods=["GET", "OPTIONS"],
)
@require_auth
def lessor_schedule_versions(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    _, deny = _auth(company_id)

    if deny:
        return deny

    version_no = request.args.get(
        "version_no",
        type=int,
    )

    return jsonify({
        "ok": True,

        "versions":
            db_service
            .list_lessor_schedule_versions(
                company_id,
                lease_id,
            ),

        "items":
            db_service
            .get_lessor_schedule_version(
                company_id,
                lease_id,
                version_no,
            ),
    })

@lessor_bp.route(
    "/api/companies/<int:company_id>"
    "/lessor-leases/<int:lease_id>/billing-workspace",
    methods=["GET", "OPTIONS"],
)
@require_auth
def lessor_billing_workspace(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    _, deny = _auth(company_id)

    if deny:
        return deny

    return jsonify({
        "ok": True,
        **db_service.get_lessor_billing_workspace(
            company_id,
            lease_id,
        ),
    })

@lessor_bp.route(
    "/api/companies/<int:company_id>"
    "/lessor-leases/<int:lease_id>/modifications",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def lessor_modifications_collection(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user_id, deny = _auth(company_id)

    if deny:
        return deny

    if request.method == "GET":
        return jsonify({
            "ok": True,
            "items":
                db_service
                .list_lessor_modifications(
                    company_id,
                    lease_id,
                ),
        })

    try:
        lease = db_service.get_lessor_lease(
            company_id,
            lease_id,
        )

        if not lease:
            return _json_error(
                "Lessor lease not found",
                404,
            )

        payload = request.get_json(
            silent=True
        ) or {}

        payload["effective_date"] = _date(
            payload.get("effective_date"),
            "effective_date",
        )

        preview = (
            lessor_lease_engine
            .preview_modification(
                lease,
                payload,
            )
        )

        with db_service._conn_cursor() as (
            conn,
            cur,
        ):
            item = (
                db_service
                .create_lessor_modification(
                    company_id,
                    lease_id,
                    payload,
                    preview,
                    user_id=user_id,
                    cur=cur,
                )
            )

            conn.commit()

        return jsonify({
            "ok": True,
            "item": item,
            "preview": preview,
        }), 201

    except ValueError as exc:
        return _json_error(
            str(exc),
            400,
        )

    except Exception as exc:
        current_app.logger.exception(
            "lessor_modifications_collection failed"
        )

        return _json_error(
            str(exc),
            500,
        )

@lessor_bp.route(
    "/api/companies/<int:company_id>"
    "/lessor-leases/<int:lease_id>/terminations",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def lessor_terminations_collection(
    company_id: int,
    lease_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user_id, deny = _auth(company_id)

    if deny:
        return deny

    if request.method == "GET":
        return jsonify({
            "ok": True,
            "items":
                db_service
                .list_lessor_terminations(
                    company_id,
                    lease_id,
                ),
        })

    try:
        lease = db_service.get_lessor_lease(
            company_id,
            lease_id,
        )

        if not lease:
            return _json_error(
                "Lessor lease not found",
                404,
            )

        payload = request.get_json(
            silent=True
        ) or {}

        payload["termination_date"] = _date(
            payload.get("termination_date"),
            "termination_date",
        )

        preview = (
            lessor_lease_engine
            .preview_termination(
                lease,
                payload,
            )
        )

        with db_service._conn_cursor() as (
            conn,
            cur,
        ):
            item = (
                db_service
                .create_lessor_termination(
                    company_id,
                    lease_id,
                    payload,
                    preview,
                    user_id=user_id,
                    cur=cur,
                )
            )

            conn.commit()

        return jsonify({
            "ok": True,
            "item": item,
            "preview": preview,
        }), 201

    except ValueError as exc:
        return _json_error(
            str(exc),
            400,
        )

    except Exception as exc:
        current_app.logger.exception(
            "lessor_terminations_collection failed"
        )

        return _json_error(
            str(exc),
            500,
        )

    