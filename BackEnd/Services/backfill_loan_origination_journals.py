import os
import sys
import traceback

from BackEnd.Services.db_service import DatabaseService


def main():
    dsn = os.getenv("MASTER_DB_DSN")
    if not dsn:
        raise RuntimeError("MASTER_DB_DSN environment variable not set")

    db = DatabaseService(dsn)

    company_id = 8
    user_id = 8

    if len(sys.argv) > 1:
        loan_ids = [int(x) for x in sys.argv[1:]]
    else:
        loan_ids = [1, 2]

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