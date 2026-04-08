import os
import sys
import traceback

from BackEnd.Services.db_service import db_service


def main():
    dsn = os.getenv("MASTER_DB_DSN")
    if not dsn:
        raise RuntimeError("MASTER_DB_DSN environment variable not set")

    db = db_service(dsn)

    company_id = 8
    loan_ids = [1, 2]
    user_id = 8

    print(f"Starting loan origination journal backfill for company_id={company_id}")
    print(f"Loan IDs: {loan_ids}")

    for loan_id in loan_ids:
        try:
            journal_id = db.backfill_loan_inception_journal(
                company_id=company_id,
                loan_id=loan_id,
                user_id=user_id,
            )
            print(f"✅ loan_id={loan_id} -> journal_id={journal_id}")
        except Exception as e:
            print(f"❌ loan_id={loan_id} failed: {e}")
            traceback.print_exc()

    print("Done.")


if __name__ == "__main__":
    main()