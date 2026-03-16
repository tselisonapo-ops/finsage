import os
import shutil
import pdfkit
from flask import render_template

# -------------------------------------------------
# wkhtmltopdf configuration (LAZY + SAFE)
# -------------------------------------------------

_PDFKIT_CONFIG = None  # initialized lazily


def _resolve_wkhtmltopdf_path():
    """
    Resolve wkhtmltopdf path in this order:
    1. WKHTMLTOPDF_PATH env var
    2. system PATH via shutil.which()
    3. common Windows install locations
    """
    env_path = os.getenv("WKHTMLTOPDF_PATH", "").strip()
    if env_path:
        return env_path

    auto_path = shutil.which("wkhtmltopdf")
    if auto_path:
        return auto_path

    common_windows_paths = [
        r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe",
        r"C:\Program Files (x86)\wkhtmltopdf\bin\wkhtmltopdf.exe",
    ]
    for p in common_windows_paths:
        if os.path.exists(p):
            return p

    return None

def _get_pdfkit_config():
    """
    Lazily create and cache pdfkit configuration.
    Prevents Flask app from crashing at import time.
    """
    global _PDFKIT_CONFIG

    if _PDFKIT_CONFIG is None:
        wkhtmltopdf_path = _resolve_wkhtmltopdf_path()
        if not wkhtmltopdf_path:
            raise RuntimeError(
                "wkhtmltopdf not found. Set WKHTMLTOPDF_PATH or install it on the server."
            )

        _PDFKIT_CONFIG = pdfkit.configuration(wkhtmltopdf=wkhtmltopdf_path)

    return _PDFKIT_CONFIG


# -------------------------------------------------
# wkhtmltopdf options (stable defaults)
# -------------------------------------------------

PDF_OPTIONS = {
    "page-size": "A4",
    "encoding": "UTF-8",
    "print-media-type": None,
    "background": None,
    "enable-local-file-access": None,
    "margin-top": "10mm",
    "margin-right": "10mm",
    "margin-bottom": "10mm",
    "margin-left": "10mm",
    "disable-smart-shrinking": None,
    "zoom": "1.0",
    "javascript-delay": "200",
    "no-stop-slow-scripts": None,
}


# -------------------------------------------------
# Core PDF generator
# -------------------------------------------------

def html_to_pdf(html: str) -> bytes:
    config = _get_pdfkit_config()

    pdf_bytes = pdfkit.from_string(
        html,
        False,
        configuration=config,
        options=PDF_OPTIONS,
    )

    if not pdf_bytes or not isinstance(pdf_bytes, (bytes, bytearray)):
        raise RuntimeError("pdfkit returned empty/invalid bytes")

    if not pdf_bytes.startswith(b"%PDF"):
        raise RuntimeError(
            f"wkhtmltopdf did not return a PDF. Head={pdf_bytes[:200]!r}"
        )

    return pdf_bytes


# -------------------------------------------------
# Invoice PDF entry point
# -------------------------------------------------

def generate_invoice_pdf(invoice, company=None) -> bytes:
    company = company or {}

    html = render_template(
        "invoice_pdf.html",
        invoice=invoice,
        company=company,
        pdf_url="",
    )
    return html_to_pdf(html)


def generate_quote_pdf(quote, company=None) -> bytes:
    company = company or {}

    html = render_template(
        "quote_pdf.html",
        quote=quote,
        company=company,
        pdf_url="",
    )
    return html_to_pdf(html)