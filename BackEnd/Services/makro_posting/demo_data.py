"""Demo data loader for the Makro posting extension.

Loads the actual remittance text that was extracted from the attached
Makro Marketplace Remittance Advice PDF using `pdftotext -layout`.

The text file lives next to this module at:
    scripts/makro_posting/remittance_pdf_text.txt

If the file is missing, fall back to extracting it directly from the
PDF in /home/z/my-project/upload/.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_TEXT_FILE = _THIS_DIR / "remittance_pdf_text.txt"

# Fallback: extract from the user's uploaded PDF.
_UPLOAD_PDF = Path("/home/z/my-project/upload/Remittance Advice from Makro Marketplace (2).PDF")


def load_remittance_text() -> str:
    """Return the raw text of the attached Makro remittance PDF."""
    if _TEXT_FILE.exists():
        return _TEXT_FILE.read_text(encoding="utf-8")

    if _UPLOAD_PDF.exists():
        result = subprocess.run(
            ["pdftotext", "-layout", str(_UPLOAD_PDF), "-"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout

    raise FileNotFoundError(
        f"Could not find remittance text at {_TEXT_FILE} "
        f"or PDF at {_UPLOAD_PDF}."
    )
