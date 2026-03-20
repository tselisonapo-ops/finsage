# BackEnd/Services/lease_routes.py

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Dict, Any, Optional

from flask import Blueprint, request, jsonify, current_app, g, make_response
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from .db_service import db_service
from .lease_engine import (
    LeaseInput,
    LeaseScheduleResult,
    build_lease_schedule,
    schedule_to_json,
    _liability_split_current_noncurrent,
)
from .lease_posting import (
    build_lessee_opening_journal,
    liability_at_date,
    _approval_required_response
)
from BackEnd.Services.credit_policy import can_post_leases, lease_review_enabled, lease_action_review_required, lease_policy_flags, normalize_role
from BackEnd.Services.company import company_policy
from BackEnd.Services.company_context import get_company_context

bp = Blueprint("leases", __name__)

_ALLOWED_FREQ = {"monthly", "quarterly", "annually"}
_ALLOWED_MODES = {"inception", "existing"}
_ALLOWED_TIMING = {"arrears", "advance"}

from datetime import date as _date

def lease_service_post_modification(company_id: int, modification_id: int, actor: dict) -> dict:
    """
    Posts a lease modification using your existing posting engine:
      - idempotency via journal(source, source_id)
      - lines via build_lease_modification_journal_lines()
      - journal posting via db_service.post_journal(..., cur=cur)
      - mark modification posted
      - deactivate current active schedule (your schedule generator runs elsewhere)
    """
    schema = f"company_{int(company_id)}"
    actor_id = int(actor.get("id") or actor.get("user_id") or 0) or None

    with db_service._conn_cursor() as (conn, cur):
        mod = db_service.get_lease_modification(int(company_id), int(modification_id), cur=cur)
        if not mod:
            raise ValueError("Lease modification not found")

        if (mod.get("status") or "").lower() == "posted" or mod.get("posted_journal_id"):
            jid = int(mod.get("posted_journal_id") or 0)
            return {"journal_id": jid, "posted": mod}

        lease_id = int(mod.get("lease_id") or 0)
        lease = db_service.get_lease(int(company_id), int(lease_id)) or {}
        if not lease:
            raise ValueError("Lease not found")

        if (lease.get("status") or "active").lower() == "terminated":
            raise ValueError("LEASE_TERMINATED|cannot_modify")

        # 1) Idempotency check via journal(source, source_id)
        already = db_service.fetch_one(
            f"SELECT id FROM {schema}.journal WHERE source=%s AND source_id=%s",
            ("lease_modification", int(modification_id)),
            cur=cur,
        )
        if already:
            jid = int(already["id"])
            try:
                db_service.mark_lease_modification_posted(int(company_id), int(modification_id), jid, cur=cur)
            except Exception:
                pass
            conn.commit()
            posted = db_service.get_lease_modification(int(company_id), int(modification_id), cur=cur) or mod
            return {"journal_id": jid, "posted": posted}

        # 2) Build journal lines (IFRS logic)
        lines = db_service.build_lease_modification_journal_lines(
            int(company_id),
            modification_id=int(modification_id),
            cur=cur,
        )
        if not lines:
            raise ValueError("Cannot build modification journal")

        # 3) Journal header + post (✅ uses your unified posting engine)
        j_date = mod.get("modification_date") or _date.today().isoformat()
        desc = f"IFRS 16 lease modification – {lease.get('lease_name') or f'Lease {lease_id}'} – MOD {modification_id}"

        adj = float(mod.get("liability_adjustment") or 0.0)

        entry = {
            "date": j_date,
            "ref": f"LEASE-{lease_id}-MOD-{modification_id}",
            "description": desc,
            "gross_amount": abs(adj),   # purely reporting; lines control debits/credits
            "net_amount": abs(adj),
            "vat_amount": 0.0,
            "source": "lease_modification",
            "source_id": int(modification_id),
            "lines": lines,
        }

        journal_id = int(db_service.post_journal(int(company_id), entry, cur=cur) or 0)
        if journal_id <= 0:
            raise ValueError("Failed to post modification journal")

        # 4) Mark modification posted
        db_service.mark_lease_modification_posted(int(company_id), int(modification_id), journal_id, cur=cur)

        # 5) Close existing active schedule (new schedule rows are generated elsewhere)
        db_service.deactivate_lease_schedule(int(company_id), int(lease_id), cur=cur)

        # 6) Audit (best-effort)
        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=int(actor_id or 0),
                module="leases",
                action="post_modification",
                severity="info",
                entity_type="lease",
                entity_id=str(lease_id),
                entity_ref=lease.get("lease_name") or f"LEASE-{lease_id}",
                before_json={"modification_id": int(modification_id)},
                after_json={"journal_id": int(journal_id), "source": "lease_modification", "source_id": int(modification_id)},
                message=f"Posted lease modification {modification_id} (journal {journal_id})",
                source="service",
            )
        except Exception:
            pass

        conn.commit()

        posted = db_service.get_lease_modification(int(company_id), int(modification_id), cur=cur) or mod
        return {"journal_id": int(journal_id), "posted": posted}


def lease_service_post_termination(company_id: int, termination_id: int, actor: dict) -> dict:
    schema = f"company_{int(company_id)}"
    actor_id = int(actor.get("id") or actor.get("user_id") or 0) or None

    with db_service._conn_cursor() as (conn, cur):
        term = db_service.get_lease_termination(int(company_id), int(termination_id), cur=cur)
        if not term:
            raise ValueError("Lease termination not found")

        # already marked posted
        if (term.get("status") or "").lower() == "posted" or term.get("posted_journal_id"):
            jid = int(term.get("posted_journal_id") or 0)
            return {"journal_id": jid, "posted": term}

        lease_id = int(term.get("lease_id") or 0)
        lease = db_service.get_lease(int(company_id), int(lease_id)) or {}
        if not lease:
            raise ValueError("Lease not found")

        # 1) Idempotency via journal(source, source_id)
        already = db_service.fetch_one(
            f"SELECT id FROM {schema}.journal WHERE source=%s AND source_id=%s",
            ("lease_termination", int(termination_id)),
            cur=cur,
        )
        if already:
            jid = int(already["id"])

            # ✅ mark termination posted + close lease
            try:
                db_service.mark_lease_termination_posted_and_close_lease(
                    int(company_id),
                    int(termination_id),
                    posted_journal_id=jid,
                    cur=cur,
                )
            except Exception:
                pass

            # ✅ stop schedules
            try:
                db_service.deactivate_lease_schedule(int(company_id), int(lease_id), cur=cur)
            except Exception:
                pass

            conn.commit()
            posted = db_service.get_lease_termination(int(company_id), int(termination_id), cur=cur) or term
            return {"journal_id": jid, "posted": posted}

        # 2) Build termination journal lines
        lines = db_service.build_lease_termination_journal_lines(
            int(company_id),
            termination_id=int(termination_id),
            cur=cur,
        )
        if not lines:
            raise ValueError("Cannot build termination journal")

        # 3) Post journal
        j_date = term.get("termination_date") or _date.today().isoformat()
        desc = f"IFRS 16 lease termination – {lease.get('lease_name') or f'Lease {lease_id}'} – TERM {termination_id}"
        gl_amt = float(term.get("gain_loss_amount") or 0.0)

        entry = {
            "date": j_date,
            "ref": f"LEASE-{lease_id}-TERM-{termination_id}",
            "description": desc,
            "gross_amount": abs(gl_amt),
            "net_amount": abs(gl_amt),
            "vat_amount": 0.0,
            "source": "lease_termination",
            "source_id": int(termination_id),
            "lines": lines,
        }

        journal_id = int(db_service.post_journal(int(company_id), entry, cur=cur) or 0)
        if journal_id <= 0:
            raise ValueError("Failed to post termination journal")

        # 4) Mark termination posted + close lease (✅ one call)
        db_service.mark_lease_termination_posted_and_close_lease(
            int(company_id),
            int(termination_id),
            posted_journal_id=int(journal_id),
            cur=cur,
        )

        # 5) Stop schedule
        db_service.deactivate_lease_schedule(int(company_id), int(lease_id), cur=cur)

        # 6) Audit (best-effort)
        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=int(actor_id or 0),
                module="leases",
                action="post_termination",
                severity="info",
                entity_type="lease",
                entity_id=str(lease_id),
                entity_ref=lease.get("lease_name") or f"LEASE-{lease_id}",
                before_json={"termination_id": int(termination_id)},
                after_json={"journal_id": int(journal_id), "source": "lease_termination", "source_id": int(termination_id)},
                message=f"Posted lease termination {termination_id} (journal {journal_id})",
                source="service",
            )
        except Exception:
            pass

        conn.commit()
        posted = db_service.get_lease_termination(int(company_id), int(termination_id), cur=cur) or term
        return {"journal_id": int(journal_id), "posted": posted}


def _parse_date(value: Any, field_name: str, required: bool = True) -> Optional[date]:
    if value in (None, ""):
        if required:
            raise ValueError(f"{field_name} is required")
        return None

    if isinstance(value, date):
        return value

    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except Exception:
        raise ValueError(f"{field_name} must be a valid date (YYYY-MM-DD)")


def _parse_lease_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")

    lease_name = (data.get("lease_name") or "").strip()
    if not lease_name:
        raise ValueError("lease_name is required")

    role = (data.get("role") or "lessee").lower()
    if role != "lessee":
        raise ValueError("Only 'lessee' role is currently supported")

    wizard_mode = (data.get("wizard_mode") or "inception").lower()
    if wizard_mode not in _ALLOWED_MODES:
        wizard_mode = "inception"

    go_live_date = _parse_date(data.get("go_live_date"), "go_live_date", required=False)

    start_date = _parse_date(data.get("start_date"), "start_date", required=True)
    end_date   = _parse_date(data.get("end_date"), "end_date", required=True)
    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date")

    try:
        payment_amount = float(data.get("payment_amount"))
    except Exception:
        raise ValueError("payment_amount must be a positive number")
    if payment_amount <= 0:
        raise ValueError("payment_amount must be greater than zero")

    payment_timing = (data.get("payment_timing") or "arrears").lower()
    if payment_timing not in _ALLOWED_TIMING:
        payment_timing = "arrears"

    payment_frequency = (data.get("payment_frequency") or "monthly").lower()
    if payment_frequency not in _ALLOWED_FREQ:
        payment_frequency = "monthly"

    try:
        annual_rate = float(data.get("annual_rate") or 0.0)
    except Exception:
        annual_rate = 0.0
    if annual_rate < 0:
        raise ValueError("annual_rate cannot be negative")

    def _float_or_default(key: str, default: float = 0.0) -> float:
        try:
            return float(data.get(key) or default)
        except Exception:
            return default

    initial_direct_costs = _float_or_default("initial_direct_costs", 0.0)
    residual_value       = _float_or_default("residual_value", 0.0)
    vat_rate             = _float_or_default("vat_rate", 0.0)

    rou_asset_account = (data.get("rou_asset_account") or "").strip()
    if not rou_asset_account:
        raise ValueError("rou_asset_account is required.")

    # legacy (optional but keep for backward compatibility)
    lease_liability_account = (data.get("lease_liability_account") or "").strip()

    # preferred split accounts
    lease_liability_current_account = (data.get("lease_liability_current_account") or "").strip()
    lease_liability_non_current_account = (data.get("lease_liability_non_current_account") or "").strip()

    # fallback to legacy
    if not lease_liability_current_account and lease_liability_account:
        lease_liability_current_account = lease_liability_account
    if not lease_liability_non_current_account and lease_liability_account:
        lease_liability_non_current_account = lease_liability_account

    if not lease_liability_current_account or not lease_liability_non_current_account:
        raise ValueError(
            "Provide lease_liability_current_account and lease_liability_non_current_account "
            "(or lease_liability_account)."
        )

    interest_expense_account      = data.get("interest_expense_account") or None
    depreciation_expense_account  = data.get("depreciation_expense_account") or None
    direct_costs_offset_account   = data.get("direct_costs_offset_account") or None

    return {
        "lease_name": lease_name,
        "role": role,
        "wizard_mode": wizard_mode,
        "go_live_date": go_live_date,
        "start_date": start_date,
        "end_date": end_date,
        "payment_amount": payment_amount,
        "payment_frequency": payment_frequency,
        "payment_timing": payment_timing,
        "annual_rate": annual_rate,
        "initial_direct_costs": initial_direct_costs,
        "residual_value": residual_value,
        "vat_rate": vat_rate,

        "rou_asset_account": rou_asset_account,

        # ✅ keep legacy key (optional, but nice for older clients)
        "lease_liability_account": lease_liability_account,

        # ✅ NEW keys
        "lease_liability_current_account": lease_liability_current_account,
        "lease_liability_non_current_account": lease_liability_non_current_account,

        "interest_expense_account": interest_expense_account,
        "depreciation_expense_account": depreciation_expense_account,
        "direct_costs_offset_account": direct_costs_offset_account,
    }

def _to_lease_input(company_id: int, payload: Dict[str, Any]) -> LeaseInput:
    return LeaseInput(
        company_id=company_id,
        role="lessee",
        lease_name=payload["lease_name"],
        start_date=payload["start_date"],
        end_date=payload["end_date"],
        payment_amount=payload["payment_amount"],
        payment_frequency=payload["payment_frequency"],
        annual_rate=payload["annual_rate"],
        payment_timing=payload.get("payment_timing", "arrears"),
        initial_direct_costs=payload["initial_direct_costs"],
        residual_value=payload["residual_value"],
        vat_rate=payload["vat_rate"],

        lease_liability_account=payload.get("lease_liability_account"),
        lease_liability_current_account=payload.get("lease_liability_current_account"),
        lease_liability_non_current_account=payload.get("lease_liability_non_current_account"),

        rou_asset_account=payload["rou_asset_account"],
        interest_expense_account=payload.get("interest_expense_account"),
        depreciation_expense_account=payload.get("depreciation_expense_account"),
        direct_costs_offset_account=payload.get("direct_costs_offset_account"),
    )

@bp.post("/api/companies/<int:company_id>/leases/preview")
@require_auth
def preview_lease(company_id: int):
    try:
        raw_data = request.get_json(force=True, silent=True)

        if not isinstance(raw_data, dict):
            return jsonify({"error": "JSON body must be an object"}), 400

        current_app.logger.info(
        "leases.preview raw_data type=%s raw_data=%s",
        type(raw_data).__name__,
        raw_data
        )
        payload = _parse_lease_payload(raw_data)

        lease_input = _to_lease_input(company_id, payload)
        result: LeaseScheduleResult = build_lease_schedule(lease_input)

        base_json = schedule_to_json(result)

        mode = payload.get("wizard_mode", "inception")
        go_live = payload.get("go_live_date")

        # Relaxed mode: return imbalance info instead of blocking
        opening_journal = build_lessee_opening_journal(
            company_id,
            result,
            mode="existing" if mode == "existing" else "inception",
            as_of=go_live,
            strict=False,
        )

        base_json["opening_journal"] = opening_journal.get("journal_lines", [])
        base_json["dr_total"] = opening_journal.get("dr_total")
        base_json["cr_total"] = opening_journal.get("cr_total")
        if "error" in opening_journal:
            base_json["journal_error"] = opening_journal["error"]

        # Existing lease: show carrying amounts at go-live, plus split (CL/NCL)
        if mode == "existing" and go_live is not None:
            carrying_liab = float(liability_at_date(result, go_live))
            current, non_current = _liability_split_current_noncurrent(result, go_live)

            base_json["opening_lease_liability"] = round(carrying_liab, 2)
            base_json["opening_rou_asset"] = round(carrying_liab, 2)
            base_json["opening_lease_liability_current"] = round(current, 2)
            base_json["opening_lease_liability_non_current"] = round(non_current, 2)
            base_json["transition_date"] = go_live.isoformat()

        return jsonify(base_json)

    except Exception as e:
        current_app.logger.exception("preview_lease error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@bp.route("/api/companies/<int:company_id>/leases", methods=["POST", "OPTIONS"])
@require_auth
def create_lease(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    lease_id = None
    journal_id = None

    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    step = "start"
    try:
        raw_data = request.get_json(silent=True) or {}
        step = "parsed_json"

        if not isinstance(raw_data, dict):
            return jsonify({"error": "JSON body must be an object"}), 400

        lessor_id = raw_data.get("lessor_id")
        try:
            lessor_id = int(lessor_id) if lessor_id is not None else None
        except Exception:
            lessor_id = None

        if not lessor_id:
            return jsonify({"error": "lessor_id is required"}), 400

        step = "validated_lessor_id"
        lessor = db_service.get_lessor(int(company_id), lessor_id)
        if not lessor:
            return jsonify({"error": "Invalid lessor_id"}), 400

        step = "loaded_lessor"
        payload2 = _parse_lease_payload(raw_data)
        lease_input = _to_lease_input(int(company_id), payload2)
        result: LeaseScheduleResult = build_lease_schedule(lease_input)

        step = "built_schedule"
        mode = (payload2.get("wizard_mode") or "inception").strip().lower()
        go_live = payload2.get("go_live_date")

        opening_journal = build_lessee_opening_journal(
            int(company_id),
            result,
            mode="existing" if mode == "existing" else "inception",
            as_of=go_live,
            strict=True,
        )

        opening_lines = opening_journal.get("journal_lines") or []
        if not opening_lines:
            return jsonify({
                "error": "Cannot build opening lease journal - missing lease accounts in payload."
            }), 400

        step = "before_insert_lease"
        lease_id = db_service.insert_lease(int(company_id), result, lessor_id=lessor_id)


        step = "after_insert_lease"
        if mode == "existing" and go_live is not None:
            carrying_liab = float(liability_at_date(result, go_live))
            base_amount = round(carrying_liab, 2)
            journal_date = go_live
            description = f"IFRS 16 transition – existing lease {lease_input.lease_name}"
        else:
            base_amount = float(result.opening_rou_asset)
            journal_date = lease_input.start_date
            description = f"Initial recognition of lease - {lease_input.lease_name}"

        journal_entry = {
            "date": journal_date,
            "description": description,
            "gross_amount": base_amount,
            "net_amount": base_amount,
            "vat_amount": 0.0,
        }

        step = "before_insert_journal"
        journal_id = db_service.insert_journal(int(company_id), journal_entry)

        step = "after_insert_journal"
        for idx, line in enumerate(opening_lines, start=1):
            step = f"before_insert_journal_line_{idx}"
            db_service.insert_journal_line(
                company_id=int(company_id),
                journal_id=int(journal_id),
                line_no=idx,
                line={
                    "account_code": line["account_code"],
                    "description": line.get("description") or journal_entry["description"],
                    "debit": float(line.get("debit") or 0.0),
                    "credit": float(line.get("credit") or 0.0),
                },
                source="leases",
                source_id=int(lease_id),
            )

            step = f"before_insert_ledger_{idx}"
            db_service.insert_ledger(int(company_id), journal_id, journal_date, line)

            step = f"before_update_trial_balance_{idx}"
            db_service.update_trial_balance(int(company_id), line)

            if db_service.requires_notes(line["account_code"]):
                step = f"before_insert_note_{idx}"
                db_service.insert_note(
                    int(company_id),
                    journal_id,
                    line["account_code"],
                    journal_entry["description"],
                )

        step = "success"

        base_json = schedule_to_json(result)
        base_json["lease_id"] = int(lease_id)
        base_json["journal_id"] = int(journal_id)
        base_json["opening_journal"] = opening_lines

        if mode == "existing" and go_live is not None:
            current, non_current = _liability_split_current_noncurrent(result, go_live)
            base_json["opening_lease_liability"] = base_amount
            base_json["opening_rou_asset"] = base_amount
            base_json["opening_lease_liability_current"] = round(float(current), 2)
            base_json["opening_lease_liability_non_current"] = round(float(non_current), 2)
            base_json["transition_date"] = go_live.isoformat()

        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=user_id,
                module="leases",
                action="create_lease",
                severity="info",
                entity_type="lease",
                entity_id=str(lease_id),
                entity_ref=(lease_input.lease_name or f"LEASE-{lease_id}"),
                before_json={"input": raw_data},
                after_json={
                    "lease_id": int(lease_id),
                    "journal_id": int(journal_id),
                    "mode": mode,
                    "lessor_id": int(lessor_id)
                },
                message=f"Created lease {lease_id} and opening journal {journal_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (create_lease)")

        return jsonify(base_json), 201

    except ValueError as ve:
        return jsonify({"error": str(ve), "step": step, "lease_id": lease_id, "journal_id": journal_id}), 400

    except Exception as e:
        return jsonify({"error": "Internal server error", "details": str(e), "step": step, "lease_id": lease_id, "journal_id": journal_id}), 500

@bp.route("/api/companies/<int:company_id>/leases", methods=["GET", "OPTIONS"])
@require_auth
def list_leases(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    try:
        limit = request.args.get("limit", type=int) or 200
        offset = request.args.get("offset", type=int) or 0
        q = (request.args.get("q") or "").strip()

        rows, total = db_service.list_leases(int(company_id), limit=limit, offset=offset, q=q)

        return jsonify({
            "ok": True,
            "rows": rows,
            "total": int(total or 0),
            "limit": int(limit),
            "offset": int(offset),
        }), 200

    except Exception as e:
        current_app.logger.exception("list_leases error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@bp.route("/api/companies/<int:company_id>/leases/<int:lease_id>", methods=["GET", "OPTIONS"])
@require_auth
def get_lease(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    try:
        row = db_service.get_lease_by_id(int(company_id), int(lease_id))
        if not row:
            return jsonify({"error": "Lease not found"}), 404
        return jsonify({"ok": True, "lease": row}), 200

    except Exception as e:
        current_app.logger.exception("get_lease error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@bp.route(
    "/api/companies/<int:company_id>/leases/<int:lease_id>/schedule/<int:period_no>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def get_lease_schedule_period(company_id: int, lease_id: int, period_no: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    try:
        # lease must exist
        lease = db_service.get_lease_by_id(int(company_id), int(lease_id))
        if not lease:
            return jsonify({"error": "Lease not found"}), 404

        # Optional:
        # - If your db_service.get_lease_schedule_row already returns the ACTIVE version row, you're done.
        # - If you later add version support, you can pass version_no and active_only to the DB method.
        version_no = request.args.get("version_no", type=int)  # optional
        active_only = request.args.get("active_only", "1").strip().lower() not in {"0", "false", "no"}

        # If your method signature is ONLY (company_id, lease_id, period_no), keep it simple:
        row = None
        try:
            row = db_service.get_lease_schedule_row(
                int(company_id),
                lease_id=int(lease_id),
                period_no=int(period_no),
                # If your method supports these, great. If not, remove them.
                version_no=version_no,
                active_only=active_only,
            )
        except TypeError:
            # fallback for older signature
            row = db_service.get_lease_schedule_row(
                int(company_id),
                lease_id=int(lease_id),
                period_no=int(period_no),
            )

        if not row:
            return jsonify({"error": "Schedule period not found"}), 404

        return jsonify({
            "ok": True,
            "company_id": int(company_id),
            "lease_id": int(lease_id),
            "lease_name": lease.get("lease_name"),
            "period_no": int(period_no),
            "active_only": bool(active_only),
            "version_no": int(row.get("version_no") or (version_no or 1)),
            "row": row,
        }), 200

    except Exception as e:
        current_app.logger.exception("get_lease_schedule_period error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@bp.route("/api/companies/<int:company_id>/leases/<int:lease_id>/schedule", methods=["GET", "OPTIONS"])
@require_auth
def get_lease_schedule(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    try:
        # paging
        limit = request.args.get("limit", type=int) or 500
        offset = request.args.get("offset", type=int) or 0

        # filters
        active_only = request.args.get("active_only", "1").strip().lower() not in {"0", "false", "no"}
        version_no = request.args.get("version_no", type=int)  # optional

        # optional period range filter (nice for large schedules)
        period_from = request.args.get("period_from", type=int)
        period_to = request.args.get("period_to", type=int)

        # lease must exist
        lease = db_service.get_lease_by_id(int(company_id), int(lease_id))
        if not lease:
            return jsonify({"error": "Lease not found"}), 404

        # get schedule rows (uses your DB method)
        out = db_service.list_lease_schedule(
            int(company_id),
            int(lease_id),
            version_no=version_no,
            active_only=active_only,
            limit=limit,
            offset=offset,
        )

        rows = out.get("rows") or []

        # apply optional period filters (kept server-side, without changing DB method)
        if period_from is not None:
            rows = [r for r in rows if int(r.get("period_no") or 0) >= int(period_from)]
        if period_to is not None:
            rows = [r for r in rows if int(r.get("period_no") or 0) <= int(period_to)]

        return jsonify({
            "ok": True,
            "company_id": int(company_id),
            "lease_id": int(lease_id),
            "lease_name": lease.get("lease_name"),
            "active_only": bool(active_only),
            "version_no": int(out.get("version_no") or (version_no or 1)),
            "limit": int(limit),
            "offset": int(offset),
            "total": int(out.get("total") or 0),
            "rows": rows,
        }), 200

    except Exception as e:
        current_app.logger.exception("get_lease_schedule error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@bp.route("/api/companies/<int:company_id>/leases/monthly_due", methods=["GET", "OPTIONS"])
@require_auth
def leases_monthly_due(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    # ✅ policy (for approvals UI hints)
    pol = company_policy(int(company_id))
    review_required = bool(lease_action_review_required(pol, "monthly"))
    mode = (pol.get("mode") or "owner_managed").strip().lower()

    # as_of defaults to today
    as_of_s = (request.args.get("as_of") or "").strip()
    try:
        as_of = datetime.strptime(as_of_s, "%Y-%m-%d").date() if as_of_s else date.today()
    except Exception:
        return jsonify({"error": "as_of must be YYYY-MM-DD"}), 400

    try:
        rows = db_service.list_lease_schedule_for_month(int(company_id), as_of) or []

        out = []
        for r in rows:
            # ✅ treat posted_journal_id or status flags as posted
            if r.get("posted") or r.get("posted_journal_id"):
                continue

            schedule_id = int(r.get("schedule_id") or r.get("id") or 0)

            item = {
                "lease_id": int(r["lease_id"]),
                "lease_name": r.get("lease_name"),
                "lessor_name": r.get("lessor_name"),
                "period_no": int(r["period_no"]),
                "period_start": str(r["period_start"]),
                "period_end": str(r["period_end"]),
                "schedule_id": schedule_id,

                "amounts": {
                    "interest": float(r.get("interest") or 0),
                    "principal": float(r.get("principal") or 0),
                    "payment": float(r.get("payment") or 0),
                    "depreciation": float(r.get("depreciation") or 0),
                },

                # ✅ approvals/UI hints (no posting here)
                "requires_approval": review_required,
                "approval": {
                    "module": "leases",
                    "action": "post_lease_month",
                    "entity_type": "lease_schedule",
                    "entity_id": schedule_id,
                    "entity_ref": f"{r.get('lease_name') or 'Lease ' + str(int(r['lease_id']))} P{int(r['period_no'])}",

                    "amount": float(r.get("payment") or 0.0),
                    # currency is optional; include if your rows include it
                    "currency": (r.get("currency") or None),
                    "payload_json": {
                        "lease_id": int(r["lease_id"]),
                        "period_no": int(r["period_no"]),
                        "schedule_id": schedule_id,
                        "period_end": str(r["period_end"]),
                        "mode": mode,
                    },
                },

                "preview_journal_lines": [],
                "errors": [],
            }

            # ✅ preview lines (safe per-row)
            try:
                preview_lines = db_service.build_monthly_lease_journal_lines(
                    int(company_id),
                    lease_id=int(r["lease_id"]),
                    schedule_id=schedule_id,
                )
                item["preview_journal_lines"] = preview_lines or []

            except ValueError as e:
                msg = str(e) or ""
                if msg.startswith("LEASE_ACCOUNTS_MISSING|"):
                    missing = msg.split("|", 1)[1]
                    item["errors"].append({"code": "LEASE_ACCOUNTS_MISSING", "missing": missing.split(",")})
                else:
                    item["errors"].append({"code": "LEASE_BUILD_FAILED", "message": msg})

            out.append(item)

        return jsonify({"ok": True, "as_of": as_of.isoformat(), "due": out}), 200

    except Exception as e:
        current_app.logger.exception("leases_monthly_due error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
    
@bp.route(
    "/api/companies/<int:company_id>/leases/<int:lease_id>/period/<int:period_no>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def post_lease_month(company_id: int, lease_id: int, period_no: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    schema = f"company_{company_id}"

    try:
        # ✅ PATCH: monthly posting permission gate when review is enabled
        pol = company_policy(int(company_id))
        flags = lease_policy_flags(pol)

        # permission gate (who may post)
        company_profile = pol.get("company") or db_service.get_company_profile(int(company_id)) or {}
        mode = (pol.get("mode") or "owner_managed").strip().lower()

        can_post = can_post_leases(user, company_profile, mode)
        if not can_post:
            return jsonify({"error": "Not allowed to post lease month", "mode": mode}), 403

        # ✅ approval gate (create approval request if review is required)
        # IMPORTANT: Monthly posting should NOT require approval for users who can post (approvers/posters),
        # otherwise you create an approval loop: approve → execute → REVIEW_REQUIRED again.
        review_required = lease_action_review_required(pol, "monthly")

        if review_required and not can_post:
            # (This branch will never run with the current permission gate above,
            # but keeping the pattern here for clarity if you later loosen can_post rules.)
            sched = db_service.get_lease_schedule_row(
                int(company_id),
                lease_id=int(lease_id),
                period_no=int(period_no),
            )
            if not sched:
                return jsonify({"error": "Lease schedule period not found"}), 404

            lease = db_service.get_lease(int(company_id), int(lease_id)) or {}
            entity_ref = f"{lease.get('lease_name') or f'Lease {lease_id}'} P{period_no}"

            amt = float(sched.get("payment") or 0.0)
            currency = (lease.get("currency") or None)

            payload_json = {
                "lease_id": int(lease_id),
                "period_no": int(period_no),
                "schedule_id": int(sched.get("id") or 0),
                "period_end": str(sched.get("period_end")),
            }

            return _approval_required_response(
                company_id=int(company_id),
                module="leases",
                action="post_lease_month",
                entity_type="lease_schedule",
                entity_id=int(sched.get("id") or 0),
                entity_ref=entity_ref,
                amount=amt,
                currency=currency,
                payload_json=payload_json,
            )
    
        with db_service._conn_cursor() as (conn, cur):
            # 1) schedule row must exist
            sched = db_service.get_lease_schedule_row(
                int(company_id),
                lease_id=int(lease_id),
                period_no=int(period_no),
            )
            if not sched:
                return jsonify({"error": "Lease schedule period not found"}), 404

            schedule_id = int(sched["id"])

            # 2) If you have posted markers, prefer them (fast path)
            posted_journal_id = sched.get("posted_journal_id")
            if posted_journal_id:
                return jsonify({
                    "error": "Already posted for this period",
                    "journal_id": int(posted_journal_id),
                    "schedule_id": schedule_id,
                }), 409

            # 3) Idempotency check via journal(source, source_id) (works even if markers not migrated)
            already = db_service.fetch_one(
                f"SELECT id FROM {schema}.journal WHERE source=%s AND source_id=%s",
                ("lease_monthly", schedule_id),
                cur=cur,
            )
            if already:
                # If markers exist, backfill them (optional, but helps your UI)
                try:
                    cur.execute(
                        f"""
                        UPDATE {schema}.lease_schedule
                        SET posted_journal_id=%s,
                            posted_at=COALESCE(posted_at, NOW())
                        WHERE id=%s
                        """,
                        (int(already["id"]), schedule_id),
                    )
                except Exception:
                    # ignore if columns don't exist yet
                    pass

                conn.commit()
                return jsonify({
                    "error": "Already posted for this period",
                    "journal_id": int(already["id"]),
                    "schedule_id": schedule_id,
                }), 409
            
            # 3b) Fallback idempotency check by ref (for older journals without source/source_id)
            already2 = db_service.fetch_one(
                f"SELECT id FROM {schema}.journal WHERE ref=%s LIMIT 1",
                (f"LEASE-{lease_id}-P{period_no}",),
                cur=cur,
            )

            if already2:
                cur.execute(
                    f"""
                    UPDATE {schema}.lease_schedule
                    SET posted_journal_id=%s,
                        posted_at=COALESCE(posted_at, NOW())
                    WHERE id=%s
                    """,
                    (int(already2["id"]), schedule_id),
                )

                conn.commit()

                return jsonify({
                    "error": "Already posted for this period",
                    "journal_id": int(already2["id"]),
                    "schedule_id": schedule_id,
                }), 409

            # 4) build lines (must return list of {account_code, debit, credit, memo})
            lines = db_service.build_monthly_lease_journal_lines(
                int(company_id),
                lease_id=int(lease_id),
                schedule_id=schedule_id,
                cur=cur,
            )

            # build_monthly_lease_journal_lines raises ValueError("LEASE_ACCOUNTS_MISSING|...")
            if not lines:
                return jsonify({"error": "Cannot build monthly journal"}), 400

            # 5) journal date = period_end
            journal_date = sched["period_end"]
            lease = db_service.get_lease(int(company_id), int(lease_id)) or {}
            desc = f"IFRS 16 monthly posting – {lease.get('lease_name') or f'Lease {lease_id}'} – P{period_no}"

            gross = float(sched.get("payment") or 0.0)

            journal_entry = {
                "date": journal_date,
                "ref": f"LEASE-{lease_id}-P{period_no}",
                "description": desc,
                "gross_amount": gross,
                "net_amount": gross,
                "vat_amount": float(sched.get("vat_portion") or 0.0),
                "source": "lease_monthly",
                "source_id": schedule_id,
            }

            journal_id = db_service.insert_journal(int(company_id), journal_entry, cur=cur)
            if journal_id <= 0:
                raise ValueError("Failed to insert journal")

            for i, line in enumerate(lines, start=1):
                db_service.insert_journal_line(
                    int(company_id),
                    int(journal_id),
                    i,
                    line,
                    source="lease_monthly",
                    source_id=schedule_id,
                    cur=cur,
                )

            # 6) write ledger lines + TB + notes
            for line in lines:
                db_service.insert_ledger(int(company_id), journal_id, journal_date, line, cur=cur)
                db_service.update_trial_balance(int(company_id), line, cur=cur)

                if db_service.requires_notes(line["account_code"]):
                    db_service.insert_note(
                        int(company_id),
                        journal_id,
                        line["account_code"],
                        desc,
                        cur=cur,
                    )

                cur.execute(
                    f"""
                    UPDATE {schema}.lease_schedule
                    SET posted_journal_id=%s,
                        posted_at=NOW()
                    WHERE id=%s
                    AND COALESCE(posted_journal_id,0)=0
                    """,
                    (int(journal_id), schedule_id),
                )
                if cur.rowcount == 0:
                    raise ValueError("Failed to mark schedule as posted (concurrent modification?)")
                
            # 8) audit (best-effort)
            try:
                db_service.audit_log(
                    int(company_id),
                    actor_user_id=int(user_id),
                    module="leases",
                    action="post_monthly_amort",
                    severity="info",
                    entity_type="lease",
                    entity_id=str(lease_id),
                    entity_ref=lease.get("lease_name") or f"LEASE-{lease_id}",
                    before_json={"schedule_id": schedule_id, "period_no": period_no},
                    after_json={"journal_id": int(journal_id), "source": "lease_monthly", "source_id": schedule_id},
                    message=f"Posted monthly IFRS 16 entry for lease {lease_id} period {period_no} (journal {journal_id})",
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed (post_lease_month)")

            conn.commit()
            return jsonify({"ok": True, "journal_id": int(journal_id), "schedule_id": schedule_id}), 201

    except ValueError as e:
        # Surface missing accounts nicely
        msg = str(e) or ""
        if msg.startswith("LEASE_ACCOUNTS_MISSING|"):
            missing = msg.split("|", 1)[1]
            return jsonify({"error": "LEASE_ACCOUNTS_MISSING", "missing": missing.split(",")}), 400
        current_app.logger.exception("post_lease_month value error")
        return jsonify({"error": "Bad request", "details": msg}), 400

    except Exception as e:
        current_app.logger.exception("post_lease_month error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@bp.route("/api/companies/<int:company_id>/leases/<int:lease_id>/payments", methods=["GET", "OPTIONS"])
@require_auth
def list_lease_payments(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    try:
        lease = db_service.get_lease_by_id(int(company_id), int(lease_id))
        if not lease:
            return jsonify({"error": "Lease not found"}), 404

        rows = db_service.list_lease_payments(int(company_id), int(lease_id)) or []
        return jsonify({"ok": True, "lease_id": int(lease_id), "payments": rows}), 200

    except Exception as e:
        current_app.logger.exception("list_lease_payments error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@bp.route(
    "/api/companies/<int:company_id>/leases/<int:lease_id>/payments/preview",
    methods=["POST", "OPTIONS"],
)
@require_auth
def preview_lease_payment(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    try:
        raw = request.get_json(silent=True) or {}
        if not isinstance(raw, dict):
            return jsonify({"error": "JSON body must be an object"}), 400

        # inputs
        amount = raw.get("amount")
        payment_date = (raw.get("payment_date") or "").strip()
        bank_account_id = raw.get("bank_account_id")
        reference = raw.get("reference")
        description = raw.get("description")
        schedule_id = raw.get("schedule_id")

        if not payment_date:
            return jsonify({"error": "payment_date is required (YYYY-MM-DD)"}), 400
        try:
            payment_date_d = datetime.strptime(payment_date, "%Y-%m-%d").date()
        except Exception:
            return jsonify({"error": "payment_date must be YYYY-MM-DD"}), 400

        try:
            bank_account_id = int(bank_account_id) if bank_account_id is not None else None
        except Exception:
            bank_account_id = None

        try:
            schedule_id = int(schedule_id) if schedule_id is not None else None
        except Exception:
            schedule_id = None

        if not bank_account_id:
            return jsonify({"error": "bank_account_id is required"}), 400

        preview = db_service.preview_lease_payment(
            company_id=int(company_id),
            lease_id=int(lease_id),
            amount=amount,
            payment_date=payment_date_d,
            bank_account_id=bank_account_id,
            reference=reference,
            description=description,
            user_id=user_id,
            schedule_id=schedule_id,
        )

        return jsonify({"ok": True, **preview}), 200

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        current_app.logger.exception("preview_lease_payment error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@bp.route("/api/companies/<int:company_id>/leases/<int:lease_id>/payments", methods=["POST", "OPTIONS"])
@require_auth
def post_lease_payment(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    try:
        # -----------------------------
        # Parse inputs ONCE (for both paths)
        # -----------------------------
        raw = request.get_json(silent=True) or {}
        if not isinstance(raw, dict):
            return jsonify({"error": "JSON body must be an object"}), 400

        amount = raw.get("amount")
        payment_date = (raw.get("payment_date") or "").strip()
        bank_account_id = raw.get("bank_account_id")
        reference = raw.get("reference")
        description = raw.get("description")
        schedule_id = raw.get("schedule_id")  # period_no in your UI

        if not payment_date:
            return jsonify({"error": "payment_date is required (YYYY-MM-DD)"}), 400
        try:
            payment_date_d = datetime.strptime(payment_date, "%Y-%m-%d").date()
        except Exception:
            return jsonify({"error": "payment_date must be YYYY-MM-DD"}), 400

        try:
            bank_account_id = int(bank_account_id) if bank_account_id is not None else None
        except Exception:
            bank_account_id = None
        if not bank_account_id:
            return jsonify({"error": "bank_account_id is required"}), 400

        try:
            schedule_id = int(schedule_id) if schedule_id is not None else None
        except Exception:
            schedule_id = None

        # company currency (no hardcode)
        ctx = get_company_context(db_service, int(company_id)) or {}
        currency = (ctx.get("currency") or "").strip().upper() or None

        # -----------------------------
        # Approval gate (policy-driven)
        # -----------------------------
        pol = company_policy(int(company_id)) or {}
        mode = str(pol.get("mode") or "owner_managed").strip().lower()
        company_profile = pol.get("company") or {}

        review_enabled = bool(pol.get("review_enabled", False))  # ✅ effective flag from company_policy()

        owner_user_id = company_profile.get("owner_user_id")
        is_owner = owner_user_id is not None and str(owner_user_id) == str(user.get("id"))

        role_norm = normalize_role(user.get("user_role") or user.get("company_role") or user.get("role") or "")
        is_cfo = role_norm in {"cfo", "admin", "owner"} or is_owner

        lease_review_on = bool(lease_review_enabled(pol))  # if lease_review_enabled is a function
        review_required = (mode == "controlled") or (mode == "assisted" and lease_review_on and not is_owner)

        if review_required and not is_cfo:
            actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or 0
            dedupe_key = f"{company_id}:leases:post_lease_payment:lease:{lease_id}:dt:{payment_date_d.isoformat()}:p:{schedule_id or 0}:amt:{amount}"

            payload_json = {
                "lease_id": int(lease_id),
                "amount": amount,
                "payment_date": payment_date_d.isoformat(),
                "bank_account_id": int(bank_account_id),
                "reference": reference,
                "description": description,
                "schedule_id": schedule_id,
                "currency": currency,      # ✅ helpful for downstream
                "flow": "lease_payment",
                "mode": mode,
            }

            req = db_service.create_approval_request(
                int(company_id),
                entity_type="lease",
                entity_id=str(lease_id),
                entity_ref=f"LEASE-{lease_id}",
                module="leases",
                action="post_lease_payment",
                requested_by_user_id=int(actor_user_id),
                amount=float(amount or 0.0),
                currency=currency,  # ✅ no hardcode
                risk_level=("high" if mode == "controlled" else "medium"),
                dedupe_key=dedupe_key,
                payload_json=payload_json,
            )

            return jsonify({"ok": False, "error": "APPROVAL_REQUIRED", "approval_request": req}), 202

        # -----------------------------
        # Execute (CFO/admin/owner OR owner-managed)
        # -----------------------------
        out = db_service.post_lease_payment(
            company_id=int(company_id),
            lease_id=int(lease_id),
            amount=amount,
            payment_date=payment_date_d,
            bank_account_id=bank_account_id,
            reference=reference,
            description=description,
            user_id=user_id,
            schedule_id=schedule_id,
        )

        # audit best-effort
        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=int(user_id),
                module="leases",
                action="post_lease_payment",
                severity="info",
                entity_type="lease",
                entity_id=str(lease_id),
                entity_ref=f"LEASE-{lease_id}",
                before_json={"input": raw},
                after_json=out,
                message=f"Posted lease payment for lease {lease_id} (journal {out.get('journal_id')})",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (post_lease_payment)")

        return jsonify({"ok": True, **out}), 201

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        current_app.logger.exception("post_lease_payment error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
    
@bp.route("/api/companies/<int:company_id>/leases/<int:lease_id>/modifications", methods=["POST", "OPTIONS"])
@require_auth
def create_lease_modification(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        user = getattr(g, "current_user", {}) or {}
        if user.get("company_id") != int(company_id):
            return jsonify({"error": "Not authorised for this company"}), 403

        payload = request.get_json(silent=True) or {}
        current_app.logger.info("create_lease_modification payload=%r", payload)

        # -------- policy --------
        pol = company_policy(int(company_id))
        mode = (pol.get("mode") or "owner_managed").strip().lower()

        review_on = lease_action_review_required(pol, "modification")  # ✅ PATCH

        requested_status = (payload.get("status") or "draft").strip().lower()
        should_post = (not review_on)  # review OFF => auto-post
        status_to_save = "approved" if should_post else requested_status
        if status_to_save not in {"draft", "approved"}:
            status_to_save = "draft"

        # -------- basic validation --------
        mod_date = payload.get("modification_date") or payload.get("date")
        change_type = (payload.get("change_type") or "").strip().lower()
        if not mod_date:
            return jsonify({"error": "modification_date is required"}), 400
        if change_type not in {"payment", "term", "rate", "scope", "mixed"}:
            return jsonify({"error": "change_type is required (payment|term|rate|scope|mixed)"}), 400

        try:
            mod_date_obj = date.fromisoformat(str(mod_date)[:10])
        except Exception:
            return jsonify({"error": "modification_date must be ISO (YYYY-MM-DD)"}), 400

        lease = db_service.get_lease(int(company_id), int(lease_id))
        if not lease:
            return jsonify({"error": "Lease not found"}), 404
        if (lease.get("status") or "active").lower() == "terminated":
            return jsonify({"error": "Lease is terminated; cannot modify"}), 409

        mod = db_service.create_lease_modification_draft(
            int(company_id),
            lease_id=int(lease_id),
            modification_date=mod_date_obj,
            change_type=change_type,
            reason=payload.get("reason"),
            old_payment_amount=payload.get("old_payment_amount"),
            new_payment_amount=payload.get("new_payment_amount"),
            old_annual_rate=payload.get("old_annual_rate"),
            new_annual_rate=payload.get("new_annual_rate"),
            old_end_date=payload.get("old_end_date"),
            new_end_date=payload.get("new_end_date"),
            created_by=int(user.get("id") or 0) or None,
        )
        if not mod:
            return jsonify({"error": "Failed to create modification"}), 500

        db_service.audit_log(
            company_id=int(company_id),
            actor_user_id=int(user.get("id") or 0),
            module="ifrs16",
            action="create",
            severity="info",
            entity_type="lease_modification",
            entity_id=str(mod.get("id")),
            entity_ref=str(f"lease:{lease_id} mod:{mod.get('id')}"),
            amount=float(mod.get("liability_adjustment") or 0.0),
            currency=(lease.get("currency") or None),
            before_json={},
            after_json=mod,
            message=f"Lease modification created ({status_to_save})",
        )

        if not should_post:
            mod["status"] = status_to_save
            return jsonify(mod), 201

        company_profile = pol.get("company") or db_service.get_company_profile(int(company_id)) or {}
        if not can_post_leases(user, company_profile, mode):
            return jsonify({"error": "Not allowed to post lease modifications", "mode": mode}), 403

        result = lease_service_post_modification(
            company_id=int(company_id),
            modification_id=int(mod["id"]),
            actor=user,
        )

        posted = result.get("posted") or db_service.get_lease_modification(int(company_id), int(mod["id"])) or {}
        posted["_posted_journal_id"] = result.get("journal_id")

        db_service.audit_log(
            company_id=int(company_id),
            actor_user_id=int(user.get("id") or 0),
            module="ifrs16",
            action="post",
            severity="info",
            entity_type="lease_modification",
            entity_id=str(mod.get("id")),
            entity_ref=str(f"lease:{lease_id} mod:{mod.get('id')}"),
            journal_id=int(result.get("journal_id") or 0) or None,
            amount=float(posted.get("liability_adjustment") or 0.0),
            currency=(lease.get("currency") or None),
            before_json=mod,
            after_json=posted,
            message="Lease modification posted to GL (auto-post: review disabled)",
        )

        return jsonify(posted), 201

    except Exception as e:
        current_app.logger.exception("❌ create_lease_modification crashed")
        return jsonify({"error": "Internal server error in create_lease_modification", "detail": str(e)}), 500
    
# =========================================================
# LEASE MODIFICATIONS (UPDATE DRAFT)
# =========================================================
@bp.route("/api/companies/<int:company_id>/leases/modifications/<int:mod_id>", methods=["PUT", "OPTIONS"])
@require_auth
def update_lease_modification(company_id: int, mod_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        user = getattr(g, "current_user", {}) or {}
        if user.get("company_id") != int(company_id):
            return jsonify({"error": "Not authorised for this company"}), 403

        payload = request.get_json(silent=True) or {}
        current_app.logger.info("update_lease_modification payload=%r", payload)

        mod = db_service.get_lease_modification(int(company_id), int(mod_id))
        if not mod:
            return jsonify({"error": "Modification not found"}), 404
        if (mod.get("status") or "").lower() in {"posted"} or mod.get("posted_journal_id"):
            return jsonify({"error": "Posted modifications cannot be edited"}), 409

        before = mod

        updated = db_service.update_lease_modification_draft(int(company_id), int(mod_id), patch=payload)
        if not updated:
            return jsonify({"error": "Failed to update modification"}), 500

        db_service.audit_log(
            company_id=int(company_id),
            actor_user_id=int(user.get("id") or 0),
            module="ifrs16",
            action="update",
            severity="info",
            entity_type="lease_modification",
            entity_id=str(mod_id),
            entity_ref=str(f"mod:{mod_id}"),
            amount=float(updated.get("liability_adjustment") or 0.0),
            currency=None,
            before_json=before or {},
            after_json=updated or {},
            message="Lease modification updated",
        )

        return jsonify(updated), 200

    except Exception as e:
        current_app.logger.exception("❌ update_lease_modification crashed")
        return jsonify({"error": "Internal server error in update_lease_modification", "detail": str(e)}), 500


# =========================================================
# LEASE MODIFICATIONS (POST)
# =========================================================
@bp.route("/api/companies/<int:company_id>/leases/modifications/<int:mod_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def post_lease_modification(company_id: int, mod_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    schema = f"company_{company_id}"

    try:
        pol = company_policy(int(company_id))
        mode = (pol.get("mode") or "owner_managed").strip().lower()
        company_profile = pol.get("company") or db_service.get_company_profile(int(company_id)) or {}
        if not can_post_leases(user, company_profile, mode):
            return jsonify({"error": "Not allowed to post lease modifications", "mode": mode}), 403

        with db_service._conn_cursor() as (conn, cur):
            mod = db_service.get_lease_modification(int(company_id), int(mod_id), cur=cur)
            if not mod:
                return jsonify({"error": "Lease modification not found"}), 404

            # ✅ if review is required: request approval and return 409 with approval request
            if lease_action_review_required(pol, "modification"):
                lease = db_service.get_lease(int(company_id), int(lease_id)) or {}
                entity_ref = f"{lease.get('lease_name') or f'Lease {lease_id}'} MOD {mod.get('id')}"

                payload_json = {
                    "lease_id": int(lease_id),
                    "modification_id": int(mod.get("id") or 0),
                }

                return _approval_required_response(
                    company_id=int(company_id),
                    module="leases",
                    action="post_lease_modification",
                    entity_type="lease_modification",
                    entity_id=int(mod.get("id") or 0),
                    entity_ref=entity_ref,
                    amount=float(mod.get("liability_adjustment") or 0.0),
                    currency=(lease.get("currency") or None),
                    payload_json=payload_json,
                )
            
            # ✅ PATCH: approval gate when review is enabled
            if lease_action_review_required(pol, "modification") and (mod.get("status") or "").lower() != "approved":
                return jsonify({"error": "LEASE_REVIEW_REQUIRED|modification_not_approved"}), 409

            if (mod.get("status") or "").lower() == "posted" or mod.get("posted_journal_id"):
                return jsonify({"error": "Already posted", "journal_id": mod.get("posted_journal_id")}), 409

            lease_id = int(mod.get("lease_id") or 0)
            lease = db_service.get_lease(int(company_id), int(lease_id)) or {}
            if not lease:
                return jsonify({"error": "Lease not found"}), 404
            if (lease.get("status") or "active").lower() == "terminated":
                return jsonify({"error": "Lease is terminated; cannot post modification"}), 409

            already = db_service.fetch_one(
                f"SELECT id FROM {schema}.journal WHERE source=%s AND source_id=%s",
                ("lease_modification", int(mod_id)),
                cur=cur,
            )
            if already:
                try:
                    db_service.mark_lease_modification_posted(
                        int(company_id), int(mod_id), int(already["id"]), cur=cur
                    )
                except Exception:
                    pass
                conn.commit()
                return jsonify({
                    "error": "Already posted",
                    "journal_id": int(already["id"]),
                    "modification_id": int(mod_id)
                }), 409

            lines = db_service.build_lease_modification_journal_lines(
                int(company_id),
                modification_id=int(mod_id),
                cur=cur,
            )
            if not lines:
                return jsonify({"error": "Cannot build modification journal"}), 400

            j_date = mod.get("modification_date")
            desc = f"IFRS 16 lease modification – {lease.get('lease_name') or f'Lease {lease_id}'} – MOD {mod_id}"

            entry = {
                "date": j_date,
                "ref": f"LEASE-{lease_id}-MOD-{mod_id}",
                "description": desc,
                "gross_amount": float(mod.get("liability_adjustment") or 0.0),
                "net_amount": float(mod.get("liability_adjustment") or 0.0),
                "vat_amount": 0.0,
                "source": "lease_modification",
                "source_id": int(mod_id),
                "lines": lines,
            }

            journal_id = int(db_service.post_journal(int(company_id), entry, cur=cur) or 0)
            if journal_id <= 0:
                raise ValueError("Failed to post modification journal")

            db_service.mark_lease_modification_posted(int(company_id), int(mod_id), int(journal_id), cur=cur)
            db_service.deactivate_lease_schedule(int(company_id), int(lease_id), cur=cur)

            conn.commit()
            return jsonify({"ok": True, "journal_id": int(journal_id), "modification_id": int(mod_id)}), 201

    except ValueError as e:
        msg = str(e) or ""
        if msg.startswith("LEASE_ACCOUNTS_MISSING|"):
            missing = msg.split("|", 1)[1]
            return jsonify({"error": "LEASE_ACCOUNTS_MISSING", "missing": missing.split(",")}), 400
        return jsonify({"error": "Bad request", "details": msg}), 400

    except Exception as e:
        current_app.logger.exception("post_lease_modification error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
    
# =========================================================
# LEASE TERMINATIONS (CREATE)
# =========================================================
@bp.route("/api/companies/<int:company_id>/leases/<int:lease_id>/terminations", methods=["POST", "OPTIONS"])
@require_auth
def create_lease_termination(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        user = getattr(g, "current_user", {}) or {}
        if user.get("company_id") != int(company_id):
            return jsonify({"error": "Not authorised for this company"}), 403

        payload = request.get_json(silent=True) or {}
        current_app.logger.info("create_lease_termination payload=%r", payload)

        pol = company_policy(int(company_id))
        mode = (pol.get("mode") or "owner_managed").strip().lower()

        review_on = lease_action_review_required(pol, "termination")  # ✅ PATCH

        requested_status = (payload.get("status") or "draft").strip().lower()
        should_post = (not review_on)
        status_to_save = "approved" if should_post else requested_status
        if status_to_save not in {"draft", "approved"}:
            status_to_save = "draft"

        term_date = payload.get("termination_date") or payload.get("date")
        if not term_date:
            return jsonify({"error": "termination_date is required"}), 400
        try:
            term_date_obj = date.fromisoformat(str(term_date)[:10])
        except Exception:
            return jsonify({"error": "termination_date must be ISO (YYYY-MM-DD)"}), 400

        lease = db_service.get_lease(int(company_id), int(lease_id))
        if not lease:
            return jsonify({"error": "Lease not found"}), 404
        if (lease.get("status") or "active").lower() == "terminated":
            return jsonify({"error": "Lease already terminated"}), 409

        term = db_service.create_lease_termination_draft(
            int(company_id),
            lease_id=int(lease_id),
            termination_date=term_date_obj,
            reason=payload.get("reason"),
            settlement_amount=float(payload.get("settlement_amount") or 0.0),
            notes=payload.get("notes"),
            created_by=int(user.get("id") or 0) or None,
        )
        if not term:
            return jsonify({"error": "Failed to create termination"}), 500

        # ✅ if review is required: request approval and return
        if lease_action_review_required(pol, "termination"):
            lease = db_service.get_lease(int(company_id), int(lease_id)) or {}
            entity_ref = f"{lease.get('lease_name') or f'Lease {lease_id}'} TERM {term.get('id')}"

            payload_json = {
                "lease_id": int(lease_id),
                "termination_id": int(term.get("id") or 0),
            }

            return _approval_required_response(
                company_id=int(company_id),
                module="leases",
                action="post_lease_termination",
                entity_type="lease_termination",
                entity_id=int(term.get("id") or 0),
                entity_ref=entity_ref,
                amount=float(term.get("gain_loss_amount") or 0.0),
                currency=(lease.get("currency") or None),
                payload_json=payload_json,
            )

        db_service.audit_log(
            company_id=int(company_id),
            actor_user_id=int(user.get("id") or 0),
            module="ifrs16",
            action="create",
            severity="info",
            entity_type="lease_termination",
            entity_id=str(term.get("id")),
            entity_ref=str(f"lease:{lease_id} term:{term.get('id')}"),
            amount=float(term.get("gain_loss_amount") or 0.0),
            currency=(lease.get("currency") or None),
            before_json={},
            after_json=term,
            message=f"Lease termination created ({status_to_save})",
        )

        if not should_post:
            term["status"] = status_to_save
            return jsonify(term), 201

        company_profile = pol.get("company") or db_service.get_company_profile(int(company_id)) or {}
        if not can_post_leases(user, company_profile, mode):
            return jsonify({"error": "Not allowed to post lease terminations", "mode": mode}), 403

        result = lease_service_post_termination(
            company_id=int(company_id),
            termination_id=int(term["id"]),
            actor=user,
        )
        posted = result.get("posted") or db_service.get_lease_termination(int(company_id), int(term["id"])) or {}
        posted["_posted_journal_id"] = result.get("journal_id")

        db_service.audit_log(
            company_id=int(company_id),
            actor_user_id=int(user.get("id") or 0),
            module="ifrs16",
            action="post",
            severity="info",
            entity_type="lease_termination",
            entity_id=str(term.get("id")),
            entity_ref=str(f"lease:{lease_id} term:{term.get('id')}"),
            journal_id=int(result.get("journal_id") or 0) or None,
            amount=float(posted.get("gain_loss_amount") or 0.0),
            currency=(lease.get("currency") or None),
            before_json=term,
            after_json=posted,
            message="Lease termination posted to GL (auto-post: review disabled)",
        )

        return jsonify(posted), 201

    except Exception as e:
        current_app.logger.exception("❌ create_lease_termination crashed")
        return jsonify({"error": "Internal server error in create_lease_termination", "detail": str(e)}), 500
    

# =========================================================
# LEASE TERMINATIONS (POST)
# =========================================================
@bp.route("/api/companies/<int:company_id>/leases/terminations/<int:term_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def post_lease_termination(company_id: int, term_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    schema = f"company_{company_id}"

    try:
        pol = company_policy(int(company_id))
        mode = (pol.get("mode") or "owner_managed").strip().lower()
        company_profile = pol.get("company") or db_service.get_company_profile(int(company_id)) or {}
        if not can_post_leases(user, company_profile, mode):
            return jsonify({"error": "Not allowed to post lease terminations", "mode": mode}), 403

        with db_service._conn_cursor() as (conn, cur):
            term = db_service.get_lease_termination(int(company_id), int(term_id), cur=cur)
            if not term:
                return jsonify({"error": "Lease termination not found"}), 404

            # ✅ PATCH: approval gate when review is enabled
            if lease_action_review_required(pol, "termination") and (term.get("status") or "").lower() != "approved":
                return jsonify({"error": "LEASE_REVIEW_REQUIRED|termination_not_approved"}), 409

            if (term.get("status") or "").lower() == "posted" or term.get("posted_journal_id"):
                return jsonify({"error": "Already posted", "journal_id": term.get("posted_journal_id")}), 409

            lease_id = int(term.get("lease_id") or 0)
            lease = db_service.get_lease(int(company_id), int(lease_id)) or {}
            if not lease:
                return jsonify({"error": "Lease not found"}), 404

            already = db_service.fetch_one(
                f"SELECT id FROM {schema}.journal WHERE source=%s AND source_id=%s",
                ("lease_termination", int(term_id)),
                cur=cur,
            )
            if already:
                jid = int(already["id"])
                db_service.mark_lease_termination_posted_and_close_lease(
                    int(company_id), int(term_id), posted_journal_id=jid, cur=cur
                )
                db_service.deactivate_lease_schedule(int(company_id), int(lease_id), cur=cur)
                conn.commit()
                return jsonify({"error": "Already posted", "journal_id": jid, "termination_id": int(term_id)}), 409

            lines = db_service.build_lease_termination_journal_lines(
                int(company_id),
                termination_id=int(term_id),
                cur=cur,
            )
            if not lines:
                return jsonify({"error": "Cannot build termination journal"}), 400

            j_date = term.get("termination_date")
            desc = f"IFRS 16 lease termination – {lease.get('lease_name') or f'Lease {lease_id}'} – TERM {term_id}"

            entry = {
                "date": j_date,
                "ref": f"LEASE-{lease_id}-TERM-{term_id}",
                "description": desc,
                "gross_amount": float(term.get("gain_loss_amount") or 0.0),
                "net_amount": float(term.get("gain_loss_amount") or 0.0),
                "vat_amount": 0.0,
                "source": "lease_termination",
                "source_id": int(term_id),
                "lines": lines,
            }

            journal_id = int(db_service.post_journal(int(company_id), entry, cur=cur) or 0)
            if journal_id <= 0:
                raise ValueError("Failed to post termination journal")

            db_service.mark_lease_termination_posted_and_close_lease(
                int(company_id), int(term_id), posted_journal_id=int(journal_id), cur=cur
            )
            db_service.deactivate_lease_schedule(int(company_id), int(lease_id), cur=cur)

            conn.commit()
            return jsonify({"ok": True, "journal_id": int(journal_id), "termination_id": int(term_id)}), 201

    except ValueError as e:
        msg = str(e) or ""
        if msg.startswith("LEASE_ACCOUNTS_MISSING|"):
            missing = msg.split("|", 1)[1]
            return jsonify({"error": "LEASE_ACCOUNTS_MISSING", "missing": missing.split(",")}), 400
        return jsonify({"error": "Bad request", "details": msg}), 400

    except Exception as e:
        current_app.logger.exception("post_lease_termination error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
    
@bp.route(
    "/api/companies/<int:company_id>/leases/<int:lease_id>/modifications",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def lease_modifications(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    # ---- auth (same pattern you use elsewhere) ----
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    # ---- LIST ----
    if request.method == "GET":
        try:
            # frontend sends these
            limit = request.args.get("limit", type=int) or 200
            offset = request.args.get("offset", type=int) or 0

            # lease must exist
            lease = db_service.get_lease_by_id(int(company_id), int(lease_id))
            if not lease:
                return jsonify({"error": "Lease not found"}), 404

            # your db method currently returns ALL rows; slice for paging
            rows_all = db_service.list_lease_modifications(int(company_id), int(lease_id)) or []
            total = len(rows_all)

            # safe paging
            limit = max(1, min(int(limit), 500))
            offset = max(0, int(offset))
            rows = rows_all[offset : offset + limit]

            return jsonify({
                "ok": True,
                "company_id": int(company_id),
                "lease_id": int(lease_id),
                "total": int(total),
                "limit": int(limit),
                "offset": int(offset),
                "rows": rows,
            }), 200

        except Exception as e:
            current_app.logger.exception("lease_modifications GET error")
            return jsonify({"error": "Internal server error", "details": str(e)}), 500

    # ---- CREATE (POST) ----
    # delegate to your existing create logic (it uses g.current_user now)
    return create_lease_modification(company_id, lease_id)


@bp.route("/api/companies/<int:company_id>/leases/<int:lease_id>/terminations", methods=["GET", "POST", "OPTIONS"])
@require_auth
def lease_terminations(company_id: int, lease_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    # LIST
    if request.method == "GET":
        user = getattr(g, "current_user", {}) or {}
        if int(user.get("company_id") or 0) != int(company_id):
            return jsonify({"error": "Not authorised for this company"}), 403

        rows = db_service.list_lease_terminations(
            int(company_id),
            lease_id=int(lease_id),
        ) or []

        return jsonify({"rows": rows}), 200

    # CREATE (your existing create logic)
    return create_lease_termination(company_id, lease_id)
