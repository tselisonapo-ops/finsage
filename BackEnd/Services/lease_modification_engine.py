from __future__ import annotations
from typing import Dict, Any

from BackEnd.Services.lease_engine import (
    LeaseInput,
    build_lease_schedule,
    schedule_to_json,
)

def compute_lease_modification(db_service, company_id: int, *, modification_id: int, cur=None) -> Dict[str, Any]:
    mod = db_service.get_lease_modification(company_id, modification_id)
    if not mod:
        raise ValueError("Modification not found")

    lease_id = int(mod.get("lease_id") or 0)
    lease = db_service.get_lease(company_id, lease_id)
    if not lease:
        raise ValueError("Lease not found")

    if (lease.get("status") or "active").lower() == "terminated":
        raise ValueError("LEASE_TERMINATED|cannot_modify")

    mod_date = mod.get("modification_date")
    if not mod_date:
        raise ValueError("Modification date is required")

    carrying = db_service.get_lease_carrying_state_as_of(
        company_id,
        lease_id=lease_id,
        as_of=mod_date,
        cur=cur,
    )

    payment_amount = float(
        mod.get("new_payment_amount")
        if mod.get("new_payment_amount") is not None
        else lease.get("payment_amount") or 0.0
    )

    annual_rate = float(
        mod.get("new_annual_rate")
        if mod.get("new_annual_rate") is not None
        else lease.get("annual_rate") or 0.0
    )

    end_date = mod.get("new_end_date") or lease.get("end_date")
    if not end_date:
        raise ValueError("Lease end date missing")

    revised_input = LeaseInput(
        company_id=int(company_id),
        role="lessee",
        lease_name=lease.get("lease_name") or f"Lease {lease_id}",
        start_date=mod_date,
        end_date=end_date,
        payment_amount=payment_amount,
        payment_frequency=(lease.get("payment_frequency") or "monthly"),
        payment_timing=(lease.get("payment_timing") or "arrears"),
        annual_rate=annual_rate,
        initial_direct_costs=0.0,
        residual_value=float(lease.get("residual_value") or 0.0),
        vat_rate=float(lease.get("vat_rate") or 0.0),
    )

    revised_result = build_lease_schedule(revised_input)
    revised_json = schedule_to_json(revised_result)

    liability_before = round(float(carrying["liability_before"]), 2)
    rou_before = round(float(carrying["rou_before"]), 2)

    liability_after = round(float(revised_result.opening_lease_liability), 2)

    change_type = (mod.get("change_type") or "").strip().lower()
    if change_type == "scope":
        # simple first-pass treatment; later you can add partial derecognition logic
        rou_after = round(rou_before + (liability_after - liability_before), 2)
    else:
        rou_after = round(rou_before + (liability_after - liability_before), 2)

    saved = db_service.set_lease_modification_computed(
        company_id,
        int(modification_id),
        liability_before=liability_before,
        liability_after=liability_after,
        rou_before=rou_before,
        rou_after=rou_after,
    )

    revised_schedule = revised_json.get("schedule") or []
    try:
        db_service.save_lease_modification_preview_rows(
            company_id,
            modification_id=int(modification_id),
            lease_id=int(lease_id),
            revised_schedule=revised_schedule,
            cur=cur,
        )
    except Exception:
        # OK if preview table does not yet exist
        pass

    return {
        "modification": saved,
        "lease_id": int(lease_id),
        "change_type": change_type,
        "liability_before": liability_before,
        "liability_after": liability_after,
        "liability_adjustment": round(liability_after - liability_before, 2),
        "rou_before": rou_before,
        "rou_after": rou_after,
        "rou_adjustment": round(rou_after - rou_before, 2),
        "revised_schedule": revised_schedule,
        "revised_pv_table": revised_json.get("pv_table") or [],
    }