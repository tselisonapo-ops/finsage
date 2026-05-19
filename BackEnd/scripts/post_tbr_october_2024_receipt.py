import os
import sys
import traceback
from decimal import Decimal
from datetime import date


def main():
    print("=== Posting TBR October 2024 Galitos receipt ===")

    ROOT = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )

    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))

    if not company_id:
        raise RuntimeError(
            "Set COMPANY_ID before running this script"
        )

    schema = db_service.company_schema(company_id)

    invoice_number = "TBR-GALITOS-2024-09"

    reference = "RCPT-GALITOS-SEPT2-2024-10-01"

    amount = Decimal("19545.00")

    # ----------------------------------------------------------
    # Fetch invoice
    # ----------------------------------------------------------

    inv = db_service.fetch_one(f"""
        SELECT
            id,
            number,
            total_amount,
            status,
            posted_journal_id,
            currency,
            customer_id
        FROM {schema}.invoices
        WHERE company_id = %s
          AND LOWER(TRIM(number)) = LOWER(TRIM(%s))
        LIMIT 1
    """, (company_id, invoice_number))

    if not inv:
        raise RuntimeError(
            f"Invoice not found: {invoice_number}"
        )

    if not inv.get("posted_journal_id"):
        raise RuntimeError(
            f"Invoice {invoice_number} "
            f"has not been posted to GL"
        )

    # ----------------------------------------------------------
    # Prevent duplicate receipt posting
    # ----------------------------------------------------------

    existing_receipt = db_service.fetch_one(f"""
        SELECT
            id,
            created_journal_id,
            amount
        FROM {schema}.receipts
        WHERE company_id = %s
        AND LOWER(TRIM(reference)) = LOWER(TRIM(%s))
        LIMIT 1
    """, (company_id, reference))

    if existing_receipt:
        print(
            f"Skipping existing receipt "
            f"receipt_id={existing_receipt['id']} "
            f"journal_id={existing_receipt.get('created_journal_id')}"
        )
        return

    # ----------------------------------------------------------
    # Determine remaining invoice balance
    # ----------------------------------------------------------

    allocated_total = Decimal(
        str(
            db_service.get_invoice_allocated_total(
                company_id,
                int(inv["id"])
            ) or "0"
        )
    ).quantize(Decimal("0.01"))

    invoice_total = Decimal(
        str(inv.get("total_amount") or "0")
    ).quantize(Decimal("0.01"))

    remaining = (
        invoice_total - allocated_total
    ).quantize(Decimal("0.01"))

    print("Invoice total :", invoice_total)
    print("Allocated     :", allocated_total)
    print("Remaining     :", remaining)

    if remaining <= Decimal("0.00"):
        print("Invoice already fully paid.")
        return

    if amount > remaining:
        print(
            f"WARNING: receipt exceeds remaining balance. "
            f"Only {remaining} will allocate."
        )

    # ----------------------------------------------------------
    # Choose bank account
    # ----------------------------------------------------------

    bank = db_service.fetch_one(f"""
        SELECT
            id,
            ledger_account_code,
            account_name
        FROM {schema}.company_bank_accounts
        WHERE company_id = %s
          AND ledger_account_code = 'BS_CA_1000'
        LIMIT 1
    """, (company_id,))

    if not bank:
        bank = db_service.fetch_one(f"""
            SELECT
                id,
                ledger_account_code,
                account_name
            FROM {schema}.company_bank_accounts
            WHERE company_id = %s
            ORDER BY id ASC
            LIMIT 1
        """, (company_id,))

    if not bank:
        raise RuntimeError(
            "No company bank account found"
        )

    print(
        f"Using bank account "
        f"{bank.get('account_name')} "
        f"({bank.get('ledger_account_code')})"
    )

    # ----------------------------------------------------------
    # Allocate payment through AR module
    # ----------------------------------------------------------

    result = db_service.allocate_payment_to_invoice(
        company_id=company_id,
        invoice_id=int(inv["id"]),
        amount=amount,
        payment_date=date(2024, 10, 1),
        bank_account_id=int(bank["id"]),
        reference=reference,
        description=(
            "Galitos Maseru Sept2 receipt "
            "- clears September 2024 invoice"
        ),
        user_id=None,

        # let system resolve AR control automatically
        ar_ledger_code="BS_CA_9002",
    )

    print("Receipt posted successfully")
    print(result)

    print("=== done ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise