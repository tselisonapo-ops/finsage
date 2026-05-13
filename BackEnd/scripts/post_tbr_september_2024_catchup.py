# BackEnd/scripts/post_tbr_september_2024_catchup.py
import os
import sys
import traceback
from decimal import Decimal, ROUND_HALF_UP


def money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def main():
    print("=== Posting TBR September 2024 bank catch-up journal ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)
    ref = "TBR-BANK-CATCHUP-2024-09"

    total_loan_payment = money("1200.00")
    loan_interest = money(os.getenv("SEP2024_LOAN_INTEREST", "615.00"))
    loan_principal = total_loan_payment - loan_interest

    if loan_principal < 0:
        raise RuntimeError("Loan interest cannot exceed total payment")

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
            "account_code": "BS_CA_1000",
            "account": "Cash & Bank",
            "debit": 20780.00,
            "credit": 0,
            "memo": "Galitos Maseru Augt2 receipt - clears August receivable"
        },
        {
            "account_code": "BS_CA_1700",
            "account": "Accounts Receivable",
            "debit": 0,
            "credit": 20780.00,
            "memo": "Clear August Galitos invoice"
        },

        {
            "account_code": "PL_COS_5003",
            "account": "Cost of Sales",
            "debit": 1500.00,
            "credit": 0,
            "memo": "Helmet purchased 03 Sep"
        },
        {
            "account_code": "PL_OPEX_6000",
            "account": "Driver & Ops Salaries",
            "debit": 5350.00,
            "credit": 0,
            "memo": "September salary payments"
        },
        {
            "account_code": "PL_OPEX_6001",
            "account": "Rent Expense",
            "debit": 2146.00,
            "credit": 0,
            "memo": "TBR Deliveries rent paid 03 Sep"
        },
        {
            "account_code": "BS_CL_2100",
            "account": "Related Party Loan",
            "debit": float(loan_principal),
            "credit": 0,
            "memo": "Estimated principal portion of September related-party motorbike financing"
        },
        {
            "account_code": "PL_FIN_7210",
            "account": "Interest Expense",
            "debit": float(loan_interest),
            "credit": 0,
            "memo": "Estimated September finance cost on related-party motorbike financing"
        },
        {
            "account_code": "PL_COS_5004",
            "account": "Fuel Expense",
            "debit": 1706.69,
            "credit": 0,
            "memo": "September POS fuel purchases - Lesotho Nissan / Zambezi"
        },
        {
            "account_code": "PL_ADJ_8250",
            "account": "Miscellaneous Adjustment",
            "debit": 5870.00,
            "credit": 0,
            "memo": "September ATM cash withdrawals - purpose unknown during reconstruction"
        },
        {
            "account_code": "PL_OPEX_6720",
            "account": "Office Supplies",
            "debit": 1050.00,
            "credit": 0,
            "memo": "Atlantic Hi Tech and Kobeli Business POS purchases"
        },
        {
            "account_code": "PL_OPEX_6710",
            "account": "Professional Fees",
            "debit": 1527.00,
            "credit": 0,
            "memo": "Services paid 06 Sep"
        },
        {
            "account_code": "PL_OPEX_6105",
            "account": "Bank Charges",
            "debit": 364.57,
            "credit": 0,
            "memo": "September bank charges and service fees"
        },

        {
            "account_code": "BS_CA_1000",
            "account": "Cash & Bank",
            "debit": 0,
            "credit": 20714.26,
            "memo": "September bank payments and charges"
        },
    ]

    total_debit = sum(money(x["debit"]) for x in lines)
    total_credit = sum(money(x["credit"]) for x in lines)

    print("Total debit :", total_debit)
    print("Total credit:", total_credit)

    if total_debit != total_credit:
        raise RuntimeError(f"Unbalanced journal: debit={total_debit} credit={total_credit}")

    entry = {
        "date": "2024-09-30",
        "ref": ref,
        "description": "September 2024 bank catch-up journal excluding September AR invoice revenue",
        "source": "bank",
        "currency": "LSL",
        "lines": lines,
    }

    journal_id = db_service.post_journal(company_id, entry)
    print(f"Posted September catch-up journal_id={journal_id}")
    print("=== done ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise