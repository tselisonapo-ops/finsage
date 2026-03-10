import time, hmac, hashlib, base64
from flask import current_app

def make_invoice_view_token(company_id: int, invoice_id: int, user_id: int, ttl_seconds: int = 120) -> str:
    exp = int(time.time()) + ttl_seconds
    payload = f"{company_id}:{invoice_id}:{user_id}:{exp}".encode("utf-8")

    secret = (current_app.config.get("SECRET_KEY") or "dev-secret").encode("utf-8")
    sig = hmac.new(secret, payload, hashlib.sha256).digest()

    token = base64.urlsafe_b64encode(payload + b"." + sig).decode("utf-8")
    return token

def verify_invoice_view_token(token: str):
    try:
        raw = base64.urlsafe_b64decode(token.encode("utf-8"))
        payload, sig = raw.rsplit(b".", 1)

        secret = (current_app.config.get("SECRET_KEY") or "dev-secret").encode("utf-8")
        expected = hmac.new(secret, payload, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            return None

        parts = payload.decode("utf-8").split(":")
        if len(parts) != 4:
            return None

        company_id, invoice_id, user_id, exp = map(int, parts)
        if time.time() > exp:
            return None

        return {"company_id": company_id, "invoice_id": invoice_id, "user_id": user_id}
    except Exception:
        return None


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")

def _b64url_decode(s: str) -> bytes:
    pad = "=" * ((4 - (len(s) % 4)) % 4)
    return base64.urlsafe_b64decode(s + pad)

def create_invoice_pdf_token(*, company_id: int, invoice_id: int, ttl_seconds: int = 120) -> str:
    return create_doc_pdf_token(company_id=company_id, doc_type="invoice", doc_id=invoice_id, ttl_seconds=ttl_seconds)

def verify_invoice_pdf_token(token: str):
    payload = verify_doc_pdf_token(token)
    if not payload or payload.get("doc_type") != "invoice":
        return None
    return {"company_id": payload["company_id"], "invoice_id": payload["doc_id"]}


def create_doc_pdf_token(*, company_id: int, doc_type: str, doc_id: int, ttl_seconds: int = 120) -> str:
    """
    doc_type: "invoice" | "quote" (or anything you want)
    """
    exp = int(time.time()) + int(ttl_seconds)
    msg = f"{company_id}:{doc_type}:{doc_id}:{exp}".encode("utf-8")
    secret = (current_app.config.get("SECRET_KEY") or "dev-secret").encode("utf-8")
    sig = hmac.new(secret, msg, hashlib.sha256).digest()
    return _b64url(msg + b"." + sig)


def verify_doc_pdf_token(token: str):
    if not token:
        return None
    try:
        raw = _b64url_decode(token)
        msg, sig = raw.rsplit(b".", 1)

        secret = (current_app.config.get("SECRET_KEY") or "dev-secret").encode("utf-8")
        good = hmac.new(secret, msg, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, good):
            return None

        parts = msg.decode("utf-8").split(":")
        # company_id:doc_type:doc_id:exp
        company_id = int(parts[0])
        doc_type = str(parts[1])
        doc_id = int(parts[2])
        exp = int(parts[3])

        if int(time.time()) > exp:
            return None

        return {"company_id": company_id, "doc_type": doc_type, "doc_id": doc_id}
    except Exception:
        return None

def create_quote_pdf_token(*, company_id: int, quote_id: int, ttl_seconds: int = 120) -> str:
    return create_doc_pdf_token(company_id=company_id, doc_type="quote", doc_id=quote_id, ttl_seconds=ttl_seconds)

def verify_quote_pdf_token(token: str):
    payload = verify_doc_pdf_token(token)
    if not payload or payload.get("doc_type") != "quote":
        return None
    return {"company_id": payload["company_id"], "quote_id": payload["doc_id"]}
