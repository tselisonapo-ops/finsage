# BackEnd/scripts/post_tbr_august_2024_catchup.py
import os
import sys
import traceback
from decimal import Decimal, ROUND_HALF_UP


def money(value):
    return Decimal(str(value)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP
    )


def main():
    print("=== Posting TBR August 2024 catch-up journal ===")

    ROOT = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )

    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))

    if not company_id:
        raise RuntimeError(
            "Set COMPANY_ID before running this script"
        )

    schema = db_service.company_schema(company_id)

    ref = "TBR-BANK-CATCHUP-2024-08"

    # ------------------------------------------------------------------
    # Estimated related-party motorbike financing
    #
    # Director obtained personal financing used entirely for
    # business delivery motorbikes.
    #
    # Estimated assumptions:
    # - capital approximately 30,000
    # - monthly instalment 1,200
    # - estimated term 5 years
    #
    # These estimates can later be refined if loan schedules
    # or lender statements become available.
    # ------------------------------------------------------------------

    total_loan_payment = money("1200.00")

    estimated_interest = money(
        os.getenv("AUG2024_LOAN_INTEREST", "615.00")
    )

    estimated_principal = (
        total_loan_payment - estimated_interest
    )

    if estimated_principal < 0:
        raise RuntimeError(
            "Loan interest cannot exceed total payment"
        )

    existing = db_service.fetch_one(f"""
        SELECT id
        FROM {schema}.journal
        WHERE company_id = %s
          AND LOWER(TRIM(ref)) = LOWER(TRIM(%s))
        LIMIT 1
    """, (company_id, ref))

    if existing:
        print(
            f"Skipping: journal already exists "
            f"journal_id={existing['id']}"
        )
        return

    lines = [

        # --------------------------------------------------------------
        # Receipt from Galitos for July invoice
        # July revenue already existed in opening receivables
        # --------------------------------------------------------------

        {
            "account_code": "BS_CA_1000",
            "account": "Cash & Bank",
            "debit": 16180.00,
            "credit": 0,
            "memo": (
                "Galitos Maseru Jul24 receipt "
                "- clears opening receivable"
            )
        },
        {
            "account_code": "BS_CA_1700",
            "account": "Accounts Receivable",
            "debit": 0,
            "credit": 16180.00,
            "memo": (
                "Clear opening receivable "
                "for July Galitos invoice"
            )
        },

        # --------------------------------------------------------------
        # Operating expenses
        # --------------------------------------------------------------

        {
            "account_code": "PL_COS_5005",
            "account": "Vehicle Repairs & Maintenance",
            "debit": 2340.00,
            "credit": 0,
            "memo": "Repairs paid 02 Aug"
        },
        {
            "account_code": "PL_OPEX_6001",
            "account": "Rent Expense",
            "debit": 2146.00,
            "credit": 0,
            "memo": "B11 office rent paid 02 Aug"
        },
        {
            "account_code": "PL_OPEX_6000",
            "account": "Driver & Ops Salaries",
            "debit": 5340.00,
            "credit": 0,
            "memo": "Salaries paid 02 Aug"
        },

        # --------------------------------------------------------------
        # Related-party motorbike financing repayment
        # --------------------------------------------------------------

        {
            "account_code": "BS_CL_2100",
            "account": "Loan Payable",
            "debit": float(estimated_principal),
            "credit": 0,
            "memo": "Principal portion of motorbike financing"
        },
        {
            "account_code": "PL_FIN_7210",
            "account": "Interest Expense",
            "debit": float(estimated_interest),
            "credit": 0,
            "memo": "Interest portion of motorbike financing"
        },

        # --------------------------------------------------------------
        # Fuel purchases
        # --------------------------------------------------------------

        {
            "account_code": "PL_COS_5004",
            "account": "Fuel Expense",
            "debit": 985.91,
            "credit": 0,
            "memo": (
                "POS fuel purchases - "
                "Lesotho Nissan / filling station"
            )
        },

        # --------------------------------------------------------------
        # ATM withdrawals
        #
        # Purpose could not be reconstructed reliably from
        # available bank statements.
        # --------------------------------------------------------------

        {
            "account_code": "PL_ADJ_8250",
            "account": "Miscellaneous Adjustment",
            "debit": 3010.00,
            "credit": 0,
            "memo": (
                "ATM cash withdrawals during reconstruction "
                "- exact purpose unknown"
            )
        },

        # --------------------------------------------------------------
        # Other operating expenses
        # --------------------------------------------------------------

        {
            "account_code": "PL_OPEX_6800",
            "account": "Staff Welfare",
            "debit": 68.90,
            "credit": 0,
            "memo": "Galitos restaurant POS purchase"
        },
        {
            "account_code": "PL_OPEX_6720",
            "account": "Office Supplies",
            "debit": 729.00,
            "credit": 0,
            "memo": (
                "Game Discount and Highveld Office "
                "purchases"
            )
        },
        {
            "account_code": "PL_OPEX_6105",
            "account": "Bank Charges",
            "debit": 373.07,
            "credit": 0,
            "memo": "Bank charges and service fees"
        },

        # --------------------------------------------------------------
        # Total August bank outflows
        # --------------------------------------------------------------

        {
            "account_code": "BS_CA_1000",
            "account": "Cash & Bank",
            "debit": 0,
            "credit": 16192.88,
            "memo": "August bank payments and charges"
        },
    ]

    total_debit = sum(
        money(line["debit"]) for line in lines
    )

    total_credit = sum(
        money(line["credit"]) for line in lines
    )

    print("Total debit :", total_debit)
    print("Total credit:", total_credit)

    if total_debit != total_credit:
        raise RuntimeError(
            f"Unbalanced journal: "
            f"debit={total_debit} "
            f"credit={total_credit}"
        )

    entry = {
        "date": "2024-08-31",
        "ref": ref,
        "description": (
            "August 2024 bank catch-up journal "
            "excluding August receivable invoice revenue"
        ),
        "source": "bank",
        "currency": "LSL",
        "lines": lines,
    }

    journal_id = db_service.post_journal(
        company_id,
        entry
    )

    print(
        f"Posted August catch-up "
        f"journal_id={journal_id}"
    )

    print("=== done ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise