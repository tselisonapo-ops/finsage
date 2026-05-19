import os
import sys
import traceback
from decimal import Decimal, ROUND_HALF_UP


def money(v):
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def main():
    print("=== Posting TBR October 2024 recent bank statement items ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)
    ref = "TBR-BANK-CATCHUP-2024-10-RECENT"

    loan_total = money("2640.35")
    loan_interest = money(os.getenv("OCT2024_LOAN_INTEREST", "1200.00"))
    loan_principal = loan_total - loan_interest

    if loan_principal < 0:
        raise RuntimeError("Loan interest cannot exceed total loan payments")

    existing = db_service.fetch_one(f"""
        SELECT id
        FROM {schema}.journal
        WHERE company_id = %s
          AND LOWER(TRIM(ref)) = LOWER(TRIM(%s))
        LIMIT 1
    """, (company_id, ref))

    if existing:
        print(f"Skipping: journal already exists journal_id={existing['id']}")
        return

    lines = [
        {
            "account_code": "PL_OPEX_6000",
            "account": "Driver & Ops Salaries",
            "debit": 7050.00,
            "credit": 0,
            "memo": "October salary payments on recent statement"
        },
        {
            "account_code": "PL_COS_5005",
            "account": "Vehicle Repairs & Maintenance",
            "debit": 2290.00,
            "credit": 0,
            "memo": "Maintenance paid 01 Oct"
        },
        {
            "account_code": "PL_OPEX_6001",
            "account": "Rent Expense",
            "debit": 2146.00,
            "credit": 0,
            "memo": "Rent paid 01 Oct"
        },
        {
            "account_code": "PL_ADJ_8250",
            "account": "Miscellaneous Adjustment",
            "debit": 2240.00,
            "credit": 0,
            "memo": "ATM cash withdrawals - purpose unknown during reconstruction"
        },
        {
            "account_code": "BS_CL_2100",
            "account": "Loan Payable",
            "debit": float(loan_principal),
            "credit": 0,
            "memo": "Estimated principal portion of October loan payments"
        },
        {
            "account_code": "PL_FIN_7210",
            "account": "Interest Expense",
            "debit": float(loan_interest),
            "credit": 0,
            "memo": "Estimated interest portion of October loan payments"
        },
        {
            "account_code": "PL_COS_5004",
            "account": "Fuel Expense",
            "debit": 156.19,
            "credit": 0,
            "memo": "Lesotho Nissan POS fuel purchase 05 Oct"
        },
        {
            "account_code": "PL_OPEX_6105",
            "account": "Bank Charges",
            "debit": 397.89,
            "credit": 0,
            "memo": "October bank fees: other fee, monthly fee and service fees"
        },
        {
            "account_code": "BS_CA_1000",
            "account": "Cash & Bank",
            "debit": 0,
            "credit": 16920.43,
            "memo": "October recent bank statement payments and charges excluding AR receipt"
        },
    ]

    total_debit = sum(money(x["debit"]) for x in lines)
    total_credit = sum(money(x["credit"]) for x in lines)

    print("Total debit :", total_debit)
    print("Total credit:", total_credit)

    if total_debit != total_credit:
        raise RuntimeError(f"Unbalanced journal: debit={total_debit} credit={total_credit}")

    entry = {
        "date": "2024-10-05",
        "ref": ref,
        "description": "October 2024 recent bank statement catch-up items excluding AR receipt",
        "source": "bank",
        "currency": "LSL",
        "lines": lines,
    }

    journal_id = db_service.post_journal(company_id, entry)
    print(f"Posted October recent bank journal_id={journal_id}")
    print("=== done ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise