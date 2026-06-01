import os, sys, traceback
from decimal import Decimal, ROUND_HALF_UP

def money(v):
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def main():
    print("=== Posting TBR April 2026 bank catch-up ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)
    ref = "TBR-BANK-CATCHUP-2026-04"

    existing = db_service.fetch_one(f"""
        SELECT id FROM {schema}.journal
        WHERE company_id=%s AND LOWER(TRIM(ref))=LOWER(TRIM(%s))
        LIMIT 1
    """, (company_id, ref))

    if existing:
        print(f"Skipping existing journal_id={existing['id']}")
        return

    lines = [
        {"account_code": "BS_CA_1000", "account": "Cash & Bank", "debit": 500.00, "credit": 0, "memo": "Director funding into company bank during ownership transition"},
        {"account_code": "BS_CL_2100", "account": "Director Loan / Owner Funding", "debit": 0, "credit": 500.00, "memo": "Director funding used while banking access was restricted"},

        {"account_code": "PL_OPEX_6800", "account": "Tracking Subscription Expense", "debit": 190.00, "credit": 0, "memo": "Ctrack debit order April"},
        {"account_code": "PL_OPEX_6105", "account": "Bank Charges", "debit": 250.40, "credit": 0, "memo": "April bank charges, debit interest and service fees"},
        {"account_code": "BS_CA_1000", "account": "Cash & Bank", "debit": 0, "credit": 440.40, "memo": "April bank payments and charges"},
    ]

    total_debit = sum(money(x["debit"]) for x in lines)
    total_credit = sum(money(x["credit"]) for x in lines)

    print("Total debit :", total_debit)
    print("Total credit:", total_credit)

    if total_debit != total_credit:
        raise RuntimeError(f"Unbalanced journal: debit={total_debit} credit={total_credit}")

    entry = {
        "date": "2026-04-30",
        "ref": ref,
        "description": "April 2026 bank catch-up during ownership transition",
        "source": "bank",
        "currency": "LSL",
        "lines": lines,
    }

    journal_id = db_service.post_journal(company_id, entry)
    print(f"Posted April bank catch-up journal_id={journal_id}")
    print("=== done ===")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise