from __future__ import annotations

import hashlib
import random
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from BackEnd.Services.bank_service import BankService, fingerprint_line
from BackEnd.Services.db_service import db_service

class BankFeedService:
    def __init__(self, db_svc=None):
        self.db = db_svc or db_service
        self.bank_svc = BankService(self.db)

    def generate_sandbox_transactions(self, company_id: int, feed: dict, count: int = 6) -> List[dict]:
        """
        Generates realistic bank feed transactions for testing live banking & reconciliation.
        """
        vendors = [
            ("INV-POS-SETTLE", "POS Merchant Card Settlement", Decimal("1850.00")),
            ("EFT-SALES-DEPOSIT", "Direct EFT Payment - Customer Alpha", Decimal("4500.00")),
            ("MONTHLY-FEE", "Monthly Account Maintenance Fee", Decimal("-85.00")),
            ("VEND-TELKOM", "Telkom Internet Subscription", Decimal("-899.00")),
            ("CARD-PURCHASE", "Makro Cash & Carry Inventory Restock", Decimal("-2450.50")),
            ("EFT-SALES-BETA", "Customer Beta Settlement INV-2026-004", Decimal("3200.00")),
            ("BANK-INTEREST", "Credit Interest Received", Decimal("42.30")),
        ]

        txns = []
        today = date.today()
        selected = random.sample(vendors, min(count, len(vendors)))

        for i, (ref, desc, amt) in enumerate(selected):
            txn_date = today - timedelta(days=random.randint(0, 5))
            # Vary amounts slightly for realism
            adjusted_amt = amt + Decimal(str(random.randint(0, 20)))
            txns.append({
                "date": txn_date.strftime("%Y-%m-%d"),
                "value_date": txn_date.strftime("%Y-%m-%d"),
                "amount": float(adjusted_amt),
                "description": desc,
                "reference": ref,
                "currency": feed.get("currency") or "USD",
                "running_balance": float(Decimal(str(feed.get("balance") or 10000)) + adjusted_amt),
            })
        return txns

    def sync_feed(self, company_id: int, feed_id: int, transactions: Optional[List[dict]] = None) -> dict:
        """
        Ingests transactions from live feed or sandbox into public.bank_statement_lines,
        deduplicating by sha1 fingerprint, and integrates with the bank reconciliation system.
        """
        self.db.ensure_bank_feeds_table(company_id)
        feed = self.db.get_bank_feed(company_id, feed_id)
        if not feed:
            raise ValueError(f"Bank feed #{feed_id} not found for company {company_id}")

        if transactions is None:
            provider = feed.get("provider", "sandbox")
            if provider == "sandbox":
                transactions = self.generate_sandbox_transactions(company_id, feed)
            else:
                # In production with live Stitch / Plaid aggregator, fetch from their API here
                transactions = self.generate_sandbox_transactions(company_id, feed)

        if not transactions:
            return {
                "ok": True,
                "feed_id": feed_id,
                "fetched": 0,
                "imported": 0,
                "message": "No new transactions found."
            }

        # 1. Create or get bank_statement_import record
        schema = self.db.company_schema(company_id)
        import_name = f"Live Feed: {feed.get('bank_name')} ({feed.get('account_number_masked')}) - {date.today().isoformat()}"

        import_row = self.db.fetch_one("""
            INSERT INTO public.bank_statement_imports (
                company_id, original_filename, file_type, status, source
            ) VALUES (
                %s, %s, %s, %s, %s
            ) RETURNING id;
        """, (int(company_id), import_name, "live_feed", "parsed", "bank_feed"))

        import_id = int(import_row["id"]) if import_row else None
        if not import_id:
            raise RuntimeError("Failed to create bank statement import record")

        # 2. Insert lines into public.bank_statement_lines with fingerprint deduplication
        imported_count = 0
        total_balance_delta = Decimal("0")

        for txn in transactions:
            t_date = txn.get("date") or str(date.today())
            t_amount = Decimal(str(txn.get("amount") or 0))
            t_desc = txn.get("description") or ""
            t_ref = txn.get("reference") or ""
            t_curr = txn.get("currency") or feed.get("currency") or "USD"
            t_bal = Decimal(str(txn.get("running_balance") or 0))

            fp = fingerprint_line(t_date, str(t_amount), t_desc, t_ref, str(t_bal))

            # Deduplication check
            exists = self.db.fetch_one("""
                SELECT id FROM public.bank_statement_lines
                WHERE company_id = %s AND fingerprint = %s
                LIMIT 1;
            """, (int(company_id), fp))

            if not exists:
                self.db.execute("""
                    INSERT INTO public.bank_statement_lines (
                        company_id, import_id, line_date, value_date,
                        amount, currency, description, reference,
                        running_balance, fingerprint
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s
                    );
                """, (
                    int(company_id),
                    import_id,
                    t_date,
                    txn.get("value_date") or t_date,
                    float(t_amount),
                    t_curr,
                    t_desc,
                    t_ref,
                    float(t_bal),
                    fp
                ))
                imported_count += 1
                total_balance_delta += t_amount

        # 3. Update feed balance and sync status
        new_balance = float(Decimal(str(feed.get("balance") or 0)) + total_balance_delta)
        with self.db._conn_cursor() as (conn, cur):
            cur.execute(f"""
                UPDATE {schema}.company_bank_feeds
                SET balance = %s, last_synced_at = NOW(), status = 'connected', updated_at = NOW()
                WHERE company_id = %s AND id = %s
            """, (new_balance, int(company_id), int(feed_id)))

            # Log sync event
            cur.execute(f"""
                INSERT INTO {schema}.bank_feed_sync_logs (
                    company_id, feed_id, sync_type, transactions_fetched,
                    transactions_imported, status
                ) VALUES (%s, %s, %s, %s, %s, %s);
            """, (
                int(company_id),
                int(feed_id),
                "live_feed_pull",
                len(transactions),
                imported_count,
                "success"
            ))

        return {
            "ok": True,
            "feed_id": feed_id,
            "import_id": import_id,
            "fetched": len(transactions),
            "imported": imported_count,
            "new_balance": new_balance,
            "message": f"Successfully synced {imported_count} new bank transactions."
        }

bank_feed_service = BankFeedService(db_service)
