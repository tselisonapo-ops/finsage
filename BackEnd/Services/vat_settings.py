# BackEnd/Services/vat_settings.py
from flask import Blueprint, request, jsonify, g, current_app
from datetime import date
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service

bp = Blueprint("companies_vat_settings", __name__)

def _deny_if_wrong_company(
    payload,
    company_id: int,
    *,
    db_service,
    engagement_id: int | None = None,
):
    role = (payload.get("role") or "").strip().lower()
    if role == "admin":
        return None

    user_id = payload.get("user_id") or payload.get("sub")
    try:
        user_id = int(user_id) if user_id is not None else None
    except Exception:
        user_id = None

    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        target_company_id = int(company_id)
    except Exception:
        return jsonify({"ok": False, "error": "AUTH|invalid_company_id"}), 400

    token_company_id = payload.get("token_company_id", payload.get("company_id"))
    try:
        token_company_id = int(token_company_id) if token_company_id is not None else None
    except Exception:
        token_company_id = None

    allowed_company_ids = (
        payload.get("token_allowed_company_ids")
        or payload.get("allowed_company_ids")
        or []
    )
    try:
        allowed_company_ids = [int(x) for x in allowed_company_ids]
    except Exception:
        allowed_company_ids = []

    # direct access
    if target_company_id == token_company_id:
        return None

    if target_company_id in allowed_company_ids:
        return None

    # delegated access through engagement workspaces
    candidate_home_company_ids = []
    if token_company_id is not None:
        candidate_home_company_ids.append(token_company_id)

    for cid in allowed_company_ids:
        if cid not in candidate_home_company_ids:
            candidate_home_company_ids.append(cid)

    for home_company_id in candidate_home_company_ids:
        try:
            with db_service._conn_cursor() as (_, cur):
                delegated_ok = db_service.user_has_delegated_company_access(
                    cur,
                    user_id=user_id,
                    company_id=home_company_id,
                    target_company_id=target_company_id,
                    engagement_id=engagement_id,
                )
            if delegated_ok:
                return None
        except Exception as e:
            print("DELEGATED ACCESS CHECK FAILED", {
                "user_id": user_id,
                "home_company_id": home_company_id,
                "target_company_id": target_company_id,
                "engagement_id": engagement_id,
                "error": str(e),
            })

    return jsonify({"ok": False, "error": "Access denied for this company"}), 403

@bp.get("/api/companies/<int:company_id>/vat_settings")
@require_auth
def get_vat_settings(company_id):

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    cfg = db_service.get_vat_settings(company_id) or {}
    return jsonify(cfg), 200


@bp.put("/api/companies/<int:company_id>/vat_settings")
@require_auth
def update_vat_settings(company_id: int):

    # -------------------------------------------------
    # Auth guard
    # -------------------------------------------------
    payload = getattr(request, "jwt_payload", {}) or {}

    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )

    if deny:
        return deny

    user_id = payload.get("sub") or payload.get("user_id")

    # -------------------------------------------------
    # Parse body
    # -------------------------------------------------
    data = request.get_json(silent=True) or {}

    # -------------------------------------------------
    # Load existing settings FIRST
    #
    # IMPORTANT:
    # Do not replace the whole JSON object because it
    # may already contain VAT GL/account configuration.
    # -------------------------------------------------
    existing = (
        db_service.get_vat_settings(company_id)
        or {}
    )

    if not isinstance(existing, dict):
        existing = {}

    before_cfg = dict(existing)

    # -------------------------------------------------
    # Authority
    #
    # Authority should normally be resolved from the
    # company's country, but an explicitly selected
    # authority is accepted from the setup screen.
    # -------------------------------------------------
    authority_code = str(
        data.get("authority_code")
        or existing.get("authority_code")
        or ""
    ).strip().upper()

    if not authority_code:

        company = db_service.fetch_one("""
            SELECT country
            FROM public.companies
            WHERE id=%s
            LIMIT 1;
        """, (int(company_id),)) or {}

        country = str(
            company.get("country")
            or ""
        ).strip().upper()

        authority_map = {
            "ZA": "SARS",
            "ZAF": "SARS",
            "SOUTH AFRICA": "SARS",

            "LS": "RSL",
            "LSO": "RSL",
            "LESOTHO": "RSL",

            "BW": "BURS",
            "BWA": "BURS",
            "BOTSWANA": "BURS",
        }

        authority_code = authority_map.get(
            country
        )

    if authority_code:

        authority = db_service.fetch_one("""
            SELECT
                id,
                authority_code,
                country_code,
                name,
                tax_name,
                currency_code,
                is_active
            FROM public.vat_authorities
            WHERE authority_code=%s
              AND is_active=TRUE
            LIMIT 1;
        """, (authority_code,))

        if not authority:
            return jsonify({
                "ok": False,
                "error": (
                    f"Unsupported or inactive VAT authority: "
                    f"{authority_code}"
                ),
            }), 400

    # -------------------------------------------------
    # Filing channel
    # -------------------------------------------------
    filing_channel = str(
        data.get("filing_channel")
        or existing.get("filing_channel")
        or (
            "efiling"
            if authority_code == "SARS"
            else "electronic"
        )
    ).strip().lower()

    allowed_channels = {
        "efiling",
        "electronic",
        "manual",
    }

    if filing_channel not in allowed_channels:
        filing_channel = (
            "efiling"
            if authority_code == "SARS"
            else "electronic"
        )

    # -------------------------------------------------
    # VAT filing category
    #
    # New setup uses period_category/category_code.
    # Keep both names compatible with older code.
    # -------------------------------------------------
    category_code = str(
        data.get("period_category")
        or data.get("category_code")
        or existing.get("period_category")
        or existing.get("category_code")
        or ""
    ).strip().upper()

    # -------------------------------------------------
    # VAT registration number
    # -------------------------------------------------
    vat_registration_number = str(
        data.get("vat_registration_number")
        or existing.get("vat_registration_number")
        or ""
    ).strip()

    # -------------------------------------------------
    # Customs / additional authority information
    # -------------------------------------------------
    customs_code = str(
        data.get("customs_code")
        or existing.get("customs_code")
        or ""
    ).strip()

    # -------------------------------------------------
    # Reminder
    # -------------------------------------------------
    try:
        reminder_days_before = int(
            data.get(
                "reminder_days_before",
                existing.get(
                    "reminder_days_before",
                    10
                ),
            )
        )
    except (TypeError, ValueError):
        reminder_days_before = 10

    reminder_days_before = max(
        0,
        reminder_days_before
    )

    # -------------------------------------------------
    # Prices include VAT
    # -------------------------------------------------
    if (
        "prices_include_vat" in data
        or "pricing_includes_vat" in data
    ):
        prices_include_vat = bool(
            data.get("prices_include_vat")
            if "prices_include_vat" in data
            else data.get("pricing_includes_vat")
        )
    else:
        prices_include_vat = bool(
            existing.get(
                "prices_include_vat",
                False
            )
        )

    # -------------------------------------------------
    # Preserve existing legacy fields for compatibility
    #
    # We do NOT delete frequency / anchor_month yet.
    # Existing VAT dashboard code may still read them.
    # -------------------------------------------------
    cfg = dict(existing)

    cfg.update({
        "authority_code": authority_code,

        "vat_registration_number":
            vat_registration_number,

        "filing_channel":
            filing_channel,

        "period_category":
            category_code,

        # compatibility with code that calls it category_code
        "category_code":
            category_code,

        "customs_code":
            customs_code,

        "reminder_days_before":
            reminder_days_before,

        "prices_include_vat":
            prices_include_vat,
    })

    # -------------------------------------------------
    # Validate the selected filing category against
    # the seeded authority rules.
    #
    # This prevents a company from saving something
    # such as SARS Category Z when no such rule exists.
    # -------------------------------------------------
    if category_code:

        today = date.today()

        regime = db_service.fetch_one("""
            SELECT id
            FROM public.vat_regimes
            WHERE authority_id=%s
              AND is_active=TRUE
              AND effective_from <= %s
              AND (
                  effective_to IS NULL
                  OR effective_to >= %s
              )
            ORDER BY effective_from DESC, id DESC
            LIMIT 1;
        """, (
            authority["id"],
            today,
            today,
        ))

        if not regime:
            return jsonify({
                "ok": False,
                "error": (
                    f"No active VAT regime is configured "
                    f"for {authority_code}."
                ),
            }), 400

        period_rule = db_service.fetch_one("""
            SELECT
                id,
                category_code,
                name,
                frequency,
                period_months,
                anchor_month,
                return_due_rule,
                payment_due_rule,
                filing_channel,
                effective_from,
                effective_to,
                is_default,
                is_active
            FROM public.vat_period_rules
            WHERE regime_id=%s
              AND category_code=%s
              AND filing_channel=%s
              AND is_active=TRUE
              AND effective_from <= %s
              AND (
                  effective_to IS NULL
                  OR effective_to >= %s
              )
            ORDER BY effective_from DESC, id DESC
            LIMIT 1;
        """, (
            regime["id"],
            category_code,
            filing_channel,
            today,
            today,
        ))

        if not period_rule:
            return jsonify({
                "ok": False,
                "error": (
                    f"No VAT filing rule exists for "
                    f"{authority_code} Category "
                    f"{category_code} using "
                    f"{filing_channel}."
                ),
            }), 400

        # Store the resolved rule information as useful
        # configuration metadata.
        cfg.update({
            "frequency":
                period_rule["frequency"],

            "anchor_month":
                period_rule["anchor_month"],

            "period_months":
                period_rule["period_months"],

            "return_due_rule":
                period_rule["return_due_rule"],

            "payment_due_rule":
                period_rule["payment_due_rule"],
        })

    # -------------------------------------------------
    # Save
    # -------------------------------------------------
    ok = db_service.save_vat_settings(
        company_id,
        cfg
    )

    if not ok:
        return jsonify({
            "ok": False,
            "error": "Failed to save VAT settings",
        }), 500

    # -------------------------------------------------
    # Audit
    # -------------------------------------------------
    try:
        db_service.audit_log(
            company_id=int(company_id),
            actor_user_id=int(user_id or 0),
            module="tax",
            action="update_vat_settings",
            severity="info",
            entity_type="vat_settings",
            entity_id=str(company_id),
            entity_ref=f"VAT-{company_id}",
            before_json=before_cfg,
            after_json=cfg,
            message="Updated VAT authority and filing settings",
            source="api",
        )

    except Exception:
        current_app.logger.exception(
            "audit_log failed (update_vat_settings)"
        )

    # -------------------------------------------------
    # Return the saved configuration
    # -------------------------------------------------
    return jsonify({
        "ok": True,
        **cfg,
    }), 200

@bp.get("/api/companies/<int:company_id>/vat/rates")
@require_auth
def get_vat_rates(company_id: int):

    payload = getattr(request, "jwt_payload", {}) or {}

    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )

    if deny:
        return deny

    # ---------------------------------------------
    # Transaction date
    # ---------------------------------------------
    transaction_date = (
        request.args.get("date")
        or date.today().isoformat()
    )

    # ---------------------------------------------
    # Resolve company VAT context
    # ---------------------------------------------
    try:
        context = db_service.vat_company_context(
            int(company_id),
            transaction_date,
        ) or {}
    except Exception as exc:
        current_app.logger.exception(
            "VAT company context failed"
        )

        return jsonify({
            "ok": False,
            "error": "Could not resolve VAT authority context.",
        }), 500

    authority_code = str(
        context.get("authority_code")
        or ""
    ).strip().upper()

    regime_id = context.get("regime_id")

    if not authority_code:
        return jsonify({
            "ok": False,
            "error": (
                "VAT authority is not configured "
                "for this company."
            ),
        }), 400

    # ---------------------------------------------
    # If context did not return regime_id,
    # resolve the active regime directly.
    # ---------------------------------------------
    if not regime_id:

        regime = db_service.fetch_one("""
            SELECT
                vr.id,
                vr.regime_code,
                vr.regime_name
            FROM public.vat_regimes vr
            JOIN public.vat_authorities va
                ON va.id = vr.authority_id
            WHERE va.authority_code=%s
              AND va.is_active=TRUE
              AND vr.is_active=TRUE
              AND vr.effective_from <= %s
              AND (
                    vr.effective_to IS NULL
                    OR vr.effective_to >= %s
              )
            ORDER BY vr.effective_from DESC, vr.id DESC
            LIMIT 1;
        """, (
            authority_code,
            transaction_date,
            transaction_date,
        ))

        if not regime:
            return jsonify({
                "ok": False,
                "error": (
                    f"No active VAT regime found "
                    f"for {authority_code}."
                ),
            }), 400

        regime_id = regime["id"]

    # ---------------------------------------------
    # Get rates applicable on transaction date
    # ---------------------------------------------
    rates = db_service.fetch_all("""
        SELECT
            r.id,
            r.rate_code,
            r.name,
            r.rate,
            r.treatment,
            r.recoverable_default,
            r.applies_to_sales,
            r.applies_to_purchases,
            r.effective_from,
            r.effective_to,
            r.legislation_reference,
            r.guidance_reference
        FROM public.vat_rates r
        WHERE r.regime_id=%s
          AND r.is_active=TRUE
          AND r.effective_from <= %s
          AND (
                r.effective_to IS NULL
                OR r.effective_to >= %s
          )
        ORDER BY
            CASE
                WHEN r.rate_code='STANDARD' THEN 0
                WHEN r.rate_code='STANDARD_15' THEN 0
                ELSE 1
            END,
            r.rate DESC,
            r.rate_code;
    """, (
        regime_id,
        transaction_date,
        transaction_date,
    ))

    # ---------------------------------------------
    # Normalise response
    # ---------------------------------------------
    result = []

    for row in rates:
        result.append({
            "id": row["id"],
            "rate_code": row["rate_code"],
            "name": row["name"],
            "rate": float(row["rate"] or 0),
            "rate_percent": float(row["rate"] or 0) * 100,
            "treatment": row["treatment"],
            "recoverable_default": bool(
                row["recoverable_default"]
            ),
            "applies_to_sales": bool(
                row["applies_to_sales"]
            ),
            "applies_to_purchases": bool(
                row["applies_to_purchases"]
            ),
            "effective_from": (
                row["effective_from"].isoformat()
                if row["effective_from"]
                else None
            ),
            "effective_to": (
                row["effective_to"].isoformat()
                if row["effective_to"]
                else None
            ),
            "legislation_reference":
                row["legislation_reference"],
            "guidance_reference":
                row["guidance_reference"],
        })

    return jsonify({
        "ok": True,
        "company_id": int(company_id),
        "transaction_date": transaction_date,
        "authority_code": authority_code,
        "regime_id": regime_id,
        "rates": result,
    }), 200