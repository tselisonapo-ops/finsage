"""
Marketplace Remittance Integration Service for FinSage.
Matches parsed remittance lines (from Makro and other marketplaces) against
existing Marketplace Orders and Fees.
Posts the bank settlement journal and records exact allocations per order,
preventing duplicate sales and duplicate expense entries.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)


def money(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    return float(Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


class MarketplaceRemittanceService:
    """
    Orchestrates the matching of marketplace remittances to orders and fees.
    Posts the settlement journal to clear Marketplace Receivable against Cash/Bank.
    """

    def __init__(self, db_service: Any):
        self.db = db_service

    def _execute(self, func, cur=None):
        if cur is not None:
            return func(cur)
        with self.db._conn_cursor() as (_c, _cur):
            return func(_cur)

    # -------------------------------------------------------------------------
    # Process Remittance Advice
    # -------------------------------------------------------------------------

    def process_remittance(
        self,
        company_id: int,
        remittance_input: Union[str, Tuple[Any, List[Any]]],
        *,
        marketplace_code: str = "MAKRO",
        auto_capture_fees: bool = True,
        auto_post_unposted_orders: bool = True,
        bank_account_code: Optional[str] = None,
        vat_mode: str = "standard",
        dry_run: bool = False,
        user_id: Optional[int] = None,
        cur=None,
    ) -> Dict[str, Any]:
        """
        Process a Makro remittance advice:
          1. Parses the statement if text is supplied.
          2. Idempotency gate: Verifies if remittance is already settled.
          3. Matches each order line to existing marketplace_orders.
          4. Captures and posts commission and transport fees into marketplace_fees.
          5. Flags any discrepancies (missing orders, amount variances).
          6. Posts Bank Settlement journal:
             Dr Bank / Cr Makro Marketplace Receivable.
          7. Allocates settlement amounts to individual orders and fees.
        """
        company_id = int(company_id)
        schema = f"company_{company_id}"

        # 1. Parse or unpack header and lines
        if isinstance(remittance_input, str):
            from BackEnd.Services.makro_posting.parser import RemittanceParser
            parser = RemittanceParser()
            header, lines = parser.parse(remittance_input)
        else:
            header, lines = remittance_input

        # Compute stable hash
        idempotency_payload = {
            "payment_reference_no": header.payment_reference_no,
            "payment_date": header.payment_date.isoformat(),
            "seller_id": header.seller_id,
            "total_net_payment": float(header.total_net_payment),
            "line_count": len(lines),
        }
        idempotency_hash = hashlib.sha256(
            json.dumps(idempotency_payload, sort_keys=True).encode("utf-8")
        ).hexdigest()

        def _run(cursor):
            from .order_service import MarketplaceOrderService
            from .posting_service import MarketplacePostingService
            from .fee_service import MarketplaceFeeService

            # Determine VAT treatment from vat_mode
            vmode = str(vat_mode or "standard").lower().strip()
            if vmode in ("zero_rated", "zero", "0%"):
                fee_is_taxable = False
                fee_is_vat_recoverable = False
            elif vmode in ("non_recoverable", "exempt", "exempt_input"):
                fee_is_taxable = True
                fee_is_vat_recoverable = False
            else:  # standard (15% VAT recoverable)
                fee_is_taxable = True
                fee_is_vat_recoverable = True

            order_svc = MarketplaceOrderService(self.db)
            posting_svc = MarketplacePostingService(self.db)
            fee_svc = MarketplaceFeeService(self.db)

            account = order_svc.get_marketplace_account(company_id, marketplace_code, cur=cursor)
            account_id = account["id"]
            mp_code = (account.get("code") or "MAKRO").upper()

            rec_account = str(account.get("receivable_account_code") or "BS_CA_9002").strip()
            bank_account = str(bank_account_code or account.get("cash_bank_account_code") or "BS_CA_1000").strip()

            payment_ref = str(header.payment_reference_no).strip()
            payment_date_str = header.payment_date.isoformat()

            # 2. Check for existing remittance
            cursor.execute(f"""
                SELECT id, status, settlement_journal_id, idempotency_hash
                FROM {schema}.marketplace_remittances
                WHERE company_id = %s AND marketplace_account_id = %s AND payment_reference_no = %s
                LIMIT 1
                FOR UPDATE;
            """, (company_id, account_id, payment_ref))
            existing_remit = cursor.fetchone()

            if existing_remit:
                ex_dict = dict(existing_remit)
                if ex_dict.get("status") == "settled" and ex_dict.get("settlement_journal_id"):
                    logger.info("Remittance %s already settled (journal_id=%s).", payment_ref, ex_dict["settlement_journal_id"])
                    return {
                        "action": "already_settled",
                        "remittance_id": ex_dict["id"],
                        "settlement_journal_id": ex_dict["settlement_journal_id"],
                        "payment_reference_no": payment_ref,
                        "payment_date": payment_date_str,
                        "total_net_payment": float(header.total_net_payment),
                    }
                remittance_id = ex_dict["id"]
            else:
                cursor.execute(f"""
                    INSERT INTO {schema}.marketplace_remittances (
                        company_id,
                        marketplace_account_id,
                        payment_reference_no,
                        payment_date,
                        currency,
                        sales_total,
                        returns_total,
                        commission_total,
                        transport_total,
                        net_payment_total,
                        status,
                        idempotency_hash,
                        parsed_payload
                    ) VALUES (
                        %s, %s, %s, %s, 'ZAR',
                        %s, %s, %s, %s, %s,
                        'imported', %s, %s::jsonb
                    )
                    RETURNING id;
                """, (
                    company_id, account_id, payment_ref, payment_date_str,
                    money(header.total_sales),
                    0.0,
                    money(header.total_commission),
                    money(header.total_transport),
                    money(header.total_net_payment),
                    idempotency_hash,
                    json.dumps(idempotency_payload)
                ))
                res = cursor.fetchone()
                remittance_id = res[0] if isinstance(res, (tuple, list)) else res.get("id")

            # 3. Match each line against Marketplace Orders & Fees
            matched_orders = []
            unmatched_lines = []
            discrepancies = []
            processed_lines = []

            for line_idx, line in enumerate(lines, start=1):
                ext_order_num = str(line.order_id).strip()
                gross = money(line.gross)
                comm = money(abs(line.commission))
                trans = money(abs(line.transport))
                net = money(line.net_payment)
                line_date_str = line.order_date.isoformat()

                # Look up order in marketplace_orders
                cursor.execute(f"""
                    SELECT id, order_status, gross_amount, net_amount, vat_amount, posted_journal_id
                    FROM {schema}.marketplace_orders
                    WHERE company_id = %s AND marketplace_account_id = %s AND LOWER(external_order_number) = LOWER(%s)
                    LIMIT 1
                    FOR UPDATE;
                """, (company_id, account_id, ext_order_num))
                ord_row = cursor.fetchone()

                matched_order_id = None
                match_status = "unmatched"
                discrepancy_info = {}

                if ord_row:
                    matched_order = dict(ord_row)
                    matched_order_id = matched_order["id"]
                    expected_gross = money(matched_order["gross_amount"])

                    # Amount check
                    if abs(gross) == expected_gross:
                        match_status = "matched"
                    else:
                        match_status = "discrepancy"
                        discrepancy_info = {
                            "type": "gross_variance",
                            "expected_gross": expected_gross,
                            "remitted_gross": gross,
                            "variance": money(gross - expected_gross),
                        }
                        discrepancies.append({
                            "external_order_number": ext_order_num,
                            **discrepancy_info
                        })

                    # If order is unposted and auto_post is enabled, post order to GL
                    if auto_post_unposted_orders and not matched_order.get("posted_journal_id"):
                        if not dry_run:
                            try:
                                posting_svc.post_order_to_gl(company_id, matched_order_id, user_id=user_id, cur=cursor)
                            except Exception as e:
                                logger.warning("Could not auto-post order %s: %s", ext_order_num, e)

                    matched_orders.append({
                        "order_id": matched_order_id,
                        "external_order_number": ext_order_num,
                        "net_payment": net,
                        "is_return": line.is_return,
                    })

                else:
                    match_status = "unmatched"
                    discrepancy_info = {
                        "type": "order_not_found",
                        "external_order_number": ext_order_num,
                        "remitted_gross": gross,
                    }
                    unmatched_lines.append(discrepancy_info)

                # Capture / ensure Marketplace Fees for commission and transport
                if auto_capture_fees and not dry_run:
                    if comm > 0:
                        fee_type = "refund_commission" if line.is_return else "commission"
                        comm_fee = fee_svc.create_fee(
                            company_id,
                            {
                                "marketplace_account_id": account_id,
                                "external_order_number": ext_order_num,
                                "order_id": matched_order_id,
                                "fee_type": fee_type,
                                "fee_date": line_date_str,
                                "total_fee": comm,
                                "is_taxable": fee_is_taxable,
                                "is_vat_recoverable": fee_is_vat_recoverable,
                                "source_reference": payment_ref,
                                "description": f"Makro {fee_type} deduction for order {ext_order_num}",
                                "remittance_line_id": line_idx,
                            },
                            cur=cursor,
                        )
                        fee_svc.post_fee_to_gl(company_id, comm_fee["id"], cur=cursor)

                    if trans > 0:
                        fee_type = "refund_transport" if line.is_return else "transport"
                        trans_fee = fee_svc.create_fee(
                            company_id,
                            {
                                "marketplace_account_id": account_id,
                                "external_order_number": ext_order_num,
                                "order_id": matched_order_id,
                                "fee_type": fee_type,
                                "fee_date": line_date_str,
                                "total_fee": trans,
                                "is_taxable": fee_is_taxable,
                                "is_vat_recoverable": fee_is_vat_recoverable,
                                "source_reference": payment_ref,
                                "description": f"Makro {fee_type} deduction for order {ext_order_num}",
                                "remittance_line_id": line_idx,
                            },
                            cur=cursor,
                        )
                        fee_svc.post_fee_to_gl(company_id, trans_fee["id"], cur=cursor)

                # Insert remittance line record
                cursor.execute(f"""
                    INSERT INTO {schema}.marketplace_remittance_lines (
                        company_id,
                        remittance_id,
                        line_number,
                        line_type,
                        external_order_number,
                        order_date,
                        sales_gross,
                        sales_net,
                        sales_vat,
                        commission_gross,
                        transport_gross,
                        net_amount,
                        matched_order_id,
                        match_status,
                        discrepancy_details
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s,
                        %s, 0, 0,
                        %s, %s, %s,
                        %s, %s, %s::jsonb
                    )
                    ON CONFLICT (remittance_id, line_number) DO UPDATE SET
                        matched_order_id = EXCLUDED.matched_order_id,
                        match_status = EXCLUDED.match_status,
                        discrepancy_details = EXCLUDED.discrepancy_details,
                        updated_at = NOW();
                """, (
                    company_id, remittance_id, line_idx,
                    "return" if line.is_return else "sale",
                    ext_order_num, line_date_str,
                    gross, comm, trans, net,
                    matched_order_id, match_status,
                    json.dumps(discrepancy_info)
                ))

                processed_lines.append({
                    "line_number": line_idx,
                    "external_order_number": ext_order_num,
                    "gross": gross,
                    "commission": comm,
                    "transport": trans,
                    "net": net,
                    "match_status": match_status,
                    "matched_order_id": matched_order_id,
                })

            # 4. Bank Settlement Journal (Clears Makro Marketplace Receivable)
            total_net = money(header.total_net_payment)
            settlement_journal_id = None

            if not dry_run and total_net > 0:
                settle_ref = f"{mp_code}-SETTLE-{payment_ref}"
                settle_desc = f"Marketplace bank settlement: {header.marketplace_name} ref {payment_ref}"

                settle_entry = {
                    "date": payment_date_str,
                    "ref": settle_ref,
                    "description": settle_desc,
                    "source": "marketplace_settlement",
                    "source_id": remittance_id,
                    "gross_amount": total_net,
                    "net_amount": total_net,
                    "vat_amount": 0.0,
                    "currency": "ZAR",
                    "lines": [
                        {
                            "account_code": bank_account,
                            "debit": total_net,
                            "credit": 0.0,
                            "description": f"Bank settlement receipt ref {payment_ref}",
                        },
                        {
                            "account_code": rec_account,
                            "debit": 0.0,
                            "credit": total_net,
                            "description": f"Clear marketplace receivable ref {payment_ref}",
                        },
                    ]
                }

                settlement_journal_id = self.db.post_journal(company_id, settle_entry, cur=cursor)

                # 5. Record Settlement Allocations
                for mo in matched_orders:
                    alloc_amt = mo["net_payment"]
                    cursor.execute(f"""
                        INSERT INTO {schema}.marketplace_settlement_allocations (
                            company_id,
                            remittance_id,
                            settlement_journal_id,
                            order_id,
                            allocation_type,
                            allocated_amount
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s
                        );
                    """, (
                        company_id, remittance_id, settlement_journal_id,
                        mo["order_id"],
                        "order_return" if mo["is_return"] else "order_gross",
                        alloc_amt
                    ))

                    # Update order settlement status
                    cursor.execute(f"""
                        UPDATE {schema}.marketplace_orders SET
                            settlement_status = 'settled',
                            updated_at = NOW()
                        WHERE id = %s;
                    """, (mo["order_id"],))

                # Update remittance header
                cursor.execute(f"""
                    UPDATE {schema}.marketplace_remittances SET
                        status = 'settled',
                        settlement_journal_id = %s,
                        updated_at = NOW()
                    WHERE id = %s;
                """, (settlement_journal_id, remittance_id))

            logger.info(
                "Processed remittance %s for company_%s: matched=%s, unmatched=%s, discrepancies=%s, settle_jid=%s",
                payment_ref, company_id, len(matched_orders), len(unmatched_lines), len(discrepancies), settlement_journal_id
            )

            return {
                "action": "settled" if not dry_run else "dry_run",
                "remittance_id": remittance_id,
                "payment_reference_no": payment_ref,
                "payment_date": payment_date_str,
                "vat_mode": vmode,
                "total_net_payment": total_net,
                "total_lines": len(lines),
                "matched_count": len(matched_orders),
                "unmatched_count": len(unmatched_lines),
                "discrepancy_count": len(discrepancies),
                "settlement_journal_id": settlement_journal_id,
                "discrepancies": discrepancies,
                "unmatched_lines": unmatched_lines,
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Get Remittance Details & Allocations
    # -------------------------------------------------------------------------

    def get_remittance(
        self,
        company_id: int,
        remittance_id: int,
        *,
        cur=None,
    ) -> Optional[Dict[str, Any]]:
        """Retrieve complete remittance header, lines, allocations, and journal."""
        schema = f"company_{int(company_id)}"

        def _run(cursor):
            cursor.execute(f"""
                SELECT 
                    r.*,
                    ma.code AS marketplace_code,
                    ma.name AS marketplace_name,
                    j.ref AS settlement_journal_ref
                FROM {schema}.marketplace_remittances r
                JOIN {schema}.marketplace_accounts ma ON ma.id = r.marketplace_account_id
                LEFT JOIN {schema}.journal j ON j.id = r.settlement_journal_id
                WHERE r.company_id = %s AND r.id = %s
                LIMIT 1;
            """, (company_id, int(remittance_id)))
            row = cursor.fetchone()
            if not row:
                return None
            remit = dict(row)
            self._serialize_fields(remit)

            # Fetch lines
            cursor.execute(f"""
                SELECT rl.*, o.external_order_number AS linked_order_ref
                FROM {schema}.marketplace_remittance_lines rl
                LEFT JOIN {schema}.marketplace_orders o ON o.id = rl.matched_order_id
                WHERE rl.remittance_id = %s
                ORDER BY rl.line_number ASC;
            """, (int(remittance_id),))
            remit["lines"] = [dict(lr) for lr in cursor.fetchall() or []]
            for l in remit["lines"]:
                self._serialize_fields(l)

            # Fetch allocations
            cursor.execute(f"""
                SELECT a.*, o.external_order_number
                FROM {schema}.marketplace_settlement_allocations a
                LEFT JOIN {schema}.marketplace_orders o ON o.id = a.order_id
                WHERE a.remittance_id = %s
                ORDER BY a.id ASC;
            """, (int(remittance_id),))
            remit["allocations"] = [dict(ar) for ar in cursor.fetchall() or []]
            for a in remit["allocations"]:
                self._serialize_fields(a)

            return remit

        return self._execute(_run, cur)

    @staticmethod
    def _serialize_fields(data: Dict[str, Any]):
        for k, v in list(data.items()):
            if isinstance(v, Decimal):
                data[k] = float(v)
            elif isinstance(v, (date, datetime)):
                data[k] = v.isoformat()
