# BackEnd/scripts/post_tbr_november_2024_recent_bank.py

import os
import sys
import traceback
from decimal import Decimal, ROUND_HALF_UP


def money(v):
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def main():
    print("=== Posting TBR November 2024 bank catch-up ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)
    ref = "TBR-BANK-CATCHUP-2024-11-REV2"

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

    lines = [
        {"account_code": "PL_OPEX_6000", "account": "Driver & Ops Salaries", "debit": 5350.00, "credit": 0, "memo": "Net November salaries after unpaid reversal"},
        {"account_code": "PL_COS_5005", "account": "Vehicle Repairs & Maintenance", "debit": 715.00, "credit": 0, "memo": "Repairs: 550 + Front Line Motors 165"},
        {"account_code": "PL_OPEX_6001", "account": "Rent Expense", "debit": 2146.00, "credit": 0, "memo": "November rent B11"},
        {"account_code": "PL_ADJ_8250", "account": "Miscellaneous Adjustment", "debit": 5050.00, "credit": 0, "memo": "November ATM cash withdrawals"},
        {"account_code": "BS_CL_2100", "account": "Loan Payable", "debit": 585.00, "credit": 0, "memo": "Principal portion of November loan payment"},
        {"account_code": "PL_FIN_7210", "account": "Interest Expense", "debit": 615.00, "credit": 0, "memo": "Interest portion of November loan payment"},
        {"account_code": "PL_OPEX_6105", "account": "Bank Charges", "debit": 370.76, "credit": 0, "memo": "November bank charges"},
        {"account_code": "PL_COS_5004", "account": "Fuel Expense", "debit": 1229.42, "credit": 0, "memo": "November fuel purchases"},
        {"account_code": "BS_CL_2200", "account": "Accounts Payable Control", "debit": 1505.29, "credit": 0, "memo": "Alliance insurance AP paid by bank"},
        {"account_code": "PL_ADJ_8250", "account": "Miscellaneous Adjustment", "debit": 1301.70, "credit": 0, "memo": "Takealot, Galitos, Kobeli and Cash Crusade purchases"},

        {"account_code": "PL_OPEX_6002", "account": "Fleet Insurance", "debit": 242.11, "credit": 0, "memo": "November amortisation of Alliance prepaid insurance"},
        {"account_code": "BS_CA_1400", "account": "Prepaid Expenses", "debit": 0, "credit": 242.11, "memo": "Release November prepaid insurance portion"},

        {"account_code": "BS_CA_1000", "account": "Cash & Bank", "debit": 0, "credit": 18868.17, "memo": "November bank payments excluding Galitos receipt/reversal"},
    ]

    total_debit = sum(money(x["debit"]) for x in lines)
    total_credit = sum(money(x["credit"]) for x in lines)

    print("Total debit :", total_debit)
    print("Total credit:", total_credit)

    if total_debit != total_credit:
        raise RuntimeError(f"Unbalanced journal: debit={total_debit} credit={total_credit}")

    entry = {
        "date": "2024-11-30",
        "ref": ref,
        "description": "November 2024 bank catch-up excluding AR receipt",
        "source": "bank",
        "currency": "LSL",
        "lines": lines,
    }

    journal_id = db_service.post_journal(company_id, entry)
    print(f"Posted November bank catch-up journal_id={journal_id}")
    print("=== done ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise