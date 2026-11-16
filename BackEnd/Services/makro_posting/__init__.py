"""
Makro Marketplace Posting Extension
====================================

Reads a Makro Marketplace Remittance Advice (PDF/CSV/text),
extracts every order line (Sales and Sales return), maps each one to
the seller's Chart of Accounts, generates balanced journals with the
correct VAT split, posts them through FinSage's db_service, and
reconciles the AR-Makro control account against the bank receipt.

Company scope: company_45 (PulseCart (Pty) Ltd trading on Makro).
The COA mapping is hard-coded for company_45 in coa_mapping.py.
To re-use for another company, override the mapping in
MakroCOAMapping and re-run.
"""

from .coa_mapping import MakroCOAMapping, COA_MAPPING_COMPANY_45
from .models import (
    GeneratedJournal,
    JournalLine,
    PostedJournal,
    RemittanceHeader,
    RemittanceLine,
)
from .parser import RemittanceParser
from .journal_generator import MakroJournalGenerator
from .posting_service import MakroPostingService, PostingResult
from .reconciliation import MakroReconciliation

__all__ = [
    "MakroCOAMapping",
    "COA_MAPPING_COMPANY_45",
    "GeneratedJournal",
    "JournalLine",
    "PostedJournal",
    "PostingResult",
    "RemittanceHeader",
    "RemittanceLine",
    "RemittanceParser",
    "MakroJournalGenerator",
    "MakroPostingService",
    "MakroReconciliation",
]
