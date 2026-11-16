"""
Posting service — the orchestrator that glues the parser, the journal
generator, and FinSage's db_service together.

Typical flow:

    text = open("remittance.txt").read()
    service = MakroPostingService(db_service, company_id=45)
    result = service.post_remittance_text(text)

`result` contains:
  - the parsed header (so you can audit)
  - every GeneratedJournal with its posted journal_id (or None if dry-run)
  - any failures (with the offending order_id)
  - a reconciliation snapshot

When `dry_run=True`, the service runs end-to-end but does NOT call
db_service.post_journal — useful for previewing the journals before
posting.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from .coa_mapping import MakroCOAMapping, COA_MAPPING_COMPANY_45
from .journal_generator import MakroJournalGenerator
from .models import GeneratedJournal, PostedJournal, RemittanceHeader, RemittanceLine
from .parser import RemittanceParser
from .reconciliation import MakroReconciliation


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------

@dataclass
class PostingResult:
    """End-to-end result of posting one remittance."""

    company_id: int
    payment_reference_no: str
    payment_date: str
    parsed_line_count: int
    sales_count: int
    return_count: int
    parsed_totals: dict
    header_info: dict = field(default_factory=dict)
    totals_cross_check: dict = field(default_factory=dict)
    posted_journals: List[PostedJournal] = field(default_factory=list)
    failed_journals: List[PostedJournal] = field(default_factory=list)
    reconciliation: Optional[dict] = None
    idempotency_hash: str = ""
    dry_run: bool = False

    @property
    def ok(self) -> bool:
        return all(pj.status in ("posted", "dry_run") for pj in self.posted_journals) \
               and not self.failed_journals

    def summary(self) -> str:
        posted = sum(1 for j in self.posted_journals if j.status == "posted")
        dry = sum(1 for j in self.posted_journals if j.status == "dry_run")
        failed = len(self.failed_journals)
        return (
            f"Remittance {self.payment_reference_no} "
            f"({self.payment_date}): "
            f"{self.parsed_line_count} lines "
            f"({self.sales_count} sales, {self.return_count} returns), "
            f"{posted} posted, {dry} dry-run, {failed} failed. "
            f"Recon: {self.reconciliation}"
        )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class MakroPostingService:
    """End-to-end posting service for a single Makro remittance."""

    def __init__(
        self,
        db_service,
        company_id: int,
        mapping: Optional[MakroCOAMapping] = None,
        actor_user_id: Optional[int] = None,
    ):
        self.db = db_service
        self.company_id = int(company_id)
        self.mapping = mapping or COA_MAPPING_COMPANY_45
        self.actor_user_id = actor_user_id

        self.parser = RemittanceParser()
        self.generator = MakroJournalGenerator(self.mapping)
        self.recon = MakroReconciliation(
            db_service=db_service,
            company_id=self.company_id,
            ar_account_code=self.mapping.ar_makro,
        )

    # ----------------------------------------------------------- public API

    def post_remittance_text(
        self,
        text: str,
        *,
        dry_run: bool = False,
    ) -> PostingResult:
        """Parse + generate + (optionally) post + reconcile."""
        header, lines = self.parser.parse(text)

        # Pre-flight: every journal must be balanced before we touch the DB.
        journals = self.generator.generate_all(header, lines)
        for j in journals:
            if not j.is_balanced():
                raise ValueError(
                    f"Unbalanced journal detected before posting: "
                    f"{j.reference}. Aborting entire batch."
                )

        result = PostingResult(
            company_id=self.company_id,
            payment_reference_no=header.payment_reference_no,
            payment_date=header.payment_date.isoformat(),
            parsed_line_count=len(lines),
            sales_count=sum(1 for l in lines if not l.is_return),
            return_count=sum(1 for l in lines if l.is_return),
            parsed_totals={
                "total_sales": header.total_sales,
                "total_commission": header.total_commission,
                "total_transport": header.total_transport,
                "total_net_payment": header.total_net_payment,
            },
            header_info={
                "vendor_name": header.vendor_name,
                "marketplace_name": header.marketplace_name,
                "vendor_sap_no": header.vendor_sap_no,
                "payment_date": header.payment_date.isoformat(),
                "payment_reference_no": header.payment_reference_no,
                "seller_id": header.seller_id,
                "bank_account_number": header.bank_account_number,
                "branch_code": header.branch_code,
                "total_sales": header.total_sales,
                "total_commission": header.total_commission,
                "total_transport": header.total_transport,
                "total_net_payment": header.total_net_payment,
            },
            totals_cross_check=header.totals_cross_check,
            idempotency_hash=self._hash_remittance(header, lines),
            dry_run=dry_run,
        )

        # Post each journal in order.
        for journal in journals:
            posted = self._post_one(journal, dry_run=dry_run)
            if posted.status == "failed":
                result.failed_journals.append(posted)
            else:
                result.posted_journals.append(posted)

        # Reconcile AR-Makro for this remittance.
        result.reconciliation = self.recon.reconcile_remittance(
            payment_reference_no=header.payment_reference_no,
            journals=result.posted_journals + result.failed_journals,
        )

        # Audit log (only when actually posted)
        if not dry_run and self.actor_user_id:
            self._audit_log(header, result)

        return result

    # ----------------------------------------------------------- internals

    def _post_one(
        self,
        journal: GeneratedJournal,
        *,
        dry_run: bool,
    ) -> PostedJournal:
        entry = journal.as_entry()

        if dry_run:
            return PostedJournal(
                reference=journal.reference,
                journal_date=journal.journal_date.isoformat(),
                description=journal.description,
                balanced=True,
                line_count=len(journal.lines),
                journal_id=None,
                status="dry_run",
                entry=entry,
            )

        try:
            journal_id = self.db.post_journal(
                self.company_id,
                entry,
            )
            status = "posted"
            error = None
        except Exception as exc:
            # Re-raise if it's a duplicate-ref error (idempotency guard)
            msg = str(exc)
            if "DUPLICATE_JOURNAL_REF" in msg or "duplicate" in msg.lower():
                raise
            journal_id = None
            status = "failed"
            error = msg

        return PostedJournal(
            reference=journal.reference,
            journal_date=journal.journal_date.isoformat(),
            description=journal.description,
            balanced=journal.is_balanced(),
            line_count=len(journal.lines),
            journal_id=journal_id,
            status=status,
            error=error,
            entry=entry if status == "failed" else None,
        )

    def _hash_remittance(
        self,
        header: RemittanceHeader,
        lines: List[RemittanceLine],
    ) -> str:
        """Stable hash of the remittance content for idempotency checks."""
        payload = {
            "payment_reference_no": header.payment_reference_no,
            "payment_date": header.payment_date.isoformat(),
            "seller_id": header.seller_id,
            "total_net_payment": header.total_net_payment,
            "lines": [
                {
                    "order_id": l.order_id,
                    "order_date": l.order_date.isoformat(),
                    "is_return": l.is_return,
                    "gross": l.gross,
                    "commission": l.commission,
                    "transport": l.transport,
                    "net_payment": l.net_payment,
                }
                for l in lines
            ],
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True).encode("utf-8")
        ).hexdigest()

    def _audit_log(self, header: RemittanceHeader, result: PostingResult):
        """Write an audit-trail entry via db_service.audit_log()."""
        try:
            self.db.audit_log(
                company_id=self.company_id,
                actor_user_id=int(self.actor_user_id or 0),
                module="makro_marketplace",
                action="post_remittance",
                severity="info",
                entity_type="makro_remittance",
                entity_id=header.payment_reference_no,
                entity_ref=header.payment_reference_no,
                amount=float(header.total_net_payment),
                currency="ZAR",
                before_json={},
                after_json={
                    "payment_date": header.payment_date.isoformat(),
                    "parsed_line_count": result.parsed_line_count,
                    "posted_count": sum(
                        1 for j in result.posted_journals if j.status == "posted"
                    ),
                    "failed_count": len(result.failed_journals),
                    "idempotency_hash": result.idempotency_hash,
                    "reconciliation": result.reconciliation,
                },
                message=(
                    f"Makro remittance {header.payment_reference_no} posted: "
                    f"{result.parsed_line_count} lines, "
                    f"net R{header.total_net_payment:.2f}."
                ),
                source="makro_posting_extension",
            )
        except Exception:
            # Audit-log failures must never break the posting flow.
            pass
