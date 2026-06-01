# BackEnd/scripts/post_tbr_october_2024_recent_bank.py

import os
import sys
import traceback
from decimal import Decimal, ROUND_HALF_UP


def money(v):
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def main():
    print("=== Posting TBR October 2024 revised bank catch-up ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)

    ref = "TBR-BANK-CATCHUP-2024-10-REV3"

    existing = db_service.fetch_one(f"""
        SELECT id
        FROM {schema}.journal
        WHERE company_id = %s
          AND LOWER(TRIM(ref)) = LOWER(TRIM(%s))
        LIMIT 1
    """, (company_id, ref))

    if existing:
        print(f"Skipping existing journal_id={existing['id']}")
        return

    loan_total = money("2640.35")
    loan_interest = money(os.getenv("OCT2024_LOAN_INTEREST", "1200.00"))
    loan_principal = loan_total - loan_interest

    lines = [

        # Salaries
        {
            "account_code": "PL_OPEX_6000",
            "account": "Driver & Ops Salaries",
            "debit": 7050.00,
            "credit": 0,
            "memo": "October salary payments"
        },

        # Repairs
        {
            "account_code": "PL_COS_5005",
            "account": "Vehicle Repairs & Maintenance",
            "debit": 2290.00,
            "credit": 0,
            "memo": "Maintenance paid October 2024"
        },

        # Rent
        {
            "account_code": "PL_OPEX_6001",
            "account": "Rent Expense",
            "debit": 2146.00,
            "credit": 0,
            "memo": "October rent"
        },

        # Fuel
        {
            "account_code": "PL_COS_5004",
            "account": "Fuel Expense",
            "debit": 156.19,
            "credit": 0,
            "memo": "Fuel purchases"
        },

        # Loan principal
        {"account_code": "BS_CL_2100", "account": "Loan Payable", "debit": 585.00, "credit": 0, "memo": "Loan principal repayment"},
        {"account_code": "PL_FIN_7210", "account": "Interest Expense", "debit": 615.00, "credit": 0, "memo": "Loan interest"},

        # Bank charges
        {
            "account_code": "PL_OPEX_6105",
            "account": "Bank Charges",
            "debit": 397.89,
            "credit": 0,
            "memo": "October bank fees"
        },

        # ATM / unidentified
        {
            "account_code": "PL_ADJ_8250",
            "account": "Miscellaneous Adjustment",
            "debit": 2240.00,
            "credit": 0,
            "memo": "ATM withdrawals and unidentified items"
        },

        {
            "account_code": "PL_ADJ_8250",
            "account": "Miscellaneous Adjustment",
            "debit": 630.00,
            "credit": 0,
            "memo": "October ATM withdrawals after 05 Oct - purpose unknown"
        },
        {
            "account_code": "PL_OPEX_6800",
            "account": "Staff Welfare",
            "debit": 110.00,
            "credit": 0,
            "memo": "Galitos Restaurant POS purchase 04 Oct posted 07 Oct"
        },
        {
            "account_code": "PL_ADJ_8250",
            "account": "Miscellaneous Adjustment",
            "debit": 514.00,
            "credit": 0,
            "memo": "Ha Pita Clinic POS purchase - purpose unknown"
        },

        # Alliance prepaid insurance
        {
            "account_code": "BS_CA_1400",
            "account": "Prepaid Expenses",
            "debit": 1400.00,
            "credit": 0,
            "memo": "Alliance GE prepaid insurance deposit"
        },

        # balancing bank line
        {
            "account_code": "BS_CA_1000",
            "account": "Cash & Bank",
            "debit": 0,
            "credit": 19574.43,
            "memo": "October bank payments and charges"
        },
    ]

    total_debit = sum(money(x["debit"]) for x in lines)
    total_credit = sum(money(x["credit"]) for x in lines)

    print("Total debit :", total_debit)
    print("Total credit:", total_credit)

    if total_debit != total_credit:
        raise RuntimeError(
            f"Unbalanced journal: debit={total_debit} credit={total_credit}"
        )

    entry = {
        "date": "2024-10-31",
        "ref": ref,
        "description": "October 2024 revised bank catch-up",
        "source": "bank",
        "currency": "LSL",
        "lines": lines,
    }

    journal_id = db_service.post_journal(company_id, entry)

    print(f"Posted journal_id={journal_id}")
    print("=== done ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise