from BackEnd.Services.db_service import db_service
from psycopg2.extras import Json
from decimal import Decimal
from datetime import date

COMPANY_ID = 16
LOAN_ID = 7
USER_ID = 30

HISTORICAL_PAYMENTS = [
    ("2024-03-31", 1200, "MIG-LOAN-PMT-2024-03"),
    ("2024-04-30", 1200, "MIG-LOAN-PMT-2024-04"),
    ("2024-05-31", 1200, "MIG-LOAN-PMT-2024-05"),
    ("2024-06-30", 1200, "MIG-LOAN-PMT-2024-06"),
    ("2024-07-31", 1200, "MIG-LOAN-PMT-2024-07"),
    ("2024-08-31", 1200, "MIG-LOAN-PMT-2024-08"),
    ("2024-09-30", 1200, "MIG-LOAN-PMT-2024-09"),
    ("2024-10-31", 1200, "MIG-LOAN-PMT-2024-10"),
    ("2024-11-30", 1200, "MIG-LOAN-PMT-2024-11"),
    ("2024-12-31", 1200, "MIG-LOAN-PMT-2024-12"),
    ("2025-01-31", 2200, "MIG-LOAN-PMT-2025-01"),
    ("2025-02-28", 1200, "MIG-LOAN-PMT-2025-02"),
    ("2025-03-31", 1200, "MIG-LOAN-PMT-2025-03"),
    ("2025-04-30", 1200, "MIG-LOAN-PMT-2025-04"),
    ("2025-05-31", 1200, "MIG-LOAN-PMT-2025-05"),
    ("2025-06-30", 1200, "MIG-LOAN-PMT-2025-06"),
]

with db_service._conn() as conn:
    schema = db_service.company_schema(COMPANY_ID)

    with conn.cursor() as cur:
        cur.execute("BEGIN;")

        # Clear module history only, not GL journals
        cur.execute(f"""
            DELETE FROM {schema}.loan_payment_allocations
            WHERE loan_id = %s
        """, (LOAN_ID,))

        cur.execute(f"""
            DELETE FROM {schema}.loan_payments
            WHERE loan_id = %s
        """, (LOAN_ID,))

        cur.execute(f"""
            DELETE FROM {schema}.loan_schedules
            WHERE loan_id = %s
        """, (LOAN_ID,))

        # Reset loan as original loan
        cur.execute(f"""
            UPDATE {schema}.loans
            SET
                principal_amount = 35000.00,
                outstanding_principal = 35000.00,
                annual_interest_rate = 24.600000,
                term_count = 60,
                payment_frequency = 'monthly',
                start_date = DATE '2024-02-01',
                first_payment_date = DATE '2024-03-31',
                maturity_date = NULL,
                schedule_version = 1,
                next_due_date = DATE '2024-03-31',
                updated_at = NOW()
            WHERE company_id = %s
              AND id = %s
        """, (COMPANY_ID, LOAN_ID))

        cur.execute("COMMIT;")

    # Generate clean 60-month schedule
    db_service.generate_loan_schedule(conn, COMPANY_ID, loan_id=LOAN_ID, user_id=USER_ID)

    with conn.cursor() as cur:
        # Import historical payments as posted module records, but do NOT create new GL journals
        for pay_date, amount, ref in HISTORICAL_PAYMENTS:
            cur.execute(f"""
                INSERT INTO {schema}.loan_payments (
                    company_id,
                    loan_id,
                    payment_date,
                    amount_paid,
                    bank_account_id,
                    reference,
                    description,
                    auto_calculate_split,
                    allocation_method,
                    payment_type,
                    status,
                    created_by,
                    notes,
                    meta_json
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id
            """, (
                COMPANY_ID,
                LOAN_ID,
                pay_date,
                Decimal(str(amount)),
                1,
                ref,
                "Migrated historical loan payment - no new GL posting",
                True,
                "schedule_order",
                "standard",
                "posted",
                USER_ID,
                "Backfilled from historical loan migration. GL journals already exist or were handled separately.",
                Json({"migration_backfill": True, "no_new_gl": True}),
            ))

            payment_id = cur.fetchone()[0]
            db_service._allocate_loan_payment(cur, COMPANY_ID, payment_id=payment_id)

        conn.commit()

print("Loan 7 reset, schedule regenerated, and historical payments allocated.")