"""
BackEnd/Services/logo_utils.py
FinSage — shared company-logo resolution (PDF + /view + email).
=============================================================================
ONE shared home for the logo helpers so that BOTH api_server.py AND the
service modules (receipt_pdf_service.py etc.) can import them without
circular imports:

    api_server.py  → imports services          (top of the stack)
    services       → must NOT import api_server

That is exactly why pasting the helpers into api_server.py was a dead end
for receipt_pdf_service.build_receipt_pdf — a service module can never
import back up into api_server.

WHAT attach_company_logo_ctx() DOES (call it on any company ctx dict):

    company["logo_path"]      real file on disk        → ReportLab Image
    company["logo_data_uri"]  base64 data URI          → /view templates
                              (cannot 404, cannot be mixed-content-blocked)
    company["logo_url"]       kept RELATIVE            → /view templates
                              (same Flask origin serves /view AND
                               /api/companies/<id>/logo/file — always 200)
    company["logo_url_abs"]   absolute URL             → email HTML only
                              (skipped silently when there is no request
                               context, e.g. background/e-mail jobs)

Logo source order: companies.logo_url  →  company_branding.logo_url
(the branding table is only queried when companies.logo_url is empty).

Handles BOTH historical url schemes:
    /api/companies/<id>/logo/file      current uploader  (api_server.py:6963,
                                       binary at static/uploads/company_<id>/logo.<ext>)
    /uploads/company_logos/<file>      legacy flow
    bare filenames                     tried in every historical folder
    "?query" suffixes                  stripped
"""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path

# Same extension set as the logo uploader (api_server.py:89)
LOGO_EXTS = (".png", ".jpg", ".jpeg", ".webp")


# ---------------------------------------------------------------------------
def resolve_company_logo_path(company_id, logo_url):
    """Stored logo_url → LOCAL FILE PATH, whichever scheme produced it.

    Self-contained: needs only os/Path + Flask's current_app (already in any
    request/app context). Returns None when nothing exists on disk.
    """
    import os
    from flask import current_app

    try:
        root = Path(current_app.root_path)
    except RuntimeError:            # outside app context (rare) — give up quietly
        return None

    try:
        cid = int(company_id)
    except (TypeError, ValueError):
        cid = 0

    url = ((logo_url or "").strip()).split("?")[0]   # strip cache-busters
    if not url:
        return None

    candidates: list[Path] = []

    if url.startswith("/api/companies/") and url.endswith("/logo/file"):
        # current uploader → static/uploads/company_<id>/logo.<ext>
        per_company = root / "static" / "uploads" / f"company_{cid}"
        candidates += [per_company / f"logo{ext}" for ext in LOGO_EXTS]
        # defensive: also trust the id embedded in the url itself
        try:
            alt = root / "static" / "uploads" / f"company_{int(url.split('/')[3])}"
            candidates += [alt / f"logo{ext}" for ext in LOGO_EXTS]
        except (ValueError, IndexError):
            pass
    else:
        # legacy folder, bare filenames, full http urls (basename fallback)
        name = os.path.basename(url.rstrip("/"))
        candidates += [
            root / "uploads" / "company_logos" / name,
            root / "static" / "uploads" / "company_logos" / name,
            root / "static" / "uploads" / f"company_{cid}" / name,
        ]

    for p in candidates:
        try:
            if p.is_file():
                return str(p)
        except OSError:
            continue
    return None


# ---------------------------------------------------------------------------
def logo_data_uri(logo_path):
    """Logo file → base64 data URI (cannot 404, cannot be mixed-content-blocked)."""
    if not logo_path:
        return None
    try:
        mime = mimetypes.guess_type(logo_path)[0] or "image/png"
        with open(logo_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        return f"data:{mime};base64,{b64}"
    except OSError:
        return None


# ---------------------------------------------------------------------------
def attach_company_logo_ctx(company: dict, company_id, branding: dict | None = None) -> dict:
    """Enrich a company context dict with resolvable logo fields.

    Usage — ONE line, anywhere a PDF / view / email company ctx is built:

        company = attach_company_logo_ctx(company, company_id)
        # or, when the route already fetched branding:
        company = attach_company_logo_ctx(company, company_id, branding=branding)

    Safe to call from background jobs (no request context) — the absolute-URL
    fallback is simply skipped.
    """
    company = dict(company or {})          # shallow copy; caller's dict untouched
    if not company.get("id") and company_id:
        company["id"] = company_id         # helps bare-filename fallbacks downstream

    # 1) COALESCE(companies.logo_url, company_branding.logo_url)
    #    branding is only fetched when companies.logo_url is empty (saves a query).
    logo_url = (company.get("logo_url") or "").strip()
    if not logo_url:
        if company_id:
            if branding is None:
                try:
                    from BackEnd.Services.db_service import db_service  # local: no cycles
                    branding = db_service.get_company_branding(int(company_id)) or {}
                except Exception:
                    branding = {}
            logo_url = (branding.get("logo_url") or "").strip()
        if logo_url:
            company["logo_url"] = logo_url      # keep RELATIVE — view templates want same-origin

    # 2) real file + data URI
    company["logo_path"] = resolve_company_logo_path(company_id, logo_url)
    company["logo_data_uri"] = logo_data_uri(company["logo_path"])

    # 3) absolute URL — for EMAIL HTML only; skipped without a request context
    if logo_url.startswith("/"):
        try:
            from flask import request
            company["logo_url_abs"] = request.host_url.rstrip("/") + logo_url
        except RuntimeError:
            pass                                # background job — nothing to absolutize against

    return company
