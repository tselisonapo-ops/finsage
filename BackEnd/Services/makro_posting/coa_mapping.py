"""
COA mapping for the Makro Marketplace posting extension.

Every code below is taken directly from the company_45.coa dump
(the chart of accounts for PulseCart (Pty) Ltd).  When the parser
sees a Sales / Sales return line on a Makro remittance advice, the
journal generator looks the role up here and writes the matching
account code into the journal line.

Mapping summary (signed-amount model):

  Sale (gross positive, commission & transport deducted by Makro):
    DR  AR-Makro (BS_CA_9002)            gross_amount (VAT-incl)
    CR  Sales Revenue (PL_REV_4000)      gross_amount / 1.15
    CR  VAT Output (BS_CL_2310)          gross_amount * 0.15 / 1.15
    DR  Commission Expense (PL_OPEX_6390)  commission_net
    DR  VAT Input (BS_CA_1410)             commission_vat
    DR  Transport Expense (PL_OPEX_6795)   transport_net
    DR  VAT Input (BS_CA_1410)             transport_vat
    CR  AR-Makro (BS_CA_9002)            (commission + transport)  # deductions

  Sales return (gross negative, commission refunded, transport re-charged):
    DR  Sales Returns & Allowances (PL_ADJ_8000)   |gross| / 1.15
    DR  VAT Output (BS_CL_2310)                    |gross| * 0.15 / 1.15  (reversal)
    CR  AR-Makro (BS_CA_9002)                      |gross|
    DR  AR-Makro (BS_CA_9002)                      commission_refund
    CR  Commission Expense (PL_OPEX_6390)          commission_refund / 1.15  (reversal)
    CR  VAT Input (BS_CA_1410)                     commission_refund * 0.15 / 1.15
    DR  Transport Expense (PL_OPEX_6795)           |transport| / 1.15  (return shipping)
    DR  VAT Input (BS_CA_1410)                     |transport| * 0.15 / 1.15
    CR  AR-Makro (BS_CA_9002)                      |transport|

  Bank receipt (one per remittance, ties to Payment Reference No):
    DR  Cash & Bank (BS_CA_1000)        net_payment
    CR  AR-Makro (BS_CA_9002)           net_payment

VAT rate: South Africa standard rate = 15%.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class MakroCOAMapping:
    """Per-company mapping of Makro flow roles to FinSage COA codes.

    Override the codes here to re-target another company.  Every code
    must already exist in the target company's `coa` table.
    """

    # Control / working accounts
    ar_makro: str               # Accounts Receivable Control
    cash_bank: str              # Cash & Bank

    # VAT
    vat_output: str             # VAT Output (output VAT on sales)
    vat_input: str              # VAT Input (input VAT on commission / transport)

    # Revenue
    sales_revenue: str          # Revenue from Contracts with Customers
    sales_returns: str          # Sales Returns & Allowances (contra-revenue)

    # Marketplace expenses
    commission_expense: str     # Sundry Expenses (closest fit; can be split out)
    transport_expense: str      # Postage & Couriers

    # Config
    vat_rate: float = 0.15      # SA standard rate


# Hard-coded mapping for company_45 (PulseCart (Pty) Ltd).
# Every code is taken directly from `SELECT code FROM company_45.coa`.
COA_MAPPING_COMPANY_45 = MakroCOAMapping(
    ar_makro="BS_CA_9002",            # Accounts Receivable Control
    cash_bank="BS_CA_1000",           # Cash & Bank
    vat_output="BS_CL_2310",          # VAT Output
    vat_input="BS_CA_1410",           # VAT Input
    sales_revenue="PL_REV_4000",      # Revenue from Contracts with Customers
    sales_returns="PL_ADJ_8000",      # Sales Returns & Allowances
    commission_expense="PL_OPEX_6390",  # Sundry Expenses (commission fees)
    transport_expense="PL_OPEX_6795",   # Postage & Couriers (transport fees)
    vat_rate=0.15,
)


# Human-readable mapping table for the design doc / audit trail.
COA_MAPPING_TABLE_COMPANY_45 = [
    ("AR-Makro (marketplace receivable)", "BS_CA_9002",  "Accounts Receivable Control"),
    ("Cash & Bank (settlement)",          "BS_CA_1000",  "Cash & Bank"),
    ("VAT Output (sales)",                "BS_CL_2310",  "VAT Output"),
    ("VAT Input (commission/transport)",  "BS_CA_1410",  "VAT Input"),
    ("Sales Revenue (net)",               "PL_REV_4000", "Revenue from Contracts with Customers"),
    ("Sales Returns & Allowances",        "PL_ADJ_8000", "Sales Returns & Allowances"),
    ("Marketplace Commission Expense",    "PL_OPEX_6390","Sundry Expenses"),
    ("Marketplace Transport Expense",     "PL_OPEX_6795","Postage & Couriers"),
]
