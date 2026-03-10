from typing import Optional, Dict, Any
from BackEnd.Services.db_service import db_service

def approvals_dedupe_key(company_id: int, module: str, action: str, entity_type: str, entity_id: str) -> str:
    return f"{company_id}:{module}:{action}:{entity_type}:{entity_id}"

def approval_payload_for_entity(entity: dict) -> dict:
    # keep small; include only what UI needs to render preview
    return {
        "id": entity.get("id"),
        "number": entity.get("number"),
        "status": entity.get("status"),
        "amount": entity.get("total_amount") or entity.get("amount"),
        "currency": entity.get("currency"),
        "ref": entity.get("reference") or entity.get("entity_ref"),
    }

def create_or_get_pending_approval(
    *,
    company_id: int,
    entity_type: str,
    entity_id: str,
    entity_ref: Optional[str],
    module: str,
    action: str,
    requested_by_user_id: int,
    amount: float = 0.0,
    currency: Optional[str] = None,
    risk_level: str = "low",
    payload_json: Optional[dict] = None,
) -> Dict[str, Any]:
    dedupe_key = approvals_dedupe_key(company_id, module, action, entity_type, entity_id)
    return db_service.create_approval_request(
        company_id,
        entity_type=entity_type,
        entity_id=str(entity_id),
        entity_ref=entity_ref,
        module=module,
        action=action,
        requested_by_user_id=int(requested_by_user_id),
        amount=float(amount or 0.0),
        currency=(currency or None),
        risk_level=risk_level,
        dedupe_key=dedupe_key,
        payload_json=(payload_json or {}),
    )