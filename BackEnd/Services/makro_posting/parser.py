"""
Makro Marketplace Remittance Advice parser.

Handles the actual text output of `pdftotext -layout` on a Makro
remittance PDF, which has this structure per line:

    OD438730228845702 01/10/2026        Sales               278.00         (41.56)         (47.15)         189.29
    100
    OD438721527907234 01/10/2026        Sales               190.00          (21.85)         (47.15)        121.00
    100
    ...
    MAK0208030        01/10/2026        Sales               210.00          (24.15)         (47.15)         138.70
    ...
    OD438753787498307 14/10/2026        Sales return       (240.00)            27.60         -             (212.40)
    ...
    Total                                                 32,224.00        (4,164.94)        (6,474.50)     21,584.56
    Payment Amount                                                                                          21,584.56

Key behaviours:

  1. Two order id formats coexist on the same remittance:
       OD438730228845702   (Makro online marketplace orders, 15 digits)
       MAK0208030          (Makro in-store / click-and-collect, 10 chars)

  2. The "100" line that appears after every OD data row is the
     Makro seller-store code; we ignore it.

  3. Negative amounts are wrapped in parentheses, e.g. "(41.56)".
     A bare "-" means zero (e.g. no transport charged on a return).

  4. The header block (Vendor SAP No, Payment Date, Payment Reference
     No, Seller ID) repeats on every page; we capture it once.

  5. The footer "Total / Payment Amount / Seller Banking Details"
     appears once, at the end of the last page.

  6. The data row regex tolerates variable whitespace between fields
     (pdftotext -layout pads columns to align them).
"""

from __future__ import annotations

import re
from datetime import date
from typing import List, Optional, Tuple

from .models import RemittanceHeader, RemittanceLine


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# A complete data row.  Captures:
#   1: order_id   (OD\d+ or MAK\d+)
#   2: date       (dd/mm/yyyy)
#   3: description ("Sales" or "Sales return")
#   4: gross      (number, possibly in parens, possibly with commas)
#   5: commission (number, possibly in parens, possibly with commas)
#   6: transport  (number, possibly in parens, possibly with commas, or "-")
#   7: net        (number, possibly in parens, possibly with commas)
_DATA_ROW_RE = re.compile(
    r"^(OD\d+|MAK\d+)\s+"                    # order id
    r"(\d{2}/\d{2}/\d{4})\s+"                # date
    r"(Sales|Sales return)\s+"               # description
    r"([\d,().\-]+)\s+"                      # gross
    r"([\d,().\-]+)\s+"                      # commission
    r"([\d,().\-]+)\s+"                      # transport
    r"([\d,().\-]+)\s*$"                     # net payment
)

# Header fields (appear inline in the pdftotext -layout output)
_VENDOR_SAP_RE = re.compile(r"Vendor SAP No\s+(\S+)")
_PAYMENT_DATE_RE = re.compile(r"Payment Date\s+(\d{2}/\d{2}/\d{4})")
_PAYMENT_REF_RE = re.compile(r"Payment Reference No\s+(\S+)")
_SELLER_ID_RE = re.compile(r"Seller ID\s*:\s*(\S+)")

# Footer totals row
_TOTAL_RE = re.compile(
    r"^Total\s+"
    r"([\d,]+\.\d{2})\s+"                   # total sales (always positive on the totals row)
    r"\(([\d,]+\.\d{2})\)\s+"               # total commission (always in parens)
    r"\(([\d,]+\.\d{2})\)\s+"               # total transport (always in parens)
    r"([\d,]+\.\d{2})\s*$"                  # total net payment
)
_PAYMENT_AMOUNT_RE = re.compile(r"^Payment Amount\s+([\d,]+\.\d{2})")

# Seller banking details
_BANK_ACCT_RE = re.compile(r"Account number:\s*(\d+)")
_BRANCH_CODE_RE = re.compile(r"Branch code:\s*(\d+)")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_amount(raw: str) -> float:
    """Convert a remittance-style amount string to a signed float.

    Handles:
      "278.00"          ->  278.00
      "(41.56)"         -> -41.56
      "1,200.00"        -> 1200.00
      "(1,200.00)"      -> -1200.00
      "-"               ->  0.00   (used when no transport charged)
    """
    s = str(raw).strip()
    if not s or s == "-":
        return 0.0

    negative = s.startswith("(") and s.endswith(")")
    if negative:
        s = s[1:-1]

    s = s.replace(",", "")
    try:
        value = float(s)
    except ValueError:
        return 0.0

    return -value if negative else value


def _parse_date_ddmmyyyy(raw: str) -> date:
    """Parse '02/11/2026' -> date(2026, 11, 2)."""
    d, m, y = raw.split("/")
    return date(int(y), int(m), int(d))


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

class RemittanceParser:
    """Stateful parser that walks the raw remittance text once."""

    def __init__(
        self,
        vendor_name: str = "PulseCart (PTY) LTD",
        marketplace_name: str = "Masstores (PTY) LTD - Makro South Africa",
        currency: str = "ZAR",
    ):
        self.vendor_name = vendor_name
        self.marketplace_name = marketplace_name
        self.currency = currency

    # ------------------------------------------------------------------ public

    def parse(self, text: str) -> Tuple[RemittanceHeader, List[RemittanceLine]]:
        """Parse the full remittance text.

        Returns (header, lines).  Raises ValueError if mandatory header
        fields or the totals row are missing, or if no order lines were
        parsed.
        """
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

        header = self._extract_header(lines)
        if header is None:
            raise ValueError(
                "Could not extract remittance header "
                "(Payment Date / Payment Reference / Seller ID / Total)."
            )

        data_lines = self._extract_data_lines(lines)
        if not data_lines:
            raise ValueError("No order lines were parsed from the remittance.")

        # Cross-check parsed line totals vs the header totals row.
        # This is informational only — the journals are driven by the
        # line items, not the totals row.  We surface the drift in the
        # header for the reconciliation step.
        parsed_gross = sum(l.gross for l in data_lines)
        parsed_commission = sum(l.commission for l in data_lines)
        parsed_transport = sum(l.transport for l in data_lines)
        parsed_net = sum(l.net_payment for l in data_lines)

        header.totals_cross_check = {
            "parsed_gross": round(parsed_gross, 2),
            "parsed_commission": round(parsed_commission, 2),
            "parsed_transport": round(parsed_transport, 2),
            "parsed_net": round(parsed_net, 2),
            "stated_total_sales": header.total_sales,
            "stated_total_commission": header.total_commission,
            "stated_total_transport": header.total_transport,
            "stated_total_net_payment": header.total_net_payment,
            "gross_drift": round(parsed_gross - header.total_sales, 2),
            "net_drift": round(parsed_net - header.total_net_payment, 2),
        }

        return header, data_lines

    # ------------------------------------------------------------------ header

    def _extract_header(self, lines: List[str]) -> Optional[RemittanceHeader]:
        vendor_sap = None
        payment_date = None
        payment_ref = None
        seller_id = None

        total_sales = total_commission = total_transport = total_net = None
        bank_acct = branch_code = None

        for ln in lines:
            if vendor_sap is None:
                m = _VENDOR_SAP_RE.search(ln)
                if m:
                    vendor_sap = m.group(1)

            if payment_date is None:
                m = _PAYMENT_DATE_RE.search(ln)
                if m:
                    payment_date = _parse_date_ddmmyyyy(m.group(1))

            if payment_ref is None:
                m = _PAYMENT_REF_RE.search(ln)
                if m:
                    payment_ref = m.group(1)

            if seller_id is None:
                m = _SELLER_ID_RE.search(ln)
                if m:
                    seller_id = m.group(1)

            # Totals row: "Total 32,224.00 (4,164.94) (6,474.50) 21,584.56"
            if total_sales is None:
                m = _TOTAL_RE.match(ln)
                if m:
                    total_sales = _parse_amount(m.group(1))
                    # Commission & transport on the totals row are shown
                    # in parens (negative).  _parse_amount already
                    # returns them as negatives.
                    total_commission = _parse_amount(m.group(2))
                    total_transport = _parse_amount(m.group(3))
                    total_net = _parse_amount(m.group(4))

            if bank_acct is None:
                m = _BANK_ACCT_RE.search(ln)
                if m:
                    bank_acct = m.group(1)

            if branch_code is None:
                m = _BRANCH_CODE_RE.search(ln)
                if m:
                    branch_code = m.group(1)

        if not (payment_date and payment_ref and seller_id and total_net is not None):
            return None

        return RemittanceHeader(
            vendor_name=self.vendor_name,
            marketplace_name=self.marketplace_name,
            vendor_sap_no=vendor_sap or "",
            payment_date=payment_date,
            payment_reference_no=payment_ref,
            seller_id=seller_id,
            total_sales=float(total_sales or 0.0),
            total_commission=float(total_commission or 0.0),
            total_transport=float(total_transport or 0.0),
            total_net_payment=float(total_net or 0.0),
            bank_account_number=bank_acct or "",
            branch_code=branch_code or "",
        )

    # ------------------------------------------------------------------ lines

    def _extract_data_lines(self, lines: List[str]) -> List[RemittanceLine]:
        """Walk the text and parse every data row."""
        out: List[RemittanceLine] = []

        for ln in lines:
            # Skip header / footer / page-chrome lines.
            if (
                _VENDOR_SAP_RE.search(ln)
                or _PAYMENT_DATE_RE.search(ln)
                or _PAYMENT_REF_RE.search(ln)
                or _SELLER_ID_RE.search(ln)
                or _TOTAL_RE.match(ln)
                or _PAYMENT_AMOUNT_RE.match(ln)
                or _BANK_ACCT_RE.search(ln)
                or _BRANCH_CODE_RE.search(ln)
            ):
                continue

            if "REMITTANCE ADVICE" in ln:
                continue
            if ln.startswith("16 Peltier Drive"):
                continue
            if "Masstores (PTY) LTD - Makro South Africa" in ln:
                continue
            if ln == "PulseCart (PTY) LTD":
                continue
            if ln.startswith("Soweto"):
                continue
            if ln == "South Africa":
                continue
            if ln.startswith("Vendor SAP No") or ln.startswith("Payment Date"):
                continue
            if ln.startswith("Payment Reference") or ln.startswith("Seller ID"):
                continue
            if ln.startswith("Order ID"):
                continue
            if ln.startswith("Sales GMV"):
                continue
            if ln.startswith("Charge"):
                continue
            if ln.startswith("Payment Amount"):
                continue
            if ln.startswith("Seller Banking Details"):
                continue
            if ln == "100":
                # The seller-store code that appears on its own line
                # after every OD data row in the pdftotext -layout
                # output.  Just ignore it.
                continue

            # Try to match a complete data row.
            m = _DATA_ROW_RE.match(ln)
            if not m:
                continue

            order_id = m.group(1)
            order_date = _parse_date_ddmmyyyy(m.group(2))
            description = m.group(3)
            gross = _parse_amount(m.group(4))
            commission = _parse_amount(m.group(5))
            transport = _parse_amount(m.group(6))
            net_payment = _parse_amount(m.group(7))

            is_return = description.lower().startswith("sales return")

            out.append(RemittanceLine(
                order_id=order_id,
                order_date=order_date,
                description=description,
                is_return=is_return,
                gross=gross,
                commission=commission,
                transport=transport,
                net_payment=net_payment,
            ))

        return out
