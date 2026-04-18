# BackEnd/Services/utils/receipt_token.py
from __future__ import annotations
import time
import hmac
import hashlib
import os
from typing import Optional, Dict, Any

_SECRET = (os.getenv("JWT_SECRET_KEY") or "dev-secret").encode("utf-8")

def create_receipt_pdf_token(*, company_id: int, receipt_id: int, ttl_seconds: int = 120) -> str:
    exp = int(time.time()) + int(ttl_seconds)
    msg = f"{company_id}:{receipt_id}:{exp}".encode("utf-8")
    sig = hmac.new(_SECRET, msg, hashlib.sha256).hexdigest()
    return f"{company_id}.{receipt_id}.{exp}.{sig}"

def verify_receipt_pdf_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        company_id_s, receipt_id_s, exp_s, sig = token.split(".", 3)
        company_id = int(company_id_s)
        receipt_id = int(receipt_id_s)
        exp = int(exp_s)
        if int(time.time()) > exp:
            return None

        msg = f"{company_id}:{receipt_id}:{exp}".encode("utf-8")
        expected = hmac.new(_SECRET, msg, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return None

        return {"company_id": company_id, "receipt_id": receipt_id, "exp": exp}
    except Exception:
        return None
    

