"""
Marketplace Reconciliation Service for FinSage.
Handles settlement reconciliation, subledger-to-GL verification,
aging of unsettled marketplace orders, and discrepancy reporting.
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)


def money(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    return float(Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


class MarketplaceReconciliationService:
    """
    Reconciliation and audit engine for marketplace accounts.
    Guarantees that the Marketplace Receivable subledger accurately mirrors
    the General Ledger control account, and flags any remittance discrepancies.
    """

    def __init__(self, db_service: Any):
        self.db = db_service

    def _execute(self, func, cur=None):
        if cur is not None:
            return func(cur)
        with self.db._conn_cursor() as (_c, _cur):
            return func(_cur)

    # -------------------------------------------------------------------------
    # Reconcile Specific Remittance Advice
    # -------------------------------------------------------------------------

    def reconcile_remittance(
        self,
        company_id: int,
        remittance_id: int,
        *,
        cur=None,
    ) -> Dict[str, Any]:
        """
        Verify settlement reconciliation for one remittance advice:
          - Reconciles total remittance lines against matched order amounts.
          - Reconciles fee deductions against captured marketplace fees.
          - Reconciles bank receipt journal against remittance total.
          - Reports any variance.
        """
        company_id = int(company_id)
        schema = f"company_{company_id}"

        def _run(cursor):
            cursor.execute(f"""
                SELECT 
                    r.*,
                    ma.code AS marketplace_code,
                    ma.name AS marketplace_name,
                    ma.receivable_account_code,
                    j.ref AS settlement_journal_ref
                FROM {schema}.marketplace_remittances r
                JOIN {schema}.marketplace_accounts ma ON ma.id = r.marketplace_account_id
                LEFT JOIN {schema}.journal j ON j.id = r.settlement_journal_id
                WHERE r.company_id = %s AND r.id = %s
                LIMIT 1;
            """, (company_id, int(remittance_id)))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Remittance {remittance_id} not found")

            remit = dict(row)
            rec_acct = str(remit.get("receivable_account_code") or "BS_CA_9002").strip()

            # Query lines summary
            cursor.execute(f"""
                SELECT 
                    COUNT(*) AS line_count,
                    COALESCE(SUM(sales_gross), 0) AS total_gross,
                    COALESCE(SUM(commission_gross), 0) AS total_commission,
                    COALESCE(SUM(transport_gross), 0) AS total_transport,
                    COALESCE(SUM(net_amount), 0) AS total_net,
                    COUNT(CASE WHEN match_status = 'matched' THEN 1 END) AS matched_lines,
                    COUNT(CASE WHEN match_status = 'unmatched' THEN 1 END) AS unmatched_lines,
                    COUNT(CASE WHEN match_status = 'discrepancy' THEN 1 END) AS discrepancy_lines
                FROM {schema}.marketplace_remittance_lines
                WHERE remittance_id = %s;
            """, (int(remittance_id),))
            line_sum = dict(cursor.fetchone() or {})

            # Query allocations summary
            cursor.execute(f"""
                SELECT 
                    COUNT(*) AS alloc_count,
                    COALESCE(SUM(allocated_amount), 0) AS total_allocated
                FROM {schema}.marketplace_settlement_allocations
                WHERE remittance_id = %s;
            """, (int(remittance_id),))
            alloc_sum = dict(cursor.fetchone() or {})

            # GL Ledger check for this remittance's settlement journal
            settle_jid = remit.get("settlement_journal_id")
            gl_cleared = 0.0
            if settle_jid:
                cursor.execute(f"""
                    SELECT COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0) AS cleared
                    FROM {schema}.ledger
                    WHERE journal_id = %s AND account = %s;
                """, (int(settle_jid), rec_acct))
                gl_row = cursor.fetchone()
                gl_cleared = money(gl_row[0] if isinstance(gl_row, (tuple, list)) else gl_row.get("cleared", 0.0))

            expected_net = money(line_sum.get("total_net"))
            actual_payment = money(remit.get("net_payment_total"))
            total_allocated = money(alloc_sum.get("total_allocated"))
            variance = money(actual_payment - expected_net)
            allocation_variance = money(actual_payment - total_allocated)

            is_reconciled = (
                abs(variance) < 0.01 and
                abs(allocation_variance) < 0.01 and
                int(line_sum.get("unmatched_lines") or 0) == 0 and
                int(line_sum.get("discrepancy_lines") or 0) == 0
            )

            return {
                "remittance_id": remittance_id,
                "payment_reference_no": remit["payment_reference_no"],
                "payment_date": remit["payment_date"].isoformat() if hasattr(remit["payment_date"], "isoformat") else str(remit["payment_date"]),
                "is_reconciled": is_reconciled,
                "actual_net_payment": actual_payment,
                "expected_net_payment": expected_net,
                "variance": variance,
                "total_allocated": total_allocated,
                "allocation_variance": allocation_variance,
                "gl_cleared_amount": gl_cleared,
                "settlement_journal_id": settle_jid,
                "line_counts": {
                    "total": int(line_sum.get("line_count") or 0),
                    "matched": int(line_sum.get("matched_lines") or 0),
                    "unmatched": int(line_sum.get("unmatched_lines") or 0),
                    "discrepancies": int(line_sum.get("discrepancy_lines") or 0),
                },
                "breakdown": {
                    "gross_sales": money(line_sum.get("total_gross")),
                    "commission": money(line_sum.get("total_commission")),
                    "transport": money(line_sum.get("total_transport")),
                }
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Marketplace Account Subledger vs GL Reconciliation
    # -------------------------------------------------------------------------

    def reconcile_marketplace_account(
        self,
        company_id: int,
        marketplace_code: str = "MAKRO",
        *,
        as_of_date: Optional[Union[str, date]] = None,
        cur=None,
    ) -> Dict[str, Any]:
        """
        Reconcile the Marketplace Orders & Fees Subledger against the General Ledger.
          - Subledger Expected Receivable: Total Posted Sales - Total Fees - Total Settlements
          - General Ledger Balance: Net debits on receivable_account_code (e.g. BS_CA_9002)
          - Reports reconciliation status and variance.
        """
        company_id = int(company_id)
        schema = f"company_{company_id}"

        def _run(cursor):
            from .order_service import MarketplaceOrderService
            order_svc = MarketplaceOrderService(self.db)
            account = order_svc.get_marketplace_account(company_id, marketplace_code, cur=cursor)
            account_id = account["id"]
            rec_acct = str(account.get("receivable_account_code") or "BS_CA_9002").strip()

            date_filter = ""
            params: List[Any] = [company_id, account_id]
            if as_of_date:
                d_str = as_of_date.isoformat() if hasattr(as_of_date, "isoformat") else str(as_of_date)[:10]
                date_filter = " AND order_date <= %s"
                params.append(d_str)

            # 1. Total Posted Sales
            cursor.execute(f"""
                SELECT 
                    COUNT(*) AS total_orders,
                    COALESCE(SUM(gross_amount), 0) AS total_gross_sales,
                    COALESCE(SUM(net_amount), 0) AS total_net_revenue,
                    COALESCE(SUM(vat_amount), 0) AS total_output_vat
                FROM {schema}.marketplace_orders
                WHERE company_id = %s AND marketplace_account_id = %s AND order_status = 'posted'{date_filter};
            """, tuple(params))
            sales_row = cursor.fetchone() or {}
            gross_sales = money(sales_row[1] if isinstance(sales_row, (tuple, list)) else sales_row.get("total_gross_sales", 0.0))

            # 2. Total Returned Sales
            cursor.execute(f"""
                SELECT 
                    COUNT(*) AS returned_orders,
                    COALESCE(SUM(gross_amount), 0) AS total_returns
                FROM {schema}.marketplace_orders
                WHERE company_id = %s AND marketplace_account_id = %s AND order_status = 'returned'{date_filter};
            """, tuple(params))
            ret_row = cursor.fetchone() or {}
            total_returns = money(ret_row[1] if isinstance(ret_row, (tuple, list)) else ret_row.get("total_returns", 0.0))

            # 3. Total Marketplace Fees Posted
            fee_params: List[Any] = [company_id, account_id]
            fee_date_filter = ""
            if as_of_date:
                fee_date_filter = " AND fee_date <= %s"
                fee_params.append(d_str)

            cursor.execute(f"""
                SELECT 
                    COALESCE(SUM(CASE WHEN fee_type NOT LIKE 'refund_%%' THEN total_fee ELSE 0 END), 0) AS fees_deducted,
                    COALESCE(SUM(CASE WHEN fee_type LIKE 'refund_%%' THEN total_fee ELSE 0 END), 0) AS fees_refunded
                FROM {schema}.marketplace_fees
                WHERE company_id = %s AND marketplace_account_id = %s AND posting_status = 'posted'{fee_date_filter};
            """, tuple(fee_params))
            fee_row = cursor.fetchone() or {}
            fees_deducted = money(fee_row[0] if isinstance(fee_row, (tuple, list)) else fee_row.get("fees_deducted", 0.0))
            fees_refunded = money(fee_row[1] if isinstance(fee_row, (tuple, list)) else fee_row.get("fees_refunded", 0.0))
            net_fees = money(fees_deducted - fees_refunded)

            # 4. Total Settlements Received & Allocated
            cursor.execute(f"""
                SELECT COALESCE(SUM(net_payment_total), 0) AS total_settlements
                FROM {schema}.marketplace_remittances
                WHERE company_id = %s AND marketplace_account_id = %s AND status = 'settled';
            """, (company_id, account_id))
            set_row = cursor.fetchone() or {}
            total_settled = money(set_row[0] if isinstance(set_row, (tuple, list)) else set_row.get("total_settlements", 0.0))

            # Subledger Expected Receivable Balance:
            # Sales (Gross) - Returns (Gross) - Net Fees Deducted - Settlements Received
            expected_receivable_subledger = money(gross_sales - total_returns - net_fees - total_settled)

            # 5. General Ledger Control Account Balance (from company ledger)
            gl_date_filter = ""
            gl_params: List[Any] = [company_id, rec_acct]
            if as_of_date:
                gl_date_filter = " AND je_date <= %s"
                gl_params.append(d_str)

            # Query marketplace-specific GL movements
            cursor.execute(f"""
                SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS gl_balance
                FROM {schema}.ledger
                WHERE company_id = %s AND account = %s 
                  AND (source LIKE 'marketplace_%%' OR source = 'makro_marketplace'){gl_date_filter};
            """, tuple(gl_params))
            gl_row = cursor.fetchone() or {}
            marketplace_gl_balance = money(gl_row[0] if isinstance(gl_row, (tuple, list)) else gl_row.get("gl_balance", 0.0))

            # Query total GL control account balance (including any historical entries if shared)
            cursor.execute(f"""
                SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS total_gl_balance
                FROM {schema}.ledger
                WHERE company_id = %s AND account = %s{gl_date_filter};
            """, tuple(gl_params))
            tot_row = cursor.fetchone() or {}
            total_gl_balance = money(tot_row[0] if isinstance(tot_row, (tuple, list)) else tot_row.get("total_gl_balance", 0.0))

            variance = money(marketplace_gl_balance - expected_receivable_subledger)
            is_in_sync = abs(variance) < 0.01

            # 6. Ageing of Unsettled Orders
            cursor.execute(f"""
                SELECT 
                    o.id,
                    o.external_order_number,
                    o.order_date,
                    o.gross_amount,
                    o.settlement_status,
                    (CURRENT_DATE - o.order_date) AS age_days
                FROM {schema}.marketplace_orders o
                WHERE o.company_id = %s AND o.marketplace_account_id = %s 
                  AND o.order_status = 'posted' AND o.settlement_status IN ('unsettled', 'partially_settled')
                ORDER BY o.order_date ASC;
            """, (company_id, account_id))
            unsettled_rows = cursor.fetchall() or []

            aging = {
                "current_0_30": 0.0,
                "days_31_60": 0.0,
                "days_61_90": 0.0,
                "days_90_plus": 0.0,
                "unsettled_order_count": len(unsettled_rows),
            }

            for u in unsettled_rows:
                u_dict = dict(u)
                amt = float(u_dict.get("gross_amount") or 0.0)
                age = int(u_dict.get("age_days") or 0)
                if age <= 30:
                    aging["current_0_30"] = money(aging["current_0_30"] + amt)
                elif age <= 60:
                    aging["days_31_60"] = money(aging["days_31_60"] + amt)
                elif age <= 90:
                    aging["days_61_90"] = money(aging["days_61_90"] + amt)
                else:
                    aging["days_90_plus"] = money(aging["days_90_plus"] + amt)

            return {
                "marketplace_code": marketplace_code.upper(),
                "marketplace_name": account.get("name"),
                "control_account": rec_acct,
                "as_of_date": d_str if as_of_date else date.today().isoformat(),
                "is_in_sync": is_in_sync,
                "variance": variance,
                "subledger": {
                    "gross_sales": gross_sales,
                    "returns": total_returns,
                    "fees_deducted": fees_deducted,
                    "fees_refunded": fees_refunded,
                    "net_fees": net_fees,
                    "settlements_received": total_settled,
                    "expected_receivable_balance": expected_receivable_subledger,
                },
                "general_ledger": {
                    "marketplace_receivable_balance": marketplace_gl_balance,
                    "total_control_account_balance": total_gl_balance,
                },
                "aging": aging,
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Marketplace Dashboard Summary (Supports Phase 7 & 8)
    # -------------------------------------------------------------------------

    def get_dashboard_summary(
        self,
        company_id: int,
        marketplace_code: str = "MAKRO",
        *,
        cur=None,
    ) -> Dict[str, Any]:
        """
        Aggregate high-level KPIs for the Marketplace Dashboard:
          - Total orders & status breakdown
          - Gross sales & returns
          - Total fees
          - Net expected settlement vs actual settlements
          - Outstanding receivable balance
          - Unmatched remittance transactions count
        """
        company_id = int(company_id)
        schema = f"company_{company_id}"

        def _run(cursor):
            from .order_service import MarketplaceOrderService
            order_svc = MarketplaceOrderService(self.db)
            account = order_svc.get_marketplace_account(company_id, marketplace_code, cur=cursor)
            account_id = account["id"]

            # Orders breakdown
            cursor.execute(f"""
                SELECT 
                    COUNT(*) AS total_orders,
                    COUNT(CASE WHEN order_status = 'imported' THEN 1 END) AS imported_count,
                    COUNT(CASE WHEN order_status = 'approved' THEN 1 END) AS approved_count,
                    COUNT(CASE WHEN order_status = 'posted' THEN 1 END) AS posted_count,
                    COUNT(CASE WHEN order_status = 'returned' THEN 1 END) AS returned_count,
                    COUNT(CASE WHEN order_status = 'cancelled' THEN 1 END) AS cancelled_count,
                    COALESCE(SUM(CASE WHEN order_status IN ('posted', 'approved') THEN gross_amount ELSE 0 END), 0) AS total_gross_sales,
                    COALESCE(SUM(CASE WHEN order_status = 'returned' THEN gross_amount ELSE 0 END), 0) AS total_returns
                FROM {schema}.marketplace_orders
                WHERE company_id = %s AND marketplace_account_id = %s;
            """, (company_id, account_id))
            ord_row = dict(cursor.fetchone() or {})

            # Fees breakdown
            cursor.execute(f"""
                SELECT 
                    COALESCE(SUM(CASE WHEN fee_type = 'commission' THEN total_fee ELSE 0 END), 0) AS commission_total,
                    COALESCE(SUM(CASE WHEN fee_type = 'transport' THEN total_fee ELSE 0 END), 0) AS transport_total,
                    COALESCE(SUM(CASE WHEN fee_type NOT IN ('commission', 'transport') AND fee_type NOT LIKE 'refund_%%' THEN total_fee ELSE 0 END), 0) AS other_fees_total,
                    COALESCE(SUM(CASE WHEN fee_type LIKE 'refund_%%' THEN total_fee ELSE 0 END), 0) AS refunds_total,
                    COALESCE(SUM(total_fee), 0) AS all_fees_gross
                FROM {schema}.marketplace_fees
                WHERE company_id = %s AND marketplace_account_id = %s;
            """, (company_id, account_id))
            fee_row = dict(cursor.fetchone() or {})

            # Settlements breakdown
            cursor.execute(f"""
                SELECT 
                    COUNT(*) AS remittance_count,
                    COALESCE(SUM(net_payment_total), 0) AS actual_settlements_total
                FROM {schema}.marketplace_remittances
                WHERE company_id = %s AND marketplace_account_id = %s AND status = 'settled';
            """, (company_id, account_id))
            rem_row = dict(cursor.fetchone() or {})

            # Unmatched Remittance Lines
            cursor.execute(f"""
                SELECT COUNT(*) AS unmatched_count
                FROM {schema}.marketplace_remittance_lines rl
                JOIN {schema}.marketplace_remittances r ON r.id = rl.remittance_id
                WHERE r.company_id = %s AND r.marketplace_account_id = %s AND rl.match_status IN ('unmatched', 'discrepancy');
            """, (company_id, account_id))
            unmatched_cnt = cursor.fetchone()
            unmatched_count = unmatched_cnt[0] if isinstance(unmatched_cnt, (tuple, list)) else unmatched_cnt.get("unmatched_count", 0)

            # Perform subledger vs GL check
            recon = self.reconcile_marketplace_account(company_id, marketplace_code, cur=cursor)

            gross_sales = money(ord_row.get("total_gross_sales"))
            returns = money(ord_row.get("total_returns"))
            net_fees = recon["subledger"]["net_fees"]
            actual_settlements = money(rem_row.get("actual_settlements_total"))
            expected_settlement = money(gross_sales - returns - net_fees)

            return {
                "marketplace": {
                    "code": account.get("code"),
                    "name": account.get("name"),
                    "currency": account.get("currency", "ZAR"),
                },
                "kpis": {
                    "total_orders": int(ord_row.get("total_orders") or 0),
                    "gross_sales": gross_sales,
                    "returns": returns,
                    "marketplace_fees": net_fees,
                    "net_expected_settlement": expected_settlement,
                    "actual_settlements": actual_settlements,
                    "outstanding_receivable": recon["subledger"]["expected_receivable_balance"],
                    "gl_control_account_balance": recon["general_ledger"]["marketplace_receivable_balance"],
                    "total_gl_control_account_balance": recon["general_ledger"]["total_control_account_balance"],
                    "is_in_sync": recon["is_in_sync"],
                    "unmatched_remittance_lines": int(unmatched_count),
                },
                "order_statuses": {
                    "imported": int(ord_row.get("imported_count") or 0),
                    "approved": int(ord_row.get("approved_count") or 0),
                    "posted": int(ord_row.get("posted_count") or 0),
                    "returned": int(ord_row.get("returned_count") or 0),
                    "cancelled": int(ord_row.get("cancelled_count") or 0),
                },
                "aging": recon["aging"],
            }

        return self._execute(_run, cur)
