"""
Marketplace Fees Service for FinSage.
Handles fee capture, VAT validation, GL journal posting, and fee reversals
for marketplace charges (commission, transport, advertising, penalties, storage, refunds).
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)


def q_money(v: Any) -> Decimal:
    if v is None or v == "":
        return Decimal("0.00")
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def q_rate(v: Any) -> Decimal:
    if v is None or v == "":
        return Decimal("0.0000")
    return Decimal(str(v)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


class MarketplaceFeeService:
    """
    Dedicated service for managing and accounting for marketplace fees and charges.
    Ensures input VAT recoverability rules, order traceability, and GL posting.
    """

    def __init__(self, db_service: Any):
        self.db = db_service

    def _execute(self, func, cur=None):
        if cur is not None:
            return func(cur)
        with self.db._conn_cursor() as (_c, _cur):
            return func(_cur)

    # -------------------------------------------------------------------------
    # Create Fee Record
    # -------------------------------------------------------------------------

    def create_fee(
        self,
        company_id: int,
        payload: Dict[str, Any],
        *,
        cur=None,
    ) -> Dict[str, Any]:
        """
        Capture an individual or general marketplace fee.
        Calculates input VAT and net expense based on tax documentation flags.
        """
        company_id = int(company_id)
        schema = f"company_{company_id}"

        def _run(cursor):
            acc_ref = payload.get("marketplace_account_id") or payload.get("marketplace_code") or "MAKRO"
            from .order_service import MarketplaceOrderService
            order_svc = MarketplaceOrderService(self.db)
            account = order_svc.get_marketplace_account(company_id, acc_ref, cur=cursor)
            account_id = account["id"]

            fee_type = str(payload.get("fee_type") or "commission").strip().lower()
            allowed_types = (
                "commission", "transport", "fulfilment", "advertising",
                "storage", "penalty", "other", "refund_commission", "refund_transport"
            )
            if fee_type not in allowed_types:
                raise ValueError(f"Invalid fee_type '{fee_type}'. Must be one of {allowed_types}")

            # Fee date
            raw_date = payload.get("fee_date") or date.today()
            fee_date = raw_date.isoformat() if hasattr(raw_date, "isoformat") else str(raw_date)[:10]

            total_fee = q_money(payload.get("total_fee") or payload.get("amount") or 0.0)
            if total_fee <= 0:
                raise ValueError(f"Total fee amount must be positive, got {total_fee}")

            # VAT & Tax recoverability logic:
            # - is_taxable: Whether the charge is standard-rated (15%)
            # - is_vat_recoverable: Whether the seller possesses valid marketplace tax invoice to claim input VAT
            is_taxable = payload.get("is_taxable", True)
            is_vat_recoverable = payload.get("is_vat_recoverable", True)
            
            raw_vat_rate = payload.get("vat_rate")
            default_rate = Decimal(str(account.get("default_vat_rate") or "0.1500"))
            vat_rate = q_rate(raw_vat_rate) if raw_vat_rate is not None else default_rate

            if is_taxable and is_vat_recoverable and vat_rate > 0:
                divisor = Decimal("1.0000") + vat_rate
                amount_before_vat = q_money(total_fee / divisor)
                vat_amount = total_fee - amount_before_vat
            else:
                # If non-taxable or seller cannot claim input VAT, entire charge is expense
                amount_before_vat = total_fee
                vat_amount = Decimal("0.00")
                vat_rate = Decimal("0.0000")

            # Link to order if order reference is provided
            ext_order_num = (payload.get("external_order_number") or "").strip() or None
            order_id = payload.get("order_id")

            if not order_id and ext_order_num:
                cursor.execute(f"""
                    SELECT id FROM {schema}.marketplace_orders
                    WHERE company_id = %s AND marketplace_account_id = %s AND LOWER(external_order_number) = LOWER(%s)
                    LIMIT 1;
                """, (company_id, account_id, ext_order_num))
                ord_row = cursor.fetchone()
                if ord_row:
                    order_id = ord_row[0] if isinstance(ord_row, (tuple, list)) else ord_row.get("id")

            currency = str(payload.get("currency") or account.get("currency") or "ZAR").strip().upper()
            source_ref = (payload.get("source_reference") or "").strip() or None
            description = (payload.get("description") or f"Marketplace {fee_type} fee").strip()
            expense_acct = (payload.get("expense_account_code") or "").strip() or None
            posting_status = (payload.get("posting_status") or "draft").strip().lower()
            remit_line_id = payload.get("remittance_line_id")
            raw_payload = payload.get("raw_payload") or {}

            cursor.execute(f"""
                INSERT INTO {schema}.marketplace_fees (
                    company_id,
                    marketplace_account_id,
                    order_id,
                    external_order_number,
                    fee_type,
                    fee_date,
                    amount_before_vat,
                    vat_rate,
                    vat_amount,
                    total_fee,
                    currency,
                    source_reference,
                    description,
                    posting_status,
                    expense_account_code,
                    remittance_line_id,
                    raw_payload
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
                )
                RETURNING id;
            """, (
                company_id, account_id, order_id, ext_order_num,
                fee_type, fee_date, amount_before_vat, vat_rate, vat_amount, total_fee,
                currency, source_ref, description, posting_status, expense_acct,
                remit_line_id, self._to_json(raw_payload)
            ))
            res = cursor.fetchone()
            fee_id = res[0] if isinstance(res, (tuple, list)) else res.get("id")

            logger.info("Marketplace fee %s created (type=%s, total=%.2f, company=%s)", fee_id, fee_type, float(total_fee), company_id)
            return self.get_fee(company_id, fee_id, cur=cursor)

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Get Fee by ID
    # -------------------------------------------------------------------------

    def get_fee(
        self,
        company_id: int,
        fee_id: int,
        *,
        cur=None,
    ) -> Optional[Dict[str, Any]]:
        """Retrieve full fee details with marketplace account and journal references."""
        schema = f"company_{int(company_id)}"

        def _run(cursor):
            cursor.execute(f"""
                SELECT 
                    f.*,
                    ma.code AS marketplace_code,
                    ma.name AS marketplace_name,
                    ma.receivable_account_code,
                    j.ref AS posted_journal_ref,
                    rj.ref AS reversal_journal_ref
                FROM {schema}.marketplace_fees f
                JOIN {schema}.marketplace_accounts ma ON ma.id = f.marketplace_account_id
                LEFT JOIN {schema}.journal j ON j.id = f.posted_journal_id
                LEFT JOIN {schema}.journal rj ON rj.id = f.reversal_journal_id
                WHERE f.company_id = %s AND f.id = %s
                LIMIT 1;
            """, (company_id, int(fee_id)))
            row = cursor.fetchone()
            if not row:
                return None
            fee = dict(row)
            self._serialize_fields(fee)
            return fee

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # List & Search Fees with Pagination
    # -------------------------------------------------------------------------

    def list_fees(
        self,
        company_id: int,
        filters: Optional[Dict[str, Any]] = None,
        *,
        limit: int = 50,
        offset: int = 0,
        cur=None,
    ) -> Dict[str, Any]:
        """Search and list fees with filtering."""
        schema = f"company_{int(company_id)}"
        filters = filters or {}

        def _run(cursor):
            where_clauses = [f"f.company_id = %s"]
            params: List[Any] = [company_id]

            if filters.get("marketplace_code"):
                where_clauses.append("UPPER(ma.code) = %s")
                params.append(filters["marketplace_code"].strip().upper())

            if filters.get("fee_type"):
                where_clauses.append("f.fee_type = %s")
                params.append(filters["fee_type"].strip().lower())

            if filters.get("posting_status"):
                where_clauses.append("f.posting_status = %s")
                params.append(filters["posting_status"].strip().lower())

            if filters.get("external_order_number"):
                where_clauses.append("LOWER(f.external_order_number) = LOWER(%s)")
                params.append(filters["external_order_number"].strip())

            if filters.get("order_id"):
                where_clauses.append("f.order_id = %s")
                params.append(int(filters["order_id"]))

            if filters.get("start_date"):
                where_clauses.append("f.fee_date >= %s")
                params.append(filters["start_date"])

            if filters.get("end_date"):
                where_clauses.append("f.fee_date <= %s")
                params.append(filters["end_date"])

            search = (filters.get("search") or "").strip()
            if search:
                where_clauses.append("(f.external_order_number ILIKE %s OR f.description ILIKE %s OR f.source_reference ILIKE %s)")
                wildcard = f"%{search}%"
                params.extend([wildcard, wildcard, wildcard])

            where_sql = " AND ".join(where_clauses)

            # Count total
            cursor.execute(f"""
                SELECT COUNT(*) FROM {schema}.marketplace_fees f
                JOIN {schema}.marketplace_accounts ma ON ma.id = f.marketplace_account_id
                WHERE {where_sql};
            """, tuple(params))
            cnt_row = cursor.fetchone()
            total = cnt_row[0] if isinstance(cnt_row, (tuple, list)) else cnt_row.get("count", 0)

            # Fetch page
            fetch_sql = f"""
                SELECT 
                    f.*,
                    ma.code AS marketplace_code,
                    ma.name AS marketplace_name
                FROM {schema}.marketplace_fees f
                JOIN {schema}.marketplace_accounts ma ON ma.id = f.marketplace_account_id
                WHERE {where_sql}
                ORDER BY f.fee_date DESC, f.id DESC
                LIMIT %s OFFSET %s;
            """
            cursor.execute(fetch_sql, tuple(params + [limit, offset]))
            rows = cursor.fetchall() or []

            items = []
            for r in rows:
                item = dict(r)
                self._serialize_fields(item)
                items.append(item)

            pages = math.ceil(total / limit) if limit > 0 else 1
            return {
                "items": items,
                "pagination": {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "pages": pages,
                },
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Post Fee to General Ledger
    # -------------------------------------------------------------------------

    def post_fee_to_gl(
        self,
        company_id: int,
        fee_id: int,
        *,
        user_id: Optional[int] = None,
        cur=None,
    ) -> Dict[str, Any]:
        """
        Post a marketplace fee to the General Ledger:
          Dr Marketplace Expense (Commission / Transport / Advertising) (Net)
          Dr Input VAT (where recoverable) (VAT)
          Cr Makro Marketplace Receivable (Gross)

        Fee refunds (refund_commission / refund_transport):
          Dr Makro Marketplace Receivable (Gross)
          Cr Marketplace Expense (Net)
          Cr Input VAT (VAT)
        """
        company_id = int(company_id)
        fee_id = int(fee_id)
        schema = f"company_{company_id}"

        def _run(cursor):
            cursor.execute(f"""
                SELECT 
                    f.*,
                    ma.code AS marketplace_code,
                    ma.name AS marketplace_name,
                    ma.receivable_account_code,
                    ma.commission_expense_account_code,
                    ma.transport_expense_account_code,
                    ma.other_expense_account_code,
                    ma.vat_input_account_code
                FROM {schema}.marketplace_fees f
                JOIN {schema}.marketplace_accounts ma ON ma.id = f.marketplace_account_id
                WHERE f.company_id = %s AND f.id = %s
                FOR UPDATE;
            """, (company_id, fee_id))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Marketplace fee {fee_id} not found")

            fee = dict(row)
            if fee.get("posted_journal_id") or fee.get("posting_status") == "posted":
                logger.info("Fee %s already posted (journal_id=%s). Returning existing.", fee_id, fee.get("posted_journal_id"))
                return {
                    "action": "already_posted",
                    "fee_id": fee_id,
                    "posted_journal_id": fee.get("posted_journal_id"),
                }

            if fee.get("posting_status") in ("reversed", "cancelled"):
                raise ValueError(f"CANNOT_POST_FEE|Fee {fee_id} status is '{fee.get('posting_status')}'.")

            fee_type = fee["fee_type"]
            total_fee = float(fee["total_fee"])
            net_amt = float(fee["amount_before_vat"])
            vat_amt = float(fee["vat_amount"])
            mp_code = (fee.get("marketplace_code") or "MP").upper()
            ext_order = fee.get("external_order_number") or ""

            # Resolve expense account
            if fee.get("expense_account_code"):
                expense_acct = fee["expense_account_code"].strip()
            elif fee_type in ("commission", "refund_commission"):
                expense_acct = str(fee.get("commission_expense_account_code") or "PL_OPEX_6390").strip()
            elif fee_type in ("transport", "refund_transport"):
                expense_acct = str(fee.get("transport_expense_account_code") or "PL_OPEX_6795").strip()
            else:
                expense_acct = str(fee.get("other_expense_account_code") or "PL_OPEX_6390").strip()

            rec_acct = str(fee.get("receivable_account_code") or "BS_CA_9002").strip()
            vat_input_acct = str(fee.get("vat_input_account_code") or "BS_CA_1410").strip()

            is_refund = fee_type.startswith("refund_")
            post_date = fee["fee_date"].isoformat() if hasattr(fee["fee_date"], "isoformat") else str(fee["fee_date"])[:10]

            if not is_refund:
                # Normal fee deduction:
                # Dr Expense (net)
                # Dr Input VAT (vat)
                # Cr Marketplace Receivable (gross)
                journal_ref = f"{mp_code}-FEE-{fee_type.upper()}-{ext_order or fee_id}"
                journal_desc = f"{fee.get('description') or f'Marketplace {fee_type} fee'}"
                if ext_order:
                    journal_desc += f" (order {ext_order})"

                lines = [
                    {
                        "account_code": expense_acct,
                        "debit": net_amt,
                        "credit": 0.0,
                        "description": f"{fee_type.capitalize()} expense {ext_order}".strip(),
                    },
                    {
                        "account_code": rec_acct,
                        "debit": 0.0,
                        "credit": total_fee,
                        "description": f"Marketplace fee deduction {ext_order}".strip(),
                    },
                ]
                if vat_amt > 0:
                    lines.append({
                        "account_code": vat_input_acct,
                        "debit": vat_amt,
                        "credit": 0.0,
                        "description": f"Input VAT on {fee_type} {ext_order}".strip(),
                    })
            else:
                # Fee refund / credit:
                # Dr Marketplace Receivable (gross)
                # Cr Expense (net)
                # Cr Input VAT (vat)
                journal_ref = f"{mp_code}-FEE-REFUND-{ext_order or fee_id}"
                journal_desc = f"Marketplace fee refund: {fee_type} {ext_order}".strip()

                lines = [
                    {
                        "account_code": rec_acct,
                        "debit": total_fee,
                        "credit": 0.0,
                        "description": f"Marketplace fee refund {ext_order}".strip(),
                    },
                    {
                        "account_code": expense_acct,
                        "debit": 0.0,
                        "credit": net_amt,
                        "description": f"Reversal of {fee_type} {ext_order}".strip(),
                    },
                ]
                if vat_amt > 0:
                    lines.append({
                        "account_code": vat_input_acct,
                        "debit": 0.0,
                        "credit": vat_amt,
                        "description": f"Reversal of input VAT on {fee_type} {ext_order}".strip(),
                    })

            entry = {
                "date": post_date,
                "ref": journal_ref,
                "description": journal_desc,
                "source": "marketplace_fee",
                "source_id": fee_id,
                "gross_amount": total_fee,
                "net_amount": net_amt,
                "vat_amount": vat_amt,
                "currency": fee.get("currency") or "ZAR",
                "lines": lines,
            }

            posted_jid = self.db.post_journal(company_id, entry, cur=cursor)

            cursor.execute(f"""
                UPDATE {schema}.marketplace_fees SET
                    posting_status = 'posted',
                    posted_journal_id = %s,
                    posted_at = NOW(),
                    posted_by = %s,
                    updated_at = NOW()
                WHERE id = %s;
            """, (posted_jid, user_id, fee_id))

            logger.info("Marketplace fee %s posted to GL (journal_id=%s)", fee_id, posted_jid)
            return {
                "action": "posted",
                "fee_id": fee_id,
                "posted_journal_id": posted_jid,
                "total_fee": total_fee,
                "amount_before_vat": net_amt,
                "vat_amount": vat_amt,
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Reverse Fee Posting
    # -------------------------------------------------------------------------

    def reverse_fee_posting(
        self,
        company_id: int,
        fee_id: int,
        *,
        reason: str,
        user_id: Optional[int] = None,
        cur=None,
    ) -> Dict[str, Any]:
        """Reverse a posted marketplace fee."""
        company_id = int(company_id)
        fee_id = int(fee_id)
        schema = f"company_{company_id}"

        def _run(cursor):
            cursor.execute(f"""
                SELECT f.*, ma.code AS marketplace_code, ma.name AS marketplace_name
                FROM {schema}.marketplace_fees f
                JOIN {schema}.marketplace_accounts ma ON ma.id = f.marketplace_account_id
                WHERE f.company_id = %s AND f.id = %s
                FOR UPDATE;
            """, (company_id, fee_id))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Marketplace fee {fee_id} not found")

            fee = dict(row)
            orig_jid = fee.get("posted_journal_id")
            if not orig_jid:
                raise ValueError(f"FEE_NOT_POSTED|Fee {fee_id} has not been posted.")

            if fee.get("reversal_journal_id"):
                return {
                    "action": "already_reversed",
                    "fee_id": fee_id,
                    "reversal_journal_id": fee.get("reversal_journal_id"),
                }

            # Fetch original journal lines to invert debits and credits
            cursor.execute(f"""
                SELECT account_code, debit, credit, description
                FROM {schema}.journal_lines
                WHERE journal_id = %s
                ORDER BY line_no ASC;
            """, (int(orig_jid),))
            orig_lines = cursor.fetchall() or []
            if not orig_lines:
                raise ValueError("Original journal lines not found")

            rev_lines = []
            for l in orig_lines:
                rev_lines.append({
                    "account_code": l["account_code"],
                    "debit": float(l["credit"] or 0.0),
                    "credit": float(l["debit"] or 0.0),
                    "description": f"Reversal: {l['description']}",
                })

            today_str = date.today().isoformat()
            mp_code = (fee.get("marketplace_code") or "MP").upper()
            rev_ref = f"{mp_code}-REV-FEE-{fee_id}"

            rev_entry = {
                "date": today_str,
                "ref": rev_ref,
                "description": f"Fee reversal: fee #{fee_id} ({fee['fee_type']}) - {reason}",
                "source": "marketplace_fee_reversal",
                "source_id": fee_id,
                "gross_amount": float(fee["total_fee"]),
                "net_amount": float(fee["amount_before_vat"]),
                "vat_amount": float(fee["vat_amount"]),
                "is_reversal": True,
                "reversal_of_journal_id": int(orig_jid),
                "currency": fee.get("currency") or "ZAR",
                "lines": rev_lines,
            }

            rev_jid = self.db.post_journal(company_id, rev_entry, cur=cursor)

            cursor.execute(f"""
                UPDATE {schema}.marketplace_fees SET
                    posting_status = 'reversed',
                    reversal_journal_id = %s,
                    updated_at = NOW()
                WHERE id = %s;
            """, (rev_jid, fee_id))

            logger.info("Fee %s reversed (reversal_jid=%s)", fee_id, rev_jid)
            return {
                "action": "reversed",
                "fee_id": fee_id,
                "reversal_journal_id": rev_jid,
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Batch Post Fees
    # -------------------------------------------------------------------------

    def batch_post_fees(
        self,
        company_id: int,
        fee_ids: List[int],
        *,
        user_id: Optional[int] = None,
        cur=None,
    ) -> Dict[str, Any]:
        """Post a batch of marketplace fees."""
        results = []
        errors = []

        def _run(cursor):
            for fid in fee_ids:
                try:
                    res = self.post_fee_to_gl(company_id, fid, user_id=user_id, cur=cursor)
                    results.append(res)
                except Exception as e:
                    errors.append({
                        "fee_id": fid,
                        "error": str(e),
                    })

            return {
                "total": len(fee_ids),
                "posted_count": len(results),
                "error_count": len(errors),
                "results": results,
                "errors": errors,
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Internal Helpers
    # -------------------------------------------------------------------------

    @staticmethod
    def _to_json(val: Any) -> str:
        import json
        if isinstance(val, str):
            return val
        return json.dumps(val or {}, default=str)

    @staticmethod
    def _serialize_fields(data: Dict[str, Any]):
        for k, v in list(data.items()):
            if isinstance(v, Decimal):
                data[k] = float(v)
            elif isinstance(v, (date, datetime)):
                data[k] = v.isoformat()
