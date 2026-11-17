"""
Reconciliation for the Makro posting extension.

After every line journal + the bank receipt journal have been posted
for one remittance, the AR-Makro control account must net to zero for
that remittance's journals.  This module computes that net and reports
any drift.

Two reconciliation modes are supported:

  1. In-memory reconciliation (used by dry-runs and by the demo):
     Sum the debits/credits on AR-Makro across every journal generated
     for this remittance, ignoring the DB entirely.  Should net to 0.

  2. Live DB reconciliation (used when actually posted):
     Query company_<id>.ledger for rows where
     `account = ar_account_code` AND the journal's `source_id` =
     payment_reference_no, and compare the ledger total to the
     expected net.
"""

from __future__ import annotations

from typing import List, Optional

from .models import GeneratedJournal, PostedJournal


class MakroReconciliation:
    """AR-Makro clearing reconciliation for one remittance."""

    def __init__(
        self,
        db_service,
        company_id: int,
        ar_account_code: str,
    ):
        self.db = db_service
        self.company_id = int(company_id)
        self.ar_account_code = ar_account_code

    # ----------------------------------------------------------- in-memory

    def reconcile_remittance(
        self,
        payment_reference_no: str,
        journals: List[PostedJournal],
    ) -> dict:
        """Compute the in-memory AR-Makro net for this remittance.

        Sums every debit/credit on the AR-Makro account across the
        posted (or dry-run) journals.  Should be zero when the line
        journals + bank receipt net out correctly.

        Returns a dict with:
          payment_reference_no
          ar_account_code
          total_debits
          total_credits
          net_balance      (debits - credits; should be 0)
          is_balanced      (bool)
          journal_count
          warning          (optional human-readable warning)
        """
        total_debits = 0.0
        total_credits = 0.0
        journal_count = 0

        for posted in journals:
            entry = posted.entry
            if not entry:
                continue

            for ln in entry.get("lines", []):
                if ln.get("account_code") != self.ar_account_code:
                    continue
                total_debits += float(ln.get("debit") or 0.0)
                total_credits += float(ln.get("credit") or 0.0)
                journal_count += 1

        net = round(total_debits - total_credits, 2)
        balanced = abs(net) < 0.01

        result = {
            "payment_reference_no": payment_reference_no,
            "ar_account_code": self.ar_account_code,
            "total_debits": round(total_debits, 2),
            "total_credits": round(total_credits, 2),
            "net_balance": net,
            "is_balanced": balanced,
            "journal_count": journal_count,
        }

        if not balanced:
            result["warning"] = (
                f"AR-Makro does not clear to zero for remittance "
                f"{payment_reference_no}. Net = {net}. "
                f"Check for missing bank receipt journal or line-level errors."
            )

        return result

    # ------------------------------------------------------------- live DB

    def reconcile_live(
        self,
        payment_reference_no: str,
    ) -> dict:
        """Query the live ledger for AR-Makro rows tied to this remittance.

        Only call this after the journals have been posted.
        Mirrors the in-memory reconciliation but uses the GL as the
        source of truth — catches any drift introduced between posting
        and the ledger (e.g. manual adjustments).
        """
        schema = f"company_{self.company_id}"

        sql = f"""
            SELECT
                COALESCE(SUM(l.debit), 0)  AS total_debits,
                COALESCE(SUM(l.credit), 0) AS total_credits
            FROM {schema}.ledger l
            JOIN {schema}.journal j ON j.id = l.journal_id
            WHERE l.account = %s
              AND j.source = 'makro_marketplace'
              AND j.source_id = %s
        """

        try:
            row = self.db.fetch_one(
                sql,
                (self.ar_account_code, payment_reference_no),
            ) or {}
        except Exception:
            return {
                "payment_reference_no": payment_reference_no,
                "ar_account_code": self.ar_account_code,
                "error": "Could not query ledger for reconciliation.",
                "is_balanced": False,
            }

        debits = float(row.get("total_debits") or 0.0)
        credits = float(row.get("total_credits") or 0.0)
        net = round(debits - credits, 2)

        return {
            "payment_reference_no": payment_reference_no,
            "ar_account_code": self.ar_account_code,
            "total_debits": round(debits, 2),
            "total_credits": round(credits, 2),
            "net_balance": net,
            "is_balanced": abs(net) < 0.01,
            "source": "live_ledger",
        }
