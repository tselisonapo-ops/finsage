# app/ppe/posting.py
from BackEnd.Services.assets.ppe_db import fetchone
from BackEnd.Services.assets.tenants import company_schema
from datetime import date, timedelta, datetime
from decimal import Decimal, ROUND_HALF_UP
from BackEnd.Services.db_service import db_service
from BackEnd.Services.credit_policy import can_approve_ppe, can_post_ppe, ppe_review_required, user_role
from BackEnd.Services.company import company_policy
from flask import current_app
from BackEnd.Services.assets.ppe_db import get_conn
import psycopg2.extras

AVG_DAYS_PER_MONTH = Decimal("30.436875")  # 365.2425 / 12

def _q(schema: str, sql: str) -> str:
    return sql.replace("{schema}", schema)

VAT_RATE = Decimal("0.15")

def _D(x) -> Decimal:
    try:
        return Decimal(str(x or "0"))
    except Exception:
        return Decimal("0")

def _q2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _vat_split(gross: Decimal):
    # gross is VAT-inclusive
    if gross <= 0:
        return Decimal("0"), Decimal("0"), gross
    net = (gross / (Decimal("1.0") + VAT_RATE)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    vat = (gross - net).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return net, vat, gross

def _pick_coa_by_keywords(cur, schema: str, keywords: list[str], default_code: str) -> str:
    # Detect which columns exist on the COA table
    # ⚠️ set table_name to your actual COA table name in this schema
    table_name = "coa"  # <-- change if yours is different (e.g. "coa", "accounts")
    cur.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema=%s AND table_name=%s
    """, (schema, table_name))
    cols = {r[0] for r in (cur.fetchall() or [])}

    if "name" in cols and "account_name" in cols:
        name_expr = "lower(coalesce(name, account_name, ''))"
    elif "name" in cols:
        name_expr = "lower(coalesce(name, ''))"
    elif "account_name" in cols:
        name_expr = "lower(coalesce(account_name, ''))"
    else:
        # no name columns; cannot keyword search safely
        return default_code

    # Try keyword search in COA
    for kw in (keywords or []):
        cur.execute(_q(schema, f"""
            SELECT code
            FROM {{schema}}.{table_name}
            WHERE {name_expr} LIKE %s
               OR lower(coalesce(code, '')) LIKE %s
            LIMIT 1
        """), (f"%{kw.lower()}%", f"%{kw.lower()}%"))
        row = cur.fetchone()
        if row and row[0]:
            return row[0]

    return default_code

def _money(x: Decimal) -> float:
    return float(x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def post_subsequent_measurement(
    cur,
    company_id: int,
    measurement_id: int,
    *,
    posted_by=None
):
    schema = company_schema(company_id)

    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.asset_subsequent_measurements
        WHERE company_id=%s
          AND id=%s
        FOR UPDATE
    """), (company_id, measurement_id))

    row = cur.fetchone()
    if not row:
        raise ValueError("Subsequent measurement not found")

    if row["status"] == "posted":
        return row

    event_type = (row["event_type"] or "").lower()

    posted_journal_id = None

    # ------------------------------------------------
    # ADD COST → create journal
    # ------------------------------------------------
    if event_type == "add_cost":

        amount = Decimal(row["amount"] or 0)
        if amount <= 0:
            raise ValueError("Invalid add_cost amount")

        debit_account = row["debit_account_code"]
        credit_account = row["credit_account_code"]

        if not debit_account or not credit_account:
            raise ValueError("Missing accounts")

        journal_id = create_journal(
            cur,
            company_id,
            journal_date=row["event_date"],
            reference=f"ASM-{measurement_id}",
            memo="Asset subsequent cost",
        )

        db_service.insert_journal_line(
            cur,
            company_id,
            journal_id,
            debit_account,
            debit=amount,
            credit=Decimal("0"),
        )

        db_service.insert_journal_line(
            cur,
            company_id,
            journal_id,
            credit_account,
            debit=Decimal("0"),
            credit=amount,
        )

        db_service.post_journal(cur, company_id, journal_id)

        posted_journal_id = journal_id

    # ------------------------------------------------
    # CHANGE ESTIMATE → no journal
    # ------------------------------------------------
    elif event_type == "change_estimate":
        posted_journal_id = None

    else:
        raise ValueError("Unsupported event_type")

    # ------------------------------------------------
    # Mark posted
    # ------------------------------------------------
    cur.execute(_q(schema, """
        UPDATE {schema}.asset_subsequent_measurements
        SET
            status='posted',
            posted_journal_id=%s,
            posted_at=NOW(),
            approved_by=%s,
            approved_at=NOW()
        WHERE company_id=%s
          AND id=%s
    """), (
        posted_journal_id,
        posted_by,
        company_id,
        measurement_id
    ))

    upsert_carrying_snapshot(
        cur,
        company_id,
        row["asset_id"],
        as_at=row["event_date"],
        source_event="subseq",
        created_by=posted_by
    )

    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.asset_subsequent_measurements
        WHERE id=%s
    """), (measurement_id,))

    return cur.fetchone()

def create_journal(cur, schema, company_id, date, ref, description, currency, source, source_id):
    # idempotent check
    cur.execute(_q(schema, """
        SELECT id FROM {schema}.journal
        WHERE company_id=%s AND source IS NOT DISTINCT FROM %s AND source_id IS NOT DISTINCT FROM %s
        LIMIT 1
    """), (company_id, source, source_id))
    row = cur.fetchone()
    if row:
        return row["id"]

    cur.execute(_q(schema, """
        INSERT INTO {schema}.journal(company_id, date, ref, description, currency, source, source_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """), (company_id, date, ref, description, currency, source, source_id))
    return cur.fetchone()["id"]

def asset_class_key(asset_row: dict, policy: dict) -> str:
    """
    Returns normalized class key like 'vehicles', 'construction_equipment', etc.
    Uses asset_row fields + policy.classification mapping.
    """
    # Prefer an explicit class field if you already store it
    direct = (asset_row.get("class_key") or asset_row.get("asset_class") or asset_row.get("class") or "").strip().lower()
    if direct and direct in (policy.get("classification", {}).get("classes", {}) or {}):
        return direct

    # Otherwise map from a more specific category/type name
    category = (asset_row.get("category") or asset_row.get("category_name") or asset_row.get("type") or "").strip().lower()

    classes = (policy.get("classification", {}).get("classes", {}) or {})
    for key, cfg in classes.items():
        inc = [str(x).strip().lower() for x in (cfg.get("includes") or [])]
        if category in inc:
            return key

    return direct or "unknown"


def asset_standard_and_model(asset_row: dict, policy: dict) -> tuple[str, str]:
    # standard (ias16 / ias40 / ias38)
    std = (asset_row.get("accounting_standard") or "").strip().lower()

    # map common aliases -> canonical standards
    # adjust aliases to match your DB values
    if std in ("", None):
        # infer from class/category if standard not stored
        cls = (asset_row.get("asset_class") or asset_row.get("class") or "").strip().lower()
        cat = (asset_row.get("category") or asset_row.get("category_name") or asset_row.get("type") or "").strip().lower()
        if cls in ("intangible", "intangibles", "goodwill") or "goodwill" in cat or "intangible" in cat:
            std = "ias38"
        elif cls in ("investment_property", "ias40") or "investment property" in cat:
            std = "ias40"
        else:
            std = "ias16"

    if std in ("intangible", "intangibles", "goodwill", "ias 38"):
        std = "ias38"
    if std in ("ias 16",):
        std = "ias16"
    if std in ("ias 40", "investment_property"):
        std = "ias40"

    # model (cost / revaluation / fair_value)
    model = (asset_row.get("measurement_model") or "").strip().lower()
    if model in ("fv", "fairvalue", "fair value"):
        model = "fair_value"

    # default model if missing or unknown
    defaults = (policy.get("models", {}).get(std, {}) or {})
    if not model:
        model = (defaults.get("default") or "cost").strip().lower()

    # if model not in allowed list, fall back to default to keep key stable
    allowed = [str(x).strip().lower() for x in (defaults.get("allowed") or [])]
    if allowed and model not in allowed:
        model = (defaults.get("default") or "cost").strip().lower()

    return std, model

def assert_capitalization_allowed(amount: float, event_type: str, policy: dict) -> None:
    cap = policy.get("capitalization") or {}
    threshold = float(cap.get("threshold_amount") or 0.0)
    rule = (cap.get("rule") or "expense_below_threshold").strip().lower()

    apply_to = cap.get("apply_to_event_types") or []
    apply_to = [str(x).strip().lower() for x in apply_to]

    et = (event_type or "").strip().lower()
    if apply_to and et not in apply_to:
        return

    if threshold > 0 and rule == "expense_below_threshold":
        if float(amount or 0.0) < threshold:
            raise ValueError(f"Amount {amount:.2f} is below capitalization threshold {threshold:.2f}; expense it instead of capitalizing.")

def assert_sm_eligible(company_id: int, asset_row: dict, event_type: str, amount: float, policy: dict) -> None:
    cls_key = asset_class_key(asset_row, policy)
    std, model = asset_standard_and_model(asset_row, policy)

    elig_root = (policy.get("eligibility") or {})
    sm_elig = (elig_root.get("subsequent_measurements") or {})

    et = (event_type or "").strip().lower()

    # 1) allowed by model
    allowed_by_model = sm_elig.get("allowed_event_types_by_model") or {}
    model_key = f"{std}_{model}".lower()
    allowed_types = [str(x).strip().lower() for x in (allowed_by_model.get(model_key) or [])]

    if allowed_types and et not in allowed_types:
        raise ValueError(
            f"Event '{et}' not allowed under model '{model_key}' for asset class '{cls_key}'."
        )

    # 2) special class restrictions only for valuation-style events
    valuation_class_rules = sm_elig.get("valuation_allowed_classes_by_event") or {}
    if et in {"revaluation", "fair_value_valuation"}:
        allowed_classes = [str(x).strip().lower() for x in (valuation_class_rules.get(et) or [])]
        if allowed_classes and cls_key not in allowed_classes:
            raise ValueError(
                f"Event '{et}' not allowed for asset class '{cls_key}'."
            )

    # 3) class-specific disallows
    disallow_by_class = sm_elig.get("disallow_event_types_by_class") or {}
    blocked = [str(x).strip().lower() for x in (disallow_by_class.get(cls_key) or [])]
    if blocked and et in blocked:
        raise ValueError(f"Event '{et}' not allowed for asset class '{cls_key}'.")

    # 4) capitalization threshold
    if et == "add_cost":
        assert_capitalization_allowed(float(amount or 0.0), et, policy)

def build_sm_preview(
    *,
    company_id: int,
    asset_row: dict,
    payload: dict,
    policy: dict,
    cur=None,
    schema=None,
    user=None,
) -> dict:
    et = (payload.get("event_type") or "").strip().lower()

    ca_before = float(asset_row.get("carrying_amount") or asset_row.get("nbv") or 0.0)

    warnings: list[str] = []

    # Use company_id meaningfully for consistency / safety checks
    asset_company_id = int(asset_row.get("company_id") or 0)
    if asset_company_id and asset_company_id != int(company_id):
        raise ValueError(
            f"Asset company mismatch: asset belongs to company_id={asset_company_id}, "
            f"but preview requested for company_id={company_id}."
        )

    # Use your role helper
    role = user_role(user or {})
    if role and role not in ("owner", "admin", "cfo", "ceo", "manager", "senior", "accountant"):
        warnings.append(
            f"Preview generated for role '{role}' without posting/approval authority."
        )

    # Dispatch calculators
    if et == "add_cost":
        out = _preview_add_cost(asset_row, payload, policy, ca_before, cur=cur)

    elif et in ("held_for_sale_classify", "held_for_sale_unclassify"):
        out = _preview_hfs(asset_row, payload, policy, ca_before, cur=cur)

    elif et in ("impairment_loss", "impairment_reversal"):
        out = _preview_impairment(asset_row, payload, policy, ca_before, cur=cur)

    elif et == "revaluation":
        out = _preview_revaluation(asset_row, payload, policy, ca_before, cur=cur)

    elif et == "fair_value_valuation":
        out = _preview_fair_value_valuation(asset_row, payload, policy, ca_before, cur=cur)

    elif et in ("transfer_ppe_to_ip", "transfer_ip_to_ppe"):
        out = _preview_transfer(asset_row, payload, policy, ca_before, cur=cur)

    elif et == "change_estimate":
        out = {
            "header": _preview_header(payload, memo=f"SM preview: {et}"),
            "lines": [],
            "impact": {
                "carrying_amount_before": ca_before,
                "carrying_amount_after": ca_before,
                "delta": 0.0,
            },
            "warnings": ["No journal for change_estimate (depreciation changes prospectively)."],
        }

    else:
        raise ValueError(f"Unsupported event_type '{et}'")

    # Enrich lines with account names from tenant COA
    if cur and schema and out.get("lines"):
        out["lines"] = _attach_account_names(out["lines"], schema=schema, cur=cur)

    # Add contextual warnings
    if warnings:
        out.setdefault("warnings", []).extend(warnings)

    # Optional metadata, useful to the UI / debugging
    out.setdefault("context", {})
    out["context"].update({
        "company_id": int(company_id),
        "asset_id": int(asset_row.get("id") or 0),
        "event_type": et,
        "user_role": role or "",
    })

    return out

def _preview_header(payload: dict, memo: str):
    return {
        "date": str(payload.get("event_date") or "")[:10],
        "memo": memo,
        "currency": payload.get("currency") or None,
    }

def _preview_impairment(asset_row: dict, payload: dict, policy: dict, ca_before: float, cur=None) -> dict:
    et = (payload.get("event_type") or "").strip().lower()
    amt = D(payload.get("amount") or 0)

    if amt <= 0:
        raise ValueError("Impairment amount must be > 0")

    company_id = int(asset_row.get("company_id") or 0)

    asset_acct = _pick_asset_code(asset_row, "asset_account_code", policy)

    lines = []
    ca_before_d = D(ca_before)
    ca_after_d = ca_before_d

    if et == "impairment_loss":
        loss_acct = _pick_asset_code(asset_row, "impairment_loss_account_code", policy, "impairment_loss_expense")
        lines.append({"account_code": loss_acct, "debit": money(amt), "credit": 0.0, "memo": "Impairment loss"})
        lines.append({"account_code": asset_acct, "debit": 0.0, "credit": money(amt), "memo": "Reduce carrying amount"})
        ca_after_d = ca_before_d - amt

    elif et == "impairment_reversal":
        rev_acct = _pick_asset_code(asset_row, "impairment_reversal_account_code", policy, "impairment_reversal_income")
        lines.append({"account_code": asset_acct, "debit": money(amt), "credit": 0.0, "memo": "Increase carrying amount"})
        lines.append({"account_code": rev_acct, "debit": 0.0, "credit": money(amt), "memo": "Impairment reversal"})
        ca_after_d = ca_before_d + amt

    else:
        raise ValueError(f"Unsupported impairment event_type '{et}'")

    ca_after = money(ca_after_d)
    impact = {
        "carrying_amount_before": money(ca_before_d),
        "carrying_amount_after": ca_after,
        "delta": money(ca_after_d - ca_before_d),
    }

    return {
        "header": _preview_header(payload, memo=f"SM preview: {et}"),
        "lines": _attach_account_names(lines, company_schema(company_id), cur=cur),
        "impact": impact,
        "warnings": [],
    }

def _preview_hfs(asset_row: dict, payload: dict, policy: dict, ca_before: float, cur=None) -> dict:
    et = (payload.get("event_type") or "").strip().lower()
    company_id = int(asset_row.get("company_id") or 0)

    asset_acct = _pick_asset_code(asset_row, "asset_account_code", policy)
    hfs_acct = _pick_asset_code(asset_row, "held_for_sale_account_code", policy, "held_for_sale_asset")

    ca = D(ca_before)
    lines = []
    warnings = []

    meta = payload.get("meta_json") or {}
    imp_on_class = D(meta.get("impairment_on_classification") or 0)

    if et == "held_for_sale_classify":
        lines.append({"account_code": hfs_acct, "debit": money(ca), "credit": 0.0, "memo": "Move to held-for-sale"})
        lines.append({"account_code": asset_acct, "debit": 0.0, "credit": money(ca), "memo": "Remove from PPE"})

        ca_after = ca
        # optional impairment on classification reduces CA (IFRS 5)
        if imp_on_class > 0:
            loss_acct = _pick_asset_code(asset_row, "impairment_loss_account_code", policy, "impairment_loss_expense")
            lines.append({"account_code": loss_acct, "debit": money(imp_on_class), "credit": 0.0, "memo": "HFS impairment"})
            lines.append({"account_code": hfs_acct, "debit": 0.0, "credit": money(imp_on_class), "memo": "Reduce HFS carrying amount"})
            ca_after = ca - imp_on_class

        impact = {
            "carrying_amount_before": money(ca),
            "carrying_amount_after": money(ca_after),
            "delta": money(ca_after - ca),
        }

    elif et == "held_for_sale_unclassify":
        # reverse the reclass back to PPE
        lines.append({"account_code": asset_acct, "debit": money(ca), "credit": 0.0, "memo": "Move back to PPE"})
        lines.append({"account_code": hfs_acct, "debit": 0.0, "credit": money(ca), "memo": "Remove from held-for-sale"})

        impact = {
            "carrying_amount_before": money(ca),
            "carrying_amount_after": money(ca),
            "delta": 0.0,
        }
        warnings.append("Unclassify preview assumes carrying amount equals current CA. If you track HFS CA separately, use meta_json to supply it.")

    else:
        raise ValueError(f"Unsupported HFS event_type '{et}'")

    return {
        "header": _preview_header(payload, memo=f"SM preview: {et}"),
        "lines": _attach_account_names(lines, company_schema(company_id), cur=cur),
        "impact": impact,
        "warnings": warnings,
    }

def _preview_revaluation(asset_row: dict, payload: dict, policy: dict, ca_before: float, cur=None) -> dict:
    company_id = int(asset_row.get("company_id") or 0)
    meta = payload.get("meta_json") or {}

    fair_value = D(meta.get("fair_value") or meta.get("new_carrying_amount") or 0)
    if fair_value <= 0:
        raise ValueError("Revaluation requires meta_json.fair_value (or meta_json.new_carrying_amount) > 0")

    ca0 = D(ca_before)
    delta = fair_value - ca0

    asset_acct = _pick_asset_code(asset_row, "asset_account_code", policy)

    # accounts (prefer asset row mappings; fallback to policy.posting.*)
    reserve_acct = (asset_row.get("revaluation_reserve_account_code") or "").strip() or ((policy.get("posting") or {}).get("revaluation_reserve") or "").strip()
    gain_acct    = (asset_row.get("revaluation_surplus_to_pnl_account_code") or "").strip() or ((policy.get("posting") or {}).get("revaluation_surplus_pnl") or "").strip()
    loss_acct    = (asset_row.get("revaluation_deficit_pnl_account_code") or "").strip() or ((policy.get("posting") or {}).get("revaluation_deficit_pnl") or "").strip()

    lines = []
    warnings = []

    if delta == 0:
        warnings.append("Fair value equals current carrying amount; no journal impact.")
        impact = {"carrying_amount_before": money(ca0), "carrying_amount_after": money(ca0), "delta": 0.0}
        return {
            "header": _preview_header(payload, memo="SM preview: revaluation"),
            "lines": [],
            "impact": impact,
            "warnings": warnings,
        }

    # asset movement
    if delta > 0:
        lines.append({"account_code": asset_acct, "debit": money(delta), "credit": 0.0, "memo": "Increase carrying amount"})
        # default: OCI reserve (preferred)
        if reserve_acct:
            lines.append({"account_code": reserve_acct, "debit": 0.0, "credit": money(delta), "memo": "OCI revaluation surplus"})
        elif gain_acct:
            warnings.append("No revaluation reserve account found; routing surplus to P/L gain.")
            lines.append({"account_code": gain_acct, "debit": 0.0, "credit": money(delta), "memo": "Revaluation gain (P/L)"})
        else:
            raise ValueError("Missing revaluation reserve mapping (asset.revaluation_reserve_account_code or policy.posting.revaluation_reserve)")

    else:
        loss_amt = -delta
        lines.append({"account_code": asset_acct, "debit": 0.0, "credit": money(loss_amt), "memo": "Decrease carrying amount"})
        if loss_acct:
            lines.append({"account_code": loss_acct, "debit": money(loss_amt), "credit": 0.0, "memo": "Revaluation deficit (P/L)"})
        else:
            raise ValueError("Missing revaluation deficit mapping (asset.revaluation_deficit_pnl_account_code or policy.posting.revaluation_deficit_pnl)")

    impact = {
        "carrying_amount_before": money(ca0),
        "carrying_amount_after": money(fair_value),
        "delta": money(delta),
    }

    return {
        "header": _preview_header(payload, memo="SM preview: revaluation"),
        "lines": _attach_account_names(lines, company_schema(company_id), cur=cur),
        "impact": impact,
        "warnings": warnings,
    }

def _preview_fair_value_valuation(asset_row: dict, payload: dict, policy: dict, ca_before: float, cur=None) -> dict:
    company_id = int(asset_row.get("company_id") or 0)
    meta = payload.get("meta_json") or {}

    fair_value = D(meta.get("fair_value") or 0)
    if fair_value <= 0:
        raise ValueError("Fair value valuation requires meta_json.fair_value > 0")

    ca0 = D(ca_before)
    delta = fair_value - ca0

    asset_acct = _pick_asset_code(asset_row, "asset_account_code", policy)

    gain_acct = (
        (asset_row.get("fair_value_gain_account_code") or "").strip()
        or ((policy.get("posting") or {}).get("fair_value_gain") or "").strip()
    )
    loss_acct = (
        (asset_row.get("fair_value_loss_account_code") or "").strip()
        or ((policy.get("posting") or {}).get("fair_value_loss") or "").strip()
    )

    lines = []
    warnings = []

    if delta == 0:
        warnings.append("Fair value equals current carrying amount; no journal impact.")
        return {
            "header": _preview_header(payload, memo="SM preview: fair_value_valuation"),
            "lines": [],
            "impact": {
                "carrying_amount_before": money(ca0),
                "carrying_amount_after": money(ca0),
                "delta": 0.0,
            },
            "warnings": warnings,
        }

    if delta > 0:
        if not gain_acct:
            raise ValueError("Missing fair value gain mapping (asset.fair_value_gain_account_code or policy.posting.fair_value_gain)")
        lines.append({"account_code": asset_acct, "debit": money(delta), "credit": 0.0, "memo": "Increase to fair value"})
        lines.append({"account_code": gain_acct, "debit": 0.0, "credit": money(delta), "memo": "Fair value gain (P/L)"})
    else:
        loss_amt = -delta
        if not loss_acct:
            raise ValueError("Missing fair value loss mapping (asset.fair_value_loss_account_code or policy.posting.fair_value_loss)")
        lines.append({"account_code": loss_acct, "debit": money(loss_amt), "credit": 0.0, "memo": "Fair value loss (P/L)"})
        lines.append({"account_code": asset_acct, "debit": 0.0, "credit": money(loss_amt), "memo": "Decrease to fair value"})

    return {
        "header": _preview_header(payload, memo="SM preview: fair_value_valuation"),
        "lines": _attach_account_names(lines, company_schema(company_id), cur=cur),
        "impact": {
            "carrying_amount_before": money(ca0),
            "carrying_amount_after": money(fair_value),
            "delta": money(delta),
        },
        "warnings": warnings,
    }

def _preview_transfer(asset_row: dict, payload: dict, policy: dict, ca_before: float, cur=None) -> dict:
    et = (payload.get("event_type") or "").strip().lower()
    company_id = int(asset_row.get("company_id") or 0)

    ca = D(ca_before)

    ppe_acct = _pick_asset_code(asset_row, "asset_account_code", policy)

    # destination account comes from policy (best) or meta override
    meta = payload.get("meta_json") or {}
    ip_acct = (meta.get("dest_account_code") or "").strip() or ((policy.get("posting") or {}).get("investment_property_account") or "").strip()

    if not ip_acct:
        raise ValueError("Missing destination account for transfer. Set meta_json.dest_account_code or policy.posting.investment_property_account")

    lines = []
    if et == "transfer_ppe_to_ip":
        lines.append({"account_code": ip_acct, "debit": money(ca), "credit": 0.0, "memo": "Transfer to investment property"})
        lines.append({"account_code": ppe_acct, "debit": 0.0, "credit": money(ca), "memo": "Remove from PPE"})

    elif et == "transfer_ip_to_ppe":
        lines.append({"account_code": ppe_acct, "debit": money(ca), "credit": 0.0, "memo": "Transfer back to PPE"})
        lines.append({"account_code": ip_acct, "debit": 0.0, "credit": money(ca), "memo": "Remove from investment property"})

    else:
        raise ValueError(f"Unsupported transfer event_type '{et}'")

    impact = {
        "carrying_amount_before": money(ca),
        "carrying_amount_after": money(ca),
        "delta": 0.0,
    }

    return {
        "header": _preview_header(payload, memo=f"SM preview: {et}"),
        "lines": _attach_account_names(lines, company_schema(company_id), cur=cur),
        "impact": impact,
        "warnings": [],
    }

from decimal import Decimal

def create_revaluation_from_sm(cur, company_id: int, sm: dict, asset: dict) -> int:
    schema = company_schema(company_id)
    meta = sm.get("meta_json") or {}

    # Required inputs
    fv = Decimal(str(meta.get("fair_value") or 0))
    if fv <= 0:
        raise ValueError("revaluation requires meta_json.fair_value > 0")

    # Snapshot before
    ca_before = Decimal(str(meta.get("carrying_amount_before") or asset.get("carrying_amount") or asset.get("nbv") or 0))
    cost_before = meta.get("cost_before", asset.get("cost"))
    acc_before = meta.get("accum_dep_before", asset.get("accumulated_depreciation") or asset.get("acc_dep"))

    ca_after = fv  # v1: carrying after = fair value (net restated style)
    change = ca_after - ca_before

    # Allocation (v1)
    oci = Decimal("0")
    pnl_gain = Decimal("0")
    pnl_loss = Decimal("0")

    if change > 0:
        # default: OCI (reserve)
        oci = change
    elif change < 0:
        pnl_loss = abs(change)

    method = (meta.get("method") or "gross_restated").strip().lower()
    if method not in ("gross_restated", "net_restated"):
        method = "gross_restated"

    cur.execute(_q(schema, """
      INSERT INTO {schema}.asset_revaluations(
        company_id, asset_id, revaluation_date,
        carrying_amount_before, cost_before, accum_dep_before,
        fair_value, carrying_amount_after, cost_after, accum_dep_after,
        revaluation_change,
        oci_revaluation_surplus, pnl_revaluation_gain, pnl_revaluation_loss,
        method, reason, notes, status, created_by, created_at
      ) VALUES (
        %s,%s,%s,
        %s,%s,%s,
        %s,%s,%s,%s,
        %s,
        %s,%s,%s,
        %s,%s,%s,'draft',%s,NOW()
      )
      RETURNING id
    """), (
      company_id, int(sm["asset_id"]), sm["event_date"],
      ca_before, cost_before, acc_before,
      fv, ca_after, meta.get("cost_after"), meta.get("accum_dep_after"),
      change,
      oci, pnl_gain, pnl_loss,
      method, meta.get("reason"), sm.get("notes"),
      sm.get("created_by")
    ))
    return int(cur.fetchone()["id"])

def create_impairment_from_sm(cur, company_id: int, sm: dict, asset: dict) -> int:
    schema = company_schema(company_id)
    meta = sm.get("meta_json") or {}

    ca_before = Decimal(str(meta.get("carrying_amount_before") or asset.get("carrying_amount") or asset.get("nbv") or 0))

    et = (sm.get("event_type") or "").strip().lower()
    if et == "impairment_loss":
        rec = Decimal(str(meta.get("recoverable_amount") or 0))
        if rec <= 0:
            raise ValueError("impairment_loss requires meta_json.recoverable_amount > 0")
        imp_amt = max(Decimal("0"), ca_before - rec)
        rev_amt = Decimal("0")

    elif et == "impairment_reversal":
        # reversal needs explicit amount OR recoverable amount
        rev_amt = Decimal(str(meta.get("reversal_amount") or meta.get("amount") or 0))
        if rev_amt <= 0:
            raise ValueError("impairment_reversal requires meta_json.reversal_amount (or meta_json.amount) > 0")
        rec = Decimal(str(meta.get("recoverable_amount") or 0))  # optional
        imp_amt = Decimal("0")

    else:
        raise ValueError(f"Unsupported impairment event_type '{et}'")

    cur.execute(_q(schema, """
      INSERT INTO {schema}.asset_impairments(
        company_id, asset_id, impairment_date,
        carrying_amount_before, recoverable_amount,
        impairment_amount, reversal_amount,
        reason, notes, status, created_at
      ) VALUES (
        %s,%s,%s,
        %s,%s,
        %s,%s,
        %s,%s,'draft',NOW()
      )
      RETURNING id
    """), (
      company_id, int(sm["asset_id"]), sm["event_date"],
      ca_before, (rec if 'rec' in locals() else Decimal("0")),
      imp_amt, rev_amt,
      meta.get("reason"), sm.get("notes")
    ))
    return int(cur.fetchone()["id"])

def create_hfs_from_sm(cur, company_id: int, sm: dict, asset: dict) -> int:
    schema = company_schema(company_id)
    meta = sm.get("meta_json") or {}

    ca = Decimal(str(meta.get("carrying_amount") or asset.get("carrying_amount") or asset.get("nbv") or 0))
    fv_lcs = Decimal(str(meta.get("fair_value_less_costs") or 0))
    if fv_lcs <= 0:
        raise ValueError("held_for_sale_classify requires meta_json.fair_value_less_costs > 0")

    imp = Decimal(str(meta.get("impairment_on_classification") or 0))
    if imp <= 0:
        # IFRS5: impairment = max(0, CA - FVLC)
        imp = max(Decimal("0"), ca - fv_lcs)

    cur.execute(_q(schema, """
      INSERT INTO {schema}.asset_held_for_sale(
        company_id, asset_id, classification_date,
        carrying_amount, fair_value_less_costs,
        impairment_on_classification, status, created_at
      ) VALUES (%s,%s,%s,%s,%s,%s,'active',NOW())
      RETURNING id
    """), (
      company_id, int(sm["asset_id"]), sm["event_date"],
      ca, fv_lcs, imp
    ))
    return int(cur.fetchone()["id"])

def create_estimate_change_from_sm(cur, company_id: int, sm: dict, asset: dict) -> int:
    schema = company_schema(company_id)

    old_life = asset.get("useful_life_months")
    old_res  = asset.get("residual_value")
    old_meth = asset.get("depreciation_method")

    new_life = sm.get("useful_life_months")
    new_res  = sm.get("residual_value")
    new_meth = sm.get("depreciation_method")

    # decide change_type
    parts = []
    if new_life is not None and int(new_life) != int(old_life or 0): parts.append("useful_life")
    if new_res  is not None and Decimal(str(new_res)) != Decimal(str(old_res or 0)): parts.append("residual_value")
    if new_meth is not None and str(new_meth) != str(old_meth or ""): parts.append("method")
    change_type = "mixed" if len(parts) > 1 else (parts[0] if parts else "mixed")

    cur.execute(_q(schema, """
      INSERT INTO {schema}.asset_estimate_changes(
        company_id, asset_id, effective_date, change_type,
        reason, notes,
        old_useful_life_months, new_useful_life_months,
        old_residual_value, new_residual_value,
        old_depreciation_method, new_depreciation_method,
        status, created_by, created_at
      ) VALUES (
        %s,%s,%s,%s,
        %s,%s,
        %s,%s,
        %s,%s,
        %s,%s,
        'draft',%s,NOW()
      )
      RETURNING id
    """), (
      company_id, int(sm["asset_id"]), sm["event_date"], change_type,
      (sm.get("meta_json") or {}).get("reason"), sm.get("notes"),
      old_life, new_life,
      old_res, new_res,
      old_meth, new_meth,
      sm.get("created_by")
    ))
    return int(cur.fetchone()["id"])

def post_subsequent_measurement(cur, company_id: int, sm_id: int, *, user=None, approved_via=None) -> int:
    schema = company_schema(company_id)

    cur.execute(_q(schema, """
      SELECT * FROM {schema}.asset_subsequent_measurements
      WHERE company_id=%s AND id=%s
      FOR UPDATE
    """), (company_id, sm_id))
    sm = fetchone(cur)
    if not sm:
        raise Exception("subsequent measurement not found")

    if (sm.get("status") or "").lower() == "posted" and sm.get("posted_journal_id"):
        return int(sm["posted_journal_id"])

    asset = get_asset(cur, schema, company_id, sm["asset_id"])
    if not asset:
        raise Exception("asset not found")

    et = (sm.get("event_type") or "").strip().lower()

    # 1) route
    if et == "add_cost":
        # your existing SM add_cost posting logic (journal with debit/credit)
        jid = post_sm_add_cost(cur, company_id, sm, asset, user=user, approved_via=approved_via)

    elif et in ("impairment_loss", "impairment_reversal"):
        imp_id = create_impairment_from_sm(cur, company_id, sm, asset)
        jid = post_impairment(cur, company_id, imp_id, user=user, approved_via=approved_via)

    elif et == "revaluation":
        reval_id = create_revaluation_from_sm(cur, company_id, sm, asset)
        jid = post_revaluation(cur, company_id, reval_id, user=user, approved_via=approved_via)

    elif et == "held_for_sale_classify":
        hfs_id = create_hfs_from_sm(cur, company_id, sm, asset)
        jid = post_hfs(cur, company_id, hfs_id, user=user, approved_via=approved_via)

    elif et == "held_for_sale_unclassify":
        # you don’t currently have a table/logic for “unclassify”
        # recommended: implement post_hfs_unclassify() that:
        # - finds active HFS row
        # - journals reverse (Dr PPE / Cr HFS)
        # - marks HFS status='reversed' and asset status back to 'active'
        jid = post_hfs_unclassify(cur, company_id, sm["asset_id"], sm["event_date"], user=user, approved_via=approved_via)

    elif et == "change_estimate":
        chg_id = create_estimate_change_from_sm(cur, company_id, sm, asset)
        # no journal typically
        jid = None
        # you can mark estimate change posted here or run a dedicated "apply estimates" function

    else:
        raise Exception(f"Unsupported subsequent measurement event_type '{et}'")

    # 2) mark SM posted
    cur.execute(_q(schema, """
      UPDATE {schema}.asset_subsequent_measurements
      SET status='posted',
          posted_journal_id=%s,
          posted_at=CASE WHEN %s IS NULL THEN posted_at ELSE NOW() END,
          updated_at=NOW()
      WHERE company_id=%s AND id=%s
    """), (jid, jid, company_id, sm_id))

    return int(jid or 0)

def post_sm_add_cost(
    cur,
    company_id: int,
    sm: dict,
    asset: dict,
    *,
    user=None,
    approved_via=None
) -> int:

    schema = company_schema(company_id)

    amt = Decimal(str(sm.get("amount") or 0))
    if amt <= 0:
        raise Exception("add_cost requires positive amount")

    debit = sm.get("debit_account_code")
    credit = sm.get("credit_account_code")

    if not debit or not credit:
        raise Exception("add_cost requires debit and credit accounts")

    ccy = get_company_currency(cur, company_id)

    jid = create_journal(
        cur,
        schema,
        company_id,
        sm["event_date"],
        None,
        f"Asset cost addition: {asset['asset_code']} - {asset['asset_name']}",
        ccy,
        "asset_add_cost",
        sm["id"]
    )

    add_line(
        cur, schema, company_id,
        jid,
        debit,
        "Capitalize additional cost",
        amt,
        0,
        "asset_add_cost",
        sm["id"]
    )

    add_line(
        cur, schema, company_id,
        jid,
        credit,
        "Payment / payable",
        0,
        amt,
        "asset_add_cost",
        sm["id"]
    )

    finalize_journal(cur, schema, company_id, jid)

    _post_journal_to_ledger_and_tb(
        cur,
        schema,
        company_id,
        jid,
        je_date=sm["event_date"],
        ref=f"ASM-COST-{sm['id']}"
    )

    # update carrying snapshot
    upsert_carrying_snapshot(
        cur,
        company_id,
        sm["asset_id"],
        as_at=sm["event_date"],
        source_event="add_cost",
        created_by=None
    )

    return jid

def post_hfs_unclassify(
    cur,
    company_id: int,
    asset_id: int,
    event_date,
    *,
    user=None,
    approved_via=None
) -> int:

    schema = company_schema(company_id)

    # find active HFS
    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.asset_held_for_sale
        WHERE company_id=%s
        AND asset_id=%s
        AND status='active'
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
    """), (company_id, asset_id))

    r = fetchone(cur)

    if not r:
        raise Exception("no active held-for-sale classification found")

    asset = get_asset(cur, schema, company_id, asset_id)

    if not asset:
        raise Exception("asset not found")

    if not asset.get("held_for_sale_account_code"):
        raise Exception("asset missing held_for_sale_account_code")

    if not asset.get("asset_account_code"):
        raise Exception("asset missing asset_account_code")

    amt = Decimal(str(r["carrying_amount"] or 0))

    ccy = get_company_currency(cur, company_id)

    jid = create_journal(
        cur,
        schema,
        company_id,
        event_date,
        None,
        f"HFS reversal: {asset['asset_code']} - {asset['asset_name']}",
        ccy,
        "asset_hfs_reverse",
        r["id"]
    )

    # move back to PPE
    add_line(
        cur, schema, company_id,
        jid,
        asset["asset_account_code"],
        "Return asset to PPE",
        amt,
        0,
        "asset_hfs_reverse",
        r["id"]
    )

    add_line(
        cur, schema, company_id,
        jid,
        asset["held_for_sale_account_code"],
        "Remove from held-for-sale",
        0,
        amt,
        "asset_hfs_reverse",
        r["id"]
    )

    finalize_journal(cur, schema, company_id, jid)

    _post_journal_to_ledger_and_tb(
        cur,
        schema,
        company_id,
        jid,
        je_date=event_date,
        ref=f"HFS-REV-{r['id']}"
    )

    # mark HFS reversed
    cur.execute(_q(schema, """
        UPDATE {schema}.asset_held_for_sale
        SET status='reversed'
        WHERE id=%s
    """), (r["id"],))

    # update asset status
    cur.execute(_q(schema, """
        UPDATE {schema}.assets
        SET status='active',
            updated_at=NOW()
        WHERE company_id=%s AND id=%s
    """), (company_id, asset_id))

    return jid

def _preview_add_cost(asset_row, payload, policy, ca_before, cur=None):
    amt = float(payload.get("amount") or 0.0)
    if amt <= 0:
        raise ValueError("Amount must be > 0")

    dr = (payload.get("debit_account_code") or asset_row.get("asset_account_code") or "").strip()
    cr = (payload.get("credit_account_code") or "").strip()
    if not dr:
        raise ValueError("Missing debit account code (asset)")
    if not cr:
        raise ValueError("Missing credit account code")

    lines = [
        {"account_code": dr, "debit": amt, "credit": 0.0},
        {"account_code": cr, "debit": 0.0, "credit": amt},
    ]

    ca_after = ca_before + amt

    return {
        "header": _preview_header(payload, memo="SM preview: add_cost"),
        "lines": _attach_account_names(lines, company_id=asset_row["company_id"], cur=cur),
        "impact": {"carrying_amount_before": ca_before, "carrying_amount_after": ca_after, "delta": ca_after - ca_before},
        "warnings": [],
    }

def assert_model_switch_allowed(asset_row: dict, target_model: str, policy: dict) -> None:
    cls_key = asset_class_key(asset_row, policy)
    std, cur_model = asset_standard_and_model(asset_row, policy)

    tm = (target_model or "").strip().lower()
    cm = (cur_model or "").strip().lower()

    std_cfg = (policy.get("models", {}).get(std) or {})
    allowed_models = [str(x).strip().lower() for x in (std_cfg.get("allowed") or [])]
    if allowed_models and tm not in allowed_models:
        raise ValueError(f"Model '{tm}' not allowed for standard '{std}'.")

    switches = std_cfg.get("allowed_switches") or []
    # If no switches defined, be strict and block switching
    if not switches:
        raise ValueError(f"Model switching is not enabled for standard '{std}'.")

    ok = False
    for s in switches:
        if (str(s.get("from") or "").strip().lower() == cm
            and str(s.get("to") or "").strip().lower() == tm):
            classes = s.get("classes") or []
            classes = [str(x).strip().lower() for x in classes]
            if not classes or cls_key in classes:
                ok = True
                break

    if not ok:
        raise ValueError(f"Switch {std}:{cm} → {tm} not allowed for asset class '{cls_key}'.")

          
def add_line(cur, schema, company_id, journal_id, account_code, desc, debit, credit, source, source_id):
    debit = Decimal(debit or 0)
    credit = Decimal(credit or 0)
    if debit <= 0 and credit <= 0:
        return

    # ✅ Guard 1: account code must be present
    code = (account_code or "").strip()
    if not code:
        raise ValueError(f"Journal line missing account_code (journal_id={journal_id}, source={source}, source_id={source_id})")

    # ✅ Guard 2: account must exist in COA (and be posting-enabled)
    cur.execute(_q(schema, """
        SELECT 1
        FROM {schema}.coa
        WHERE company_id=%s
          AND code=%s
          AND posting IS TRUE
        LIMIT 1
    """), (company_id, code))
    if not cur.fetchone():
        raise ValueError(f"Unknown or non-posting account_code '{code}' (journal_id={journal_id}, source={source}, source_id={source_id})")

    # Next line number
    cur.execute(_q(schema, """
        SELECT COALESCE(MAX(line_no),0)+1 AS next_no
        FROM {schema}.journal_lines
        WHERE journal_id=%s AND company_id=%s
    """), (journal_id, company_id))
    ln = cur.fetchone()["next_no"]

    # Insert
    cur.execute(_q(schema, """
        INSERT INTO {schema}.journal_lines(
          company_id, journal_id, line_no, account_code, description, debit, credit, source, source_id
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """), (company_id, journal_id, ln, code, desc, debit, credit, source, source_id))

def finalize_journal(cur, schema, company_id, journal_id):
    cur.execute(_q(schema, """
        SELECT
          COALESCE(SUM(debit),0)::numeric(18,2) AS d,
          COALESCE(SUM(credit),0)::numeric(18,2) AS c
        FROM {schema}.journal_lines
        WHERE company_id=%s AND journal_id=%s
    """), (company_id, journal_id))
    tot = cur.fetchone()
    d = Decimal(tot["d"])
    c = Decimal(tot["c"])
    if abs(d - c) > Decimal("0.02"):
        raise Exception(f"Journal not balanced: debit={d} credit={c}")

    cur.execute(_q(schema, """
        SELECT COALESCE(SUM(debit - credit),0)::numeric(18,2) AS vat
        FROM {schema}.journal_lines
        WHERE company_id=%s AND journal_id=%s
          AND (
            lower(coalesce(description,'')) LIKE '%%vat%%'
            OR account_code ILIKE %s
          )
    """), (company_id, journal_id, "%1410%"))
    v = cur.fetchone()
    vat_amt = Decimal(v["vat"] or 0)

    cur.execute(_q(schema, """
        UPDATE {schema}.journal
        SET gross_amount=%s, net_amount=%s, vat_amount=%s
        WHERE company_id=%s AND id=%s
    """), (d, d - vat_amt, vat_amt, company_id, journal_id))

def _ppe_post_guard(*, company_id: int, action: str, user: dict | None, approved_via: str | None):
    """
    Central PPE posting permission guard.

    action examples:
      - post_depreciation
      - post_acquisition
      - post_revaluation
      - post_impairment
      - classify_hfs
      - post_disposal
    """
    pol = company_policy(company_id)
    mode = pol["mode"]
    company_profile = pol["company"]
    policy = pol["policy"]

    review_required = bool(ppe_review_required(mode, policy, action))

    if review_required:
        # Must come from approve-post endpoint
        if (approved_via or "").strip().lower() != "approve_post":
            raise Exception(f"{action} is in review mode. Use approve-post endpoint.")
        if not user or not can_approve_ppe(user, company_profile, mode):
            raise Exception("Not allowed to approve/post in review mode.")
    else:
        # Normal mode: allow posters (if user provided)
        if user and (not can_post_ppe(user, company_profile, mode)):
            raise Exception("Not allowed to post.")
        
def _post_journal_to_ledger_and_tb(cur, schema: str, company_id: int, journal_id: int, je_date, ref: str | None = None):
    # Guard against duplicates
    cur.execute(_q(schema, """
        SELECT 1
        FROM {schema}.ledger
        WHERE company_id=%s AND journal_id=%s
        LIMIT 1
    """), (company_id, journal_id))
    if cur.fetchone():
        return

    cur.execute(_q(schema, """
        SELECT account_code, description, debit, credit, source, source_id
        FROM {schema}.journal_lines
        WHERE company_id=%s AND journal_id=%s
        ORDER BY line_no
    """), (company_id, journal_id))
    rows = cur.fetchall() or []

    je_date = je_date.isoformat()[:10] if hasattr(je_date, "isoformat") else str(je_date)[:10]

    for r in rows:
        if isinstance(r, dict):
            account_code = r.get("account_code")
            memo         = r.get("description") or ""
            debit        = Decimal(r.get("debit") or 0)
            credit       = Decimal(r.get("credit") or 0)
            source       = r.get("source")
            source_id    = r.get("source_id")
        else:
            account_code, memo, debit, credit, source, source_id = r
            memo = memo or ""
            debit = Decimal(debit or 0)
            credit = Decimal(credit or 0)

        if debit == 0 and credit == 0:
            continue

        # ✅ HARD GUARD: no blanks / must exist in COA
        code = (account_code or "").strip()
        if not code:
            raise ValueError(f"Ledger/TB post failed: blank account_code (journal_id={journal_id}, source={source}, source_id={source_id})")

        cur.execute(_q(schema, """
            SELECT 1
            FROM {schema}.coa
            WHERE company_id=%s AND code=%s AND posting IS TRUE
            LIMIT 1
        """), (company_id, code))
        if not cur.fetchone():
            raise ValueError(f"Ledger/TB post failed: unknown/non-posting account_code '{code}' (journal_id={journal_id})")

        # Ledger insert
        cur.execute(_q(schema, """
            INSERT INTO {schema}.ledger(
                company_id, journal_id, date, ref, account,
                debit, credit, source, source_id, memo,
                customer_id, vendor_id
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,NULL)
        """), (
            int(company_id),
            int(journal_id),
            je_date,
            ref,
            code,
            debit,
            credit,
            source,
            source_id,
            memo,
        ))

        # Trial balance upsert
        cur.execute(_q(schema, """
            INSERT INTO {schema}.trial_balance
                (company_id, account, debit_total, credit_total, closing_balance)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (company_id, account)
            DO UPDATE SET
                debit_total = {schema}.trial_balance.debit_total + EXCLUDED.debit_total,
                credit_total = {schema}.trial_balance.credit_total + EXCLUDED.credit_total,
                closing_balance = {schema}.trial_balance.closing_balance
                                + (EXCLUDED.debit_total - EXCLUDED.credit_total)
        """), (
            int(company_id),
            code,
            debit,
            credit,
            debit - credit,
        ))

def get_company_currency(cur, company_id):
    # base currency lives in public.companies
    cur.execute("SELECT COALESCE(NULLIF(trim(currency),''),'ZAR') AS ccy FROM public.companies WHERE id=%s", (company_id,))
    return cur.fetchone()["ccy"]

def get_asset(cur, schema, company_id, asset_id):
    cur.execute(_q(schema, "SELECT * FROM {schema}.assets WHERE company_id=%s AND id=%s"), (company_id, asset_id))
    return fetchone(cur)

def get_bank_ledger_account(cur, schema, company_id, bank_code_or_id):
    # supports ledger_account_code or id string
    cur.execute(_q(schema, """
        SELECT ledger_account_code
        FROM {schema}.company_bank_accounts
        WHERE company_id=%s AND (ledger_account_code=%s OR id::text=%s)
        LIMIT 1
    """), (company_id, bank_code_or_id, bank_code_or_id))
    row = cur.fetchone()
    return row["ledger_account_code"] if row else None

def get_latest_accum_dep(cur, schema, company_id, asset_id, as_at_date):
    cur.execute(_q(schema, """
        SELECT accumulated_depreciation
        FROM {schema}.asset_depreciation
        WHERE company_id=%s AND asset_id=%s AND status='posted' AND period_end <= %s
        ORDER BY period_end DESC, id DESC
        LIMIT 1
    """), (company_id, asset_id, as_at_date))
    row = cur.fetchone()
    return Decimal(row["accumulated_depreciation"]) if row else None


def get_impairment_net(cur, schema, company_id, asset_id, as_at_date):
    cur.execute(_q(schema, """
        SELECT COALESCE(SUM(impairment_amount - reversal_amount),0) AS net
        FROM {schema}.asset_impairments
        WHERE company_id=%s AND asset_id=%s AND status='posted' AND impairment_date <= %s
    """), (company_id, asset_id, as_at_date))
    return Decimal(cur.fetchone()["net"] or 0)

def get_reval_net(cur, schema, company_id, asset_id, as_at_date):
    cur.execute(_q(schema, """
        SELECT COALESCE(SUM(revaluation_change),0) AS net
        FROM {schema}.asset_revaluations
        WHERE company_id=%s AND asset_id=%s AND status='posted' AND revaluation_date <= %s
    """), (company_id, asset_id, as_at_date))
    return Decimal(cur.fetchone()["net"] or 0)

def get_cost_total(cur, schema, company_id, asset_id, as_at_date):
    # 1) Sum posted acquisitions up to as_at_date
    cur.execute(_q(schema, """
        SELECT COALESCE(SUM(amount),0) AS s
        FROM {schema}.asset_acquisitions
        WHERE company_id=%s
          AND asset_id=%s
          AND status='posted'
          AND acquisition_date <= %s
    """), (company_id, asset_id, as_at_date))
    acq_sum = Decimal((cur.fetchone() or {}).get("s") or 0)

    # 2) Sum posted subsequent add_cost up to as_at_date
    cur.execute(_q(schema, """
        SELECT COALESCE(SUM(amount),0) AS s
        FROM {schema}.asset_subsequent_measurements
        WHERE company_id=%s
          AND asset_id=%s
          AND status='posted'
          AND event_type='add_cost'
          AND event_date <= %s
    """), (company_id, asset_id, as_at_date))
    add_sum = Decimal((cur.fetchone() or {}).get("s") or 0)

    # If we have any posted acquisition/add_cost rows, treat those as authoritative cost
    if (acq_sum + add_sum) > 0:
        return (acq_sum + add_sum)

    # 3) Fallback to opening_cost or cost (legacy assets)
    cur.execute(_q(schema, """
        SELECT COALESCE(opening_cost, cost, 0) AS base_cost
        FROM {schema}.assets
        WHERE company_id=%s AND id=%s
    """), (company_id, asset_id))
    return Decimal((cur.fetchone() or {}).get("base_cost") or 0)

def carrying_amount(cur, schema, company_id, asset_id, as_at_date):
    # cost + reval - accum_dep - opening_impairment - impair_net
    cur.execute(_q(schema, """
        SELECT COALESCE(opening_accum_dep,0) AS open_accum,
               COALESCE(opening_impairment,0) AS open_imp
        FROM {schema}.assets WHERE company_id=%s AND id=%s
    """), (company_id, asset_id))
    snap = cur.fetchone()
    open_accum = Decimal(snap["open_accum"] or 0)
    open_imp   = Decimal(snap["open_imp"] or 0)

    cost_total = get_cost_total(cur, schema, company_id, asset_id, as_at_date)
    reval_net  = get_reval_net(cur, schema, company_id, asset_id, as_at_date)

    accum = get_latest_accum_dep(cur, schema, company_id, asset_id, as_at_date)
    accum = accum if accum is not None else open_accum

    imp_net = get_impairment_net(cur, schema, company_id, asset_id, as_at_date)

    ca = cost_total + reval_net - accum - open_imp - imp_net
    return max(Decimal("0"), ca)

# ----------------------------
# Posting: Acquisition
# ----------------------------

def _get_company_controls(cur, company_id: int) -> dict:
    """
    Reads control codes from public.company_account_settings.
    If some columns don't exist in your DB yet, we fallback safely.
    """
    controls = {
        "vat_input_code": "BS_CA_1410",   # fallback
        "ap_control_code": "BS_CL_2100",  # fallback
        "grni_control_code": None,        # required for GRNI, fallback handled below
    }

    # Try fetch from settings (won't crash if columns missing; we guard)
    cur.execute("""
        SELECT *
        FROM public.company_account_settings
        WHERE company_id=%s
        LIMIT 1
    """, (company_id,))
    row = cur.fetchone() or {}

    # Safe gets (row may be dict or RealDict)
    def g(k):
        try:
            return row.get(k)
        except Exception:
            return None

    v = (g("vat_input_code") or g("vat_input_account_code") or "").strip()
    if v:
        controls["vat_input_code"] = v

    ap = (g("ap_control_code") or g("ap_control_account_code") or "").strip()
    if ap:
        controls["ap_control_code"] = ap

    grni = (g("grni_control_code") or g("grni_control_account_code") or "").strip()
    if grni:
        controls["grni_control_code"] = grni

    return controls

def build_asset_acquisition_journal_preview(cur, company_id: int, acq_id: int) -> dict:
    """
    Returns:
      {
        ok: True,
        ref, description,
        lines: [{account_code,debit,credit,memo?}],
        total_debit, total_credit
      }

    VAT rule:
      - bank_cash & vendor_credit: amount assumed VAT-inclusive (invoice exists)
      - grni: amount assumed NET (no VAT yet)
      - other: default VAT-inclusive (you can later add a toggle)
    """
    schema = company_schema(company_id)

    # 1) load acquisition
    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.asset_acquisitions
        WHERE company_id=%s AND id=%s
        LIMIT 1
    """), (company_id, acq_id))
    acq = fetchone(cur)
    if not acq:
        raise Exception("Acquisition not found")

    # 2) load asset
    asset = get_asset(cur, schema, company_id, acq["asset_id"])
    if not asset:
        raise Exception("Asset not found for this acquisition")
    asset_cost_code = (asset.get("asset_account_code") or "").strip()
    if not asset_cost_code:
        raise Exception("Asset missing asset_account_code (PPE cost account)")

    funding = (acq.get("funding_source") or "").strip().lower()
    amount = _D(acq.get("amount"))
    if amount <= 0:
        raise Exception("Amount must be > 0")

    ref = (acq.get("reference") or f"ASSET-{acq['asset_id']}").strip()
    desc = f"Asset acquisition: {asset.get('asset_code','')} - {asset.get('asset_name','')}".strip(" -")

    controls = _get_company_controls(cur, company_id)
    vat_input_code = controls["vat_input_code"]
    ap_control_code = controls["ap_control_code"]
    grni_control_code = controls["grni_control_code"]

    lines = []

    def _attach_account_names(cur, schema, lines):
        for ln in lines:
            code = ln.get("account_code")
            if not code:
                continue

            cur.execute(_q(schema, """
                SELECT COALESCE(NULLIF(name,''), code) AS account_name
                FROM {schema}.coa
                WHERE code=%s
                LIMIT 1
            """), (code,))

            r = cur.fetchone()
            ln["account_name"] = (
                (r.get("account_name") if isinstance(r, dict) else r[0])
                if r else code
            )

    # ---------------------------
    # Funding logic
    # ---------------------------

    # ✅ BANK/CASH (your DB stores bank_cash, not bank/cash)
    if funding in ("bank_cash", "bank", "cash"):
        # Use bank_account_code already stored by create_acquisition (ledger code)
        bank_code = (acq.get("bank_account_code") or "").strip()

        # If missing, try resolve from bank_account_id (your table: company_bank_accounts)
        if not bank_code and acq.get("bank_account_id"):
            cur.execute(_q(schema, """
                SELECT ledger_account_code
                FROM {schema}.company_bank_accounts
                WHERE company_id=%s AND id=%s
                LIMIT 1
            """), (company_id, int(acq["bank_account_id"])))
            b = cur.fetchone() or {}
            bank_code = (b.get("ledger_account_code") or "").strip()

        if not bank_code:
            raise Exception("Bank account missing ledger_account_code (bank_account_code)")

        # amount is VAT-inclusive (paid invoice)
        net, vat, gross = _vat_split(amount)

        lines.append({"account_code": asset_cost_code, "debit": _money(net), "credit": 0.0, "memo": "Recognise asset (net)"})
        if vat > 0:
            lines.append({"account_code": vat_input_code, "debit": _money(vat), "credit": 0.0, "memo": "VAT input"})
        lines.append({"account_code": bank_code, "debit": 0.0, "credit": _money(gross), "memo": "Bank/Cash payment (gross)"})

    # ✅ VENDOR CREDIT (AP)
    elif funding == "vendor_credit":
        # amount is VAT-inclusive (invoice exists -> liability recognised)
        net, vat, gross = _vat_split(amount)

        lines.append({"account_code": asset_cost_code, "debit": _money(net), "credit": 0.0, "memo": "Recognise asset (net)"})
        if vat > 0:
            lines.append({"account_code": vat_input_code, "debit": _money(vat), "credit": 0.0, "memo": "VAT input"})
        lines.append({"account_code": ap_control_code, "debit": 0.0, "credit": _money(gross), "memo": "Recognise AP liability (gross)"})

    # ✅ GRNI (NO VAT YET)
    elif funding == "grni":
        if not grni_control_code:
            raise Exception("GRNI control account not configured in company settings")

        # amount is NET (no VAT until invoice)
        net = amount

        lines.append({"account_code": asset_cost_code, "debit": _money(net), "credit": 0.0, "memo": "Recognise asset on GRN (net)"})
        lines.append({"account_code": grni_control_code, "debit": 0.0, "credit": _money(net), "memo": "Credit GRNI (net) - invoice pending"})

    # ✅ OTHER (suspense/clearing)
    elif funding == "other":
        credit_code = (acq.get("credit_account_code") or "").strip()
        if not credit_code:
            raise Exception("Other funding requires credit_account_code")

        # assume VAT-inclusive by default
        net, vat, gross = _vat_split(amount)

        lines.append({"account_code": asset_cost_code, "debit": _money(net), "credit": 0.0, "memo": "Recognise asset (net)"})
        if vat > 0:
            lines.append({"account_code": vat_input_code, "debit": _money(vat), "credit": 0.0, "memo": "VAT input (assumed)"})
        lines.append({"account_code": credit_code, "debit": 0.0, "credit": _money(gross), "memo": "Credit clearing/suspense (gross)"})

    else:
        raise Exception(f"Unsupported funding_source: {funding}")

    total_debit = sum(_D(x.get("debit")) for x in lines)
    total_credit = sum(_D(x.get("credit")) for x in lines)

    codes = [l["account_code"] for l in lines]
    name_map = _coa_name_map(cur, schema, codes)

    for l in lines:
        l["account_name"] = name_map.get(l["account_code"], l["account_code"])

    _attach_account_names(cur, schema, lines)

    return {
        "ok": True,
        "ref": ref,
        "description": desc,
        "lines": lines,
        "total_debit": _money(total_debit),
        "total_credit": _money(total_credit),
    }

def _coa_name_map(cur, schema: str, codes: list[str]) -> dict[str, str]:
    """
    Returns {account_code: account_name} map.

    Works across different COA schemas by auto-detecting
    the best available name column.
    """

    # -----------------------------------
    # Clean input
    # -----------------------------------
    codes = [str(c).strip() for c in (codes or []) if c]
    if not codes:
        return {}

    # -----------------------------------
    # Detect name column in this schema
    # -----------------------------------
    cur.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema=%s
          AND table_name='coa'
          AND column_name IN (
            'name',
            'account_name',
            'account_title',
            'title',
            'description'
          )
    """, (schema,))

    cols = {r[0] if not isinstance(r, dict) else r["column_name"]
            for r in (cur.fetchall() or [])}

    # Priority order
    if "name" in cols:
        name_col = "name"
    elif "account_name" in cols:
        name_col = "account_name"
    elif "account_title" in cols:
        name_col = "account_title"
    elif "title" in cols:
        name_col = "title"
    elif "description" in cols:
        name_col = "description"
    else:
        name_col = None

    # -----------------------------------
    # Fallback if no name column exists
    # -----------------------------------
    if not name_col:
        return {c: c for c in codes}

    # -----------------------------------
    # Query name map
    # -----------------------------------
    cur.execute(_q(schema, f"""
        SELECT
          code,
          COALESCE(NULLIF({name_col}, ''), code) AS nm
        FROM {{schema}}.coa
        WHERE code = ANY(%s)
    """), (codes,))

    rows = cur.fetchall() or []

    out: dict[str, str] = {}

    for r in rows:
        code = r["code"] if isinstance(r, dict) else r[0]
        nm   = r["nm"]   if isinstance(r, dict) else r[1]
        out[str(code)] = str(nm or code)

    # Ensure all requested codes exist in output
    for c in codes:
        out.setdefault(str(c), str(c))

    return out


def post_acquisition(
    cur,
    company_id: int,
    acq_id: int,
    *,
    user: dict | None = None,
    approved_via: str | None = None
) -> int:
    enforce_ppe_post_policy(company_id=company_id, user=user, action="post_acquisition", approved_via=approved_via)

    schema = company_schema(company_id)

    cur.execute(
        _q(schema, "SELECT * FROM {schema}.asset_acquisitions WHERE company_id=%s AND id=%s FOR UPDATE"),
        (company_id, acq_id),
    )
    acq = fetchone(cur)
    if not acq:
        raise Exception("acquisition not found")
    if acq["status"] == "posted" and acq.get("posted_journal_id"):
        return acq["posted_journal_id"]

    asset = get_asset(cur, schema, company_id, acq["asset_id"])
    if not asset or not asset.get("asset_account_code"):
        raise Exception("asset missing asset_account_code")

    posting_date = acq.get("posting_date")
    if not posting_date:
        raise Exception("posting_date is required before posting acquisition")

    amount = _D(acq.get("amount"))
    if amount <= 0:
        raise Exception("amount must be > 0")

    ccy = get_company_currency(cur, company_id)

    funding = (acq.get("funding_source") or "").strip().lower()
    if funding in ("cash", "bank"):
        funding = "bank_cash"
    if funding == "ap":
        funding = "vendor_credit"

    controls = _get_company_controls(cur, company_id)
    vat_input_code = controls["vat_input_code"]
    ap_control_code = controls["ap_control_code"]
    grni_control_code = controls["grni_control_code"]

    if not vat_input_code:
        vat_input_code = _pick_coa_by_keywords(cur, schema, ["vat input", "input vat", "1410"], "BS_CA_1410")
    if not ap_control_code:
        ap_control_code = _pick_coa_by_keywords(cur, schema, ["accounts payable", "creditors", "ap control"], "BS_CL_2100")
    if not grni_control_code:
        grni_control_code = _pick_coa_by_keywords(cur, schema, ["grni", "goods received", "not invoiced"], "BS_CL_2200")

    def _resolve_bank_gl_code():
        code = (acq.get("bank_account_code") or "").strip()
        if code:
            return get_bank_ledger_account(cur, schema, company_id, code) or code

        bid = acq.get("bank_account_id")
        if bid:
            cur.execute(_q(schema, """
                SELECT ledger_account_code
                FROM {schema}.company_bank_accounts
                WHERE company_id=%s AND id=%s
                LIMIT 1
            """), (company_id, int(bid)))
            row = cur.fetchone() or {}
            code = (row.get("ledger_account_code") or "").strip()
            if code:
                return code

        raise Exception("bank_account_code or bank_account_id->ledger_account_code required for bank_cash funding_source")

    jid = create_journal(
        cur, schema, company_id,
        posting_date,
        acq.get("reference"),
        f"Asset acquisition: {asset['asset_code']} - {asset['asset_name']}",
        ccy, "asset_acquisition", acq["id"]
    )

    if funding == "grni":
        net = amount
        add_line(cur, schema, company_id, jid, asset["asset_account_code"], "Acquire PPE (net)", float(_q2(net)), 0, "asset_acquisition", acq["id"])
        add_line(cur, schema, company_id, jid, grni_control_code, "GRNI control (net)", 0, float(_q2(net)), "asset_acquisition", acq["id"])

    elif funding == "vendor_credit":
        gross = amount
        net, vat, gross = _vat_split(gross)

        add_line(cur, schema, company_id, jid, asset["asset_account_code"], "Acquire PPE (net)", float(net), 0, "asset_acquisition", acq["id"])
        if vat > 0:
            add_line(cur, schema, company_id, jid, vat_input_code, "VAT input", float(vat), 0, "asset_acquisition", acq["id"])
        add_line(cur, schema, company_id, jid, ap_control_code, "AP control (gross)", 0, float(_q2(gross)), "asset_acquisition", acq["id"])

    elif funding == "bank_cash":
        gross = amount
        net, vat, gross = _vat_split(gross)

        bank_gl = _resolve_bank_gl_code()
        add_line(cur, schema, company_id, jid, asset["asset_account_code"], "Acquire PPE (net)", float(net), 0, "asset_acquisition", acq["id"])
        if vat > 0:
            add_line(cur, schema, company_id, jid, vat_input_code, "VAT input", float(vat), 0, "asset_acquisition", acq["id"])
        add_line(cur, schema, company_id, jid, bank_gl, "Bank/Cash (gross)", 0, float(_q2(gross)), "asset_acquisition", acq["id"])

    else:
        credit_acct = (acq.get("credit_account_code") or "").strip() or "BS_CL_2000"
        gross = amount
        net, vat, gross = _vat_split(gross)

        add_line(cur, schema, company_id, jid, asset["asset_account_code"], "Acquire PPE (net)", float(net), 0, "asset_acquisition", acq["id"])
        if vat > 0:
            add_line(cur, schema, company_id, jid, vat_input_code, "VAT input (assumed)", float(vat), 0, "asset_acquisition", acq["id"])
        add_line(cur, schema, company_id, jid, credit_acct, "Credit (gross)", 0, float(_q2(gross)), "asset_acquisition", acq["id"])

    finalize_journal(cur, schema, company_id, jid)

    _post_journal_to_ledger_and_tb(
        cur,
        schema,
        company_id,
        jid,
        je_date=posting_date,
        ref=acq.get("reference")
    )

    cur.execute(_q(schema, """
      UPDATE {schema}.asset_acquisitions
      SET status='posted', posted_journal_id=%s, posted_at=NOW()
      WHERE company_id=%s AND id=%s
    """), (jid, company_id, acq_id))

    return jid


def post_opening_balance(
    cur,
    company_id: int,
    asset_id: int,
    *,
    posting_date,   # ✅ ADD
    user: dict | None = None,
    approved_via: str | None = None
) -> int:
    enforce_ppe_post_policy(
        company_id=company_id,
        user=user,
        action="post_opening_balance",
        approved_via=approved_via,
    )

    schema = company_schema(company_id)

    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.assets
        WHERE company_id=%s AND id=%s
        FOR UPDATE
    """), (company_id, asset_id))
    asset = fetchone(cur)
    if not asset:
        raise Exception("asset not found")

    asset_account_code = (asset.get("asset_account_code") or "").strip()
    accum_dep_account_code = (asset.get("accum_dep_account_code") or "").strip()

    if not asset_account_code:
        raise Exception("asset missing asset_account_code")
    if not accum_dep_account_code:
        raise Exception("asset missing accum_dep_account_code")

    cost = Decimal(str(asset.get("cost") or 0))
    opening_accum_dep = Decimal(str(asset.get("opening_accum_dep") or 0))
    opening_impairment = Decimal(str(asset.get("opening_impairment") or 0))
    opening_as_at = asset.get("opening_as_at") or asset.get("available_for_use_date") or asset.get("acquisition_date")

    if not opening_as_at:
        raise Exception("opening_as_at or asset start date is required")

    if cost <= 0:
        raise Exception("opening asset cost must be > 0")
    if opening_accum_dep < 0:
        raise Exception("opening_accum_dep cannot be negative")
    if opening_impairment < 0:
        raise Exception("opening_impairment cannot be negative")
    if opening_accum_dep > cost:
        raise Exception("opening_accum_dep cannot exceed cost")

    carrying = cost - opening_accum_dep - opening_impairment
    if carrying < 0:
        raise Exception("invalid opening values: carrying amount cannot be negative")

    ccy = get_company_currency(cur, company_id)

    cur.execute(_q(schema, """
        SELECT code
        FROM {schema}.coa
        WHERE company_id=%s
          AND template_code_scoped = 'G::3105'
        LIMIT 1
    """), (company_id,))
    row = cur.fetchone()

    if not row or not row.get("code"):
        raise Exception("Opening Balance Equity account (G::3105) not found in company COA")

    opening_equity_code = (row.get("code") or "").strip()

    impairment_account_code = (
        (asset.get("accum_impairment_account_code") or "").strip()
        or (asset.get("impairment_loss_account_code") or "").strip()
    )

    ref = f"OB-ASSET-{asset['id']}"

    jid = create_journal(
        cur,
        schema,
        company_id,
        posting_date,   # ✅ USE THIS
        ref,
        f"Asset opening balance: {asset['asset_code']} - {asset['asset_name']}",
        ccy,
        "asset_opening_balance",
        asset["id"],
    )

    add_line(
        cur, schema, company_id, jid,
        asset_account_code,
        "Opening PPE cost",
        float(_q2(cost)), 0,
        "asset_opening_balance", asset["id"]
    )

    if opening_accum_dep > 0:
        add_line(
            cur, schema, company_id, jid,
            accum_dep_account_code,
            "Opening accumulated depreciation",
            0, float(_q2(opening_accum_dep)),
            "asset_opening_balance", asset["id"]
        )

    if opening_impairment > 0:
        if not impairment_account_code:
            raise Exception("opening_impairment provided but no impairment account configured")

        add_line(
            cur, schema, company_id, jid,
            impairment_account_code,
            "Opening accumulated impairment",
            0, float(_q2(opening_impairment)),
            "asset_opening_balance", asset["id"]
        )

    if carrying > 0:
        add_line(
            cur, schema, company_id, jid,
            opening_equity_code,
            "Opening balance equity",
            0, float(_q2(carrying)),
            "asset_opening_balance", asset["id"]
        )

    finalize_journal(cur, schema, company_id, jid)

    _post_journal_to_ledger_and_tb(
        cur,
        schema,
        company_id,
        jid,
        je_date=posting_date,   # ✅ USE THIS
        ref=ref,
    )

    cur.execute(_q(schema, """
        UPDATE {schema}.assets
        SET updated_at = NOW()
        WHERE company_id=%s AND id=%s
    """), (company_id, asset_id))

    return jid

# ----------------------------
# Posting: Revaluation
# ----------------------------
def post_revaluation(
    cur,
    company_id: int,
    reval_id: int,
    *,
    user: dict | None = None,
    approved_via: str | None = None
) -> int:
    enforce_ppe_post_policy(company_id=company_id, user=user, action="post_revaluation", approved_via=approved_via)

    schema = company_schema(company_id)

    cur.execute(_q(schema, """
        SELECT * FROM {schema}.asset_revaluations
        WHERE company_id=%s AND id=%s
        FOR UPDATE
    """), (company_id, reval_id))
    r = fetchone(cur)
    if not r:
        raise Exception("revaluation not found")
    if r["status"] == "posted" and r["posted_journal_id"]:
        return r["posted_journal_id"]

    asset = get_asset(cur, schema, company_id, r["asset_id"])
    if not asset or not asset.get("asset_account_code"):
        raise Exception("asset missing asset_account_code")

    if Decimal(r["oci_revaluation_surplus"]) > 0 and not asset.get("revaluation_reserve_account_code"):
        raise Exception("missing revaluation_reserve_account_code")
    if Decimal(r["pnl_revaluation_gain"]) > 0 and not asset.get("revaluation_surplus_to_pnl_account_code"):
        raise Exception("missing revaluation_surplus_to_pnl_account_code")
    if Decimal(r["pnl_revaluation_loss"]) > 0 and not asset.get("revaluation_deficit_pnl_account_code"):
        raise Exception("missing revaluation_deficit_pnl_account_code")

    ccy = get_company_currency(cur, company_id)
    jid = create_journal(
        cur, schema, company_id,
        r["revaluation_date"], None,
        f"Revaluation: {asset['asset_code']} - {asset['asset_name']}",
        ccy, "asset_revaluation", r["id"]
    )

    delta = Decimal(r["revaluation_change"] or 0)
    if delta > 0:
        add_line(cur, schema, company_id, jid, asset["asset_account_code"], "Increase carrying amount", delta, 0, "asset_revaluation", r["id"])
    elif delta < 0:
        add_line(cur, schema, company_id, jid, asset["asset_account_code"], "Decrease carrying amount", 0, abs(delta), "asset_revaluation", r["id"])

    oci = Decimal(r["oci_revaluation_surplus"] or 0)
    gain = Decimal(r["pnl_revaluation_gain"] or 0)
    loss = Decimal(r["pnl_revaluation_loss"] or 0)

    if oci > 0:
        add_line(cur, schema, company_id, jid, asset["revaluation_reserve_account_code"], "OCI revaluation surplus", 0, oci, "asset_revaluation", r["id"])
        cur.execute(_q(schema, """
          INSERT INTO {schema}.asset_revaluation_reserve(
            company_id, asset_id, event_date, event_type, reserve_movement,
            revaluation_id, equity_account_code, status, posted_journal_id, posted_at
          ) VALUES (%s,%s,%s,'revaluation',%s,%s,%s,'posted',%s,NOW())
        """), (company_id, r["asset_id"], r["revaluation_date"], oci, r["id"], asset["revaluation_reserve_account_code"], jid))

    if gain > 0:
        add_line(cur, schema, company_id, jid, asset["revaluation_surplus_to_pnl_account_code"], "Revaluation gain (P/L)", 0, gain, "asset_revaluation", r["id"])
    if loss > 0:
        add_line(cur, schema, company_id, jid, asset["revaluation_deficit_pnl_account_code"], "Revaluation deficit (P/L)", loss, 0, "asset_revaluation", r["id"])

    finalize_journal(cur, schema, company_id, jid)

    _post_journal_to_ledger_and_tb(cur, schema, company_id, jid, je_date=r["revaluation_date"], ref=f"REVAL-{r['id']}")

    cur.execute(_q(schema, """
      UPDATE {schema}.asset_revaluations
      SET status='posted', posted_journal_id=%s, posted_at=NOW()
      WHERE company_id=%s AND id=%s
    """), (jid, company_id, reval_id))

    upsert_carrying_snapshot(
        cur,
        company_id,
        r["asset_id"],
        as_at=r["revaluation_date"],
        source_event="revaluation",
        created_by=None
    )
    return jid

# ----------------------------
# Posting: Impairment
# ----------------------------
def post_impairment(
    cur,
    company_id: int,
    imp_id: int,
    *,
    user: dict | None = None,
    approved_via: str | None = None
) -> int:
    enforce_ppe_post_policy(company_id=company_id, user=user, action="post_impairment", approved_via=approved_via)

    schema = company_schema(company_id)

    cur.execute(_q(schema, """
        SELECT * FROM {schema}.asset_impairments
        WHERE company_id=%s AND id=%s
        FOR UPDATE
    """), (company_id, imp_id))
    r = fetchone(cur)
    if not r:
        raise Exception("impairment not found")
    if r["status"] == "posted" and r["posted_journal_id"]:
        return r["posted_journal_id"]

    asset = get_asset(cur, schema, company_id, r["asset_id"])
    if not asset or not asset.get("asset_account_code"):
        raise Exception("asset missing asset_account_code")

    imp = Decimal(r["impairment_amount"] or 0)
    rev = Decimal(r["reversal_amount"] or 0)
    if imp <= 0 and rev <= 0:
        raise Exception("nothing to post")

    if imp > 0 and not asset.get("impairment_loss_account_code"):
        raise Exception("missing impairment_loss_account_code")
    if rev > 0 and not asset.get("impairment_reversal_account_code"):
        raise Exception("missing impairment_reversal_account_code")

    ccy = get_company_currency(cur, company_id)
    jid = create_journal(
        cur, schema, company_id,
        r["impairment_date"], None,
        f"Impairment: {asset['asset_code']} - {asset['asset_name']}",
        ccy, "asset_impairment", r["id"]
    )

    if imp > 0:
        add_line(cur, schema, company_id, jid, asset["impairment_loss_account_code"], "Impairment loss", imp, 0, "asset_impairment", r["id"])
        add_line(cur, schema, company_id, jid, asset["asset_account_code"], "Reduce PPE carrying amount", 0, imp, "asset_impairment", r["id"])

    if rev > 0:
        add_line(cur, schema, company_id, jid, asset["asset_account_code"], "Increase PPE carrying amount", rev, 0, "asset_impairment", r["id"])
        add_line(cur, schema, company_id, jid, asset["impairment_reversal_account_code"], "Impairment reversal", 0, rev, "asset_impairment", r["id"])

    finalize_journal(cur, schema, company_id, jid)

    _post_journal_to_ledger_and_tb(cur, schema, company_id, jid, je_date=r["impairment_date"], ref=f"IMP-{r['id']}")

    cur.execute(_q(schema, """
      UPDATE {schema}.asset_impairments
      SET status='posted', posted_journal_id=%s, posted_at=NOW()
      WHERE company_id=%s AND id=%s
    """), (jid, company_id, imp_id))

    upsert_carrying_snapshot(
        cur,
        company_id,
        r["asset_id"],
        as_at=r["impairment_date"],
        source_event="impairment",
        created_by=None
    )
    return jid

# ----------------------------
# Posting: Held-for-sale
# ----------------------------
def post_hfs(
    cur,
    company_id: int,
    hfs_id: int,
    *,
    user: dict | None = None,
    approved_via: str | None = None
) -> int:
    enforce_ppe_post_policy(company_id=company_id, user=user, action="post_hfs", approved_via=approved_via)

    schema = company_schema(company_id)

    cur.execute(_q(schema, """
      SELECT *
      FROM {schema}.asset_held_for_sale
      WHERE company_id=%s AND id=%s
      FOR UPDATE
    """), (company_id, hfs_id))
    r = fetchone(cur)
    if not r:
        raise Exception("hfs not found")
    if r.get("posted_journal_id"):
        return r["posted_journal_id"]

    asset = get_asset(cur, schema, company_id, r["asset_id"])
    if not asset or not asset.get("asset_account_code") or not asset.get("held_for_sale_account_code"):
        raise Exception("asset missing asset_account_code or held_for_sale_account_code")

    ccy = get_company_currency(cur, company_id)
    jid = create_journal(
        cur, schema, company_id,
        r["classification_date"], None,
        f"Held for sale: {asset['asset_code']} - {asset['asset_name']}",
        ccy, "asset_hfs", r["id"]
    )

    add_line(cur, schema, company_id, jid, asset["held_for_sale_account_code"], "Move to held-for-sale", r["carrying_amount"], 0, "asset_hfs", r["id"])
    add_line(cur, schema, company_id, jid, asset["asset_account_code"], "Remove from PPE", 0, r["carrying_amount"], "asset_hfs", r["id"])

    imp = Decimal(r["impairment_on_classification"] or 0)
    if imp > 0:
        if not asset.get("impairment_loss_account_code"):
            raise Exception("missing impairment_loss_account_code for HFS impairment")
        add_line(cur, schema, company_id, jid, asset["impairment_loss_account_code"], "HFS impairment", imp, 0, "asset_hfs", r["id"])
        add_line(cur, schema, company_id, jid, asset["held_for_sale_account_code"], "Reduce HFS carrying amount", 0, imp, "asset_hfs", r["id"])

    finalize_journal(cur, schema, company_id, jid)

    # ✅ BUG FIX: you were using r["revaluation_date"] here, but HFS uses classification_date
    _post_journal_to_ledger_and_tb(
        cur, schema, company_id, jid,
        je_date=r["classification_date"],
        ref=f"HFS-{r['id']}"
    )

    cur.execute(_q(schema, """
        UPDATE {schema}.asset_held_for_sale
        SET posted_journal_id=%s, posted_at=NOW()
        WHERE company_id=%s AND id=%s
    """), (jid, company_id, hfs_id))

    cur.execute(_q(schema, """
        UPDATE {schema}.assets
        SET status='held_for_sale', updated_at=NOW()
        WHERE company_id=%s AND id=%s
    """), (company_id, r["asset_id"]))

    return jid

# ----------------------------
# Posting: Disposal
# ----------------------------

def post_disposal(cur, company_id: int, disp_id: int, *, user: dict | None = None, approved_via: str | None = None) -> int:
    """
    Posts an asset disposal (creates journal, posts to ledger/TB, marks asset disposed).
    IMPORTANT: Enforces PPE review policy when enabled.

    approved_via:
      - "approve_post" when called by /approve-post endpoint
      - None/"" otherwise
    """

    schema = company_schema(company_id)

    # ------------------------------------------------------------
    # POLICY GATE (prevents bypassing approve-post endpoint)
    # ------------------------------------------------------------
    pol = company_policy(company_id)
    mode = pol["mode"]
    company_profile = pol["company"]
    policy = pol["policy"]

    review_required = ppe_review_required(mode, policy, "post_disposal")

    if review_required:
        # Only allow posting if called via approve-post AND user can approve
        if (approved_via or "").strip().lower() != "approve_post":
            raise Exception("Disposal posting is in review mode. Use approve-post endpoint.")
        if not user or not can_approve_ppe(user, company_profile, mode):
            raise Exception("Not allowed to approve/post disposals in review mode.")
    else:
        # Normal mode: allow posters
        if user and (not can_post_ppe(user, company_profile, mode)):
            raise Exception("Not allowed to post disposals.")

    # ------------------------------------------------------------
    # Load + lock disposal
    # ------------------------------------------------------------
    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.asset_disposals
        WHERE company_id=%s AND id=%s
        FOR UPDATE
    """), (company_id, disp_id))
    r = fetchone(cur)
    if not r:
        raise Exception("disposal not found")

    st = (r.get("status") or "").strip().lower()
    if st == "posted" and r.get("posted_journal_id"):
        return r["posted_journal_id"]
    if st in {"void", "reversed"}:
        raise Exception(f"cannot post disposal in status '{st}'")

    if not r.get("asset_id"):
        raise Exception("disposal missing asset_id")
    if not r.get("disposal_date"):
        raise Exception("disposal missing disposal_date")

    # ------------------------------------------------------------
    # Load asset + validate mappings
    # ------------------------------------------------------------
    asset = get_asset(cur, schema, company_id, r["asset_id"])
    if not asset:
        raise Exception("asset not found")

    needed = [
        "asset_account_code",
        "accum_dep_account_code",
        "disposal_gain_account_code",
        "disposal_loss_account_code",
    ]
    for k in needed:
        if not (asset.get(k) or "").strip():
            raise Exception(f"asset missing {k}")

    ccy = get_company_currency(cur, company_id)

    # ------------------------------------------------------------
    # Ensure depreciation is up to disposal date
    # ------------------------------------------------------------
    last_end = get_last_posted_dep_end(
        cur, schema, company_id,
        asset_id=r["asset_id"],
        up_to=r["disposal_date"]
    )
    if last_end and last_end < r["disposal_date"]:
        ps = last_end + timedelta(days=1)
        pe = r["disposal_date"]
        dep_id = generate_single_asset_depreciation(cur, company_id, r["asset_id"], ps, pe)

        # IMPORTANT: pass through same policy intent if you gate depreciation too
        post_depreciation(cur, company_id, dep_id, user=user, approved_via=approved_via)

    # ------------------------------------------------------------
    # Compute numbers
    # ------------------------------------------------------------
    ca = carrying_amount(cur, schema, company_id, r["asset_id"], r["disposal_date"])
    proceeds = Decimal(r.get("proceeds") or 0)
    gainloss = proceeds - ca

    accum = get_latest_accum_dep(cur, schema, company_id, r["asset_id"], r["disposal_date"])
    if accum is None:
        cur.execute(_q(schema, """
            SELECT COALESCE(opening_accum_dep,0) AS x
            FROM {schema}.assets
            WHERE company_id=%s AND id=%s
        """), (company_id, r["asset_id"]))
        accum = Decimal(cur.fetchone()["x"] or 0)

    # remove PPE at (carrying + accum)
    remove_ppe_credit = ca + accum

    # Proceeds account
    if (r.get("bank_account_code") or "").strip():
        proceeds_acct = get_bank_ledger_account(cur, schema, company_id, r["bank_account_code"]) or r["bank_account_code"]
    else:
        proceeds_acct = "BS_CA_1000"  # fallback cash

    # ------------------------------------------------------------
    # Create journal
    # ------------------------------------------------------------
    jid = create_journal(
        cur, schema, company_id,
        r["disposal_date"],
        r.get("reference"),
        f"Disposal: {asset['asset_code']} - {asset['asset_name']}",
        ccy,
        "asset_disposal",
        r["id"]
    )

    if proceeds > 0:
        add_line(cur, schema, company_id, jid, proceeds_acct, "Disposal proceeds", proceeds, 0, "asset_disposal", r["id"])

    if accum > 0:
        add_line(cur, schema, company_id, jid, asset["accum_dep_account_code"], "Clear accumulated depreciation", accum, 0, "asset_disposal", r["id"])

    add_line(cur, schema, company_id, jid, asset["asset_account_code"], "Remove PPE", 0, remove_ppe_credit, "asset_disposal", r["id"])

    if gainloss > 0:
        add_line(cur, schema, company_id, jid, asset["disposal_gain_account_code"], "Gain on disposal", 0, gainloss, "asset_disposal", r["id"])
    elif gainloss < 0:
        add_line(cur, schema, company_id, jid, asset["disposal_loss_account_code"], "Loss on disposal", abs(gainloss), 0, "asset_disposal", r["id"])

    finalize_journal(cur, schema, company_id, jid)

    # ✅ FIXED: use disposal_date + correct ref
    _post_journal_to_ledger_and_tb(
        cur, schema, company_id, jid,
        je_date=r["disposal_date"],
        ref=f"DISP-{r['id']}"
    )

    # ------------------------------------------------------------
    # Update disposal + asset
    # ------------------------------------------------------------
    cur.execute(_q(schema, """
        UPDATE {schema}.asset_disposals
        SET status='posted',
            posted_journal_id=%s,
            posted_at=NOW(),
            carrying_amount=%s,
            gain_loss=%s
        WHERE company_id=%s AND id=%s
    """), (jid, ca, gainloss, company_id, disp_id))

    cur.execute(_q(schema, """
        UPDATE {schema}.assets
        SET status='disposed',
            disposed_date=%s,
            updated_at=NOW()
        WHERE company_id=%s AND id=%s
    """), (r["disposal_date"], company_id, r["asset_id"]))

    return jid

from decimal import Decimal, ROUND_HALF_UP

def D(x) -> Decimal:
    try:
        return Decimal(str(x or 0))
    except Exception:
        return Decimal("0")

def money(x) -> float:
    return float(D(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def _req_posting(policy: dict, key: str) -> str:
    code = ((policy.get("posting") or {}).get(key) or "").strip()
    if not code:
        raise ValueError(f"Missing policy.posting.{key} account mapping")
    return code

def _pick_asset_code(asset_row: dict, key: str, policy: dict, fallback_policy_key: str | None = None) -> str:
    """
    Prefer asset mapping (like your existing posting functions),
    fallback to policy.posting.* if provided.
    """
    code = (asset_row.get(key) or "").strip()
    if code:
        return code
    if fallback_policy_key:
        return _req_posting(policy, fallback_policy_key)
    raise ValueError(f"Missing asset.{key}" + (f" (or policy.posting.{fallback_policy_key})" if fallback_policy_key else ""))

def _attach_account_names(lines: list[dict], schema: str, cur=None) -> list[dict]:
    """
    Attach account names from {schema}.coa to preview lines.
    """
    if not cur or not lines or not schema:
        return lines

    codes = sorted({
        (l.get("account_code") or "").strip()
        for l in lines
        if (l.get("account_code") or "").strip()
    })
    if not codes:
        return lines

    cur.execute(f"""
        SELECT code, name
        FROM {schema}.coa
        WHERE code = ANY(%s)
    """, (codes,))

    mp = {r["code"]: r["name"] for r in (cur.fetchall() or [])}

    out = []
    for l in lines:
        row = dict(l)
        c = (row.get("account_code") or "").strip()
        if c and c in mp:
            row["account_name"] = mp[c]
        out.append(row)

    return out

def _preview_header(payload: dict, memo: str) -> dict:
    return {
        "date": str(payload.get("event_date") or "")[:10],
        "memo": memo,
        "currency": payload.get("currency") or None,
    }

def _round2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def _to_date(x):
    if x is None:
        return None
    if isinstance(x, date) and not isinstance(x, datetime):
        return x
    if isinstance(x, datetime):
        return x.date()
    if isinstance(x, str):
        # handles "YYYY-MM-DD" and ISO datetime strings
        return datetime.fromisoformat(x[:10]).date()
    return None


def eligible_for_depreciation(asset: dict, period_end):
    pe = _to_date(period_end)

    start = _to_date(
        asset.get("available_for_use_date")
        or asset.get("in_service_date")      # keep fallback if other schemas exist
        or asset.get("acquisition_date")
        or asset.get("acquired_on")
    )

    disposed = _to_date(asset.get("disposed_date"))

    return bool(
        pe and start and start <= pe and (disposed is None or disposed > pe)
    )

def calc_monthly_dep(asset, cost_basis: Decimal, residual: Decimal) -> Decimal:
    """
    Straight-line depreciation MONTHLY AMOUNT only (not rate).
    """
    life = int(asset.get("useful_life_months") or 0)
    if life <= 0:
        return Decimal("0")

    depreciable = max(Decimal("0"), cost_basis - residual)
    return _round2(depreciable / Decimal(life))

# ----------------------------
# Posting: Depreciation
# ----------------------------

from decimal import Decimal

def post_depreciation(
    cur,
    company_id: int,
    dep_id: int,
    *,
    user: dict | None = None,
    approved_via: str | None = None,
    approved_by_user_id: int | None = None,
    approval_note: str | None = None,
) -> int:
    enforce_ppe_post_policy(
        company_id=company_id,
        user=user,
        action="post_depreciation",
        approved_via=approved_via
    )

    schema = company_schema(company_id)

    cur.execute(_q(schema, """
      SELECT *
      FROM {schema}.asset_depreciation
      WHERE company_id=%s AND id=%s
      FOR UPDATE
    """), (company_id, dep_id))
    dep = fetchone(cur)
    if not dep:
        raise Exception("depreciation not found")
    if dep.get("status") == "posted" and dep.get("posted_journal_id"):
        return dep["posted_journal_id"]

    asset = get_asset(cur, schema, company_id, dep["asset_id"])
    if not asset:
        raise Exception("asset not found")

    dep_exp, acc_dep = resolve_depreciation_accounts(cur, schema, company_id, asset)
    if not dep_exp or not acc_dep:
        raise Exception("Depreciation control accounts not configured (dep_exp or acc_dep missing)")

    amt = Decimal(dep.get("depreciation_amount") or 0)
    if amt <= 0:
        raise Exception("Depreciation amount must be > 0")

    ccy = get_company_currency(cur, company_id)

    jid = create_journal(
        cur, schema, company_id,
        dep["period_end"],
        None,
        f"Depreciation: {asset.get('asset_code')} {dep.get('period_start')}..{dep.get('period_end')}",
        ccy,
        "asset_depreciation",
        dep["id"]
    )

    add_line(cur, schema, company_id, jid, dep_exp, "Depreciation expense", amt, 0, "asset_depreciation", dep["id"])
    add_line(cur, schema, company_id, jid, acc_dep, "Accumulated depreciation", 0, amt, "asset_depreciation", dep["id"])

    finalize_journal(cur, schema, company_id, jid)

    _post_journal_to_ledger_and_tb(
        cur, schema, company_id, jid,
        je_date=dep["period_end"],
        ref=f"DEP-{dep['id']}"
    )

    # ✅ stamp posted info
    cur.execute(_q(schema, """
      UPDATE {schema}.asset_depreciation
      SET status='posted',
          posted_journal_id=%s,
          posted_at=NOW()
      WHERE company_id=%s AND id=%s
    """), (jid, company_id, dep_id))

    upsert_carrying_snapshot(
        cur,
        company_id,
        dep["asset_id"],
        as_at=dep["period_end"],
        source_event="depreciation",
        created_by=None
    )
    return jid

def ensure_col_exists(cur, schema: str, table: str, col: str, col_type: str = "text") -> bool:
    """
    Dev-only helper.
    Ensures {schema}.{table}.{col} exists, adding it if missing.
    Returns True if column exists after this call.
    """
    # 1) check
    cur.execute("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema=%s AND table_name=%s AND column_name=%s
        LIMIT 1
    """, (schema, table, col))
    if cur.fetchone() is not None:
        return True

    # 2) add (idempotent)
    # NOTE: cannot parametrize identifiers; validate schema/table/col upstream if needed.
    cur.execute(f'ALTER TABLE "{schema}"."{table}" ADD COLUMN IF NOT EXISTS "{col}" {col_type}')

    # 3) re-check
    cur.execute("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema=%s AND table_name=%s AND column_name=%s
        LIMIT 1
    """, (schema, table, col))
    return cur.fetchone() is not None

def coa_first_by_name_excluding(
    cur, schema: str, company_id: int, *,
    patterns: list[str],
    exclude_patterns: list[str] | None = None,
    section: str | None = None,
    is_contra: bool | None = None
) -> str | None:
    patterns = [p for p in (patterns or []) if (p or "").strip()]
    if not patterns:
        return None

    where = ["company_id=%s", "posting IS TRUE"]
    params: list = [company_id]

    if section:
        where.append("LOWER(COALESCE(section,''))=LOWER(%s)")
        params.append(section)

    if is_contra is not None:
        where.append("is_contra IS %s")
        params.append(is_contra)

    like_sql = " OR ".join(["name ILIKE %s"] * len(patterns))
    params.extend(patterns)

    not_sql = ""
    if exclude_patterns:
        ex = [p for p in exclude_patterns if (p or "").strip()]
        if ex:
            not_sql = " AND " + " AND ".join(["name NOT ILIKE %s"] * len(ex))
            params.extend(ex)

    cur.execute(_q(schema, f"""
      SELECT code
      FROM {{schema}}.coa
      WHERE {" AND ".join(where)}
        AND ({like_sql})
        {not_sql}
      ORDER BY code
      LIMIT 1
    """), tuple(params))

    r = cur.fetchone()
    return r["code"] if r else None

def generate_depreciation_run(
    cur,
    company_id: int,
    period_start: date,
    period_end: date,
    asset_class: str | None = None,
    include_draft_usage: bool = False,   # ✅ add
):
    """
    Creates DRAFT rows in asset_depreciation for eligible assets for the period.
    Returns list of created depreciation ids.

    ✅ Key rules:
      - effective period_start per asset = max(requested period_start, available_for_use_date/acquisition_date)
      - SL prorates using _month_fraction(eff_ps, period_end)
      - RB uses rb_depreciation(asset, ca_start, eff_ps, period_end)
      - accum_prev uses eff_ps - 1 day
      - avoid duplicates for same asset+effective period
      - writes basis snapshot fields (RB/UOP too)
    """
    schema = company_schema(company_id)

    where = ["company_id=%s", "status='active'"]
    params = [company_id]
    if asset_class:
        where.append("asset_class=%s")
        params.append(asset_class)

    cur.execute(_q(schema, f"""
      SELECT * FROM {{schema}}.assets
      WHERE {" AND ".join(where)}
      ORDER BY id
    """), params)

    assets = cur.fetchall() or []
    created_ids: list[int] = []

    for a in assets:
        asset_id = a["id"]

        # -------------------------
        # ✅ effective start date per asset
        # -------------------------
        start = a.get("available_for_use_date") or a.get("acquisition_date")
        eff_ps = period_start
        if start and start > eff_ps:
            eff_ps = start

        # If asset only becomes available after period_end, skip
        if start and start > period_end:
            continue

        # Eligibility check should use eff_ps/period_end logic (or at least period_end)
        if not eligible_for_depreciation(a, period_end):
            continue

        # -------------------------
        # ✅ avoid duplicates for same asset+effective period
        # -------------------------
        cur.execute(_q(schema, """
          SELECT 1
          FROM {schema}.asset_depreciation
          WHERE company_id=%s AND asset_id=%s
            AND period_start=%s AND period_end=%s
            AND status <> 'void'
          LIMIT 1
        """), (company_id, asset_id, eff_ps, period_end))
        if cur.fetchone():
            continue

        # -------------------------
        # Basis snapshots (base from asset master)
        # -------------------------
        cost_basis = get_cost_total(cur, schema, company_id, asset_id, period_end)

        residual_base = Decimal(a.get("residual_value") or 0)
        life_base     = int(a.get("useful_life_months") or 0)
        method_base   = (a.get("depreciation_method") or "SL").upper()
        meas          = a.get("measurement_basis") or "cost"

        # ✅ estimate effective at start of period (prospective)
        est_start = get_effective_estimate_as_of(cur, schema, company_id, asset_id, eff_ps)
        residual_1, life_1, method_1 = _apply_estimate_overrides(
            residual=residual_base, life=life_base, method=method_base, est=est_start
        )

        # Find FIRST change in the period (if any)
        est_in_period = get_first_estimate_change_in_period(cur, schema, company_id, asset_id, eff_ps, period_end)

        # Segment dates
        seg1_ps = eff_ps
        seg1_pe = period_end
        seg2_ps = None
        seg2_pe = None

        # If estimate changes during the period, split:
        # seg1: eff_ps .. (change_date - 1)
        # seg2: change_date .. period_end
        if est_in_period:
            chg = est_in_period["event_date"]
            if chg and chg > eff_ps and chg <= period_end:
                seg1_pe = chg - timedelta(days=1)
                seg2_ps = chg
                seg2_pe = period_end

        # ✅ accumulated dep as at day BEFORE eff_ps (same as your current code)
        as_at_prev = eff_ps - timedelta(days=1)
        accum_prev = get_latest_accum_dep(cur, schema, company_id, asset_id, as_at_prev)
        if accum_prev is None:
            cur.execute(_q(schema, """
              SELECT COALESCE(opening_accum_dep,0) AS x
              FROM {schema}.assets
              WHERE company_id=%s AND id=%s
            """), (company_id, asset_id))
            accum_prev = Decimal((cur.fetchone() or {}).get("x") or 0)

        # Carrying amount at START (before this period dep)
        ca_start = carrying_amount(cur, schema, company_id, asset_id, eff_ps)

        # -------------------------
        # Dep calculation (possibly split)
        # -------------------------
        def _dep_for_segment(method: str, life: int, residual: Decimal, seg_ps: date, seg_pe: date, ca_seg_start: Decimal) -> Decimal:
            if seg_pe < seg_ps:
                return Decimal("0")

            if method == "SL":
                if life <= 0:
                    return Decimal("0")
                monthly_amt = calc_monthly_dep({"useful_life_months": life}, cost_basis, residual)
                frac_m = _month_fraction(seg_ps, seg_pe)
                return _round2(monthly_amt * frac_m)

            if method == "RB":
                # RB uses ca_start for the segment
                temp_asset = dict(a)
                temp_asset["rb_rate_percent"] = a.get("rb_rate_percent")
                return rb_depreciation(temp_asset, ca_seg_start, seg_ps, seg_pe)

            if method == "UOP":
                units_used = get_units_used(
                    cur, schema, company_id, asset_id, seg_ps, seg_pe,
                    include_draft=include_draft_usage
                )
                # uop_depreciation needs the asset row for uop_total_units, etc
                temp_asset = dict(a)
                temp_asset["useful_life_months"] = life  # not used by UOP, safe
                return uop_depreciation(temp_asset, cost_basis, residual, units_used)

            return Decimal("0")

        dep1 = _dep_for_segment(method_1, life_1, residual_1, seg1_ps, seg1_pe, ca_start)

        dep2 = Decimal("0")
        residual_2, life_2, method_2 = residual_1, life_1, method_1

        if seg2_ps and seg2_pe:
            # apply overrides effective at change date (seg2 start)
            est_seg2 = get_effective_estimate_as_of(cur, schema, company_id, asset_id, seg2_ps)
            residual_2, life_2, method_2 = _apply_estimate_overrides(
                residual=residual_base, life=life_base, method=method_base, est=est_seg2
            )

            # segment 2 carrying start = ca_start - dep1 (approx; consistent with one-row model)
            # Segment 2 CA start should reflect posted movements up to the change date
            # BUT depreciation for seg1 is still draft, so subtract dep1 manually.
            ca_at_change = carrying_amount(cur, schema, company_id, asset_id, seg2_ps)

            # remove draft depreciation already calculated for seg1
            ca_seg2_start = _round2(max(Decimal("0"), ca_at_change - dep1))

            dep2 = _dep_for_segment(method_2, life_2, residual_2, seg2_ps, seg2_pe, ca_seg2_start)

        dep_amt = _round2(dep1 + dep2)

        # Cap so we don't go below residual (use residual at END of period i.e., seg2 if exists else seg1)
        residual_end = residual_2 if (seg2_ps and seg2_pe) else residual_1
        max_dep = max(Decimal("0"), ca_start - residual_end)
        dep_amt = min(dep_amt, _round2(max_dep))

        if dep_amt <= 0:
            continue

        accum_after = _round2(accum_prev + dep_amt)
        ca_after    = _round2(max(Decimal("0"), ca_start - dep_amt))

        # ✅ choose basis snapshot to store:
        # store END-of-period estimate snapshot (most relevant going forward)
        life_basis     = life_2 if (seg2_ps and seg2_pe) else life_1
        residual_basis = residual_end
        method_basis   = method_2 if (seg2_ps and seg2_pe) else method_1

        # ✅ accumulated dep as at day BEFORE eff_ps
        as_at_prev = eff_ps - timedelta(days=1)
        accum_prev = get_latest_accum_dep(cur, schema, company_id, asset_id, as_at_prev)

        if accum_prev is None:
            cur.execute(_q(schema, """
              SELECT COALESCE(opening_accum_dep,0) AS x
              FROM {schema}.assets
              WHERE company_id=%s AND id=%s
            """), (company_id, asset_id))
            accum_prev = Decimal((cur.fetchone() or {}).get("x") or 0)

        if method_basis == "SL" and life_basis <= 0:
            current_app.logger.warning("DEP SKIP invalid SL life asset_id=%s life=%s", asset_id, life_basis)
            continue

        # Carrying amount at start (before this period dep)
        ca_start = carrying_amount(cur, schema, company_id, asset_id, eff_ps)

        # Pro-rate factor for SL
        frac_m = _month_fraction(eff_ps, period_end)

        dep_amt = Decimal("0")

        if method_basis == "SL":
            monthly_amt = calc_monthly_dep(a, cost_basis, residual_basis)
            current_app.logger.info("DEP SL asset_id=%s life=%s cost_basis=%s residual=%s monthly=%s frac=%s",
                                    asset_id, life_basis, cost_basis, residual_basis, monthly_amt, frac_m)
            dep_amt = _round2(monthly_amt * frac_m)

        elif method_basis == "RB":
            dep_amt = rb_depreciation(a, ca_start, eff_ps, period_end)
            current_app.logger.info("DEP RB asset_id=%s rate=%s ca_start=%s eff_ps=%s pe=%s dep=%s",
                                    asset_id, a.get("rb_rate_percent"), ca_start, eff_ps, period_end, dep_amt)
        elif method_basis == "UOP":
            units_used = get_units_used(
                cur, schema, company_id, asset_id, eff_ps, period_end,
                include_draft=include_draft_usage
            )
            dep_amt = uop_depreciation(a, cost_basis, residual_basis, units_used)

        # Cap so we don't go below residual
        max_dep = max(Decimal("0"), ca_start - residual_basis)
        dep_amt = min(dep_amt, _round2(max_dep))

        if dep_amt <= 0:
            current_app.logger.info(
                "DEP SKIP asset_id=%s name=%s method=%s cost_basis=%s residual=%s ca_start=%s life=%s frac=%s start=%s eff_ps=%s pe=%s",
                asset_id,
                a.get("asset_name"),
                method_basis,
                str(cost_basis),
                str(residual_basis),
                str(ca_start),
                str(life_basis),
                str(frac_m),
                str(start),
                str(eff_ps),
                str(period_end),
            )
            continue

        if dep_amt <= 0:
            continue

        accum_after = _round2(accum_prev + dep_amt)
        ca_after    = _round2(max(Decimal("0"), ca_start - dep_amt))

        # -------------------------
        # ✅ extra basis columns
        # -------------------------
        rb_rate_percent_basis = a.get("rb_rate_percent")

        uop_total_units_basis = None
        uop_units_used_basis  = None
        uop_unit_name_basis   = None
        if method_basis == "UOP":
            uop_total_units_basis = Decimal(a.get("uop_total_units") or 0)
            uop_units_used_basis  = get_units_used(
                cur, schema, company_id, asset_id, eff_ps, period_end,
                include_draft=include_draft_usage
            )
            uop_unit_name_basis   = a.get("uop_unit_name")

        cur.execute(_q(schema, """
          INSERT INTO {schema}.asset_depreciation(
            company_id, asset_id,
            period_start, period_end,
            depreciation_amount,
            accumulated_depreciation, carrying_amount,
            cost_basis, residual_value_basis, useful_life_months_basis,
            depreciation_method_basis, measurement_basis,
            rb_rate_percent_basis,
            uop_total_units_basis, uop_units_used_basis, uop_unit_name_basis,
            status, created_at
          )
          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'draft',NOW())
          RETURNING id
        """), (
          company_id, asset_id,
          eff_ps, period_end,
          dep_amt,
          accum_after, ca_after,
          cost_basis, residual_basis, life_basis,
          method_basis, meas,
          rb_rate_percent_basis,
          uop_total_units_basis, uop_units_used_basis, uop_unit_name_basis
        ))

        created_ids.append(cur.fetchone()["id"])

    return created_ids

def get_effective_estimate_as_of(cur, schema: str, company_id: int, asset_id: int, as_of: date):
    """
    Returns latest change_estimate (life/residual/method) effective on/before as_of.
    Uses status <> 'void' to allow draft/pending_review to affect previews.
    If you ONLY want posted estimates to affect depreciation, change the status filter to = 'posted'.
    """
    cur.execute(_q(schema, """
        SELECT
            event_date,
            useful_life_months,
            residual_value,
            depreciation_method
        FROM {schema}.asset_subsequent_measurements
        WHERE company_id=%s
          AND asset_id=%s
          AND lower(event_type)='change_estimate'
          AND status <> 'void'              -- or: AND lower(status)='posted'
          AND event_date <= %s
        ORDER BY event_date DESC, id DESC
        LIMIT 1
    """), (company_id, asset_id, as_of))

    r = cur.fetchone() or None
    if not r:
        return None

    life = r.get("useful_life_months")
    resid = r.get("residual_value")
    meth = r.get("depreciation_method")

    out = {
        "event_date": r.get("event_date"),
        "useful_life_months": int(life) if life not in (None, "", 0, "0") else None,
        "residual_value": Decimal(resid or 0) if resid is not None else None,
        "depreciation_method": (str(meth).strip().upper() if meth else None),
    }
    return out

def days_in_period(ps: date, pe: date) -> int:
    return (pe - ps).days + 1

def days_in_year(d: date) -> int:
    # simple: actual/365; if you want leap-year: check calendar.isleap(d.year)
    return 365

def get_first_estimate_change_in_period(cur, schema: str, company_id: int, asset_id: int, ps: date, pe: date):
    """
    Returns the first change_estimate event_date within [ps, pe] (inclusive).
    If you only want posted estimates to affect depreciation, replace status <> 'void' with lower(status)='posted'.
    """
    cur.execute(_q(schema, """
        SELECT id, event_date, useful_life_months, residual_value, depreciation_method
        FROM {schema}.asset_subsequent_measurements
        WHERE company_id=%s
          AND asset_id=%s
          AND lower(event_type)='change_estimate'
          AND status <> 'void'
          AND event_date >= %s
          AND event_date <= %s
        ORDER BY event_date ASC, id ASC
        LIMIT 1
    """), (company_id, asset_id, ps, pe))

    r = cur.fetchone() or None
    if not r:
        return None

    from decimal import Decimal
    return {
        "id": int(r.get("id")),
        "event_date": r.get("event_date"),
        "useful_life_months": int(r["useful_life_months"]) if r.get("useful_life_months") not in (None, "", 0, "0") else None,
        "residual_value": Decimal(r["residual_value"]) if r.get("residual_value") is not None else None,
        "depreciation_method": (str(r.get("depreciation_method")).strip().upper() if r.get("depreciation_method") else None),
    }

def _apply_estimate_overrides(*, residual: Decimal, life: int, method: str, est: dict | None):
    if not est:
        return residual, life, method
    if est.get("residual_value") is not None:
        residual = est["residual_value"]
    if est.get("useful_life_months") is not None:
        life = int(est["useful_life_months"])
    if est.get("depreciation_method"):
        method = est["depreciation_method"]
    return residual, life, method

def rb_depreciation(asset_row, ca_start: Decimal, ps: date, pe: date) -> Decimal:
    rate_pct = Decimal(asset_row.get("rb_rate_percent") or 0)
    if rate_pct <= 0:
        return Decimal("0")
    annual_rate = rate_pct / Decimal("100")
    frac = Decimal(days_in_period(ps, pe)) / Decimal(days_in_year(pe))
    return _round2(ca_start * annual_rate * frac)


def uop_depreciation(asset_row, cost_basis: Decimal, residual: Decimal, units_used: Decimal) -> Decimal:
    total = Decimal(asset_row.get("uop_total_units") or 0)
    if total <= 0 or units_used <= 0:
        return Decimal("0")
    depreciable = max(Decimal("0"), cost_basis - residual)
    return _round2(depreciable * (units_used / total))


def get_last_posted_dep_end(cur, schema: str, company_id: int, asset_id: int, as_at: date) -> date | None:
    """
    Returns latest posted depreciation period_end up to as_at (inclusive).
    """
    cur.execute(_q(schema, """
      SELECT MAX(period_end) AS last_end
      FROM {schema}.asset_depreciation
      WHERE company_id=%s
        AND asset_id=%s
        AND status='posted'
        AND period_end <= %s
    """), (company_id, asset_id, as_at))
    row = cur.fetchone()
    return row["last_end"] if row and row["last_end"] else None


def _days(ps: date, pe: date) -> int:
    return max(0, (pe - ps).days + 1)

def month_starts(ps: date, pe: date):
    d = date(ps.year, ps.month, 1)
    end = date(pe.year, pe.month, 1)
    while d <= end:
        yield d
        d = date(d.year + (d.month // 12), ((d.month % 12) + 1), 1)

def month_end(d: date):
    # last day of month
    nxt = date(d.year + (d.month // 12), ((d.month % 12) + 1), 1)
    return nxt - timedelta(days=1)

from datetime import date, timedelta

def month_floor(d: date) -> date:
    return date(d.year, d.month, 1)

def month_ceil_end(d: date) -> date:
    # last day of month
    if d.month == 12:
        return date(d.year, 12, 31)
    return date(d.year, d.month + 1, 1) - timedelta(days=1)

def iter_months(ps: date, pe: date):
    d = month_floor(ps)
    last = month_floor(pe)
    while d <= last:
        yield d
        # next month
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)

def days_in_month(d: date) -> int:
    return month_ceil_end(d).day

def sl_amount_for_slice(asset, cost_basis, residual, ps_m, pe_m):
    monthly = calc_monthly_dep(asset, cost_basis, residual)
    # prorate by actual days in that month
    dim = Decimal(days_in_month(ps_m))
    days = Decimal((pe_m - ps_m).days + 1)
    return _round2(monthly * (days / dim)) 

def _month_fraction(ps, pe):
    # treat as number of months, not a fraction
    # rough: whole months + partial
    months = (pe.year - ps.year)*12 + (pe.month - ps.month)
    # add partial month portion
    dim = Decimal(month_end(ps).day)  # days in ps month
    partial = Decimal((month_end(ps) - ps).days + 1) / dim
    return Decimal(months) + partial


def get_units_used(
    cur,
    schema: str,
    company_id: int,
    asset_id: int,
    period_start: date,
    period_end: date,
    include_draft: bool = False
) -> Decimal:
    # read config from assets
    cur.execute(_q(schema, """
      SELECT
        COALESCE(uop_usage_mode,'DELTA') AS mode,
        uop_opening_reading::numeric AS opening
      FROM {schema}.assets
      WHERE company_id=%s AND id=%s
    """), (company_id, asset_id))
    a = cur.fetchone() or {}
    mode = str(a.get("mode") or "DELTA").upper()
    opening = Decimal(str(a.get("opening") or "0"))

    if mode == "READING":
        # last reading on/before period_end
        cur.execute(_q(schema, """
          SELECT au.units_used::numeric AS reading
          FROM {schema}.asset_usage au
          WHERE au.company_id=%s AND au.asset_id=%s
            AND (au.status='posted' OR (%s AND au.status='draft'))
            AND au.period_end <= %s
          ORDER BY au.period_end DESC, au.id DESC
          LIMIT 1
        """), (company_id, asset_id, include_draft, period_end))
        last = cur.fetchone()
        if not last or last.get("reading") is None:
            return Decimal("0")

        last_reading = Decimal(str(last["reading"]))

        # baseline reading on/before period_start (else opening)
        cur.execute(_q(schema, """
          SELECT au.units_used::numeric AS reading
          FROM {schema}.asset_usage au
          WHERE au.company_id=%s AND au.asset_id=%s
            AND (au.status='posted' OR (%s AND au.status='draft'))
            AND au.period_end <= %s
          ORDER BY au.period_end DESC, au.id DESC
          LIMIT 1
        """), (company_id, asset_id, include_draft, period_start))
        base = cur.fetchone()
        base_reading = Decimal(str(base["reading"])) if base and base.get("reading") is not None else opening

        used = last_reading - base_reading
        return used if used > 0 else Decimal("0")

    # DELTA: sum entries in overlap
    cur.execute(_q(schema, """
      SELECT COALESCE(SUM(au.units_used::numeric),0) AS u
      FROM {schema}.asset_usage au
      WHERE au.company_id=%s AND au.asset_id=%s
        AND (au.status='posted' OR (%s AND au.status='draft'))
        AND au.period_start >= %s
        AND au.period_end   <= %s
    """), (company_id, asset_id, include_draft, period_start, period_end))
    r = cur.fetchone() or {}
    return Decimal(str(r.get("u") or "0"))

def generate_single_asset_depreciation(
    cur, company_id: int, asset_id: int,
    period_start: date, period_end: date,
    created_by: str | None = None,
    include_draft_usage: bool = False,   # ✅ add
) -> int | None:
    """
    Creates one DRAFT depreciation row for a single asset and period.

    ✅ Fixes included:
      - SL proration using _month_fraction
      - RB uses rb_depreciation() only
      - accum_prev uses period_start - 1 day
    """
    schema = company_schema(company_id)

    cur.execute(_q(schema, "SELECT * FROM {schema}.assets WHERE company_id=%s AND id=%s"),
                (company_id, asset_id))
    a = cur.fetchone()
    if not a:
        raise Exception("asset not found")

    if not eligible_for_depreciation(a, period_end):
        return None

    # Avoid duplicates
    cur.execute(_q(schema, """
      SELECT 1
      FROM {schema}.asset_depreciation
      WHERE company_id=%s AND asset_id=%s
        AND period_start=%s AND period_end=%s
        AND status <> 'void'
      LIMIT 1
    """), (company_id, asset_id, period_start, period_end))
    if cur.fetchone():
        return None

    cost_basis = get_cost_total(cur, schema, company_id, asset_id, period_end)
    residual = Decimal(a.get("residual_value") or 0)
    life = int(a.get("useful_life_months") or 0)
    method = (a.get("depreciation_method") or "SL").upper()
    meas = a.get("measurement_basis") or "cost"

    # ✅ accum_prev up to day BEFORE period_start
    as_at_prev = period_start - timedelta(days=1)
    accum_prev = get_latest_accum_dep(cur, schema, company_id, asset_id, as_at_prev)
    if accum_prev is None:
        cur.execute(_q(schema, """
          SELECT COALESCE(opening_accum_dep,0) AS x
          FROM {schema}.assets WHERE company_id=%s AND id=%s
        """), (company_id, asset_id))
        accum_prev = Decimal(cur.fetchone()["x"] or 0)

    ca_start = carrying_amount(cur, schema, company_id, asset_id, period_start)

    frac_m = _month_fraction(period_start, period_end)

    dep_amt = Decimal("0")

    if method == "SL":
        monthly_amt = calc_monthly_dep(a, cost_basis, residual)
        dep_amt = _round2(monthly_amt * frac_m)

    elif method == "RB":
        dep_amt = rb_depreciation(a, ca_start, period_start, period_end)

    elif method == "UOP":
        total_units = Decimal(a.get("uop_total_units") or 0)
        used = get_units_used(
            cur, schema, company_id, asset_id, period_start, period_end,
            include_draft=include_draft_usage
        )
        if total_units > 0 and used > 0:
            depreciable = max(Decimal("0"), (cost_basis - residual))
            dep_amt = _round2(depreciable * (used / total_units))
        else:
            dep_amt = Decimal("0")
    else:
        return None

    # Cap so we don't go below residual
    max_dep = max(Decimal("0"), (ca_start - residual))
    dep_amt = min(dep_amt, _round2(max_dep))

    if dep_amt <= 0:
        return None

    accum_after = _round2(accum_prev + dep_amt)
    ca_after = _round2(max(Decimal("0"), ca_start - dep_amt))

    # Optional bases for UOP
    uop_total_units_basis = None
    uop_units_used_basis = None
    uop_unit_name_basis = None
    if method == "UOP":
        uop_total_units_basis = Decimal(a.get("uop_total_units") or 0)
        uop_units_used_basis = get_units_used(
            cur, schema, company_id, asset_id, period_start, period_end,
            include_draft=include_draft_usage
        )
        uop_unit_name_basis = a.get("uop_unit_name")

    rb_rate_percent_basis = a.get("rb_rate_percent")

    cur.execute(_q(schema, """
        INSERT INTO {schema}.asset_depreciation(
            company_id, asset_id,
            period_start, period_end,
            depreciation_amount,
            accumulated_depreciation, carrying_amount,
            cost_basis, residual_value_basis, useful_life_months_basis,
            depreciation_method_basis, measurement_basis,
            rb_rate_percent_basis,
            uop_total_units_basis, uop_units_used_basis, uop_unit_name_basis,
            status, created_at, created_by
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'draft',NOW(),%s)
        RETURNING id
        """), (
        company_id, asset_id,
        period_start, period_end,
        dep_amt,
        accum_after, ca_after,
        cost_basis, residual, life,
        method, meas,
        rb_rate_percent_basis,
        uop_total_units_basis, uop_units_used_basis, uop_unit_name_basis,
        created_by
        ))

    return cur.fetchone()["id"]

from datetime import datetime
from decimal import Decimal

def preview_depreciation_run(
    cur,
    company_id: int,
    period_start: date,
    period_end: date,
    asset_class: str | None = None,
    asset_id: int | None = None,
):
    schema = company_schema(company_id)

    cur.execute("SAVEPOINT dep_preview")
    try:
        # 1) generate draft depreciation rows (only for assets that produce > 0)
        if asset_id:
            new_id = generate_single_asset_depreciation(
                cur, company_id, asset_id, period_start, period_end,
                created_by=None,
                include_draft_usage=True   # ✅ preview should include draft usage
            )
        else:
            ids = generate_depreciation_run(
                cur, company_id, period_start, period_end,
                asset_class=asset_class,
                include_draft_usage=True   # ✅
            )

        # 2) fetch inserted preview rows
        rows: list[dict] = []
        if ids:
            cur.execute(_q(schema, """
              SELECT
                d.*,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.depreciation_method,
                a.uop_unit_name,
                a.uop_total_units,
                a.cost,
                a.opening_cost,
                a.opening_accum_dep
              FROM {schema}.asset_depreciation d
              JOIN {schema}.assets a ON a.id = d.asset_id
              WHERE d.company_id=%s AND d.id = ANY(%s)
              ORDER BY d.asset_id, d.period_end
            """), (company_id, ids))
            rows = cur.fetchall() or []

        # 3) candidate assets list (only active)
        params = [company_id]
        where = ["a.company_id=%s", "a.status='active'"]

        if asset_class:
            where.append("a.asset_class=%s")
            params.append(asset_class)

        if asset_id:
            where.append("a.id=%s")
            params.append(asset_id)

        cur.execute(_q(schema, f"""
        SELECT
          a.id,
          a.asset_code,
          a.asset_name,
          a.asset_class,
          a.depreciation_method,
          a.acquisition_date,
          a.available_for_use_date,
          a.disposed_date,
          a.cost,
          a.opening_cost,
          a.opening_accum_dep,
          a.residual_value,

          a.useful_life_months,
          a.rb_rate_percent,
          a.uop_usage_mode,
          a.uop_opening_reading,

          a.uop_total_units,
          a.uop_unit_name,

          a.dep_expense_account_code,
          a.accum_dep_account_code
        FROM {{schema}}.assets a
        WHERE {' AND '.join(where)}
        ORDER BY a.id
        """), tuple(params))

        candidate_assets = cur.fetchall() or []
        assets_by_id = {int(a["id"]): a for a in candidate_assets if a.get("id") is not None}

        # 4) attach journal_lines + carrying_after to each preview dep row
        for r in rows:
            aid = int(r.get("asset_id") or 0)
            a = assets_by_id.get(aid) or {}

            r["journal_lines"] = build_dep_preview_journal_lines(cur, schema, company_id, a, r)

            dep_amt = Decimal(r.get("depreciation_amount") or 0)

            cost_basis = (
                Decimal(a.get("opening_cost") or 0)
                if a.get("opening_cost") not in (None, "")
                else Decimal(a.get("cost") or 0)
            )

            cur.execute(_q(schema, """
              SELECT COALESCE((
                SELECT d.accumulated_depreciation::numeric
                FROM {schema}.asset_depreciation d
                WHERE d.company_id=%s AND d.asset_id=%s AND d.status='posted' AND d.period_end <= %s
                ORDER BY d.period_end DESC, d.id DESC
                LIMIT 1
              ), COALESCE(%s,0))::numeric AS acc_dep
            """), (company_id, aid, period_end, a.get("opening_accum_dep")))

            acc_dep = Decimal(cur.fetchone()["acc_dep"] or 0)
            nbv_before = cost_basis - acc_dep
            r["carrying_after"] = (nbv_before - dep_amt)

        produced = {int(r["asset_id"]) for r in rows if r.get("asset_id") is not None}

        # ✅ define this so step 6 never crashes (you removed step 5)
        skipped_ids: set[int] = set()

        # 6) skipped_general for anything else that didn't produce a row
        skipped_general: list[dict] = []
        for a in candidate_assets:
            aid = int(a["id"])
            if aid in produced or aid in skipped_ids:
                continue

            reason = "no_depreciation_generated"
            missing: list[str] = []

            method = (a.get("depreciation_method") or "").upper().strip()
            start = a.get("available_for_use_date") or a.get("acquisition_date")
            disposed = a.get("disposed_date")

            if isinstance(start, datetime):
                start = start.date()
            if isinstance(disposed, datetime):
                disposed = disposed.date()

            # ✅ effective start (important for UOP usage checks)
            eff_ps = period_start
            if start and start > eff_ps:
                eff_ps = start

            jl = build_dep_preview_journal_lines(cur, schema, company_id, a, {"depreciation_amount": Decimal("0.00")})
            codes = {x.get("account_code") for x in (jl or [])}

            if "MISSING_DEP_EXPENSE_ACCT" in codes:
                missing.append("dep_expense_account_code (or role depreciation_expense)")
            if "MISSING_ACC_DEP_ACCT" in codes:
                missing.append("accum_dep_account_code (or role accumulated_depreciation)")

            if missing:
                reason = "missing_gl_accounts"
            elif not start:
                reason = "missing_start_date"
                missing.append("available_for_use_date/acquisition_date")
            elif start > period_end:
                reason = "not_in_service_yet"
            elif disposed and disposed <= period_end:
                reason = "disposed"
            elif method == "UOP":
                if not a.get("uop_total_units"):
                    reason = "missing_uop_total_units"
                    missing.append("uop_total_units")
                else:
                    units_used = get_units_used(
                        cur, schema, company_id, aid, eff_ps, period_end,
                        include_draft=True
                    )
                    if not units_used or Decimal(units_used) <= 0:
                        reason = "skipped_no_usage"
            elif method == "SL":
                life = int(a.get("useful_life_months") or 0)
                if life <= 0:
                    reason = "missing_useful_life_months"
                    missing.append("useful_life_months")
            elif method == "RB":
                if not a.get("rb_rate_percent"):
                    reason = "missing_rb_rate_percent"
                    missing.append("rb_rate_percent")

            skipped_general.append({
                "company_id": company_id,
                "asset_id": aid,
                "period_start": eff_ps,   # ✅ show effective start (optional but useful)
                "period_end": period_end,
                "asset_code": a.get("asset_code"),
                "asset_name": a.get("asset_name"),
                "asset_class": a.get("asset_class"),
                "status": reason,
                "missing_fields": missing or None,
                "depreciation_amount": Decimal("0.00"),
                "carrying_after": None,
                "journal_lines": jl,
            })

        cur.execute("ROLLBACK TO SAVEPOINT dep_preview")
        return (rows or []) + skipped_general

    except Exception:
        cur.execute("ROLLBACK TO SAVEPOINT dep_preview")
        raise


def preview_single_asset_depreciation(
    cur,
    company_id: int,
    asset_id: int,
    ps: date,
    pe: date,
    asset_class: str | None = None,
):
    schema = company_schema(company_id)

    cur.execute("SAVEPOINT dep_preview_one")
    try:
        # ✅ Optional safety: if caller supplied asset_class, enforce it
        if asset_class:
            cur.execute(_q(schema, """
              SELECT 1
              FROM {schema}.assets
              WHERE company_id=%s AND id=%s AND asset_class=%s
              LIMIT 1
            """), (company_id, asset_id, asset_class))
            if not cur.fetchone():
                cur.execute("ROLLBACK TO SAVEPOINT dep_preview_one")
                return None

        new_id = generate_single_asset_depreciation(
            cur, company_id, asset_id, ps, pe, created_by=None
        )
        if not new_id:
            cur.execute("ROLLBACK TO SAVEPOINT dep_preview_one")
            return None

        cur.execute(_q(schema, """
          SELECT d.*, a.asset_code, a.asset_name, a.asset_class
          FROM {schema}.asset_depreciation d
          JOIN {schema}.assets a ON a.id = d.asset_id
          WHERE d.company_id=%s AND d.id=%s
        """), (company_id, new_id))

        row = cur.fetchone()
        if row:
            # ✅ fetch asset (for account codes + cost)
            cur.execute(_q(schema, """
              SELECT a.*
              FROM {schema}.assets a
              WHERE a.company_id=%s AND a.id=%s
              LIMIT 1
            """), (company_id, asset_id))
            asset = cur.fetchone() or {}

            # ✅ attach preview journal lines
            row["journal_lines"] = build_dep_preview_journal_lines(cur, schema, company_id, asset, row)

            # ✅ carrying_after
            dep_amt = Decimal(row.get("depreciation_amount") or 0)
            cost_basis = Decimal(asset.get("opening_cost") or asset.get("cost") or 0)

            cur.execute(_q(schema, """
              SELECT COALESCE((
                SELECT d.accumulated_depreciation::numeric
                FROM {schema}.asset_depreciation d
                WHERE d.company_id=%s AND d.asset_id=%s AND d.status='posted' AND d.period_end <= %s
                ORDER BY d.period_end DESC, d.id DESC
                LIMIT 1
              ), COALESCE(%s,0))::numeric AS acc_dep
            """), (company_id, asset_id, pe, asset.get("opening_accum_dep")))

            acc_dep = Decimal(cur.fetchone()["acc_dep"] or 0)
            nbv_before = cost_basis - acc_dep
            row["carrying_after"] = (nbv_before - dep_amt)

        cur.execute("ROLLBACK TO SAVEPOINT dep_preview_one")
        return row

    except Exception:
        cur.execute("ROLLBACK TO SAVEPOINT dep_preview_one")
        raise

def coa_exists(cur, schema: str, company_id: int, code: str | None) -> bool:
    code = (code or "").strip()
    if not code:
        return False
    cur.execute(_q(schema, """
      SELECT 1
      FROM {schema}.coa
      WHERE company_id=%s AND code=%s AND posting IS TRUE
      LIMIT 1
    """), (company_id, code))
    return bool(cur.fetchone())

def coa_first_by_role(cur, schema: str, company_id: int, role: str) -> str | None:
    role = (role or "").strip()
    if not role:
        return None
    cur.execute(_q(schema, """
      SELECT code
      FROM {schema}.coa
      WHERE company_id=%s
        AND posting IS TRUE
        AND NULLIF(TRIM(role),'') IS NOT NULL
        AND LOWER(role)=LOWER(%s)
      ORDER BY code
      LIMIT 1
    """), (company_id, role))
    r = cur.fetchone()
    return r["code"] if r else None

def coa_first_by_name(
    cur, schema: str, company_id: int, *,
    patterns: list[str],
    section: str | None = None,
    is_contra: bool | None = None
) -> str | None:
    patterns = [p for p in (patterns or []) if (p or "").strip()]
    if not patterns:
        return None

    where = ["company_id=%s", "posting IS TRUE"]
    params: list = [company_id]

    if section:
        where.append("LOWER(COALESCE(section,''))=LOWER(%s)")
        params.append(section)

    if is_contra is not None:
        where.append("is_contra IS %s")
        params.append(is_contra)

    like_sql = " OR ".join(["name ILIKE %s"] * len(patterns))
    params.extend(patterns)

    cur.execute(_q(schema, f"""
      SELECT code
      FROM {{schema}}.coa
      WHERE {" AND ".join(where)}
        AND ({like_sql})
      ORDER BY
        -- prefer closer matches if you want; otherwise just code
        code
      LIMIT 1
    """), tuple(params))

    r = cur.fetchone()
    return r["code"] if r else None


def is_rou_asset_record(asset: dict) -> bool:
    # adapt to your schema fields
    t = (asset.get("asset_type") or asset.get("type") or "").lower()
    std = (asset.get("standard") or asset.get("ifrs_standard") or "").lower()
    nm = (asset.get("name") or "").lower()

    return (
        "rou" in t or "right-of-use" in t or "right of use" in t or
        "ifrs 16" in std or
        "right-of-use" in nm or "right of use" in nm
    )


def resolve_depreciation_accounts(
    cur, schema: str, company_id: int, asset: dict
) -> tuple[str | None, str | None]:
    """
    Resolves depreciation/amortisation expense + accumulated depreciation accounts.

    Priority:
    1) Asset-specific overrides (asset fields)
    2) Role-based defaults (PPE vs ROU split)
    3) Name-based best-effort (with ROU exclusions when PPE)

    Notes:
    - PPE must NEVER “accidentally” pick the ROU accumulated depreciation account.
    - If you keep multiple COA rows with the same role (e.g. accumulated_depreciation_ppe),
      role-based selection will pick the lowest code (ORDER BY code). Prefer a single “control”
      account for that role, or set asset.accum_dep_account_code explicitly.
    """

    # -------------------------
    # 1) Asset-specific overrides (best)
    # -------------------------
    dep_exp = (asset.get("dep_expense_account_code") or "").strip() or None
    acc_dep = (asset.get("accum_dep_account_code") or "").strip() or None

    dep_exp_code = dep_exp if dep_exp and coa_exists(cur, schema, company_id, dep_exp) else None
    acc_dep_code = acc_dep if acc_dep and coa_exists(cur, schema, company_id, acc_dep) else None

    rou = is_rou_asset_record(asset)

    # -------------------------
    # 2) Role-based defaults (PPE vs ROU split)
    # -------------------------
    if rou:
        if not dep_exp_code:
            dep_exp_code = (
                coa_first_by_role(cur, schema, company_id, "amortisation_expense_rou")
                or coa_first_by_role(cur, schema, company_id, "depreciation_expense_rou")
                or coa_first_by_role(cur, schema, company_id, "lease_amortization")  # legacy
            )

        if not acc_dep_code:
            acc_dep_code = (
                coa_first_by_role(cur, schema, company_id, "accumulated_depreciation_rou")
                or coa_first_by_role(cur, schema, company_id, "accumulated_amortization_rou")  # legacy
            )
    else:
        if not dep_exp_code:
            dep_exp_code = (
                coa_first_by_role(cur, schema, company_id, "depreciation_expense_ppe")
                or coa_first_by_role(cur, schema, company_id, "depreciation_expense")  # generic
            )

        if not acc_dep_code:
            acc_dep_code = coa_first_by_role(cur, schema, company_id, "accumulated_depreciation_ppe")

    # -------------------------
    # 3) Name-based fallback (avoid PPE picking ROU acc dep)
    # -------------------------
    ROU_EXCLUDES = ["%right-of-use%", "%right of use%", "%rou%"]

    def coa_first_by_name_excluding(
        *,
        patterns: list[str],
        exclude_patterns: list[str] | None,
        section: str | None,
        is_contra: bool | None,
    ) -> str | None:
        patterns = [p for p in (patterns or []) if (p or "").strip()]
        if not patterns:
            return None

        where = ["company_id=%s", "posting IS TRUE"]
        params: list = [company_id]

        if section:
            where.append("LOWER(COALESCE(section,''))=LOWER(%s)")
            params.append(section)

        if is_contra is not None:
            where.append("is_contra IS %s")
            params.append(is_contra)

        like_sql = " OR ".join(["name ILIKE %s"] * len(patterns))
        params.extend(patterns)
        where.append(f"({like_sql})")

        if exclude_patterns:
            ex = [p for p in (exclude_patterns or []) if (p or "").strip()]
            if ex:
                where.extend(["name NOT ILIKE %s"] * len(ex))
                params.extend(ex)

        cur.execute(
            _q(
                schema,
                f"""
                SELECT code
                FROM {{schema}}.coa
                WHERE {" AND ".join(where)}
                ORDER BY code
                LIMIT 1
                """,
            ),
            tuple(params),
        )
        r = cur.fetchone()
        return r["code"] if r else None

    # ---- accumulated depreciation fallback
    if not acc_dep_code:
        if rou:
            # Prefer explicit ROU accumulated dep
            acc_dep_code = coa_first_by_name(
                cur,
                schema,
                company_id,
                patterns=[
                    "%accum%depr%right-of-use%",
                    "%accum%depr%right of use%",
                    "%accum%depr%rou%",
                    "%accumulated depreciation%right-of-use%",
                    "%accumulated depreciation%rou%",
                ],
                section="Asset",
                is_contra=True,
            )

            # last resort: any accumulated dep (still fine for ROU)
            if not acc_dep_code:
                acc_dep_code = coa_first_by_name(
                    cur,
                    schema,
                    company_id,
                    patterns=["%accum%depr%", "%accumulated depreciation%"],
                    section="Asset",
                    is_contra=True,
                )

        else:
            # PPE: try match by asset name first, exclude ROU
            asset_nm = (asset.get("name") or "").strip()
            if asset_nm:
                # keep this broad enough to match your seeded names
                acc_dep_code = coa_first_by_name_excluding(
                    patterns=[f"%accum%depr%{asset_nm}%"],
                    exclude_patterns=ROU_EXCLUDES,
                    section="Asset",
                    is_contra=True,
                )

            # then any accumulated depreciation, but exclude ROU
            if not acc_dep_code:
                acc_dep_code = coa_first_by_name_excluding(
                    patterns=["%accum%depr%", "%accumulated depreciation%"],
                    exclude_patterns=ROU_EXCLUDES,
                    section="Asset",
                    is_contra=True,
                )

    # ---- depreciation/amortisation expense fallback
    if not dep_exp_code:
        if rou:
            dep_exp_code = (
                coa_first_by_name(
                    cur,
                    schema,
                    company_id,
                    patterns=[
                        "%lease amort%",
                        "%lease amortis%",
                        "%rou amort%",
                        "%amort%right-of-use%",
                        "%right-of-use%amort%",
                        "%right of use%amort%",
                    ],
                    section="Expense",
                    is_contra=False,
                )
                or coa_first_by_name(
                    cur,
                    schema,
                    company_id,
                    patterns=["%depreciation%"],
                    section="Expense",
                    is_contra=False,
                )
            )
        else:
            dep_exp_code = coa_first_by_name(
                cur,
                schema,
                company_id,
                patterns=["%depreciation%"],
                section="Expense",
                is_contra=False,
            )

    return dep_exp_code, acc_dep_code

def _coa_find_by_code(cur, schema: str, company_id: int, code: str | None, *, include_non_posting: bool = False) -> str | None:
    code = (code or "").strip()
    if not code:
        return None

    where = "company_id=%s AND code=%s"
    params = [company_id, code]
    if not include_non_posting:
        where += " AND posting IS TRUE"

    cur.execute(_q(schema, f"""
      SELECT 1
      FROM {{schema}}.coa
      WHERE {where}
      LIMIT 1
    """), tuple(params))

    return code if cur.fetchone() else None


def _coa_find_by_role(cur, schema: str, company_id: int, role: str, *, include_non_posting: bool = False) -> str | None:
    role = (role or "").strip()
    if not role:
        return None

    where = """
      company_id=%s
      AND NULLIF(TRIM(role),'') IS NOT NULL
      AND LOWER(role)=LOWER(%s)
    """
    params = [company_id, role]
    if not include_non_posting:
        where += " AND posting IS TRUE"

    cur.execute(_q(schema, f"""
      SELECT code
      FROM {{schema}}.coa
      WHERE {where}
      ORDER BY code
      LIMIT 1
    """), tuple(params))

    r = cur.fetchone()
    return r["code"] if r else None


def _coa_find_by_name(
    cur,
    schema: str,
    company_id: int,
    patterns: list[str],
    *,
    section: str | None = None,
    is_contra: bool | None = None,
    include_non_posting: bool = False,
) -> str | None:
    where = ["company_id=%s"]
    params: list = [company_id]

    if not include_non_posting:
        where.append("posting IS TRUE")

    if section:
        sec = section.strip()
        # tolerate Asset vs Assets etc.
        where.append("LOWER(COALESCE(section,'')) IN (LOWER(%s), LOWER(%s))")
        params.extend([sec, sec + "s"])

    if is_contra is not None:
        where.append("is_contra = %s")   # ✅ FIX
        params.append(bool(is_contra))

    like_sql = " OR ".join(["name ILIKE %s"] * len(patterns))
    params.extend(patterns)

    cur.execute(_q(schema, f"""
      SELECT code
      FROM {{schema}}.coa
      WHERE {" AND ".join(where)} AND ({like_sql})
      ORDER BY code
      LIMIT 1
    """), tuple(params))

    r = cur.fetchone()
    return r["code"] if r else None

def get_ppe_policy_defaults(cur, schema: str, company_id: int) -> dict:
    # If you don’t have this table yet, return {} and rely on name fallback.
    cur.execute(_q(schema, """
      SELECT default_dep_expense_code, default_accum_dep_code
      FROM {schema}.ppe_policy
      WHERE company_id=%s
      LIMIT 1
    """), (company_id,))
    return cur.fetchone() or {}


def get_class_policy(cur, schema: str, company_id: int, asset_class: str | None) -> dict:
    if not asset_class:
        return {}
    cur.execute(_q(schema, """
      SELECT dep_expense_code, accum_dep_code
      FROM {schema}.asset_class_policy
      WHERE company_id=%s AND asset_class=%s
      LIMIT 1
    """), (company_id, asset_class))
    return cur.fetchone() or {}

def build_dep_preview_journal_lines(cur, schema: str, company_id: int, asset_row: dict, dep_row: dict) -> list[dict]:
    amt = dep_row.get("depreciation_amount") or dep_row.get("amount") or 0
    try:
        amt = Decimal(str(amt))
    except Exception:
        amt = Decimal("0")

    if amt <= 0:
        amt = Decimal("0.00")  # keep lines, show zero amounts

    # 1) Dedicated accounts on asset (optional)
    dep_exp_raw = (
        asset_row.get("dep_expense_account_code")
        or asset_row.get("depreciation_expense_account_code")
        or ""
    )
    acc_dep_raw = (
        asset_row.get("accum_dep_account_code")
        or asset_row.get("accumulated_depreciation_account_code")
        or ""
    )

    dep_exp = _coa_find_by_code(cur, schema, company_id, dep_exp_raw)
    acc_dep = _coa_find_by_code(cur, schema, company_id, acc_dep_raw)

    text = " ".join([
        str(asset_row.get("asset_class") or ""),
        str(asset_row.get("standard") or ""),
        str(asset_row.get("measurement_basis") or ""),
        str(asset_row.get("name") or ""),
    ]).lower()

    is_rou = any(k in text for k in ("right-of-use", "right of use", "rou", "ifrs 16", "lease"))
    is_int = any(k in text for k in ("intangible", "ias 38"))

    # 2) Role-based defaults
    if not dep_exp:
        if is_rou:
            dep_exp = (
                _coa_find_by_role(cur, schema, company_id, "depreciation_expense_rou")
                or _coa_find_by_role(cur, schema, company_id, "amortisation_expense_rou")
                or _coa_find_by_role(cur, schema, company_id, "depreciation_expense_ppe")  # fallback
                or _coa_find_by_role(cur, schema, company_id, "depreciation_expense")
            )
        elif is_int:
            dep_exp = (
                _coa_find_by_role(cur, schema, company_id, "amortisation_expense")
                or _coa_find_by_role(cur, schema, company_id, "depreciation_expense_ppe")
                or _coa_find_by_role(cur, schema, company_id, "depreciation_expense")
            )
        else:
            dep_exp = (
                _coa_find_by_role(cur, schema, company_id, "depreciation_expense_ppe")
                or _coa_find_by_role(cur, schema, company_id, "depreciation_expense")
            )

    if not acc_dep:
        if is_rou:
            acc_dep = (
                _coa_find_by_role(cur, schema, company_id, "accumulated_depreciation_rou")
                or _coa_find_by_role(cur, schema, company_id, "accumulated_depreciation_ppe")  # fallback
                or _coa_find_by_role(cur, schema, company_id, "accumulated_depreciation")
            )
        elif is_int:
            # you currently only store accumulated amort as a normal COA row; role might be blank
            acc_dep = (
                _coa_find_by_role(cur, schema, company_id, "accumulated_amortization")
                or _coa_find_by_role(cur, schema, company_id, "accumulated_amortisation")
                or _coa_find_by_name(cur, schema, company_id, patterns=["%accum%amort%"], is_contra=True)
            )
        else:
            acc_dep = (
                _coa_find_by_role(cur, schema, company_id, "accumulated_depreciation_ppe")
                or _coa_find_by_role(cur, schema, company_id, "accumulated_depreciation")
            )

    # 2) Role-based generic defaults (company-specific, not industry-specific)
    #    (You can let users configure these in Settings -> Control accounts style UI)
    if not dep_exp:
        dep_exp = (
            _coa_find_by_role(cur, schema, company_id, "depreciation_expense_ppe")
            or _coa_find_by_role(cur, schema, company_id, "depreciation_expense")
            or _coa_find_by_role(cur, schema, company_id, "amortisation_expense")  # optional
        )

    if not acc_dep:
        acc_dep = (
            _coa_find_by_role(cur, schema, company_id, "accumulated_depreciation_ppe")
            or _coa_find_by_role(cur, schema, company_id, "accumulated_depreciation")
        )

    # 3) Heuristic fallback by name (only if role not configured)
    #    - expense: non-contra, section usually Expense
    #    - accumulated dep: contra-asset
    if not dep_exp:
        dep_exp = _coa_find_by_name(
            cur, schema, company_id,
            patterns=["%depreciation%", "%amortisation%", "%amortization%"],
            section="Expense",
            is_contra=False
        ) or _coa_find_by_name(
            cur, schema, company_id,
            patterns=["%depreciation%", "%amortisation%", "%amortization%"],
            is_contra=False
        )

    if not acc_dep:
        acc_dep = _coa_find_by_name(
            cur, schema, company_id,
            patterns=["%accum%depr%", "%accumulated%depr%", "%accum%amort%"],
            is_contra=True
            ) or _coa_find_by_name(
                cur, schema, company_id,
                patterns=["%accum%depr%", "%accumulated%depr%", "%accum%amort%"]
            )

    if acc_dep == "BS_NCA_1590":
        acc_dep = (
            _coa_find_by_role(cur, schema, company_id, "accumulated_depreciation_ppe")
            or _coa_find_by_role(cur, schema, company_id, "accumulated_depreciation")
            or acc_dep
        )

    # 4) Still not found -> show “missing” so UI pushes configuration
    dep_exp_code = dep_exp or "MISSING_DEP_EXPENSE_ACCT"
    acc_dep_code = acc_dep or "MISSING_ACC_DEP_ACCT"

    return [
        {
            "asset_id": dep_row.get("asset_id"),
            "dep_id": dep_row.get("id"),
            "account_code": dep_exp_code,
            "debit": str(amt),
            "credit": "0.00",
            "line_type": "depreciation_expense",
        },
        {
            "asset_id": dep_row.get("asset_id"),
            "dep_id": dep_row.get("id"),
            "account_code": acc_dep_code,
            "debit": "0.00",
            "credit": str(amt),
            "line_type": "accumulated_depreciation",
        },
    ]

PPE_DISPATCH = {
    ("ppe", "post_acquisition", "asset_acquisition"): lambda cur, cid, eid, user: post_acquisition(cur, cid, int(eid)),
    ("ppe", "post_revaluation", "asset_revaluation"): lambda cur, cid, eid, user: post_revaluation(cur, cid, int(eid)),
    ("ppe", "post_impairment",  "asset_impairment"):  lambda cur, cid, eid, user: post_impairment(cur, cid, int(eid)),
    ("ppe", "post_hfs",         "asset_hfs"):         lambda cur, cid, eid, user: post_hfs(cur, cid, int(eid)),

    # Disposal already enforces the special "approved_via" gate
    ("ppe", "post_disposal",    "asset_disposal"):    lambda cur, cid, eid, user: post_disposal(
        cur, cid, int(eid), user=user, approved_via="approve_post"
    ),
}

def approve_and_execute_ppe(db, company_id: int, request_id: int, *, user: dict, note: str | None = None):
    """
    Atomic: approve + execute posting in ONE transaction.
    """
    with db_service._conn_cursor() as (conn, cur):
        req = db_service.get_approval_request(company_id, request_id, cur=cur)
        if not req:
            raise Exception("approval request not found")

        if (req.get("status") or "").lower() != "pending":
            raise Exception("request not pending")

        # PPE permission gate
        pol = company_policy(company_id)
        if not can_approve_ppe(user, pol["company"], pol["mode"]):
            raise Exception("not allowed to approve PPE")

        key = (
            (req.get("module") or "").lower(),
            (req.get("action") or "").lower(),
            (req.get("entity_type") or "").lower(),
        )
        fn = PPE_DISPATCH.get(key)
        if not fn:
            raise Exception(f"no dispatcher for {key}")

        # 1) Decide (writes history + flips status to approved)
        db_service.decide_approval_request(
            company_id,
            request_id,
            decision="approve",
            decided_by_user_id=int(user["id"]),
            note=note,
            meta_json={"executed": True},
            # IMPORTANT: update your decide_approval_request to accept cur=cur,
            # otherwise you lose atomicity.
        )

        # 2) Execute posting
        posted_journal_id = fn(cur, company_id, req["entity_id"], user)

        conn.commit()
        return {"request_id": request_id, "posted_journal_id": posted_journal_id}
    
def enforce_ppe_post_policy(*, company_id: int, user: dict | None, action: str, approved_via: str | None = None):
    pol = company_policy(company_id)
    mode = pol["mode"]
    company_profile = pol["company"]
    policy = pol["policy"]

    review_required = bool(ppe_review_required(mode, policy, action))

    av = (approved_via or "").strip().lower()
    approved_contexts = {"approve_post", "approval_request"}  # ✅ add this

    if review_required:
        if av not in approved_contexts:
            raise Exception(f"{action} is in review mode. Use approve-post endpoint.")
        if not user or not can_approve_ppe(user, company_profile, mode):
            raise Exception(f"Not allowed to approve/post ({action}) in review mode.")
    else:
        if user and (not can_post_ppe(user, company_profile, mode)):
            raise Exception(f"Not allowed to post ({action}).")

    return True




def get_latest_carrying_snapshot(cur, schema, company_id, asset_id, as_at):
    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.asset_carrying_amount_history
        WHERE company_id=%s
          AND asset_id=%s
          AND as_at <= %s
        ORDER BY as_at DESC, id DESC
        LIMIT 1
    """), (company_id, asset_id, as_at))
    return cur.fetchone()


def carrying_amount_fast(cur, schema, company_id, asset_id, as_at_date):
    snap = get_latest_carrying_snapshot(cur, schema, company_id, asset_id, as_at_date)
    if snap:
        return Decimal(snap["carrying_amount"] or 0)
    # fallback to your existing compute if history not present yet
    return carrying_amount(cur, schema, company_id, asset_id, as_at_date)

def upsert_carrying_snapshot(
    cur,
    company_id: int,
    asset_id: int,
    *,
    as_at,
    source_event: str,
    notes: str | None = None,
    created_by: int | None = None,
):
    schema = company_schema(company_id)

    # Components (reuse your existing logic)
    cost_total = get_cost_total(cur, schema, company_id, asset_id, as_at)
    reval_net  = get_reval_net(cur, schema, company_id, asset_id, as_at)
    imp_net    = get_impairment_net(cur, schema, company_id, asset_id, as_at)

    accum = get_latest_accum_dep(cur, schema, company_id, asset_id, as_at)
    if accum is None:
        cur.execute(_q(schema, """
          SELECT COALESCE(opening_accum_dep,0) AS x
          FROM {schema}.assets
          WHERE company_id=%s AND id=%s
        """), (company_id, asset_id))
        accum = Decimal((cur.fetchone() or {}).get("x") or 0)

    ca = cost_total + reval_net - Decimal(accum) - Decimal(get_opening_impairment(cur, schema, company_id, asset_id)) - imp_net
    ca = max(Decimal("0"), ca)

    cur.execute(_q(schema, """
      INSERT INTO {schema}.asset_carrying_amount_history(
        company_id, asset_id, as_at, source_event,
        cost_total, reval_net, imp_net, accumulated_depreciation, carrying_amount,
        notes, created_by, created_at
      )
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
      ON CONFLICT (asset_id, as_at)
      DO UPDATE SET
        source_event=EXCLUDED.source_event,
        cost_total=EXCLUDED.cost_total,
        reval_net=EXCLUDED.reval_net,
        imp_net=EXCLUDED.imp_net,
        accumulated_depreciation=EXCLUDED.accumulated_depreciation,
        carrying_amount=EXCLUDED.carrying_amount,
        notes=EXCLUDED.notes,
        created_by=EXCLUDED.created_by,
        created_at=NOW()
    """), (
      company_id, asset_id, as_at, source_event,
      cost_total, reval_net, imp_net, accum, ca,
      notes, created_by
    ))

    return {
      "asset_id": asset_id,
      "as_at": as_at,
      "carrying_amount": ca
    }


def get_opening_impairment(cur, schema, company_id, asset_id):
    cur.execute(_q(schema, """
      SELECT COALESCE(opening_impairment,0) AS x
      FROM {schema}.assets
      WHERE company_id=%s AND id=%s
    """), (company_id, asset_id))
    return Decimal((cur.fetchone() or {}).get("x") or 0)

def rebuild_asset_carrying_history(cur, company_id: int, asset_id: int):
    schema = company_schema(company_id)

    # Collect all relevant dates that can change carrying amount
    cur.execute(_q(schema, """
      WITH dates AS (
        SELECT acquisition_date::date AS d
        FROM {schema}.asset_acquisitions
        WHERE company_id=%s AND asset_id=%s AND status='posted'
        UNION
        SELECT event_date::date AS d
        FROM {schema}.asset_subsequent_measurements
        WHERE company_id=%s AND asset_id=%s AND status='posted'
        UNION
        SELECT revaluation_date::date AS d
        FROM {schema}.asset_revaluations
        WHERE company_id=%s AND asset_id=%s AND status='posted'
        UNION
        SELECT impairment_date::date AS d
        FROM {schema}.asset_impairments
        WHERE company_id=%s AND asset_id=%s AND status='posted'
        UNION
        SELECT period_end::date AS d
        FROM {schema}.asset_depreciation
        WHERE company_id=%s AND asset_id=%s AND status='posted'
      )
      SELECT DISTINCT d
      FROM dates
      WHERE d IS NOT NULL
      ORDER BY d
    """), (
      company_id, asset_id,
      company_id, asset_id,
      company_id, asset_id,
      company_id, asset_id,
      company_id, asset_id
    ))

    dates = [r["d"] for r in (cur.fetchall() or [])]
    if not dates:
        # still create at least one snapshot "opening" at acquisition/available date if present
        cur.execute(_q(schema, """
          SELECT COALESCE(available_for_use_date, acquisition_date, CURRENT_DATE)::date AS d
          FROM {schema}.assets
          WHERE company_id=%s AND id=%s
        """), (company_id, asset_id))
        d = (cur.fetchone() or {}).get("d")
        if d:
            dates = [d]

    for d in dates:
        upsert_carrying_snapshot(
            cur, company_id, asset_id,
            as_at=d,
            source_event="rebuild",
            notes="Rebuilt from posted events"
        )

    return len(dates)

def company_assets_policy(company_id: int) -> dict:
    base = company_policy(company_id)  # keep your existing one

    # load DB policies for assets/ppe
    asset_pol = get_asset_policies(company_id) or {}  # reads {schema}.asset_policies.payload_json

    # normalize structure: allow either top-level keys OR nested { "ppe": {...} }
    ppe_pol = asset_pol.get("ppe") if isinstance(asset_pol.get("ppe"), dict) else asset_pol

    # assets policy inherits global mode unless overridden
    mode = (ppe_pol.get("mode") or base.get("mode") or "").strip().lower()
    if mode:
        ppe_pol["mode"] = mode

    return {
        "mode": mode or base.get("mode"),
        "company": base.get("company") or {},
        "policy": ppe_pol or {},
        "_base": base,  # optional: keep the global policy available for debugging
    }

def company_asset_rules(company_id: int) -> dict:
    """
    Asset eligibility rules (NOT credit policy):
    - classification classes
    - capitalization threshold rules
    - models allowed/switch rules per standard (IAS16/IAS40/IAS38/IAS41)
    - SM eligibility by model
    """
    pol = get_asset_policies(company_id) or {}
    if not isinstance(pol, dict):
        pol = {}

    # -----------------------------
    # Classification defaults
    # -----------------------------
    pol.setdefault("classification", {})
    pol["classification"].setdefault("classes", {})

    classes = pol["classification"]["classes"]

    classes.setdefault("land", {"includes": ["land"]})
    classes.setdefault("building", {"includes": ["building", "buildings"]})
    classes.setdefault("land_and_buildings", {"includes": ["land and buildings", "land_and_buildings"]})
    classes.setdefault("vehicles", {"includes": ["vehicle", "vehicles", "motor vehicle", "motor vehicles"]})
    classes.setdefault("construction_equipment", {"includes": ["construction equipment", "excavator", "grader", "loader", "bulldozer"]})
    classes.setdefault("office_equipment", {"includes": ["office equipment", "printer", "copier", "desk", "chair"]})

    classes.setdefault("intangible_assets", {
        "includes": ["intangible", "intangibles", "software", "licences", "licenses", "patents", "trademarks", "brands"]
    })
    classes.setdefault("goodwill", {"includes": ["goodwill"]})
    classes.setdefault("investment_property", {"includes": ["investment property", "investment_property", "ias40"]})
    classes.setdefault("biological_assets", {"includes": ["biological asset", "biological assets", "ias41"]})

    # -----------------------------
    # Capitalization defaults
    # -----------------------------
    pol.setdefault("capitalization", {})
    pol["capitalization"].setdefault("threshold_amount", 0)
    pol["capitalization"].setdefault("rule", "expense_below_threshold")
    pol["capitalization"].setdefault("apply_to_event_types", ["add_cost"])

    # -----------------------------
    # Model rules per standard
    # -----------------------------
    pol.setdefault("models", {})

    pol["models"].setdefault("ias16", {
        "default": "cost",
        "allowed": ["cost", "revaluation"],
        "allowed_switches": []
    })

    pol["models"].setdefault("ias40", {
        "default": "cost",
        "allowed": ["cost", "fair_value"],
        "allowed_switches": []
    })

    pol["models"].setdefault("ias38", {
        "default": "cost",
        "allowed": ["cost", "revaluation"],
        "allowed_switches": []
    })

    pol["models"].setdefault("ias41", {
        "default": "fair_value",
        "allowed": ["fair_value"],
        "allowed_switches": []
    })

    # -----------------------------
    # Eligibility defaults
    # -----------------------------
    pol.setdefault("eligibility", {})
    pol["eligibility"].setdefault("subsequent_measurements", {})
    sm = pol["eligibility"]["subsequent_measurements"]

    sm.setdefault("allowed_event_types_by_model", {
        "ias16_cost": [
            "add_cost",
            "change_estimate",
            "impairment_loss",
            "impairment_reversal",
            "revaluation",
            "held_for_sale_classify",
            "held_for_sale_unclassify",
            "transfer_ppe_to_ip",
        ],
        "ias16_revaluation": [
            "add_cost",
            "change_estimate",
            "impairment_loss",
            "impairment_reversal",
            "revaluation",
            "held_for_sale_classify",
            "held_for_sale_unclassify",
            "transfer_ppe_to_ip",
        ],
        "ias40_cost": [
            "add_cost",
            "change_estimate",
            "impairment_loss",
            "impairment_reversal",
            "fair_value_valuation",
            "transfer_ip_to_ppe",
        ],
        "ias40_fair_value": [
            "fair_value_valuation",
            "transfer_ip_to_ppe",
        ],
        "ias38_cost": [
            "add_cost",
            "change_estimate",
            "impairment_loss",
            "impairment_reversal",
            "revaluation",
        ],
        "ias38_revaluation": [
            "add_cost",
            "change_estimate",
            "impairment_loss",
            "impairment_reversal",
            "revaluation",
        ],
        "ias41_fair_value": [
            "fair_value_valuation",
        ],
    })

    # Only valuation-style events are restricted by class
    sm.setdefault("valuation_allowed_classes_by_event", {
        "revaluation": [
            "land",
            "building",
            "land_and_buildings",
            "intangible_assets",
            "biological_assets",
        ],
        "fair_value_valuation": [
            "land",
            "building",
            "land_and_buildings",
            "investment_property",
            "intangible_assets",
            "biological_assets",
        ],
    })

    sm.setdefault("disallow_event_types_by_class", {
        "goodwill": ["change_estimate", "revaluation", "fair_value_valuation"]
    })

    return pol

def get_asset_policies(company_id: int) -> dict:
    schema = company_schema(company_id)
    with get_conn(company_id) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(_q(schema, """
              SELECT payload_json
              FROM {schema}.asset_policies
              WHERE company_id=%s
              LIMIT 1
            """), (company_id,))
            row = cur.fetchone() or {}
            return row.get("payload_json") or {}
