import os
import sys
import traceback
from decimal import Decimal


def main():
    print("=== TBR October 2024 assets, loan and scooter disposal ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service
    from BackEnd.Services.assets import service, posting

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)

    acquisition_date = "2024-10-16"  # Wednesday
    disposal_date = "2024-10-16"

    def table_columns(cur, table_name):
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = %s
        """, (schema, table_name))
        return {r["column_name"] for r in cur.fetchall()}

    def insert_filtered(cur, table_name, data):
        cols = table_columns(cur, table_name)
        clean = {k: v for k, v in data.items() if k in cols}

        keys = list(clean.keys())
        placeholders = ", ".join(["%s"] * len(keys))
        col_sql = ", ".join(keys)

        cur.execute(
            f"""
            INSERT INTO {schema}.{table_name} ({col_sql})
            VALUES ({placeholders})
            RETURNING id
            """,
            [clean[k] for k in keys],
        )

        return cur.fetchone()["id"]

    def asset_exists(cur, asset_code):
        cur.execute(
            f"""
            SELECT id
            FROM {schema}.assets
            WHERE company_id = %s
              AND asset_code = %s
            LIMIT 1
            """,
            (company_id, asset_code),
        )
        row = cur.fetchone()
        return row["id"] if row else None

    def create_sym_asset(cur, asset_code, asset_name, cost):
        existing_id = asset_exists(cur, asset_code)
        if existing_id:
            print(f"Skipping existing asset {asset_code} asset_id={existing_id}")
            return existing_id

        payload = {
            "entry_mode": "acquisition",
            "asset_code": asset_code,
            "asset_name": asset_name,
            "asset_class": "Motorbike",
            "asset_class_group": "motor_vehicles",
            "category": "Motorbikes",
            "location": "Operations",
            "serial_no": None,
            "notes": "SYM 150cc motorbike acquired in October 2024. VIN to be added later.",

            "acquisition_date": acquisition_date,
            "available_for_use_date": acquisition_date,
            "ready_for_use_date": acquisition_date,

            "cost": cost,
            "residual_value": 0,
            "depreciation_method": "SL",
            "useful_life_months": 48,

            "status": "active",
            "measurement_basis": "cost",

            "asset_account_code": "BS_NCA_1110",
            "accum_dep_account_code": "BS_NCA_1525",
            "dep_expense_account_code": "PL_DA_7100",
            "disposal_gain_account_code": "PL_OI_4370",
            "disposal_loss_account_code": "PL_ADJ_8250",
            "acquisition_ref": "TBR-SYM-LOAN-2024-10",
        }

        asset_id = service.create_asset(cur, company_id, payload)
        print(f"Created asset {asset_code} asset_id={asset_id}")
        return asset_id

    with db_service._conn_cursor() as (conn, cur):
        # ------------------------------------------------------------
        # 1) Create loan master only.
        # Liability posting is done through PPE acquisition journals.
        # This avoids double-posting the loan.
        # ------------------------------------------------------------
        cur.execute(
            f"""
            SELECT id
            FROM {schema}.loans
            WHERE company_id = %s
              AND loan_reference = %s
            LIMIT 1
            """,
            (company_id, "TBR-SYM-LOAN-2024-10"),
        )
        loan_row = cur.fetchone()

        if loan_row:
            loan_id = loan_row["id"]
            print(f"Skipping existing loan loan_id={loan_id}")
        else:
            loan_id = insert_filtered(cur, "loans", {
                "company_id": company_id,
                "loan_name": "SYM motorbike acquisition loan",
                "loan_reference": "TBR-SYM-LOAN-2024-10",
                "lender_name": "Related party / owner-arranged cash loan",
                "loan_type": "term_loan",
                "start_date": acquisition_date,
                "first_payment_date": "2024-11-16",
                "principal_amount": Decimal("21000.00"),
                "annual_interest_rate": Decimal("23.80"),
                "interest_method": "amortised_fixed_payment",
                "term_count": 60,
                "payment_frequency": "monthly",
                "currency": "LSL",
                "outstanding_principal": Decimal("21000.00"),
                "outstanding_interest": Decimal("0.00"),
                "status": "active",
                "interest_expense_account_code": "PL_FIN_7210",
                "loan_payable_current_account_code": "BS_CL_2100",
                "loan_payable_noncurrent_account_code": "BS_NCL_2600",
                "notes": "Loan used to acquire two SYM 150cc delivery motorbikes. Created for reconstruction; agreement details to be updated later.",
                "agreement_reference": "TBR-SYM-LOAN-2024-10",
                "meta_json": {
                    "migration_note": "Created from October 2024 reconstruction.",
                    "asset_codes": ["TBR-SYM-150-001", "TBR-SYM-150-002"],
                },
            })
            print(f"Created loan loan_id={loan_id}")

        # ------------------------------------------------------------
        # 2) Create two SYM 150cc assets.
        # Total paid 21,000, allocated 10,500 each.
        # ------------------------------------------------------------
        sym_assets = [
            ("TBR-SYM-150-001", "SYM 150cc motorbike 1", Decimal("10500.00")),
            ("TBR-SYM-150-002", "SYM 150cc motorbike 2", Decimal("10500.00")),
        ]

        for asset_code, asset_name, cost in sym_assets:
            asset_id = create_sym_asset(cur, asset_code, asset_name, cost)

            cur.execute(
                f"""
                SELECT id, status, posted_journal_id
                FROM {schema}.asset_acquisitions
                WHERE company_id = %s
                  AND reference = %s
                LIMIT 1
                """,
                (company_id, f"ACQ-{asset_code}"),
            )
            existing_acq = cur.fetchone()

            if existing_acq and existing_acq.get("posted_journal_id"):
                print(f"Skipping posted acquisition {asset_code} journal_id={existing_acq['posted_journal_id']}")
                continue

            if existing_acq:
                acq_id = existing_acq["id"]
            else:
                acq_id = insert_filtered(cur, "asset_acquisitions", {
                    "company_id": company_id,
                    "asset_id": asset_id,
                    "acquisition_date": acquisition_date,
                    "posting_date": acquisition_date,
                    "amount": cost,
                    "currency": "LSL",
                    "funding_source": "loan",
                    "credit_account_code": "BS_CL_2100",
                    "reference": f"ACQ-{asset_code}",
                    "status": "draft",
                    "notes": "Acquisition financed by October 2024 SYM motorbike loan.",
                })

            jid = posting.post_acquisition(
                cur,
                company_id,
                int(acq_id),
                user=None,
                approved_via="migration_script",
            )
            print(f"Posted acquisition {asset_code} acq_id={acq_id} journal_id={jid}")

        # ------------------------------------------------------------
        # 3) Dispose opening scooter sold for 4,000 cash.
        # ------------------------------------------------------------
        cur.execute(
            f"""
            SELECT id
            FROM {schema}.assets
            WHERE company_id = %s
              AND asset_code = %s
            LIMIT 1
            """,
            (company_id, "TBR-SCOOTER-001"),
        )
        scooter = cur.fetchone()

        if not scooter:
            print("WARNING: opening scooter TBR-SCOOTER-001 not found; disposal skipped.")
        else:
            scooter_id = scooter["id"]

            cur.execute(
                f"""
                UPDATE {schema}.assets
                SET disposal_gain_account_code = COALESCE(NULLIF(disposal_gain_account_code, ''), 'PL_OI_4370'),
                    disposal_loss_account_code = COALESCE(NULLIF(disposal_loss_account_code, ''), 'PL_ADJ_8250'),
                    updated_at = NOW()
                WHERE company_id = %s
                  AND id = %s
                """,
                (company_id, scooter_id),
            )

            cur.execute(
                f"""
                SELECT id, status, posted_journal_id
                FROM {schema}.asset_disposals
                WHERE company_id = %s
                  AND reference = %s
                LIMIT 1
                """,
                (company_id, "DISP-TBR-SCOOTER-001-2024-10"),
            )
            existing_disp = cur.fetchone()

            if existing_disp and existing_disp.get("posted_journal_id"):
                print(f"Skipping posted scooter disposal journal_id={existing_disp['posted_journal_id']}")
            else:
                if existing_disp:
                    disp_id = existing_disp["id"]
                else:
                    disp_id = insert_filtered(cur, "asset_disposals", {
                        "company_id": company_id,
                        "asset_id": scooter_id,
                        "disposal_date": disposal_date,
                        "proceeds": Decimal("4000.00"),
                        "currency": "LSL",
                        "reference": "DISP-TBR-SCOOTER-001-2024-10",
                        "bank_account_code": "BS_CA_1010",
                        "status": "draft",
                        "notes": "Scooter sold for cash in October 2024.",
                    })

                jid = posting.post_disposal(
                    cur,
                    company_id,
                    int(disp_id),
                    user=None,
                    approved_via="migration_script",
                )
                print(f"Posted scooter disposal disp_id={disp_id} journal_id={jid}")

        conn.commit()

    print("=== done ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise