# BackEnd/Services/lease_posting.py

from __future__ import annotations
from BackEnd.Services.db_service import db_service
from typing import List, Dict, Any, Optional
from datetime import date
from datetime import datetime, date
from flask import jsonify, request, g, current_app, make_response

from .lease_engine import (
    LeaseScheduleResult,
    _liability_split_current_noncurrent,
)

from datetime import date
from typing import Any, Dict, List

def build_lessee_opening_journal(
    company_id: int,
    result,  # LeaseScheduleResult
    mode: str = "inception",
    as_of: date | None = None,
    strict: bool = False,
) -> Dict[str, Any]:
    """
    Build Day-1 / transition opening journal for IFRS 16 lessee.

    IMPORTANT:
    Initial direct costs are NO LONGER offset inside the opening lease journal.
    They must be captured later via:
      - AP bill, or
      - direct cash/bank payment workflow.

    Therefore:
      opening journal = core lease only
      Dr ROU asset (excluding uncaptured direct costs)
      Cr Lease liability current
      Cr Lease liability non-current
    """
    lease = result.lease_input
    mode = (mode or "inception").lower()
    as_of = as_of or lease.start_date

    desc = (
        f"IFRS 16 transition – existing lease {lease.lease_name}"
        if mode == "existing"
        else f"Initial recognition of lease - {lease.lease_name}"
    )

    # ----------------------------
    # 1) Amounts
    # ----------------------------
    direct_costs = round(float(getattr(lease, "initial_direct_costs", 0.0) or 0.0), 2)

    if mode == "existing":
        liab_amt = round(float(liability_at_date(result, as_of)), 2)

        # ✅ core opening journal excludes uncaptured direct costs
        rou_amt = round(liab_amt, 2)

    else:
        liab_amt = round(float(result.opening_lease_liability), 2)

        full_rou_amt = round(float(result.opening_rou_asset), 2)

        # ✅ remove direct costs from opening journal
        rou_amt = round(full_rou_amt - direct_costs, 2)

        # protect against negative rounding edge cases
        if rou_amt < 0:
            rou_amt = 0.0

    # Split liability into CL/NCL at as_of
    cur_amt, ncur_amt = _liability_split_current_noncurrent(result, as_of)
    cur_amt = round(float(cur_amt or 0.0), 2)
    ncur_amt = round(float(ncur_amt or 0.0), 2)

    split_total = round(cur_amt + ncur_amt, 2)
    if abs(split_total - liab_amt) > 0.02:
        # push rounding difference into non-current
        ncur_amt = round(ncur_amt + (liab_amt - split_total), 2)

    # ----------------------------
    # 2) Resolve accounts -> posting codes
    # ----------------------------
    lease_defaults = db_service.get_lease_posting_accounts(company_id) or {}

    def _pick(*vals: str | None) -> str:
        for v in vals:
            s = (v or "").strip()
            if s:
                return s
        return ""

    print("[LEASE DEBUG] legacy_liab_raw =", legacy_liab_raw, flush=True)
    print("[LEASE DEBUG] lease_defaults =", lease_defaults, flush=True)
    print("[LEASE DEBUG] liab_cur_raw before resolve =", liab_cur_raw, flush=True)
    print("[LEASE DEBUG] liab_ncur_raw before resolve =", liab_ncur_raw, flush=True)
    def resolve_posting(raw_code: str) -> str:
        """
        raw_code can be a posting code OR a template_code.
        Returns the actual posting code (row[1]) from company_{id}.coa
        """
        c = (raw_code or "").strip()
        if not c:
            raise ValueError("Missing required account code.")
        print(f"[LEASE DEBUG] resolve_posting raw_code={c}", flush=True)
        row = db_service.get_account_row_for_posting(company_id, c)
        print(f"[LEASE DEBUG] resolve_posting row={row}", flush=True)
        if not row:
            raise ValueError(f"Account '{c}' not found in company COA (code/template_code).")
        posting = (row[1] or "").strip()
        if not posting:
            raise ValueError(f"Resolved posting code blank for '{c}'")
        return posting

    # Wizard overrides (if present) else settings defaults
    rou_raw = _pick(getattr(lease, "rou_asset_account", None), lease_defaults.get("roa"))
    liab_cur_raw = _pick(
        getattr(lease, "lease_liability_current_account", None),
        lease_defaults.get("liability_current"),
    )
    liab_ncur_raw = _pick(
        getattr(lease, "lease_liability_non_current_account", None),
        lease_defaults.get("liability_noncurrent"),
    )

    # Legacy fallback: only current may use the old single liability field.
    legacy_liab_raw = (getattr(lease, "lease_liability_account", None) or "").strip()

    if not liab_cur_raw and legacy_liab_raw:
        liab_cur_raw = legacy_liab_raw

    # Non-current MUST come from defaults/settings (no fallback to legacy)
    if not liab_ncur_raw:
        liab_ncur_raw = (lease_defaults.get("liability_noncurrent") or "").strip()

    # ----------------------------
    # VALIDATION (MUST BE OUTSIDE)
    # ----------------------------
    if not rou_raw:
        raise ValueError("ROU asset account is required (wizard or company settings).")

    if not liab_cur_raw:
        raise ValueError("Lease liability current account is required.")

    if not liab_ncur_raw:
        raise ValueError("Lease liability non-current account is required.")

    rou_acct = resolve_posting(rou_raw)
    liab_cur_acct = resolve_posting(liab_cur_raw)
    liab_ncur_acct = resolve_posting(liab_ncur_raw)

    if not liab_cur_acct.startswith("BS_CL_"):
        raise ValueError(
            f"Lease liability current account must be BS_CL_*, got '{liab_cur_acct}'."
        )

    if not liab_ncur_acct.startswith("BS_NCL_"):
        raise ValueError(
            f"Lease liability non-current account must be BS_NCL_*, got '{liab_ncur_acct}'."
        )
    
    # ----------------------------
    # 3) Build lines
    # ----------------------------
    lines: List[Dict[str, Any]] = []

    # DR ROU asset (core lease only; excludes uncaptured direct costs)
    lines.append({
        "account_code": rou_acct,
        "description": desc,
        "debit": rou_amt,
        "credit": 0.0,
    })

    # CR Lease liability (split)
    if cur_amt > 0:
        lines.append({
            "account_code": liab_cur_acct,
            "description": desc + " – lease liability (current)",
            "debit": 0.0,
            "credit": cur_amt,
        })

    if ncur_amt > 0:
        lines.append({
            "account_code": liab_ncur_acct,
            "description": desc + " – lease liability (non-current)",
            "debit": 0.0,
            "credit": ncur_amt,
        })

    # ✅ REMOVED:
    # No direct cost offset line is posted here anymore.
    # Direct costs must be captured later through AP or cash/bank flow.

    # ----------------------------
    # 4) Balance check
    # ----------------------------
    dr = round(sum(float(l["debit"]) for l in lines), 2)
    cr = round(sum(float(l["credit"]) for l in lines), 2)

    if dr != cr:
        if strict:
            raise ValueError(f"Opening lease journal does not balance (DR {dr}, CR {cr}).")
        return {
            "journal_lines": lines,
            "dr_total": dr,
            "cr_total": cr,
            "error": f"Opening lease journal does not balance (DR {dr}, CR {cr})."
        }

    return {"journal_lines": lines, "dr_total": dr, "cr_total": cr}

def liability_at_date(
    result: LeaseScheduleResult,
    as_of: date,
) -> float:
    """
    Returns total lease liability carrying amount as at 'as_of'.
    """
    liability = float(result.opening_lease_liability)

    for p in result.periods:
        # subtract principal for periods already due
        if p.period_end <= as_of:
            liability -= float(p.principal)

    return round(max(liability, 0.0), 2)

def _approval_required_response(*, company_id: int, module: str, action: str, entity_type: str, entity_id: int, entity_ref: str | None, amount: float = 0.0, currency: str | None = None, payload_json: dict | None = None):
    """
    Creates an approval request and returns a consistent 409 payload for the UI.
    """
    item = db_service.create_approval_request(
        int(company_id),
        entity_type=entity_type,
        entity_id=str(entity_id),
        entity_ref=entity_ref,
        module=module,
        action=action,
        requested_by_user_id=int(getattr(g, "user_id", 0) or 0),
        amount=float(amount or 0.0),
        currency=currency,
        risk_level="low",
        dedupe_key=f"{module}:{action}:{entity_type}:{entity_id}",
        payload_json=payload_json or {},
    )
    return jsonify({
        "ok": False,
        "error": "REVIEW_REQUIRED",
        "module": module,
        "action": action,
        "approval_request": item,
    }), 409

