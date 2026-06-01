import os, sys, traceback
from decimal import Decimal, ROUND_HALF_UP

def money(v):
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def main():
    print("=== Posting TBR March 2026 bank catch-up ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)
    ref = "TBR-BANK-CATCHUP-2026-03"

    existing = db_service.fetch_one(f"""
        SELECT id FROM {schema}.journal
        WHERE company_id=%s AND LOWER(TRIM(ref))=LOWER(TRIM(%s))
        LIMIT 1
    """, (company_id, ref))

    if existing:
        print(f"Skipping existing journal_id={existing['id']}")
        return

    lines = [
        {"account_code": "PL_COS_5004", "account": "Fuel Expense", "debit": 1338.35, "credit": 0, "memo": "March fuel purchases"},
        {"account_code": "PL_ADJ_8250", "account": "Miscellaneous Adjustment", "debit": 1700.00, "credit": 0, "memo": "March ATM cash withdrawals"},
        {"account_code": "PL_OPEX_6800", "account": "Tracking Subscription Expense", "debit": 190.00, "credit": 0, "memo": "Ctrack debit order March"},
        {"account_code": "PL_OPEX_6105", "account": "Bank Charges", "debit": 263.28, "credit": 0, "memo": "March bank charges"},
        {"account_code": "BS_CA_1000", "account": "Cash & Bank", "debit": 0.55, "credit": 0, "memo": "Monthly fee refund"},
        {"account_code": "PL_OPEX_6105", "account": "Bank Charges", "debit": 0, "credit": 0.55, "memo": "Monthly fee refund against bank charges"},
        {"account_code": "BS_CA_1000", "account": "Cash & Bank", "debit": 0, "credit": 3491.63, "memo": "March bank payments excluding business receipts"},
    ]

    total_debit = sum(money(x["debit"]) for x in lines)
    total_credit = sum(money(x["credit"]) for x in lines)

    print("Total debit :", total_debit)
    print("Total credit:", total_credit)

    if total_debit != total_credit:
        raise RuntimeError(f"Unbalanced journal: debit={total_debit} credit={total_credit}")

    entry = {
        "date": "2026-03-31",
        "ref": ref,
        "description": "March 2026 bank catch-up excluding receipts paid into director personal account",
        "source": "bank",
        "currency": "LSL",
        "lines": lines,
    }

    journal_id = db_service.post_journal(company_id, entry)
    print(f"Posted March bank catch-up journal_id={journal_id}")
    print("=== done ===")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise