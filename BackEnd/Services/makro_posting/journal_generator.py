"""
Journal generator for the Makro Marketplace posting extension.

Given a parsed RemittanceHeader + list[RemittanceLine], produces:

  1. One journal per remittance LINE (sale or sales return) — this
     gives full audit traceability per order id and lets the AR-Makro
     control account mirror the remittance line-by-line.

  2. One bank receipt journal per REMITTANCE — ties to the Payment
     Reference No and clears the AR-Makro balance to zero.

Each line journal is balanced: sum(debits) == sum(credits).

VAT model:
  - South Africa standard rate = 15%.
  - Gross sales on Makro are VAT-inclusive (consumer prices).
  - Makro's commission and transport fees are also VAT-inclusive;
    Makro issues a tax invoice for them, so the seller can claim
    input VAT.

Idempotency:
  - Every journal reference embeds the payment_reference_no and the
    order_id (or "BANK-RECEIPT" for the receipt journal).
  - Re-posting the same remittance raises a DuplicateJournalRef error
    upstream in db_service.post_journal().
"""

from __future__ import annotations

from datetime import date
from typing import List

from .coa_mapping import MakroCOAMapping
from .models import (
    GeneratedJournal,
    JournalLine,
    RemittanceHeader,
    RemittanceLine,
)


class MakroJournalGenerator:
    """Builds FinSage-ready journal entries from parsed remittance data."""

    def __init__(
        self,
        mapping: MakroCOAMapping,
        currency: str = "USD",
    ):
        self.m = mapping
        self.vat_rate = mapping.vat_rate
        self.currency = str(currency or "USD").strip().upper()

    # ----------------------------------------------------------- public API

    def generate_line_journal(
        self,
        header: RemittanceHeader,
        line: RemittanceLine,
    ) -> GeneratedJournal:
        """Generate one journal for a single remittance line."""
        if line.is_return:
            return self._generate_return_journal(header, line)
        return self._generate_sale_journal(header, line)

    def generate_bank_receipt_journal(
        self,
        header: RemittanceHeader,
    ) -> GeneratedJournal:
        """Generate the bank receipt journal for the whole remittance.

        Posted once, using the Payment Date and Payment Reference No.
        Dr Cash & Bank / Cr AR-Makro.
        """
        net = round(header.total_net_payment, 2)
        if net <= 0:
            raise ValueError(
                f"Net payment must be positive for a bank receipt; "
                f"got {net} for remittance {header.payment_reference_no}."
            )

        ref = f"MAKRO-BANK-{header.payment_reference_no}"
        description = (
            f"Makro Marketplace settlement received. "
            f"Payment Ref {header.payment_reference_no}, "
            f"paid {header.payment_date.isoformat()} into "
            f"bank a/c {header.bank_account_number}."
        )

        return GeneratedJournal(
            journal_date=header.payment_date,
            reference=ref,
            description=description,
            currency=self.currency,
            source="makro_marketplace",
            source_id=f"BANK-{header.payment_reference_no}",
            lines=[
                JournalLine(
                    account_code=self.m.cash_bank,
                    debit=net,
                    credit=0.0,
                    description=(
                        f"Makro settlement {header.payment_reference_no}"
                    ),
                    source_id=header.payment_reference_no,
                ),
                JournalLine(
                    account_code=self.m.ar_makro,
                    debit=0.0,
                    credit=net,
                    description=(
                        f"AR-Makro cleared by bank receipt "
                        f"{header.payment_reference_no}"
                    ),
                    source_id=header.payment_reference_no,
                ),
            ],
        )

    def generate_all(
        self,
        header: RemittanceHeader,
        lines: List[RemittanceLine],
    ) -> List[GeneratedJournal]:
        """Generate every journal for a remittance in posting order.

        Order: all line journals first (chronological by order date),
        then the bank receipt journal at the end.
        """
        ordered = sorted(lines, key=lambda l: (l.order_date, l.order_id))

        out: List[GeneratedJournal] = []
        for line in ordered:
            out.append(self.generate_line_journal(header, line))

        out.append(self.generate_bank_receipt_journal(header))
        return out

    # ----------------------------------------------------------- sale journal

    def _generate_sale_journal(
        self,
        header: RemittanceHeader,
        line: RemittanceLine,
    ) -> GeneratedJournal:
        """Sale line journal.

        Makro deduction convention on a sale:
          gross       positive   (e.g. 278.00)
          commission  negative   (e.g. (41.56))
          transport   negative   (e.g. (47.15))
          net         positive   (e.g. 189.29)
        """
        gross = abs(line.gross)
        commission = abs(line.commission)   # expense amount
        transport = abs(line.transport)     # expense amount

        sales_net, sales_vat = self._split_vat(gross)
        commission_net, commission_vat = self._split_vat(commission)
        transport_net, transport_vat = self._split_vat(transport)

        deductions = commission + transport  # AR credit side

        ref = f"MAKRO-SALE-{header.payment_reference_no}-{line.order_id}"
        description = (
            f"Makro Marketplace sale. Order {line.order_id}, "
            f"{line.order_date.isoformat()}. "
            f"Gross R{gross:.2f} (net R{sales_net:.2f} + VAT R{sales_vat:.2f}), "
            f"commission R{commission:.2f}, transport R{transport:.2f}."
        )

        lines = [
            # Gross receivable from Makro (VAT-inclusive)
            JournalLine(
                account_code=self.m.ar_makro,
                debit=gross,
                description=f"AR-Makro gross sale {line.order_id}",
                source_id=line.order_id,
            ),
            # Sales revenue (net of VAT)
            JournalLine(
                account_code=self.m.sales_revenue,
                credit=sales_net,
                description=f"Sales revenue (net) {line.order_id}",
                source_id=line.order_id,
            ),
            # Output VAT on the sale
            JournalLine(
                account_code=self.m.vat_output,
                credit=sales_vat,
                description=f"Output VAT 15% {line.order_id}",
                source_id=line.order_id,
            ),
        ]

        # Commission expense (only if non-zero)
        if commission > 0:
            lines.extend([
                JournalLine(
                    account_code=self.m.commission_expense,
                    debit=commission_net,
                    description=f"Makro commission (net) {line.order_id}",
                    source_id=line.order_id,
                ),
                JournalLine(
                    account_code=self.m.vat_input,
                    debit=commission_vat,
                    description=f"Input VAT on commission {line.order_id}",
                    source_id=line.order_id,
                ),
            ])

        # Transport expense (only if non-zero)
        if transport > 0:
            lines.extend([
                JournalLine(
                    account_code=self.m.transport_expense,
                    debit=transport_net,
                    description=f"Makro transport (net) {line.order_id}",
                    source_id=line.order_id,
                ),
                JournalLine(
                    account_code=self.m.vat_input,
                    debit=transport_vat,
                    description=f"Input VAT on transport {line.order_id}",
                    source_id=line.order_id,
                ),
            ])

        # AR-Makro credit for the deductions (commission + transport)
        if deductions > 0:
            lines.append(JournalLine(
                account_code=self.m.ar_makro,
                credit=deductions,
                description=(
                    f"AR-Makro deductions (commission + transport) "
                    f"{line.order_id}"
                ),
                source_id=line.order_id,
            ))

        return GeneratedJournal(
            journal_date=line.order_date,
            reference=ref,
            description=description,
            currency=self.currency,
            lines=lines,
            source="makro_marketplace",
            source_id=line.order_id,
        )

    # ------------------------------------------------------- return journal

    def _generate_return_journal(
        self,
        header: RemittanceHeader,
        line: RemittanceLine,
    ) -> GeneratedJournal:
        """Sales return line journal.

        Makro convention on a return:
          gross       negative  (e.g. (240.00))
          commission  positive  (e.g. 27.60  — Makro refunds commission)
          transport   negative  (e.g. (47.15) — return shipping re-charged)
          net         negative  (e.g. (259.55))

        Net AR movement = -gross + commission - transport
                        = -(gross - commission + transport)
        which matches the negative net payment shown on the remittance.
        """
        gross_abs = abs(line.gross)
        commission_refund = abs(line.commission)  # positive refund
        transport_abs = abs(line.transport)       # return shipping charge

        sales_net, sales_vat = self._split_vat(gross_abs)
        commission_net, commission_vat = self._split_vat(commission_refund)
        transport_net, transport_vat = self._split_vat(transport_abs)

        ref = f"MAKRO-RETURN-{header.payment_reference_no}-{line.order_id}"
        description = (
            f"Makro Marketplace sales return. Order {line.order_id}, "
            f"{line.order_date.isoformat()}. "
            f"Gross reversed R{gross_abs:.2f} "
            f"(net R{sales_net:.2f} + VAT R{sales_vat:.2f}), "
            f"commission refunded R{commission_refund:.2f}, "
            f"return transport R{transport_abs:.2f}."
        )

        lines = [
            # Contra-revenue (Sales Returns & Allowances) — net of VAT
            JournalLine(
                account_code=self.m.sales_returns,
                debit=sales_net,
                description=f"Sales returns & allowances (net) {line.order_id}",
                source_id=line.order_id,
            ),
            # Reverse output VAT
            JournalLine(
                account_code=self.m.vat_output,
                debit=sales_vat,
                description=f"Reverse output VAT on return {line.order_id}",
                source_id=line.order_id,
            ),
            # Reduce AR-Makro by the gross return
            JournalLine(
                account_code=self.m.ar_makro,
                credit=gross_abs,
                description=f"AR-Makro gross return {line.order_id}",
                source_id=line.order_id,
            ),
        ]

        # Commission refund: AR-Makro goes up, commission expense goes down
        if commission_refund > 0:
            lines.extend([
                JournalLine(
                    account_code=self.m.ar_makro,
                    debit=commission_refund,
                    description=(
                        f"AR-Makro commission refund {line.order_id}"
                    ),
                    source_id=line.order_id,
                ),
                JournalLine(
                    account_code=self.m.commission_expense,
                    credit=commission_net,
                    description=(
                        f"Reverse commission expense (net) {line.order_id}"
                    ),
                    source_id=line.order_id,
                ),
                JournalLine(
                    account_code=self.m.vat_input,
                    credit=commission_vat,
                    description=(
                        f"Reverse input VAT on commission {line.order_id}"
                    ),
                    source_id=line.order_id,
                ),
            ])

        # Return transport: new shipping charge on the return
        if transport_abs > 0:
            lines.extend([
                JournalLine(
                    account_code=self.m.transport_expense,
                    debit=transport_net,
                    description=(
                        f"Return transport (net) {line.order_id}"
                    ),
                    source_id=line.order_id,
                ),
                JournalLine(
                    account_code=self.m.vat_input,
                    debit=transport_vat,
                    description=(
                        f"Input VAT on return transport {line.order_id}"
                    ),
                    source_id=line.order_id,
                ),
                JournalLine(
                    account_code=self.m.ar_makro,
                    credit=transport_abs,
                    description=(
                        f"AR-Makro return transport charge {line.order_id}"
                    ),
                    source_id=line.order_id,
                ),
            ])

        return GeneratedJournal(
            journal_date=line.order_date,
            reference=ref,
            description=description,
            currency=self.currency,
            lines=lines,
            source="makro_marketplace",
            source_id=line.order_id,
        )

    # ------------------------------------------------------------- helpers

    def _split_vat(self, amount_inclusive: float) -> tuple:
        """Split a VAT-inclusive amount into (net, vat)."""
        net = amount_inclusive / (1.0 + self.vat_rate)
        vat = amount_inclusive - net
        return round(net, 2), round(vat, 2)
