"""
Marketplace Posting Service for FinSage.
Handles General Ledger posting and FIFO/average-cost inventory consumption
for marketplace orders and reversals.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)


def money(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    return float(Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


class MarketplacePostingService:
    """
    Connects marketplace orders to FinSage General Ledger and inventory engines.
    Ensures strict idempotency, audit trail retention, and proper reversal handling.
    """

    def __init__(self, db_service: Any):
        self.db = db_service

    def _execute(self, func, cur=None):
        if cur is not None:
            return func(cur)
        with self.db._conn_cursor() as (_c, _cur):
            return func(_cur)

    # -------------------------------------------------------------------------
    # Post Order to GL & Inventory
    # -------------------------------------------------------------------------

    def post_order_to_gl(
        self,
        company_id: int,
        order_id: int,
        *,
        recognition_date: Optional[Union[str, date]] = None,
        enforce_approved: bool = False,
        user_id: Optional[int] = None,
        cur=None,
    ) -> Dict[str, Any]:
        """
        Post a single marketplace order to General Ledger and consume inventory.

        1. Validates order status and idempotency gate.
        2. Posts Sales Revenue journal:
           Dr Marketplace Receivable (Gross)
           Cr Sales Revenue (Net)
           Cr Output VAT (VAT)
        3. Consumes stock via existing fifo_consume() engine for tracked items.
        4. If inventory cost > 0, posts COGS journal:
           Dr Cost of Goods Sold (Cost)
           Cr Inventory (Cost)
        5. Updates order header and line costs.
        """
        company_id = int(company_id)
        order_id = int(order_id)
        schema = f"company_{company_id}"

        def _run(cursor):
            # 1. Lock order row (idempotency gate)
            cursor.execute(f"""
                SELECT 
                    o.*,
                    ma.code AS marketplace_code,
                    ma.name AS marketplace_name,
                    ma.receivable_account_code,
                    ma.sales_revenue_account_code,
                    ma.sales_returns_account_code,
                    ma.cogs_account_code,
                    ma.inventory_account_code,
                    ma.vat_output_account_code,
                    ma.vat_input_account_code
                FROM {schema}.marketplace_orders o
                JOIN {schema}.marketplace_accounts ma ON ma.id = o.marketplace_account_id
                WHERE o.company_id = %s AND o.id = %s
                FOR UPDATE;
            """, (company_id, order_id))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Marketplace order {order_id} not found for company_{company_id}")

            order = dict(row)
            order_status = (order.get("order_status") or "").strip().lower()
            ext_order_num = str(order.get("external_order_number") or "").strip()

            # Hard idempotency gate
            if order.get("posted_journal_id") or order_status == "posted":
                logger.info("Order %s already posted (journal_id=%s). Returning existing.", order_id, order.get("posted_journal_id"))
                return {
                    "action": "already_posted",
                    "order_id": order_id,
                    "external_order_number": ext_order_num,
                    "posted_journal_id": order.get("posted_journal_id"),
                    "cogs_journal_id": order.get("cogs_journal_id"),
                    "gross_amount": float(order["gross_amount"]),
                    "net_amount": float(order["net_amount"]),
                    "vat_amount": float(order["vat_amount"]),
                    "total_cost": float(order["total_cost"]),
                }

            if order_status == "cancelled":
                raise ValueError(f"CANNOT_POST_CANCELLED_ORDER|Order {order_id} ({ext_order_num}) is cancelled.")

            if enforce_approved and order_status not in ("approved", "imported"):
                raise ValueError(f"ORDER_NOT_APPROVED|Order {order_id} has status '{order_status}' and cannot be posted.")

            # 2. Determine recognition date
            if recognition_date:
                post_date = recognition_date.isoformat() if hasattr(recognition_date, "isoformat") else str(recognition_date)[:10]
            elif order.get("fulfilment_date"):
                fd = order["fulfilment_date"]
                post_date = fd.isoformat() if hasattr(fd, "isoformat") else str(fd)[:10]
            else:
                od = order["order_date"]
                post_date = od.isoformat() if hasattr(od, "isoformat") else str(od)[:10]

            gross = money(order.get("gross_amount"))
            net = money(order.get("net_amount"))
            vat = money(order.get("vat_amount"))

            # Guard against zero-gross unexpected orders
            if gross <= 0:
                raise ValueError(f"INVALID_ORDER_AMOUNT|Gross amount must be positive, got {gross}")

            # Verify balance
            if round(net + vat, 2) != gross:
                # Minor rounding adjustment to net
                net = round(gross - vat, 2)

            rec_account = str(order.get("receivable_account_code") or "BS_CA_9002").strip()
            rev_account = str(order.get("sales_revenue_account_code") or "PL_REV_4000").strip()
            vat_account = str(order.get("vat_output_account_code") or "BS_CL_2310").strip()

            mp_code = (order.get("marketplace_code") or "MP").upper()

            # 3. Build & Post Sales Revenue Journal
            sales_journal_ref = f"{mp_code}-SALE-{ext_order_num}"
            sales_entry = {
                "date": post_date,
                "ref": sales_journal_ref,
                "description": f"Marketplace sale: {order.get('marketplace_name', mp_code)} order {ext_order_num}",
                "source": "marketplace_order",
                "source_id": order_id,
                "gross_amount": gross,
                "net_amount": net,
                "vat_amount": vat,
                "currency": order.get("currency") or "ZAR",
                "lines": [
                    {
                        "account_code": rec_account,
                        "debit": gross,
                        "credit": 0.0,
                        "description": f"Marketplace receivable {ext_order_num}",
                    },
                    {
                        "account_code": rev_account,
                        "debit": 0.0,
                        "credit": net,
                        "description": f"Sales revenue {ext_order_num}",
                    },
                ]
            }

            if vat > 0:
                sales_entry["lines"].append({
                    "account_code": vat_account,
                    "debit": 0.0,
                    "credit": vat,
                    "description": f"Output VAT {ext_order_num}",
                })

            posted_journal_id = self.db.post_journal(company_id, sales_entry, cur=cursor)

            # 4. Inventory Costing & Consumption
            cursor.execute(f"""
                SELECT 
                    ol.*,
                    ii.track_stock,
                    ii.valuation_method,
                    ii.cogs_account,
                    ii.inventory_account
                FROM {schema}.marketplace_order_lines ol
                LEFT JOIN {schema}.inventory_items ii ON ii.id = ol.inventory_item_id
                WHERE ol.order_id = %s
                ORDER BY ol.line_number ASC
                FOR UPDATE OF ol;
            """, (order_id,))
            order_lines = cursor.fetchall() or []

            total_inventory_cost = 0.0
            cogs_account_default = str(order.get("cogs_account_code") or "PL_COS_5000").strip()
            inv_account_default = str(order.get("inventory_account_code") or "BS_CA_1500").strip()

            line_cogs_entries: List[Dict[str, Any]] = []

            for raw_line in order_lines:
                line = dict(raw_line)
                line_id = line["id"]
                item_id = line.get("inventory_item_id")
                qty = float(line.get("quantity") or 0.0)
                track_stock = bool(line.get("track_stock", False))
                val_method = str(line.get("valuation_method") or "FIFO").strip().upper()

                line_cost = 0.0
                unit_cost = 0.0

                if item_id and track_stock and qty > 0:
                    if val_method == "FIFO":
                        # Consume from existing FIFO layers
                        line_cost = money(self.db.fifo_consume(
                            company_id,
                            item_id=int(item_id),
                            qty_out=qty,
                            tx_date=post_date,
                            source="marketplace_order_line",
                            source_id=int(line_id),
                            posted_journal_id=int(posted_journal_id),
                            cur=cursor,
                        ))
                    else:
                        # Average cost fallback
                        cursor.execute(f"""
                            SELECT purchase_cost, sales_price FROM {schema}.inventory_items
                            WHERE company_id = %s AND id = %s LIMIT 1;
                        """, (company_id, int(item_id)))
                        item_row = cursor.fetchone()
                        avg_u_cost = float(item_row.get("purchase_cost") or 0.0) if item_row else 0.0
                        line_cost = money(qty * avg_u_cost)

                    if qty > 0 and line_cost > 0:
                        unit_cost = money(line_cost / qty)

                    # Update line cost
                    cursor.execute(f"""
                        UPDATE {schema}.marketplace_order_lines SET
                            unit_cost = %s,
                            total_cost = %s,
                            updated_at = NOW()
                        WHERE id = %s;
                    """, (unit_cost, line_cost, line_id))

                    total_inventory_cost += line_cost

                    cogs_acct = str(line.get("cogs_account") or cogs_account_default).strip()
                    inv_acct = str(line.get("inventory_account") or inv_account_default).strip()

                    line_cogs_entries.append({
                        "item_id": item_id,
                        "cogs_account": cogs_acct,
                        "inventory_account": inv_acct,
                        "cost": line_cost,
                        "description": f"COGS: {line.get('product_description') or ext_order_num}",
                    })

            # 5. Post COGS Journal if inventory cost exists
            cogs_journal_id = None
            if total_inventory_cost > 0 and line_cogs_entries:
                cogs_journal_ref = f"{mp_code}-COGS-{ext_order_num}"
                cogs_lines = []

                # Group by account to keep journal concise
                cogs_by_acct: Dict[str, float] = {}
                inv_by_acct: Dict[str, float] = {}

                for entry in line_cogs_entries:
                    cogs_by_acct[entry["cogs_account"]] = money(cogs_by_acct.get(entry["cogs_account"], 0.0) + entry["cost"])
                    inv_by_acct[entry["inventory_account"]] = money(inv_by_acct.get(entry["inventory_account"], 0.0) + entry["cost"])

                for acct, amt in cogs_by_acct.items():
                    if amt > 0:
                        cogs_lines.append({
                            "account_code": acct,
                            "debit": amt,
                            "credit": 0.0,
                            "description": f"COGS for {ext_order_num}",
                        })

                for acct, amt in inv_by_acct.items():
                    if amt > 0:
                        cogs_lines.append({
                            "account_code": acct,
                            "debit": 0.0,
                            "credit": amt,
                            "description": f"Inventory deduction {ext_order_num}",
                        })

                cogs_entry = {
                    "date": post_date,
                    "ref": cogs_journal_ref,
                    "description": f"Cost of goods sold: {order.get('marketplace_name', mp_code)} order {ext_order_num}",
                    "source": "marketplace_cogs",
                    "source_id": order_id,
                    "gross_amount": total_inventory_cost,
                    "net_amount": total_inventory_cost,
                    "vat_amount": 0.0,
                    "currency": order.get("currency") or "ZAR",
                    "lines": cogs_lines,
                }

                cogs_journal_id = self.db.post_journal(company_id, cogs_entry, cur=cursor)

            # 6. Update Marketplace Order header
            cursor.execute(f"""
                UPDATE {schema}.marketplace_orders SET
                    order_status = 'posted',
                    posted_journal_id = %s,
                    cogs_journal_id = %s,
                    total_cost = %s,
                    posted_at = NOW(),
                    posted_by = %s,
                    updated_at = NOW()
                WHERE id = %s;
            """, (posted_journal_id, cogs_journal_id, total_inventory_cost, user_id, order_id))

            logger.info(
                "Order %s (%s) posted to GL (sales_jid=%s, cogs_jid=%s, cost=%.2f)",
                order_id, ext_order_num, posted_journal_id, cogs_journal_id, total_inventory_cost
            )

            return {
                "action": "posted",
                "order_id": order_id,
                "external_order_number": ext_order_num,
                "posted_journal_id": posted_journal_id,
                "cogs_journal_id": cogs_journal_id,
                "gross_amount": gross,
                "net_amount": net,
                "vat_amount": vat,
                "total_cost": total_inventory_cost,
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Reverse Order Posting (Returns & Post-Posting Cancellations)
    # -------------------------------------------------------------------------

    def reverse_order_posting(
        self,
        company_id: int,
        order_id: int,
        *,
        reason: str,
        return_stock: bool = True,
        user_id: Optional[int] = None,
        cur=None,
    ) -> Dict[str, Any]:
        """
        Reverse a posted marketplace order.

        1. Validates that the order was actually posted.
        2. Idempotency: If already reversed, returns existing reversal journal.
        3. Posts Sales Reversal journal:
           Dr Sales Returns / Sales Revenue (Net)
           Dr Output VAT (VAT)
           Cr Makro Marketplace Receivable (Gross)
        4. If COGS was posted and return_stock is True:
           Dr Inventory (Cost)
           Cr Cost of Goods Sold (Cost)
           Adds inbound inventory layer so stock is replenished.
        5. Updates order status to 'returned' or 'cancelled'.
        """
        company_id = int(company_id)
        order_id = int(order_id)
        schema = f"company_{company_id}"

        def _run(cursor):
            cursor.execute(f"""
                SELECT 
                    o.*,
                    ma.code AS marketplace_code,
                    ma.name AS marketplace_name,
                    ma.receivable_account_code,
                    ma.sales_revenue_account_code,
                    ma.sales_returns_account_code,
                    ma.cogs_account_code,
                    ma.inventory_account_code,
                    ma.vat_output_account_code
                FROM {schema}.marketplace_orders o
                JOIN {schema}.marketplace_accounts ma ON ma.id = o.marketplace_account_id
                WHERE o.company_id = %s AND o.id = %s
                FOR UPDATE;
            """, (company_id, order_id))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Marketplace order {order_id} not found")

            order = dict(row)
            ext_order_num = str(order.get("external_order_number") or "").strip()
            orig_posted_jid = order.get("posted_journal_id")

            if not orig_posted_jid:
                raise ValueError(
                    f"ORDER_NOT_POSTED|Order {order_id} ({ext_order_num}) has not been posted to GL. Use cancel_order instead."
                )

            # Idempotency check
            if order.get("reversal_journal_id"):
                logger.info("Order %s already reversed (reversal_jid=%s). Returning existing.", order_id, order.get("reversal_journal_id"))
                return {
                    "action": "already_reversed",
                    "order_id": order_id,
                    "reversal_journal_id": order.get("reversal_journal_id"),
                }

            today_str = date.today().isoformat()
            gross = money(order.get("gross_amount"))
            net = money(order.get("net_amount"))
            vat = money(order.get("vat_amount"))
            mp_code = (order.get("marketplace_code") or "MP").upper()

            rec_account = str(order.get("receivable_account_code") or "BS_CA_9002").strip()
            
            # Prefer valid sales returns contra-revenue account if configured, else original revenue account
            rev_account = str(order.get("sales_revenue_account_code") or "PL_REV_4000").strip()
            configured_returns = str(order.get("sales_returns_account_code") or "").strip()
            if configured_returns and not ("_" in configured_returns and len(configured_returns.split("_")[1]) > 4):
                returns_account = configured_returns
            else:
                returns_account = rev_account
            vat_account = str(order.get("vat_output_account_code") or "BS_CL_2310").strip()

            # 1. Post Sales Reversal Journal
            rev_sales_ref = f"{mp_code}-REV-{ext_order_num}"
            rev_sales_entry = {
                "date": today_str,
                "ref": rev_sales_ref,
                "description": f"Reversal/Return: {order.get('marketplace_name', mp_code)} order {ext_order_num} - {reason}",
                "source": "marketplace_order_reversal",
                "source_id": order_id,
                "gross_amount": gross,
                "net_amount": net,
                "vat_amount": vat,
                "is_reversal": True,
                "reversal_of_journal_id": int(orig_posted_jid),
                "currency": order.get("currency") or "ZAR",
                "lines": [
                    {
                        "account_code": returns_account,
                        "debit": net,
                        "credit": 0.0,
                        "description": f"Sales return {ext_order_num}",
                    },
                    {
                        "account_code": rec_account,
                        "debit": 0.0,
                        "credit": gross,
                        "description": f"Clear receivable for return {ext_order_num}",
                    },
                ]
            }

            if vat > 0:
                rev_sales_entry["lines"].append({
                    "account_code": vat_account,
                    "debit": vat,
                    "credit": 0.0,
                    "description": f"Reverse output VAT {ext_order_num}",
                })

            rev_sales_jid = self.db.post_journal(company_id, rev_sales_entry, cur=cursor)

            # 2. Reverse COGS if applicable
            orig_cogs_jid = order.get("cogs_journal_id")
            rev_cogs_jid = None
            total_cost = money(order.get("total_cost"))

            if orig_cogs_jid and total_cost > 0 and return_stock:
                cogs_acct = str(order.get("cogs_account_code") or "PL_COS_5000").strip()
                inv_acct = str(order.get("inventory_account_code") or "BS_CA_1500").strip()

                rev_cogs_ref = f"{mp_code}-REV-COGS-{ext_order_num}"
                rev_cogs_entry = {
                    "date": today_str,
                    "ref": rev_cogs_ref,
                    "description": f"Restore stock: {order.get('marketplace_name', mp_code)} order {ext_order_num} - {reason}",
                    "source": "marketplace_cogs_reversal",
                    "source_id": order_id,
                    "gross_amount": total_cost,
                    "net_amount": total_cost,
                    "vat_amount": 0.0,
                    "is_reversal": True,
                    "reversal_of_journal_id": int(orig_cogs_jid),
                    "currency": order.get("currency") or "ZAR",
                    "lines": [
                        {
                            "account_code": inv_acct,
                            "debit": total_cost,
                            "credit": 0.0,
                            "description": f"Restore inventory {ext_order_num}",
                        },
                        {
                            "account_code": cogs_acct,
                            "debit": 0.0,
                            "credit": total_cost,
                            "description": f"Reverse COGS {ext_order_num}",
                        },
                    ]
                }
                rev_cogs_jid = self.db.post_journal(company_id, rev_cogs_entry, cur=cursor)

                # Replenish inventory layers
                cursor.execute(f"""
                    SELECT ol.inventory_item_id, ol.quantity, ol.unit_cost
                    FROM {schema}.marketplace_order_lines ol
                    JOIN {schema}.inventory_items ii ON ii.id = ol.inventory_item_id
                    WHERE ol.order_id = %s AND ii.track_stock = TRUE;
                """, (order_id,))
                for line_item in cursor.fetchall() or []:
                    it_id = line_item["inventory_item_id"]
                    it_qty = float(line_item["quantity"] or 0)
                    it_cost = float(line_item["unit_cost"] or 0)
                    if it_qty > 0:
                        cursor.execute(f"""
                            INSERT INTO {schema}.inventory_layers (
                                company_id, item_id, tx_date, qty_in, qty_out, unit_cost,
                                ref, source, source_id, posted_journal_id
                            ) VALUES (
                                %s, %s, %s, %s, 0, %s,
                                %s, 'marketplace_return', %s, %s
                            );
                        """, (
                            company_id, it_id, today_str, it_qty, it_cost,
                            f"RETURN-{ext_order_num}", order_id, rev_cogs_jid
                        ))

            # 3. Update order record
            cursor.execute(f"""
                UPDATE {schema}.marketplace_orders SET
                    order_status = 'returned',
                    reversal_journal_id = %s,
                    cancelled_at = NOW(),
                    cancelled_by = %s,
                    cancellation_reason = %s,
                    updated_at = NOW()
                WHERE id = %s;
            """, (rev_sales_jid, user_id, reason, order_id))

            logger.info("Order %s reversed (rev_sales_jid=%s, rev_cogs_jid=%s)", order_id, rev_sales_jid, rev_cogs_jid)
            return {
                "action": "reversed",
                "order_id": order_id,
                "reversal_journal_id": rev_sales_jid,
                "reversal_cogs_journal_id": rev_cogs_jid,
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Batch Post Orders
    # -------------------------------------------------------------------------

    def batch_post_orders(
        self,
        company_id: int,
        order_ids: List[int],
        *,
        recognition_date: Optional[Union[str, date]] = None,
        user_id: Optional[int] = None,
        cur=None,
    ) -> Dict[str, Any]:
        """Post a batch of approved marketplace orders."""
        results = []
        errors = []

        def _run(cursor):
            for oid in order_ids:
                try:
                    res = self.post_order_to_gl(
                        company_id,
                        oid,
                        recognition_date=recognition_date,
                        user_id=user_id,
                        cur=cursor,
                    )
                    results.append(res)
                except Exception as e:
                    errors.append({
                        "order_id": oid,
                        "error": str(e),
                    })

            return {
                "total": len(order_ids),
                "posted_count": len(results),
                "error_count": len(errors),
                "results": results,
                "errors": errors,
            }

        return self._execute(_run, cur)
