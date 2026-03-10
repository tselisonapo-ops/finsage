# BackEnd/Services/coa_template_service.py
from __future__ import annotations
from typing import Any, Dict, List, Optional

# Import ONLY the pure template builders / helpers from coa_service
# (build_coa uses your in-file templates and business rules)
from BackEnd.Services.coa_service import build_coa, row_to_dict


def build_coa_flat(industry: str, subindustry: Optional[str] = None) -> List[Dict[str, Any]]:
    rows = build_coa(industry, subindustry)
    return [row_to_dict(r) for r in rows]
