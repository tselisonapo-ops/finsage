# scripts/post_tbr_opening_non_fixed_assets.py
import os
import sys
import traceback
from decimal import Decimal, ROUND_HALF_UP


def money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def main():
    print("=== Posting TBR non-fixed-asset opening balances ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    dsn = os.getenv("MASTER_DB_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("MASTER_DB_DSN or DATABASE_URL is not set")

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)
    ref = "OPENING-BAL-2024-07-31"

    existing = db_service.fetch_one(f"""
        SELECT id
        FROM {schema}.journal
        WHERE company_id = %s
          AND LOWER(TRIM(ref)) = LOWER(TRIM(%s))
        LIMIT 1
    """, (company_id, ref))

    if existing:
        print(f"Skipping: opening journal already exists journal_id={existing['id']}")
        return

    lines = [
        # -------------------------
        # Current assets
        # -------------------------
        {
            "account_code": "BS_CA_1000",
            "account": "Cash & Bank",
            "debit": 699.70,
            "credit": 0,
            "memo": "Opening bank balance"
        },
        {
            "account_code": "BS_CA_1700",
            "account": "Accounts Receivable",
            "debit": 16180.00,
            "credit": 0,
            "memo": "Opening accounts receivable"
        },

        # Negative cash-in-hand balance from balance sheet
        {
            "account_code": "BS_CA_1010",
            "account": "Petty Cash",
            "debit": 0,
            "credit": 318.30,
            "memo": "Opening cash in hand credit balance"
        },

        # -------------------------
        # Liabilities
        # -------------------------
        {
            "account_code": "BS_CL_2100",
            "account": "Loan Payable",
            "debit": 0,
            "credit": 31111.12,
            "memo": "Opening bank loan"
        },
        {
            "account_code": "BS_CL_2200",
            "account": "Accounts Payable",
            "debit": 0,
            "credit": 10031.00,
            "memo": "Opening accounts payable"
        },
        {
            "account_code": "BS_NCL_2600",
            "account": "Loan Payable - Non-Current",
            "debit": 0,
            "credit": 3889.99,
            "memo": "Opening other loan"
        },
        {
            "account_code": "BS_CL_2613",
            "account": "Accrued Expenses",
            "debit": 0,
            "credit": 5340.00,
            "memo": "Opening accrued expenses"
        },

        # -------------------------
        # Equity
        # -------------------------
        {
            "account_code": "BS_EQ_3001",
            "account": "Owner's Capital",
            "debit": 0,
            "credit": 8669.99,
            "memo": "Opening equity"
        },
        {
            "account_code": "BS_EQ_3003",
            "account": "Retained Earnings",
            "debit": 1361.97,
            "credit": 0,
            "memo": "Opening retained losses"
        },

        # -------------------------
        # Bridge for asset module
        # Asset opening-balance journals will CREDIT this same account.
        # -------------------------
        {
            "account_code": "BS_EQ_3105",
            "account": "Opening Balance Equity",
            "debit": 41118.73,
            "credit": 0,
            "memo": "Bridge for fixed assets inserted through PPE opening balance"
        },
    ]

    total_debit = sum(money(line["debit"]) for line in lines)
    total_credit = sum(money(line["credit"]) for line in lines)

    print("Total debit :", total_debit)
    print("Total credit:", total_credit)

    if total_debit != total_credit:
        raise RuntimeError(
            f"Opening journal is not balanced: debit={total_debit} credit={total_credit}"
        )

    entry = {
        "date": "2024-07-31",
        "ref": ref,
        "description": (
            "Opening balances from TBR Deliveries balance sheet at 31 July 2024 - "
            "excluding PPE cost and accumulated depreciation posted through asset register"
        ),
        "source": "opening_balance_migration",
        "currency": "LSL",
        "lines": lines,
    }

    journal_id = db_service.post_journal(company_id, entry)

    print(f"Posted opening non-fixed-asset journal_id={journal_id}")
    print("=== done ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise