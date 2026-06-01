import os, sys, traceback
from decimal import Decimal, ROUND_HALF_UP

def money(v):
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def main():
    print("=== Posting TBR September 2025 bank catch-up ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)
    ref = "TBR-BANK-CATCHUP-2025-09-REV2"

    existing = db_service.fetch_one(f"""
        SELECT id
        FROM {schema}.journal
        WHERE company_id=%s
          AND LOWER(TRIM(ref))=LOWER(TRIM(%s))
        LIMIT 1
    """, (company_id, ref))

    if existing:
        print(f"Skipping existing journal_id={existing['id']}")
        return

    lines = [
        {"account_code": "PL_ADJ_8250", "account": "Miscellaneous Adjustment", "debit": 5320.00, "credit": 0, "memo": "September ATM cash withdrawals"},
        {"account_code": "PL_ADJ_8250", "account": "Miscellaneous Adjustment", "debit": 1515.00, "credit": 0, "memo": "Yoco Bloe and Four One One purchases"},
        {"account_code": "PL_COS_5004", "account": "Fuel Expense", "debit": 1472.04, "credit": 0, "memo": "September fuel purchases: Lesotho Nissan and Driveway Filling Station"},
        {"account_code": "PL_COS_5005", "account": "Vehicle Repairs & Maintenance", "debit": 200.00, "credit": 0, "memo": "Pioneer Auto purchase"},
        {"account_code": "PL_OPEX_6800", "account": "Tracking Subscription Expense", "debit": 570.00, "credit": 0, "memo": "Ctrack debit order September"},
        {"account_code": "PL_OPEX_6105", "account": "Bank Charges", "debit": 460.98, "credit": 0, "memo": "September bank charges, service fees and declined transaction fees"},

        {"account_code": "PL_OPEX_6002", "account": "Fleet Insurance", "debit": 242.11, "credit": 0, "memo": "September amortisation of Alliance prepaid insurance"},
        {"account_code": "BS_CA_1400", "account": "Prepaid Expenses", "debit": 0, "credit": 242.11, "memo": "Release September prepaid insurance portion"},

        {"account_code": "BS_CA_1000", "account": "Cash & Bank", "debit": 0, "credit": 9538.02, "memo": "September bank payments excluding Galitos receipt"},
    ]

    total_debit = sum(money(x["debit"]) for x in lines)
    total_credit = sum(money(x["credit"]) for x in lines)

    print("Total debit :", total_debit)
    print("Total credit:", total_credit)

    if total_debit != total_credit:
        raise RuntimeError(f"Unbalanced journal: debit={total_debit} credit={total_credit}")

    entry = {
        "date": "2025-09-30",
        "ref": ref,
        "description": "September 2025 bank catch-up excluding Galitos receipt",
        "source": "bank",
        "currency": "LSL",
        "lines": lines,
    }

    journal_id = db_service.post_journal(company_id, entry)
    print(f"Posted September bank catch-up journal_id={journal_id}")
    print("=== done ===")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise