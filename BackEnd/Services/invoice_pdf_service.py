import os
import pdfkit
from flask import render_template, current_app

# -------------------------------------------------
# wkhtmltopdf configuration (LAZY + SAFE)
# -------------------------------------------------

WKHTMLTOPDF_PATH = r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe"
_PDFKIT_CONFIG = None  # initialized lazily


def _get_pdfkit_config():
    """
    Lazily create and cache pdfkit configuration.
    Prevents Flask app from crashing at import time.
    """
    global _PDFKIT_CONFIG

    if _PDFKIT_CONFIG is None:
        if not os.path.exists(WKHTMLTOPDF_PATH):
            raise RuntimeError(f"wkhtmltopdf not found at: {WKHTMLTOPDF_PATH}")

        _PDFKIT_CONFIG = pdfkit.configuration(
            wkhtmltopdf=WKHTMLTOPDF_PATH
        )

    return _PDFKIT_CONFIG


# -------------------------------------------------
# wkhtmltopdf options (stable defaults)
# -------------------------------------------------

PDF_OPTIONS = {
    "page-size": "A4",
    "encoding": "UTF-8",

    # rendering
    "print-media-type": None,
    "background": None,
    "enable-local-file-access": None,

    # margins
    "margin-top": "10mm",
    "margin-right": "10mm",
    "margin-bottom": "10mm",
    "margin-left": "10mm",

    # stability / layout
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
        False,  # return bytes
        configuration=config,
        options=PDF_OPTIONS,
    )

    # Hard validation (VERY GOOD PRACTICE)
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
        company=company,  # ✅ now template has it
        pdf_url="",
    )
    return html_to_pdf(html)

def generate_quote_pdf(quote, company=None) -> bytes:
    company = company or {}
    html = render_template(
        "quote_pdf.html",
        quote=quote,
        company=company,
        pdf_url="",  # empty inside actual PDF response
    )
    return html_to_pdf(html)
