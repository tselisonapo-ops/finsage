# scripts/post_tbr_opening_assets.py
import os
import sys
import traceback

def main():
    print("=== Posting TBR opening fixed assets ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    dsn = os.getenv("MASTER_DB_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("MASTER_DB_DSN or DATABASE_URL is not set")

    from BackEnd.Services.db_service import db_service
    from BackEnd.Services.assets import service, posting  

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)

    opening_assets = [
        {
            "asset_code": "TBR-BICYCLES-OPENING",
            "asset_name": "Opening bicycles",
            "asset_class": "Delivery Equipment",
            "asset_class_group": "equipment",
            "category": "Bicycles",
            "acquisition_date": "2024-01-15",
            "available_for_use_date": "2024-01-15",
            "cost": 2500.00,
            "opening_accum_dep": 558.03,
            "useful_life_months": 36,
            "asset_account_code": "BS_NCA_1110",
            "accum_dep_account_code": "BS_NCA_1525",
            "dep_expense_account_code": "PL_DA_7100",
        },
        {
            "asset_code": "TBR-BIGBOY-OPENING",
            "asset_name": "2 Bigboy motorcycles",
            "asset_class": "Motorbike",
            "asset_class_group": "motor_vehicles",
            "category": "Motorbikes",
            "acquisition_date": "2024-02-15",
            "available_for_use_date": "2024-02-15",
            "cost": 30000.00,
            "opening_accum_dep": 1116.05,
            "useful_life_months": 48,
            "asset_account_code": "BS_NCA_1110",
            "accum_dep_account_code": "BS_NCA_1525",
            "dep_expense_account_code": "PL_DA_7100",
        },
        {
            "asset_code": "TBR-SCOOTER-001",
            "asset_name": "Opening scooter",
            "asset_class": "Motorbike",
            "asset_class_group": "motor_vehicles",
            "category": "Scooters",
            "acquisition_date": "2024-05-15",
            "available_for_use_date": "2024-05-15",
            "cost": 8000.00,
            "opening_accum_dep": 1674.08,
            "useful_life_months": 36,
            "asset_account_code": "BS_NCA_1110",
            "accum_dep_account_code": "BS_NCA_1525",
            "dep_expense_account_code": "PL_DA_7100",
        },
        {
            "asset_code": "TBR-SAFETY-OPENING",
            "asset_name": "Opening safety equipment",
            "asset_class": "Equipment",
            "asset_class_group": "equipment",
            "category": "Safety Equipment",
            "acquisition_date": "2024-01-15",
            "available_for_use_date": "2024-01-15",
            "cost": 5000.00,
            "opening_accum_dep": 2232.11,
            "useful_life_months": 36,
            "asset_account_code": "BS_NCA_1120",
            "accum_dep_account_code": "BS_NCA_1527",
            "dep_expense_account_code": "PL_DA_7100",
        },
        {
            "asset_code": "TBR-PRINTER-OPENING",
            "asset_name": "Opening printer",
            "asset_class": "Computer Equipment",
            "asset_class_group": "equipment",
            "category": "Printer",
            "acquisition_date": "2024-07-31",
            "available_for_use_date": "2024-08-01",
            "cost": 1199.00,
            "opening_accum_dep": 0.00,
            "useful_life_months": 36,
            "asset_account_code": "BS_NCA_1105",
            "accum_dep_account_code": "BS_NCA_1532",
            "dep_expense_account_code": "PL_DA_7100",
        },
    ]

    with db_service._conn_cursor() as (conn, cur):
        for asset in opening_assets:
            existing = db_service.fetch_one(f"""
                SELECT id
                FROM {schema}.assets
                WHERE company_id = %s
                  AND asset_code = %s
                LIMIT 1
            """, (company_id, asset["asset_code"]), cur=cur)

            if existing:
                print(f"Skipping existing asset {asset['asset_code']} asset_id={existing['id']}")
                continue

            payload = {
                **asset,
                "entry_mode": "opening_balance",
                "opening_as_at": "2024-07-31",
                "posting_date": "2024-07-31",
                "opening_cost": asset["cost"],
                "opening_impairment": 0,
                "residual_value": 0,
                "depreciation_method": "SL",
                "status": "active",
                "measurement_basis": "cost",
            }

            asset_id = service.create_asset(cur, company_id, payload)

            journal_id = posting.post_opening_balance(
                cur,
                company_id,
                int(asset_id),
                posting_date="2024-07-31",
                user=None,
                approved_via="migration_script",
            )

            print(
                f"Created asset {asset['asset_code']} "
                f"asset_id={asset_id} opening_journal_id={journal_id}"
            )

        conn.commit()

    print("=== done ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise