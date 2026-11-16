"""Data classes used by the Makro posting extension."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional


@dataclass
class RemittanceHeader:
    """Header block of a Makro Marketplace Remittance Advice."""

    vendor_name: str                      # e.g. "PulseCart (PTY) LTD"
    marketplace_name: str                 # e.g. "Masstores (PTY) LTD - Makro South Africa"
    vendor_sap_no: str                    # e.g. "226412"
    payment_date: date                    # when Makro paid the seller
    payment_reference_no: str             # bank statement reference
    seller_id: str                        # Makro seller id

    # Footer totals (from the remittance)
    total_sales: float                    # 32,224.00
    total_commission: float               # 4,164.94 (shown on remittance as positive deduction total)
    total_transport: float                # 6,474.50
    total_net_payment: float              # 21,584.56

    # Seller bank account
    bank_account_number: str
    branch_code: str

    # Populated by the parser after the lines have been parsed.
    # Compares the sum of parsed line items to the totals row.
    totals_cross_check: dict = field(default_factory=dict)


@dataclass
class RemittanceLine:
    """One order line on a Makro remittance.

    All amounts are SIGNED using the remittance's own convention:

      Sales line:
        gross       > 0       (positive)
        commission  < 0       (negative, in parentheses on the PDF)
        transport   < 0       (negative, in parentheses on the PDF)
        net_payment > 0       (positive)

      Sales return line:
        gross       < 0       (negative, in parentheses)
        commission  > 0       (positive, Makro refunds commission)
        transport   < 0       (negative, Makro re-charges return shipping)
        net_payment < 0       (negative, in parentheses)
    """

    order_id: str
    order_date: date
    description: str                      # "Sales" or "Sales return"
    is_return: bool
    gross: float                          # signed
    commission: float                     # signed
    transport: float                      # signed
    net_payment: float                    # signed

    @property
    def line_type(self) -> str:
        return "sales_return" if self.is_return else "sales"

    def describe(self) -> str:
        sign = "RETURN" if self.is_return else "SALE"
        return (
            f"{sign} {self.order_id} {self.order_date.isoformat()} "
            f"gross={self.gross:.2f} commission={self.commission:.2f} "
            f"transport={self.transport:.2f} net={self.net_payment:.2f}"
        )


@dataclass
class JournalLine:
    """One leg of a FinSage journal entry."""

    account_code: str
    debit: float = 0.0
    credit: float = 0.0
    description: str = ""
    source: str = "makro_marketplace"
    source_id: Optional[str] = None       # order_id
    module_name: str = "makro_marketplace"

    def as_dict(self) -> dict:
        return {
            "account_code": self.account_code,
            "debit": round(float(self.debit), 2),
            "credit": round(float(self.credit), 2),
            "description": self.description,
            "source": self.source,
            "source_id": self.source_id,
            "module_name": self.module_name,
        }


@dataclass
class GeneratedJournal:
    """A complete generated journal (header + lines), ready for posting."""

    journal_date: date
    reference: str
    description: str
    currency: str
    lines: List[JournalLine] = field(default_factory=list)
    source: str = "makro_marketplace"
    source_id: Optional[str] = None       # payment_reference_no or batch id

    def as_entry(self) -> dict:
        """Convert to the dict shape expected by db_service.post_journal()."""
        return {
            "date": self.journal_date.isoformat(),
            "ref": self.reference,
            "description": self.description,
            "currency": self.currency,
            "source": self.source,
            "source_id": self.source_id,
            "lines": [ln.as_dict() for ln in self.lines],
        }

    def is_balanced(self) -> bool:
        debits = sum(ln.debit for ln in self.lines)
        credits = sum(ln.credit for ln in self.lines)
        return abs(debits - credits) < 0.005


@dataclass
class PostedJournal:
    """One journal's outcome after posting (or dry-run)."""

    reference: str
    journal_date: str
    description: str
    balanced: bool
    line_count: int
    journal_id: Optional[int]            # None if dry-run or failed
    status: str                          # "posted" | "dry_run" | "failed"
    error: Optional[str] = None
    entry: Optional[dict] = None         # full entry payload (for audit)
