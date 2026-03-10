# BackEnd/Services/coa_service.py
from __future__ import annotations

from typing import Optional, List, Tuple, Dict, Any
from BackEnd.Services.utils.industry_utils import normalize_industry_pair, slugify, TEMPLATE_INDUSTRY_ALIASES, SUB_INDUSTRY_ALIASES
from BackEnd.Services.industry_profiles import get_industry_profile

# ==============================================================
#                       CONFIG / CONSTANTS
# ==============================================================

# When an industry/subindustry account uses the same code as a GENERAL account,
# the GENERAL row is re-numbered starting at this base (9000, 9001, ...).
DISPLACED_CODE_BASE = 9000

# (name, code, category, reporting_group, description, ifrs_tag)
AccountRow = Tuple[str, str, str, str, str, Optional[str]]
ListAccountRow = List[AccountRow]

# ==============================================================
#                   GENERAL ACCOUNTS (ALWAYS INCLUDED)
# ==============================================================

GENERAL_ACCOUNTS_LIST: ListAccountRow = [
    # =========================
    # CASH / BANK / TREASURY
    # =========================
    ('Cash & Bank', '1000', 'Asset', 'Cash & Equivalents',
     'Money held in bank accounts and petty cash', None),
    ('Petty Cash', '1010', 'Asset', 'Cash & Equivalents',
     'Small cash float for minor expenses', None),
    ('Bank Clearing / Suspense', '1050', 'Asset', 'Cash & Equivalents',
     'Temporary clearing account for unmatched bank items', None),

    # =========================
    # TRADE RECEIVABLES / CUSTOMERS
    # =========================
    ('Accounts Receivable', '9002', 'Asset', 'Current Assets',
     'Amounts due from customers for general business', 'IFRS 9'),
    ('Allowance for Doubtful Debts', '1705', 'Asset', 'Current Assets',
     'Contra-asset: expected credit loss allowance for receivables', 'IFRS 9'),
    ('Customer Deposits (Receivable Clearing)', '1715', 'Asset', 'Current Assets',
     'Customer advances / deposits clearing if treated as receivable-side operational account', None),

    # =========================
    # PREPAIDS / OTHER CURRENT ASSETS
    # =========================
    ('Prepaid Expenses', '1400', 'Asset', 'Current Assets',
     'Expenses paid in advance (e.g., insurance, rent)', None),
    ('Deposits Paid', '1405', 'Asset', 'Current Assets',
     'Deposits paid to suppliers/landlords (recoverable)', None),

    # =========================
    # VAT / TAX ASSETS & LIABILITIES
    # =========================
    ('VAT Input',  '1410', 'Asset',     'Current Assets',
     'Input VAT on purchases - recoverable from Tax Authority', None),
    ('VAT Output', '2310', 'Liability', 'Current Liabilities',
     'Output VAT on sales - payable to Tax Authority', None),
    ('VAT Payable (Net)', '2300', 'Liability', 'Current Liabilities',
     'Net VAT payable/receivable control (optional, if you net off)', None),
    ('PAYE / Withholding Tax Payable', '2320', 'Liability', 'Current Liabilities',
     'Employee withholding tax payable to tax authority', None),
    ('Income Tax Payable', '2330', 'Liability', 'Current Liabilities',
     'Current income tax liability', 'IAS 12'),
    ('Deferred Tax', '2605', 'Liability', 'Current Liabilities',
     'Deferred tax liability (or asset if debit balance)', 'IAS 12'),
    ('Provision for Other Liabilities', '2500', 'Liability', 'Non-Current Liabilities',
    'Provision for warranties or other long-term obligations', None),
    ('Provision for Bonuses', '2510', 'Liability', 'Current Liabilities',
    'Accrued staff bonuses', None),

    # =========================
    # INVENTORY
    # =========================
    ('Inventory', '1500', 'Asset', 'Current Assets',
     'Goods held for resale or materials used in production', 'IAS 2'),
    ('Inventory - Raw Materials', '1501', 'Asset', 'Current Assets',
     'Raw materials inventory', 'IAS 2'),
    ('Inventory - Finished Goods', '1502', 'Asset', 'Current Assets',
     'Finished goods inventory', 'IAS 2'),
    ('Inventory Write-Down / Obsolescence', '1509', 'Asset', 'Current Assets',
     'Contra inventory for write-downs', 'IAS 2'),

    # =========================
    # PROPERTY, PLANT & EQUIPMENT (PPE)
    # =========================
    ('Office Furniture', '1100', 'Asset', 'Property, Plant & Equipment',
     'General tangible assets for administrative use', "IAS 16"),
    ('Computer Equipment', '1105', 'Asset', 'Property, Plant & Equipment',
     'Computers, printers, and IT hardware', "IAS 16"),
    ('Motor Vehicles', '1110', 'Asset', 'Property, Plant & Equipment',
     'Company vehicles used for operations', "IAS 16"),
    ('Land', '1510', 'Asset', 'Property, Plant & Equipment',
     'Owned land (non-depreciable)', "IAS 16"),
    ('Buildings', '1520', 'Asset', 'Property, Plant & Equipment',
     'Owned business premises', "IAS 16"),
    ('Investment Property', '1522', 'Asset', 'Non-Current Assets', 
     'Building held for rental', 'IAS 40'),
    ('Accumulated Depreciation - Buildings', '1521', 'Asset',
     'Accumulated Depreciation', 'Contra-asset for buildings', "IAS 16"),
    ('Accumulated Depreciation - Equipment', '1590', 'Asset',
     'Accumulated Depreciation', 'Contra-asset for equipment', "IAS 16"),

    # =========================
    # INTANGIBLES
    # =========================
    ('Intangible Asset', '1800', 'Asset', 'Intangible Assets',
     'Intangible assets such as software licenses or trademarks', "IAS 38"),
    ('Accumulated Amortization - Intangibles', '1890', 'Asset', 'Intangible Assets',
     'Contra-asset for accumulated amortization', "IAS 38"),

    # =========================
    # IFRS 16 LEASES
    # =========================
    ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets',
     'Asset for leased property or equipment', 'IFRS 16'),
    ('Lease Receivable - Current', '1710', 'Asset', 'Current Assets',
     'Short-term lease receivable (amounts due within 12 months)', 'IFRS 16'),
    ('Lease Receivable - Non-Current', '1720', 'Asset', 'Non-Current Assets',
     'Long-term lease receivable (amounts due after 12 months)', 'IFRS 16'),
    ('Lease Liability - Current', '2610', 'Liability', 'Current Liabilities',
     'Current portion of lease obligations due within 12 months', 'IFRS 16'),
    ('Lease Liability - Non-Current', '2620', 'Liability', 'Non-Current Liabilities',
     'Long-term lease obligations due after 12 months', 'IFRS 16'),

    # =========================
    # TRADE PAYABLES / ACCRUALS
    # =========================
    ('Accounts Payable', '2200', 'Liability', 'Current Liabilities',
     'Money owed to general vendors and suppliers', "IFRS 9"),
    ('Accrued Expenses', '2210', 'Liability', 'Current Liabilities',
     'Expenses incurred but not yet invoiced or paid', None),
    ('Bank Overdraft', '2105', 'Liability', 'Current Liabilities',
     'Short-term bank overdraft facility', None),
    ('Loan Payable - Current', '2100', 'Liability', 'Current Liabilities',
     'Short-term portion of loans', None),
    ('Loan Payable - Non-Current', '2600', 'Liability', 'Non-Current Liabilities',
     'Long-term borrowings', None),
    ('Salaries Payable', '2220', 'Liability', 'Current Liabilities',
    'Salaries & Wages due for payment', None),

    # =========================
    # REVENUE / CONTRACTS
    # =========================
    ('Sales Revenue', '4000', 'Income', 'Sales Revenue',
     'Revenue from sales of goods', 'IFRS 15'),
    ('Service Income', '4100', 'Income', 'Service Revenue',
     'Revenue from rendering services', 'IFRS 15'),
    ('Contract Income', '4120', 'Income', 'Service Revenue',
     'Revenue recognized from contracts', 'IFRS 15'),
    ('Deferred Income', '2700', 'Liability', 'Current Liabilities',
     'Payments received for goods/services not yet delivered', 'IFRS 15'),

    # --- Revenue adjustments / discounts / returns (PL_ADJ family) ---
    ('Sales Returns & Allowances', '8000', 'Adjustment', 'Revenue Adjustments',
     'Contra revenue: returns, discounts, allowances', 'IFRS 15'),
    ('Sales Discounts', '8010', 'Adjustment', 'Revenue Adjustments',
     'Early payment discounts and other sales discounts granted to customers', 'IFRS 15'),
    ('Sales Rebates', '8020', 'Adjustment', 'Revenue Adjustments',
     'Volume rebates and other retrospective price reductions', 'IFRS 15'),

    # =========================
    # COST OF SALES / DIRECT COSTS
    # =========================
    ('Purchases', '6000', 'Expense', 'Cost of Sales',
     'Direct cost of goods sold', 'IAS 2'),
    ('Cost of Sales', '6100', 'Expense', 'Cost of Sales',
     'Direct cost associated with revenue', None),

    # =========================
    # OPERATING EXPENSES (UNIVERSAL)
    # =========================
    ('Salaries & Wages', '6200', 'Expense', 'Operating Expenses',
     'Compensation paid to employees', "IAS 19"),
    ('Employer Contributions', '6205', 'Expense', 'Operating Expenses',
     'Employer UIF/pension/medical contributions', "IAS 19"),
    ('Rent Expense', '6400', 'Expense', 'Operating Expenses',
     'Premises rent (non-IFRS 16 or variable rent)', None),
    ('Utilities Expense', '6300', 'Expense', 'Operating Expenses',
     'Electricity, water, internet', None),
    ('Telephone & Internet', '6310', 'Expense', 'Operating Expenses',
     'Communication services', None),
    ('Repairs & Maintenance', '6500', 'Expense', 'Operating Expenses',
     'Repairs and upkeep of premises/equipment', None),
    ('Insurance Expense', '6510', 'Expense', 'Operating Expenses',
     'Business insurance premiums', None),
    ('Fuel & Travel', '6600', 'Expense', 'Operating Expenses',
     'Travel, fuel, transport, accommodation', None),
    ('Advertising & Marketing', '6700', 'Expense', 'Operating Expenses',
     'Marketing and promotional expenses', None),
    ('Professional Fees', '6710', 'Expense', 'Operating Expenses',
     'Legal, accounting, consulting fees', None),
    ('Office Supplies', '6720', 'Expense', 'Operating Expenses',
     'Stationery and consumables', None),
    ('Bank Charges', '6105', 'Expense', 'Operating Expenses',
     'Bank service fees and charges', None),
    ('Income Tax Expense - Current', '7300', 'Expense', 'Tax Expense',
    'Current period income tax expense', 'IAS 12'),
    ('Income Tax Expense - Deferred', '7310', 'Expense', 'Tax Expense',
    'Deferred tax expense / (credit)', 'IAS 12'),
    ('Cleaning & Office Maintenance', '6790', 'Expense', 'Operating Expenses',
    'Cleaning services and minor office maintenance', None),
    ('Postage & Couriers', '6795', 'Expense', 'Operating Expenses',
    'Postage, couriers and document delivery', None),
    ('Staff Welfare', '6800', 'Expense', 'Operating Expenses',
    'Tea, coffee and general staff welfare costs', None),
    ('Meeting & Conference Costs', '6810', 'Expense', 'Operating Expenses',
    'Venue hire and costs for meetings and conferences', None),
    ('Direct Materials', '6030', 'Expense', 'Cost of Sales',
    'Materials consumed directly in providing goods or services', None),
    ('Direct Subcontractor Costs', '6040', 'Expense', 'Cost of Sales',
    'External subcontractors directly involved in delivery', None),
    ('Other Operating Income', '4350', 'Income', 'Other Income',
    'Miscellaneous operating income not classified elsewhere', None),
    ('Sundry Income', '4360', 'Income', 'Other Income',
    'Small ad hoc income items (sundry receipts)', None),
    ('Gain on Disposal of Assets', '4370', 'Income', 'Other Income',
    'Gains on sale of property, plant and equipment', None),
    ('Recovery of Expenses', '4380', 'Income', 'Other Income',
    'Recoveries of costs previously expensed', None),    

    # =========================
    # DEPRECIATION / AMORTIZATION
    # =========================
    ('Depreciation', '7100', 'Expense', 'Depreciation & Amortization',
     'Expense for usage of fixed assets', "IAS 16"),
    ('Amortization', '7200', 'Expense', 'Depreciation & Amortization',
     'Amortization of intangible assets', "IAS 38"),
    ('Lease Amortization', '7110', 'Expense', 'Depreciation & Amortization',
     'Systematic expense of Right-of-Use asset', 'IFRS 16'),

    # =========================
    # FINANCE / FX / OTHER
    # =========================
    ('Interest Expense', '7210', 'Expense', 'Finance Costs',
     'Interest paid on loans/overdrafts', None),
    ('Interest Income', '4300', 'Income', 'Other Income',
     'Interest earned on deposits/investments', None),
    ('Foreign Exchange Gain', '4310', 'Income', 'Other Income',
     'Realized/unrealized foreign exchange gains', "IAS 21"),
    ('Foreign Exchange Loss', '7220', 'Expense', 'Other Expense',
     'Realized/unrealized foreign exchange losses', "IAS 21"),

    # =========================
    # EQUITY
    # =========================
    ('Owner Capital', '3000', 'Equity', 'Capital',
     'Owners investment in the business', None),
    ('Retained Earnings', '3100', 'Equity', 'Retained Earnings',
     'Accumulated profits/losses retained by the business', None),
    ('Drawings / Dividends', '3110', 'Equity', 'Equity Changes',
     'Owner withdrawals or dividends', None),

    # =========================
    # ADJUSTMENTS / JOURNAL HELPERS
    # =========================
    ('Accrual Adjustment', '8200', 'Adjustment', 'Other Adjustments',
     'Adjustment for unrecorded revenue or expense', None),
    ('Depreciation Adjustment', '8100', 'Adjustment', 'Depreciation & Amortization',
     'Adjustment to fixed asset depreciation', None),
    ('Bad Debt Write-Off', '8210', 'Adjustment', 'Other Adjustments',
     'Write-off of irrecoverable receivables', None),
    ('Year-End Reclassification Adjustment', '8220', 'Adjustment', 'Other Adjustments',
     'General reclassification / clean-up adjustments at period end', None),
    ('Inventory Adjustment', '8230', 'Adjustment', 'Other Adjustments',
    'General inventory quantity or valuation adjustments', None),
    ('Opening Balance Adjustment', '8240', 'Adjustment', 'Other Adjustments',
    'General opening balance or prior period adjustment', None),
    ('Miscellaneous Adjustment', '8250', 'Adjustment', 'Other Adjustments',
    'Other small balancing or correction entries', None),
]

# ==============================================================
#                BASE INDUSTRY TEMPLATES (FULL SET)
# ==============================================================

INDUSTRY_TEMPLATES: Dict[str, ListAccountRow] = {
    "Agriculture": [
        ('Farming Equipment', '1100', 'Asset', 'Property, Plant & Equipment', 'Tangible assets used in farming operations', 'IAS 16'),
        ('Livestock -Biological Asset', '1510', 'Asset', 'Biological Assets', 'Animals/plants held for produce or sale', 'IAS 41'),
        ('Crop Inventory', '1520', 'Asset', 'Inventories', 'Harvested produce or work in progress', 'IAS 2'),
        ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets', 'Asset for long-term leased land or property', 'IFRS 16'),
        ('Contract Asset', '1700', 'Asset', 'Current Assets', 'Right to consideration in exchange for goods/services transferred to a customer', 'IFRS 15'),
        ('Intangible Asset', '1800', 'Asset', 'Intangible Assets', 'Non-physical asset like patents or quotas', 'IAS 38'),
        ('Asset Held for Sale', '1900', 'Asset', 'Non-Current Assets', 'Equipment or property whose carrying amount will be recovered principally through a sale transaction', 'IFRS 5'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Seasonal Loans Payable', '2100', 'Liability', 'Current Liabilities', 'Loans repayable within the current season/year', 'IFRS 9'),
        ('Fertilizer Payable', '2200', 'Liability', 'Current Liabilities', 'Money owed to suppliers for farming inputs', 'IFRS 9'),
        ('Lease Liability', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased assets (e.g., land)', 'IFRS 16'),
        ('Contract Liability', '2700', 'Liability', 'Current Liabilities', 'Obligation to transfer goods/services to a customer (e.g., prepaid produce)', 'IFRS 15'),
        ('Farm Capital', '3000', 'Equity', 'Capital', 'Owners investment in the agricultural entity', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the farm', 'IAS 1'),
        ('Produce Sales', '4000', 'Income', 'Sales Revenue', 'Revenue from bulk sales of harvested goods', 'IFRS 15'),
        ('Farmgate Revenue', '4100', 'Income', 'Sales Revenue', 'Revenue from direct-to-consumer sales at the farm', 'IFRS 15'),
        ('Revenue Recognition -IFRS 15', '4200', 'Income', 'Sales Revenue', 'Adjustment account for revenue based on IFRS 15 principles', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income earned from leasing assets to other parties', 'IFRS 16'),
        ('Fertilizer Expense', '6100', 'Expense', 'Cost of Sales', 'Direct cost of farming inputs', 'IAS 2'),
        ('Labour Expense', '6200', 'Expense', 'Operating Expenses', 'Wages paid to farm workers', 'IAS 1/19'),
        ('Veterinary Costs', '6300', 'Expense', 'Operating Expenses', 'Cost of animal healthcare', 'IAS 1'),
        ('Lease Amortization', '7100', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Amortization Expense', '7200', 'Expense', 'Depreciation & Amortization', 'Systematic expense of intangible assets', 'IAS 38'),
        ('Harvest Revaluation', '8000', 'Adjustment', 'Other Adjustments', 'Fair value adjustment of biological assets at harvest', 'IAS 41'),
        ('Accrued Labour', '8100', 'Adjustment', 'Other Adjustments', 'Adjustment for unrecorded wages at period-end', 'IAS 19'),
        ('Impairment Loss', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for loss in value of assets (e.g., equipment)', 'IAS 36'),
        ('Recoverable Amount Adjustment', '8300', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment to reflect net selling price or value in use of assets', 'IAS 36'),
        ('Discontinued Operation', '8400', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for disposal of a major business component', 'IFRS 5'),
    ],
    "Body Corporate": [
        ('Monthly Levies', '4000', 'Income', 'Service Revenue', 'Recurring fees charged to unit owners', 'IFRS 15'),
        ('Special Contributions', '4100', 'Income', 'Other Income', 'Non-recurring fees for major projects', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income earned from leasing common property', 'IFRS 16'),
        ('Security Services', '6100', 'Expense', 'Operating Expenses', 'Cost of contracted security personnel and systems', 'IAS 1'),
        ('Repairs & Maintenance', '6200', 'Expense', 'Operating Expenses', 'Cost of routine upkeep of common areas', 'IAS 1'),
        ('Insurance Premiums', '6300', 'Expense', 'Operating Expenses', 'Cost of body corporate insurance coverage', 'IAS 1'),
        ('Amortization of Shared Systems', '7200', 'Expense', 'Depreciation & Amortization', 'Expense for shared intangible systems (e.g., access software)', 'IAS 38'),
        ('Lease Amortization', '7100', 'Expense', 'Depreciation & Amortization', 'Systematic expense of leased assets', 'IFRS 16'),
        ('Maintenance Reserve Fund', '1050', 'Asset', 'Cash & Equivalents', 'Cash set aside for future major maintenance', 'IAS 7'),
        ('Receivables -Levies', '1700', 'Asset', 'Current Assets', 'Levy amounts due from unit owners', 'IFRS 9'),
        ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets', 'Asset for long-term leased property', 'IFRS 16'),
        ('Prepaid System Licenses', '1400', 'Asset', 'Current Assets', 'License fees paid in advance for future use', 'IAS 1'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing property', 'IFRS 16'),
        ('Accrued Maintenance', '2200', 'Liability', 'Current Liabilities', 'Estimated costs for un-invoiced maintenance work', 'IAS 37'),
        ('Contract Liability -Prepaid Levies', '2700', 'Liability', 'Current Liabilities', 'Obligation for levies received but not yet earned', 'IFRS 15'),
        ('Lease Liability', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased property', 'IFRS 16'),
        ('Accumulated Surplus', '3100', 'Equity', 'Retained Earnings', 'Accumulated excess of income over expenditure', 'IAS 1'),
        ('Prepaid Insurance Adjustment', '8000', 'Adjustment', 'Other Adjustments', 'Reclassification of prepaid expense to actual expense', 'IAS 1'),
        ('Amortization Adjustment', '8100', 'Adjustment', 'Other Adjustments', 'Adjustment to amortization expense', 'IAS 38'),
        ('Lease Asset Depreciation', '8200', 'Adjustment', 'Depreciation & Amortization', 'Depreciation expense on the Right-of-Use asset', 'IFRS 16'),
    ],
    "Call Center": [
        ('Client Billing Revenue', '4000', 'Income', 'Service Revenue', 'Primary income from client call/support services', 'IFRS 15'),
        ('Commission Income', '4100', 'Income', 'Other Income', 'Income earned from third-party commissions', 'IFRS 15'),
        ('Revenue Recognition -Contractual', '4200', 'Income', 'Service Revenue', 'Adjustment for revenue recognized under complex contracts', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income earned from sub-leasing equipment or space', 'IFRS 16'),
        ('Agent Salaries', '6100', 'Expense', 'Operating Expenses', 'Wages paid to call center agents', 'IAS 19'),
        ('Telecom Costs', '6200', 'Expense', 'Operating Expenses', 'Cost of telephone, internet, and communication lines', 'IAS 1'),
        ('Training & Development', '6300', 'Expense', 'Operating Expenses', 'Cost of training materials and staff development', 'IAS 1'),
        ('Lease Amortization', '7100', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Office Equipment', '1100', 'Asset', 'Property, Plant & Equipment', 'Tangible assets like desks and computers', 'IAS 16'),
        ('Client Receivables', '1700', 'Asset', 'Current Assets', 'Amounts due from clients for services rendered', 'IFRS 15'),
        ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets', 'Asset for leased office premises', 'IFRS 16'),
        ('Intangible Assets -CRM Systems', '1800', 'Asset', 'Intangible Assets', 'Non-physical asset for customer relationship software', 'IAS 38'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Deferred Income', '2700', 'Liability', 'Current Liabilities', 'Payments received for services not yet delivered', 'IFRS 15'),
        ('Lease Liability', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased office premises', 'IFRS 16'),
        ('Accrued Salaries', '2200', 'Liability', 'Current Liabilities', 'Wages incurred but not yet paid at period-end', 'IAS 19'),
        ('BPO Startup Capital', '3000', 'Equity', 'Capital', 'Owners initial investment in the business process outsourcing firm', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the call center', 'IAS 1'),
        ('Accrued Telecom Expense', '8000', 'Adjustment', 'Other Adjustments', 'Adjustment for unrecorded telecom costs', 'IAS 1'),
        ('Amortization Adjustment', '8100', 'Adjustment', 'Other Adjustments', 'Adjustment to amortization expense', 'IAS 38'),
        ('Depreciation -Office Equipment', '8200', 'Adjustment', 'Depreciation & Amortization', 'Depreciation expense on call center equipment', 'IAS 16'),
        ('Recoverability Check', '8300', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment to assess ability to recover asset value', 'IAS 36'),
    ],
    "Car Dealership": [
        ('Vehicle Inventory', '1500', 'Asset', 'Inventories', 'Vehicles held for sale in the ordinary course of business', 'IAS 2'),
        ('Demo Fleet', '1110', 'Asset', 'Property, Plant & Equipment', 'Vehicles used for customer test drives and promotion', 'IAS 16'),
        ('Receivables -Vehicle Sales', '1700', 'Asset', 'Current Assets', 'Amounts due from customers for vehicle sales', 'IFRS 15'),
        ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets', 'Asset for leased property or equipment', 'IFRS 16'),
        ('Intangible Asset -Dealership License', '1800', 'Asset', 'Intangible Assets', 'Non-physical asset representing the right to operate', 'IAS 38'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Vehicle Finance Payable', '2100', 'Liability', 'Current Liabilities', 'Short-term loans for purchasing vehicle inventory (floor planning)', 'IFRS 9'),
        ('Dealer Commission Payable', '2200', 'Liability', 'Current Liabilities', 'Commissions owed to sales staff', 'IFRS 15'),
        ('Lease Liability', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased assets', 'IFRS 16'),
        ('Contract Liability -Deposits', '2700', 'Liability', 'Current Liabilities', 'Customer deposits received for vehicle orders', 'IFRS 15'),
        ('Capital Injection', '3000', 'Equity', 'Capital', 'Owners investment in the dealership', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the dealership', 'IAS 1'),
        ('Vehicle Sales Revenue', '4000', 'Income', 'Sales Revenue', 'Revenue generated from the sale of new and used vehicles', 'IFRS 15'),
        ('Service & Repair Income', '4100', 'Income', 'Service Revenue', 'Revenue from maintenance and repair work', 'IFRS 15'),
        ('Commission Income', '4200', 'Income', 'Other Income', 'Income from referring customers to finance/insurance providers', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing vehicles or assets to third parties', 'IFRS 16'),
        ('Mechanic Wages', '6100', 'Expense', 'Cost of Sales', 'Labour cost directly related to service and repairs', 'IAS 2'),
        ('Transport Costs', '6200', 'Expense', 'Cost of Sales', 'Cost of shipping vehicles to the dealership', 'IAS 2'),
        ('Advertising Expense', '6300', 'Expense', 'Operating Expenses', 'Cost of marketing and promotional activities', 'IAS 1'),
        ('Lease Amortization', '7100', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Inventory Write-down', '8000', 'Adjustment', 'Other Adjustments', 'Adjustment for loss in value of vehicle inventory', 'IAS 2'),
        ('Depreciation -Demo Fleet', '8100', 'Adjustment', 'Depreciation & Amortization', 'Expense for the usage of the demonstration fleet', 'IAS 16'),
        ('Impairment Loss', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for non-recoverable value of long-lived assets', 'IAS 36'),
        ('Accrued Commission', '8300', 'Adjustment', 'Other Adjustments', 'Adjustment for unrecorded sales commission at period-end', 'IFRS 15'),
        ('Amortization Adjustment', '8400', 'Adjustment', 'Depreciation & Amortization', 'Adjustment to amortization expense of intangible assets', 'IAS 38'),
    ],
    "Construction": [
        ('Construction Equipment', '1100', 'Asset', 'Property, Plant & Equipment', 'Tangible assets like cranes, excavators, and tools', 'IAS 16'),
        ('Project Work-in-Progress', '1500', 'Asset', 'Inventories', 'Accumulated costs for uncompleted projects (job-costing)', 'IFRS 15'),
        ('Contract Asset', '1700', 'Asset', 'Current Assets', 'Right to consideration in exchange for goods/services transferred to a customer', 'IFRS 15'),
        ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets', 'Asset for long-term leased sites or machinery', 'IFRS 16'),
        ('Asset Held for Sale', '1900', 'Asset', 'Non-Current Assets', 'Equipment or property whose carrying amount will be recovered principally through a sale', 'IFRS 5'),
        ('Intangible Asset', '1800', 'Asset', 'Intangible Assets', 'Non-physical asset like patents or design rights', 'IAS 38'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Retention Payable', '2100', 'Liability', 'Current Liabilities', 'Funds withheld from subcontractors pending final project completion', 'IFRS 9'),
        ('Accounts Payable', '2200', 'Liability', 'Current Liabilities', 'Money owed to material suppliers and vendors', 'IFRS 9'),
        ('Contract Liability', '2700', 'Liability', 'Current Liabilities', 'Obligation to transfer goods/services to a customer (e.g., prepaid milestones)', 'IFRS 15'),
        ('Lease Liability', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased assets', 'IFRS 16'),
        ('Contractor Capital', '3000', 'Equity', 'Capital', 'Owners investment in the construction business', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the contractor', 'IAS 1'),
        ('Contract Income', '4000', 'Income', 'Sales Revenue', 'Revenue generated from long-term construction projects', 'IFRS 15'),
        ('Variation Orders', '4100', 'Income', 'Sales Revenue', 'Additional revenue from changes to the original contract scope', 'IFRS 15'),
        ('Deferred Revenue', '4200', 'Income', 'Sales Revenue', 'Revenue received but not yet earned (e.g., progress payments)', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income earned from leasing equipment to others', 'IFRS 16'),
        ('Subcontractor Payments', '6100', 'Expense', 'Cost of Sales', 'Costs paid to third-party contractors', 'IFRS 15'),
        ('Material Purchases', '6200', 'Expense', 'Cost of Sales', 'Direct cost of raw materials used in construction', 'IAS 2'),
        ('Site Preparation', '6300', 'Expense', 'Operating Expenses', 'Cost of initial work like clearing and leveling', 'IAS 1'),
        ('Lease Amortization', '7100', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Amortization Expense', '7200', 'Expense', 'Depreciation & Amortization', 'Systematic expense of intangible assets', 'IAS 38'),
        ('Accrued Contract Income', '8000', 'Adjustment', 'Other Adjustments', 'Adjustment for unbilled revenue recognized under percentage-of-completion', 'IFRS 15'),
        ('Project Cost Recognition', '8100', 'Adjustment', 'Other Adjustments', 'Adjustment to recognize costs of construction projects', 'IFRS 15'),
        ('Impairment Loss', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for loss in value of assets (e.g., equipment)', 'IAS 36'),
        ('Recoverable Amount Adjustment', '8300', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment to reflect net selling price or value in use of assets', 'IAS 36'),
        ('Discontinued Operation', '8400', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for disposal of a major business component', 'IFRS 5'),
    ],

    "Private School":[
        # ASSETS
        ("Cash on Hand", "1000", "Asset", "Cash & Equivalents",
        "Petty cash and till floats", "IAS 1"),
        ("Current Account - Bank", "1010", "Asset", "Cash & Equivalents",
        "Main operating bank account", "IAS 1"),
        ("Accounts Receivable - School Fees", "1200", "Asset", "Trade & Other Receivables",
        "Amounts owed by parents/guardians for tuition", "IFRS 9"),
        ("Inventory - Uniforms", "1500", "Asset", "Inventories",
        "School uniforms held for sale", "IAS 2"),
        ("Inventory - Textbooks & Stationery", "1510", "Asset", "Inventories",
        "Textbooks and stationery held for sale to learners", "IAS 2"),
        ("Prepaid Expenses", "1600", "Asset", "Current Assets",
        "Prepaid insurance, rent and similar items", "IAS 1"),
        ("Property, Plant & Equipment - Classrooms", "1700", "Asset", "Property, Plant & Equipment",
        "Buildings and classroom improvements", "IAS 16"),
        ("Furniture & Fittings - School", "1710", "Asset", "Property, Plant & Equipment",
        "Desks, chairs and classroom furniture", "IAS 16"),
        ("IT Equipment - School", "1720", "Asset", "Property, Plant & Equipment",
        "Computers, tablets and related equipment", "IAS 16"),
        ("Right-of-Use Asset - School Premises", "1800", "Asset", "Non-Current Assets",
        "IFRS 16 right-of-use asset for leased campus", "IFRS 16"),

        # LIABILITIES
        ("Accounts Payable - Suppliers", "2100", "Liability", "Current Liabilities",
        "Trade payables to suppliers", "IFRS 9"),
        ("Accrued Expenses", "2200", "Liability", "Current Liabilities",
        "Accrued salaries, utilities and other expenses", "IAS 37"),
        ("School Fees Received in Advance", "2300", "Liability", "Current Liabilities",
        "Tuition fees invoiced/received for future periods", "IFRS 15"),
        ("Lease Liability - School Premises", "2600", "Liability", "Non-Current Liabilities",
        "IFRS 16 lease liability for premises", "IFRS 16"),
        ("Bank Overdraft / Short-term Loan", "2700", "Liability", "Current Liabilities",
        "Short-term borrowings and overdrafts", "IFRS 9"),

        # EQUITY
        ("Share Capital / Members' Interest", "3000", "Equity", "Share Capital",
        "Owner's invested capital", "IAS 1"),
        ("Retained Earnings", "3100", "Equity", "Retained Earnings",
        "Accumulated profit or loss", "IAS 1"),

        # INCOME
        ("Tuition Fee Income", "4000", "Income", "Revenue",
        "School tuition fees charged to learners", "IFRS 15"),
        ("Registration & Application Fees", "4010", "Income", "Revenue",
        "Non-refundable registration and application fees", "IFRS 15"),
        ("Aftercare & Extramural Fees", "4020", "Income", "Revenue",
        "Aftercare, sport and cultural activity fees", "IFRS 15"),
        ("Uniform Sales", "4100", "Income", "Sales",
        "Income from sale of school uniforms", "IFRS 15"),
        ("Textbook & Stationery Sales", "4110", "Income", "Sales",
        "Income from sale of textbooks and stationery", "IFRS 15"),
        ("Cafeteria / Tuckshop Sales", "4120", "Income", "Sales",
        "Income from cafeteria and tuckshop sales", "IFRS 15"),
        ("Other School Income", "4800", "Income", "Other Income",
        "Miscellaneous school income (functions, rentals, etc.)", "IAS 1"),

        # COST OF SALES (for inventory-using schools)
        ("Cost of Sales - Uniforms", "5000", "Expense", "Cost of Sales",
        "Cost of school uniforms sold", "IAS 2"),
        ("Cost of Sales - Books & Stationery", "5010", "Expense", "Cost of Sales",
        "Cost of textbooks and stationery sold", "IAS 2"),
        ("Cost of Sales - Cafeteria", "5020", "Expense", "Cost of Sales",
        "Food and beverage cost for cafeteria/tuckshop", "IAS 2"),

        # OPERATING EXPENSES
        ("Teaching Staff Salaries", "6100", "Expense", "Operating Expenses",
        "Salaries and wages for teaching staff", "IAS 19"),
        ("Non-Teaching Staff Salaries", "6110", "Expense", "Operating Expenses",
        "Admin and support staff salaries", "IAS 19"),
        ("Employer Contributions & Benefits", "6120", "Expense", "Operating Expenses",
        "Pension, medical and other benefits", "IAS 19"),
        ("Classroom Supplies & Learning Materials", "6200", "Expense", "Operating Expenses",
        "Consumable learning materials used in class", "IAS 1"),
        ("Utilities - Electricity & Water", "6300", "Expense", "Operating Expenses",
        "Electricity, water and municipal charges", "IAS 1"),
        ("Repairs & Maintenance - School", "6400", "Expense", "Operating Expenses",
        "Repairs and maintenance of facilities and equipment", "IAS 16"),
        ("IT & Software Costs", "6500", "Expense", "Operating Expenses",
        "Licences, subscriptions and IT support", "IAS 38"),
        ("Marketing & Advertising", "6600", "Expense", "Operating Expenses",
        "Marketing, open day and advertising costs", "IAS 1"),
        ("Insurance - School", "6700", "Expense", "Operating Expenses",
        "Property and liability insurance", "IAS 37"),
        ("Bad Debts & Impairment - School Fees", "6800", "Expense", "Operating Expenses",
        "Impairment of fee receivables and write-offs", "IFRS 9"),

        # DEPRECIATION / INTEREST
        ("Depreciation - Buildings & Improvements", "7100", "Expense", "Depreciation & Amortization",
        "Depreciation of school buildings and improvements", "IAS 16"),
        ("Depreciation - Furniture & Equipment", "7110", "Expense", "Depreciation & Amortization",
        "Depreciation of furniture, IT and other equipment", "IAS 16"),
        ("Depreciation - Right-of-Use Asset", "7120", "Expense", "Depreciation & Amortization",
        "Depreciation of IFRS 16 right-of-use asset", "IFRS 16"),
        ("Interest Expense - Loans & Overdraft", "7200", "Expense", "Finance Costs",
        "Interest on loans and overdraft facilities", "IFRS 9"),
        ("Interest Expense - Lease Liability", "7210", "Expense", "Finance Costs",
        "Interest portion of lease payments", "IFRS 16"),

        # ADJUSTMENTS / OTHER
        ("Foreign Exchange Gain / (Loss)", "8000", "Adjustment", "Non-Operating Adjustments",
        "Realised and unrealised FX differences", "IAS 21"),
    ],
    "NPO Education": [
        ('Donated Classroom Equipment', '1100', 'Asset', 'Property, Plant & Equipment', 'Physical assets received as donations for educational use', 'IAS 16'),
        ('Facility Grants Receivable', '1700', 'Asset', 'Current Assets', 'Amounts due from grants restricted to facility use', 'IFRS NPO'),
        ('Textbook Inventory', '1500', 'Asset', 'Inventories', 'Books and educational materials held for distribution', 'IAS 2'),
        ('Right-of-Use Asset -School Building', '1610', 'Asset', 'Non-Current Assets', 'Asset for long-term leased school property', 'IFRS 16'),
        ('Foreign Cash -Educational Grants', '1050', 'Asset', 'Cash & Equivalents', 'Cash held in a foreign currency from specific grants', 'IAS 21'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Deferred Education Grant', '2700', 'Liability', 'Current Liabilities', 'Grant funds received but not yet spent for the intended purpose', 'IFRS NPO'),
        ('Scholarship Payables', '2200', 'Liability', 'Current Liabilities', 'Funds committed to be paid out as scholarships', 'IAS 37'),
        ('Lease Liability -Campus Premises', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased campus space', 'IFRS 16'),
        ('Payables -Educational Suppliers', '2210', 'Liability', 'Current Liabilities', 'Money owed to vendors for school supplies and services', 'IFRS 9'),
        ('Education Grant Fund', '3000', 'Equity', 'Restricted Funds', 'Net assets subject to donor/grantor-imposed restrictions', 'IFRS NPO'),
        ('Net Surplus -Academic Programs', '3100', 'Equity', 'Accumulated Surplus', 'Accumulated excess of revenues over expenses', 'IAS 1'),
        ('Foreign Currency Translation Reserve', '3200', 'Equity', 'Other Comprehensive Income', 'Reserve for unrealized gains/losses from foreign operations', 'IAS 21'),
        ('Government Subsidy -Education', '4000', 'Income', 'Grant Income', 'Funding received from government agencies for educational purposes', 'IFRS NPO'),
        ('Donor Income -Education', '4100', 'Income', 'Donor Income', 'Unrestricted monetary and in-kind contributions from donors', 'IFRS NPO'),
        ('Community Contributions', '4200', 'Income', 'Donor Income', 'Small, local donations from the community', 'IFRS NPO'),
        ('Exchange Gain -Grant Conversion', '4300', 'Income', 'Other Income', 'Gain from converting foreign currency grants to local currency', 'IAS 21'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from sub-leasing parts of the facility', 'IFRS 16'),
        ('Teacher Stipends', '6100', 'Expense', 'Program Expenses', 'Direct compensation paid to teaching staff', 'IAS 19'),
        ('Learning Materials Expense', '6200', 'Expense', 'Program Expenses', 'Cost of textbooks, software, and instructional supplies used', 'IAS 2'),
        ('School Meals Program', '6300', 'Expense', 'Program Expenses', 'Costs associated with providing meals to students', 'IAS 1'),
        ('Depreciation -Classroom Equipment', '7100', 'Expense', 'Depreciation & Amortization', 'Expense for the usage of tangible educational assets', 'IAS 16'),
        ('Lease Expense -Exempt Premises', '6400', 'Expense', 'Operating Expenses', 'Expense for leases not capitalized (short-term/low-value)', 'IFRS 16'),
        ('Exchange Loss -Education Disbursement', '7200', 'Expense', 'Other Expense', 'Loss from converting local currency for foreign payments', 'IAS 21'),
        ('Unspent Grant Reversal', '8000', 'Adjustment', 'Revenue Adjustments', 'Reclassification of deferred revenue when grant conditions are met', 'IFRS NPO'),
        ('Asset Depreciation -Donated', '8100', 'Adjustment', 'Depreciation & Amortization', 'Adjustment to recognize depreciation on donated assets', 'IAS 16'),
        ('Exchange Adjustment -Foreign Education Grant', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for changes in foreign exchange rates on grants', 'IAS 21'),
        ('Provision Adjustment -Scholarships', '8300', 'Adjustment', 'Other Adjustments', 'Adjustment to the provision for future scholarship payouts', 'IAS 37'),
        ('Lease Reassessment -Campus Facility', '8400', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment due to change in lease terms or scope', 'IFRS 16'),
    ],
    "NPO Healthcare": [
        ('Donated Medical Equipment', '1100', 'Asset', 'Property, Plant & Equipment', 'Physical assets received as donations for clinical use', 'IAS 16'),
        ('Facility Grants Receivable', '1700', 'Asset', 'Current Assets', 'Amounts due from grants restricted to facility development', 'IFRS NPO'),
        ('Medicine Inventory', '1500', 'Asset', 'Inventories', 'Pharmaceuticals and medical supplies held for patient use', 'IAS 2'),
        ('Right-of-Use Asset -Health Facility', '1610', 'Asset', 'Non-Current Assets', 'Asset for long-term leased clinic or hospital space', 'IFRS 16'),
        ('Foreign Cash -Donor Programs', '1050', 'Asset', 'Cash & Equivalents', 'Cash held in a foreign currency for specific health programs', 'IAS 21'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Deferred Health Funding', '2700', 'Liability', 'Current Liabilities', 'Grant funds received but not yet utilized for health initiatives', 'IFRS NPO'),
        ('Medical Vendor Payables', '2200', 'Liability', 'Current Liabilities', 'Money owed to suppliers for medical equipment and drugs', 'IFRS 9'),
        ('Lease Liability -Clinical Space', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased clinical premises', 'IFRS 16'),
        ('Provision -Patient Outreach', '2800', 'Liability', 'Provisions', 'Estimated future costs for patient outreach and public health initiatives', 'IAS 37'),
        ('Health Grant Fund', '3000', 'Equity', 'Restricted Funds', 'Net assets subject to donor/grantor-imposed restrictions for health programs', 'IFRS NPO'),
        ('Net Surplus -Medical Programs', '3100', 'Equity', 'Accumulated Surplus', 'Accumulated excess of revenues over expenses', 'IAS 1'),
        ('Foreign Currency Translation Reserve', '3200', 'Equity', 'Other Comprehensive Income', 'Reserve for unrealized gains/losses from foreign healthcare operations', 'IAS 21'),
        ('Donor Health Funding', '4000', 'Income', 'Donor Income', 'Unrestricted monetary and in-kind contributions for healthcare', 'IFRS NPO'),
        ('Public Health Subsidies', '4100', 'Income', 'Grant Income', 'Funding received from government agencies for public health services', 'IFRS NPO'),
        ('Community Donations -Medical', '4200', 'Income', 'Donor Income', 'Small, local donations supporting the medical facility', 'IFRS NPO'),
        ('Exchange Gain -Donor Conversion', '4300', 'Income', 'Other Income', 'Gain from converting foreign currency donations to local currency', 'IAS 21'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from sub-leasing parts of the clinical facility', 'IFRS 16'),
        ('Clinical Staff Stipends', '6100', 'Expense', 'Program Expenses', 'Direct compensation paid to doctors, nurses, and clinical staff', 'IAS 19'),
        ('Outreach & Awareness', '6200', 'Expense', 'Program Expenses', 'Costs associated with public health education and community programs', 'IAS 1'),
        ('Essential Medication Expense', '6300', 'Expense', 'Program Expenses', 'Cost of medicines and supplies used in patient care', 'IAS 2'),
        ('Depreciation -Donated Equipment', '7100', 'Expense', 'Depreciation & Amortization', 'Expense for the usage of donated medical equipment', 'IAS 16'),
        ('Lease Expense -Temporary Clinic', '6400', 'Expense', 'Operating Expenses', 'Expense for short-term or low-value leases (e.g., temporary field clinics)', 'IFRS 16'),
        ('Exchange Loss -Cross-Border Payment', '7200', 'Expense', 'Other Expense', 'Loss from converting local currency for international program payments', 'IAS 21'),
        ('Deferred Donor Income Reversal', '8000', 'Adjustment', 'Revenue Adjustments', 'Reclassification of deferred revenue when donor restrictions are met', 'IFRS NPO'),
        ('Equipment Depreciation -Donated', '8100', 'Adjustment', 'Depreciation & Amortization', 'Adjustment to recognize depreciation on donated assets', 'IAS 16'),
        ('Exchange Adjustment -Health Grants', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for changes in foreign exchange rates on health grants', 'IAS 21'),
        ('Provision Adjustment -Outreach', '8300', 'Adjustment', 'Other Adjustments', 'Adjustment to the provision for future patient outreach costs', 'IAS 37'),
        ('Lease Reassessment -Clinic Space', '8400', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment due to change in lease terms or scope', 'IFRS 16'),
    ],
    "Information Technology": [
        # ASSETS
        ("Developer Equipment", "1100", "Asset", "Property, Plant & Equipment",
         "Capital tools - IAS 16", "IAS 16"),
        ("Cloud Infrastructure Credits", "1405", "Asset", "Current Assets",
         "Prepaid services - IAS 1 current asset", "IAS 1"),
        ("Software Licenses", "1800", "Asset", "Intangible Assets",
         "Purchased tools - IAS 38 intangible assets", "IAS 38"),
        ("Right-of-Use Asset - Office Lease", "1610", "Asset", "Non-Current Assets",
         "Workspace leases - IFRS 16", "IFRS 16"),
        ("Foreign Receivables - Tech Clients", "1715", "Asset", "Current Assets",
         "FX balances - IAS 21", "IAS 21"),
        ("Lease Receivable", "1720", "Asset", "Current Assets",
         "Receivable from leasing out servers or office space - IFRS 16", "IFRS 16"),

        # LIABILITIES
        ("Deferred Revenue", "2700", "Liability", "Current Liabilities",
         "Advance billing for performance obligations - IFRS 15", "IFRS 15"),
        ("Software Payables", "2205", "Liability", "Current Liabilities",
         "Subscription liabilities - IAS 1 current obligation", "IAS 1"),
        ("Lease Liability - Premises", "2610", "Liability", "Non-Current Liabilities",
         "Discounted lease outflows - IFRS 16", "IFRS 16"),

        # EQUITY
        ("Tech Founder's Capital", "3000", "Equity", "Capital",
         "Owner investment - IAS 1 presentation", "IAS 1"),
        ("Retained Earnings", "3100", "Equity", "Retained Earnings",
         "Accumulated profit - IAS 1", "IAS 1"),

        # INCOME
        ("Software Subscription Revenue", "4000", "Income", "Service Revenue",
         "Recurring SaaS contracts - IFRS 15", "IFRS 15"),
        ("IT Consulting Fees", "4100", "Income", "Service Revenue",
         "Time-based or milestone billing - IFRS 15", "IFRS 15"),
        ("License Sales", "4200", "Income", "Sales Revenue",
         "One-off usage rights - IFRS 15 distinct performance obligation", "IFRS 15"),
        ("Exchange Gain - SaaS Contracts", "4300", "Income", "Other Income",
         "FX restatement benefit - IAS 21", "IAS 21"),
        ("Lease Income", "4800", "Income", "Other Income",
         "Income from leasing out servers or office space - IFRS 16", "IFRS 16"),

        # EXPENSES
        ("Developer Salaries", "6100", "Expense", "Operating Expenses",
         "Staff costs - IAS 19", "IAS 19"),
        ("Cloud Hosting Costs", "6200", "Expense", "Operating Expenses",
         "Infrastructure spend - IAS 1 by nature", "IAS 1"),
        ("Cybersecurity Expenses", "6300", "Expense", "Operating Expenses",
         "Security tooling - IAS 1 classification", "IAS 1"),
        ("Depreciation - Developer Hardware", "7100", "Expense", "Depreciation & Amortization",
         "Asset usage spread - IAS 16", "IAS 16"),
        ("Amortization - Software Licenses", "7110", "Expense", "Depreciation & Amortization",
         "Intangible value usage - IAS 38", "IAS 38"),
        ("Exchange Loss - Vendor Settlement", "7200", "Expense", "Other Expense",
         "FX volatility impact - IAS 21", "IAS 21"),

        # ADJUSTMENTS
        ("Deferred Revenue Adjustment", "8000", "Adjustment", "Other Adjustments",
         "Recognition as service delivered - IFRS 15", "IFRS 15"),
        ("License Amortization", "8100", "Adjustment", "Depreciation & Amortization",
         "Periodic value allocation - IAS 38", "IAS 38"),
        ("Exchange Rate Adjustment - Receivables", "8200", "Adjustment", "Non-Operating Adjustments",
         "Closing rate FX restatement - IAS 21", "IAS 21"),
    ],
    "NPO IT": [
        ('Donated IT Equipment', '1100', 'Asset', 'Property, Plant & Equipment', 'Physical assets received as donations for IT infrastructure', 'IAS 16'),
        ('Software Licenses - Sponsored', '1800', 'Asset', 'Intangible Assets', 'Non-physical assets for operational software, often donated', 'IAS 38'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets', 'Asset for leased office space or equipment', 'IFRS 16'),
        ('Grant Deferred Income', '2700', 'Liability', 'Current Liabilities', 'Funds received for IT projects not yet completed', 'IFRS NPO'),
        ('Community Project Obligations', '2800', 'Liability', 'Provisions', 'Estimated costs for future community tech obligations', 'IAS 37'),
        ('Lease Liability', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased assets', 'IFRS 16'),
        ('Fund Balances - Tech Grants', '3000', 'Equity', 'Restricted Funds', 'Net assets subject to donor/grantor restrictions for technology', 'IFRS NPO'),
        ('Net Surplus - IT Activities', '3100', 'Equity', 'Accumulated Surplus', 'Accumulated excess of revenues over expenses', 'IAS 1'),
        ('Technology Grant Income', '4000', 'Income', 'Grant Income', 'Funding received specifically for technology initiatives', 'IFRS NPO'),
        ('Donor Platform Sponsorship', '4100', 'Income', 'Donor Income', 'Contributions from sponsors of online platforms', 'IFRS NPO'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing out surplus IT equipment or space', 'IFRS 16'),
        ('Tech Volunteer Stipends', '6100', 'Expense', 'Program Expenses', 'Direct compensation paid to tech volunteers/staff', 'IAS 19'),
        ('Community Hosting Costs', '6200', 'Expense', 'Program Expenses', 'Cost of hosting services for community tech projects', 'IAS 1'),
        ('Digital Literacy Campaign', '6300', 'Expense', 'Program Expenses', 'Costs associated with public digital education programs', 'IAS 1'),
        ('Lease Amortization', '7100', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Unspent Tech Grant Reversal', '8000', 'Adjustment', 'Revenue Adjustments', 'Reclassification of deferred revenue when grant conditions are met', 'IFRS NPO'),
        ('Software Depreciation', '8100', 'Adjustment', 'Depreciation & Amortization', 'Expense for usage of donated or purchased software', 'IAS 38'),
        ('Lease Reassessment Adjustment', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment due to change in lease terms or scope', 'IFRS 16'),
    ],
    "NPO Transport": [
        ('Donated Vehicles', '1100', 'Asset', 'Property, Plant & Equipment', 'Vehicles received as donations for program use', 'IAS 16'),
        ('Transport Equipment', '1110', 'Asset', 'Property, Plant & Equipment', 'Other operational equipment like lifts or repair tools', 'IAS 16'),
        ('Right-of-Use Asset -Vehicle Lease', '1610', 'Asset', 'Non-Current Assets', 'Asset for long-term leased vehicles or transport facilities', 'IFRS 16'),
        ('Foreign Cash -Transport Funding', '1050', 'Asset', 'Cash & Equivalents', 'Cash held in a foreign currency from specific transport grants', 'IAS 21'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Deferred Transport Grants', '2700', 'Liability', 'Current Liabilities', 'Grant funds received but not yet spent on transport programs', 'IFRS NPO'),
        ('Route Subsidy Payable', '2200', 'Liability', 'Current Liabilities', 'Amounts owed for government/public transport subsidies', 'IFRS 9'),
        ('Lease Liability -Transport Fleet', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased vehicle fleet', 'IFRS 16'),
        ('Payables -Vehicle Maintenance', '2210', 'Liability', 'Current Liabilities', 'Money owed to mechanics and maintenance vendors', 'IFRS 9'),
        ('Transport Grant Fund', '3000', 'Equity', 'Restricted Funds', 'Net assets subject to donor/grantor restrictions for transport', 'IFRS NPO'),
        ('Net Surplus -Mobility Programs', '3100', 'Equity', 'Accumulated Surplus', 'Accumulated excess of revenues over expenses', 'IAS 1'),
        ('Foreign Currency Translation Reserve', '3200', 'Equity', 'Other Comprehensive Income', 'Reserve for unrealized gains/losses from foreign currency transactions', 'IAS 21'),
        ('Donor Income -Transport', '4000', 'Income', 'Donor Income', 'Unrestricted monetary and in-kind contributions for mobility', 'IFRS NPO'),
        ('Public Mobility Support', '4100', 'Income', 'Grant Income', 'Funding received from government/public bodies for transport services', 'IFRS NPO'),
        ('Exchange Gain -Funding Conversion', '4200', 'Income', 'Other Income', 'Gain from converting foreign currency grants/donations', 'IAS 21'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing out transport assets', 'IFRS 16'),
        ('Driver Stipends', '6100', 'Expense', 'Program Expenses', 'Direct compensation paid to transport drivers', 'IAS 19'),
        ('Fuel & Maintenance Costs', '6200', 'Expense', 'Program Expenses', 'Cost of vehicle operation and upkeep', 'IAS 1'),
        ('Outreach Campaigns -Transport', '6300', 'Expense', 'Program Expenses', 'Costs associated with public awareness campaigns', 'IAS 1'),
        ('Depreciation -Donated Vehicles', '7100', 'Expense', 'Depreciation & Amortization', 'Expense for the usage of donated vehicles', 'IAS 16'),
        ('Lease Expense -Short-Term Vans', '6400', 'Expense', 'Operating Expenses', 'Expense for short-term or low-value leases', 'IFRS 16'),
        ('Exchange Loss -Service Payments', '7200', 'Expense', 'Other Expense', 'Loss from converting local currency for foreign payments', 'IAS 21'),
        ('Unrecognized Transport Grant', '8000', 'Adjustment', 'Revenue Adjustments', 'Reclassification of deferred revenue when grant conditions are met', 'IFRS NPO'),
        ('Vehicle Depreciation -Donated', '8100', 'Adjustment', 'Depreciation & Amortization', 'Adjustment to recognize depreciation on donated assets', 'IAS 16'),
        ('Exchange Adjustment -Logistics Grant', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for changes in foreign exchange rates on grants', 'IAS 21'),
        ('Provision Adjustment -Route Subsidy', '8300', 'Adjustment', 'Other Adjustments', 'Adjustment to the provision for route subsidy payouts', 'IAS 37'),
        ('Lease Reassessment -Fleet', '8400', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment due to change in lease terms or scope', 'IFRS 16'),
    ],
    "Professional Services": [
        ('Office Equipment', '1100', 'Asset', 'Property, Plant & Equipment', 'Tangible assets like computers and printers', 'IAS 16'),
        ('Furniture & Fixtures', '1110', 'Asset', 'Property, Plant & Equipment', 'Tangible assets like desks and chairs', 'IAS 16'),
        ('Receivables', '1700', 'Asset', 'Current Assets', 'Amounts due from clients for services rendered', 'IFRS 15'),
        ('Right-of-Use Asset -Office Lease', '1610', 'Asset', 'Non-Current Assets', 'Asset for long-term leased office space', 'IFRS 16'),
        ('Foreign Receivables', '1710', 'Asset', 'Current Assets', 'Amounts due from international clients', 'IAS 21'),
        ('Lease Receivable', '1720', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Accounts Payable', '2200', 'Liability', 'Current Liabilities', 'Money owed to general suppliers and vendors', 'IFRS 9'),
        ('Client Deposits', '2700', 'Liability', 'Current Liabilities', 'Payments received in advance of service delivery', 'IFRS 15'),
        ('Lease Liability -Office Premises', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased office space', 'IFRS 16'),
        ('Owners Capital', '3000', 'Equity', 'Capital', 'Owners investment in the firm', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the firm', 'IAS 1'),
        ('Consulting Revenue', '4000', 'Income', 'Service Revenue', 'Revenue from advisory and consultation services', 'IFRS 15'),
        ('Service Fees', '4100', 'Income', 'Service Revenue', 'Revenue from ongoing service contracts', 'IFRS 15'),
        ('Foreign Service Revenue', '4200', 'Income', 'Service Revenue', 'Revenue earned from international clients', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing assets to others', 'IFRS 16'),
        ('Salaries & Wages', '6100', 'Expense', 'Operating Expenses', 'Compensation paid to employees', 'IAS 19'),
        ('Rent Expense', '6200', 'Expense', 'Operating Expenses', 'Cost of rental for premises (non-IFRS 16 leases)', 'IFRS 16'),
        ('Utilities', '6300', 'Expense', 'Operating Expenses', 'Cost of electricity, water, internet', 'IAS 1'),
        ('Professional Subscriptions', '6400', 'Expense', 'Operating Expenses', 'Cost of required licenses, software, and memberships', 'IAS 38'),
        ('Depreciation', '7100', 'Expense', 'Depreciation & Amortization', 'Expense for usage of office equipment and furniture', 'IAS 16'),
        ('Lease Amortization', '7110', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Accrued Expense Adjustment', '8000', 'Adjustment', 'Other Adjustments', 'Adjustment for unrecorded expenses at period-end', 'IAS 1'),
        ('Depreciation', '8100', 'Adjustment', 'Depreciation & Amortization', 'Adjustment to fixed asset depreciation', 'IAS 16'),
        ('Exchange Rate Revaluation', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for changes in foreign exchange rates', 'IAS 21'),
        ('Lease Reassessment Adjustment', '8300', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment due to change in lease terms or scope', 'IFRS 16'),
    ],
    "Property Management": [
        ('Monthly Levies', '4000', 'Income', 'Service Revenue', 'Recurring fees charged to unit owners/tenants', 'IFRS 15'),
        ('Special Contributions', '4100', 'Income', 'Other Income', 'Non-recurring fees for major projects', 'IFRS 15'),
        ('Security Services', '6100', 'Expense', 'Operating Expenses', 'Cost of contracted security personnel and systems', 'IAS 1'),
        ('Repairs & Maintenance', '6200', 'Expense', 'Operating Expenses', 'Cost of routine upkeep of managed areas', 'IAS 1'),
        ('Insurance Premiums', '6300', 'Expense', 'Operating Expenses', 'Cost of property insurance coverage', 'IAS 1'),
        ('Maintenance Reserve Fund', '1050', 'Asset', 'Cash & Equivalents', 'Cash set aside for future major maintenance', 'IAS 7'),
        ('Receivables -Levies', '1700', 'Asset', 'Current Assets', 'Levy amounts due from unit owners/tenants', 'IFRS 15'),
        ('Prepaid Insurance', '1400', 'Asset', 'Current Assets', 'Insurance paid in advance for future coverage', 'IAS 1'),
        ('Accrued Maintenance', '2200', 'Liability', 'Current Liabilities', 'Estimated costs for un-invoiced maintenance work', 'IAS 37'),
        ('Payables -Contractors', '2210', 'Liability', 'Current Liabilities', 'Money owed to maintenance contractors', 'IFRS 9'),
        ('Accumulated Surplus', '3100', 'Equity', 'Retained Earnings', 'Accumulated excess of income over expenditure', 'IAS 1'),
        ('Prepaid Insurance Adjustment', '8000', 'Adjustment', 'Other Adjustments', 'Reclassification of prepaid expense to actual expense', 'IAS 1'),
        ('Accrued Maintenance Adjustment', '8100', 'Adjustment', 'Other Adjustments', 'Adjustment to accrued maintenance provision', 'IAS 37'),
    ],
    "Restaurant": [
        ('Kitchen Equipment', '1100', 'Asset', 'Property, Plant & Equipment', 'Tangible assets for food preparation (ovens, fridges)', 'IAS 16'),
        ('Furniture & Fixtures', '1110', 'Asset', 'Property, Plant & Equipment', 'Tangible assets for dining area', 'IAS 16'),
        ('Inventory -Ingredients', '1500', 'Asset', 'Inventories', 'Raw materials held for food and beverage preparation', 'IAS 2'),
        ('POS Hardware', '1120', 'Asset', 'Property, Plant & Equipment', 'Point-of-Sale systems and terminals', 'IAS 16'),
        ('Right-of-Use Asset -Premises', '1610', 'Asset', 'Non-Current Assets', 'Asset for long-term leased restaurant space', 'IFRS 16'),
        ('Accounts Receivable', '1700', 'Asset', 'Current Assets', 'Amounts due from corporate clients or delivery partners', 'IFRS 15'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Accounts Payable', '2200', 'Liability', 'Current Liabilities', 'Money owed to food and beverage suppliers', 'IFRS 9'),
        ('VAT Payable', '2300', 'Liability', 'Current Liabilities', 'Sales tax collected but not yet remitted', 'IAS 37'),
        ('Advance Deposits', '2700', 'Liability', 'Current Liabilities', 'Customer deposits for large bookings or catering', 'IFRS 15'),
        ('Lease Liability -Kitchen Space', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased kitchen space', 'IFRS 16'),
        ("Owner's Contribution", '3000', 'Equity', 'Capital', 'Owners investment in the restaurant', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the restaurant', 'IAS 1'),
        ('Food Sales', '4000', 'Income', 'Sales Revenue', 'Revenue generated from food items sold', 'IFRS 15'),
        ('Beverage Sales', '4100', 'Income', 'Sales Revenue', 'Revenue generated from drinks sold', 'IFRS 15'),
        ('Event Catering Revenue', '4200', 'Income', 'Service Revenue', 'Revenue from external catering services', 'IFRS 15'),
        ('Delivery Revenue', '4300', 'Income', 'Sales Revenue', 'Revenue generated from delivery fees', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing assets to others', 'IFRS 16'),
        ('Food Ingredient Purchases', '6100', 'Expense', 'Cost of Sales', 'Direct cost of raw food materials', 'IAS 2'),
        ('Kitchen Staff Wages', '6200', 'Expense', 'Operating Expenses', 'Compensation for kitchen staff', 'IAS 19'),
        ('Wait Staff Salaries', '6210', 'Expense', 'Operating Expenses', 'Compensation for front-of-house staff', 'IAS 19'),
        ('Utilities', '6300', 'Expense', 'Operating Expenses', 'Cost of electricity, gas, and water', 'IAS 1'),
        ('Cleaning Supplies', '6310', 'Expense', 'Operating Expenses', 'Cost of sanitation and cleaning products', 'IAS 1'),
        ('Packaging Materials', '6320', 'Expense', 'Operating Expenses', 'Cost of takeaway containers and boxes', 'IAS 1'),
        ('Advertising & Promotions', '6400', 'Expense', 'Operating Expenses', 'Cost of marketing and promotional activities', 'IAS 1'),
        ('Prepaid Rent Adjustment', '8000', 'Adjustment', 'Other Adjustments', 'Reclassification of prepaid expense to actual rent expense', 'IAS 1'),
        ('Depreciation -Kitchen Equipment', '8100', 'Adjustment', 'Depreciation & Amortization', 'Expense for the usage of kitchen fixed assets', 'IAS 16'),
        ('Inventory Spoilage Write-off', '8200', 'Adjustment', 'Other Adjustments', 'Adjustment for wasted or expired ingredients', 'IAS 2'),
    ],
    "Retail & Wholesale": [
        ('Retail Inventory', '1500', 'Asset', 'Inventories', 'Goods held for resale to customers', 'IAS 2'),
        ('POS Equipment', '1100', 'Asset', 'Property, Plant & Equipment', 'Point-of-Sale systems and hardware', 'IAS 16'),
        ('Shop Furniture', '1110', 'Asset', 'Property, Plant & Equipment', 'Shelving, racks, and display units', 'IAS 16'),
        ('Right-of-Use Asset -Premises', '1610', 'Asset', 'Non-Current Assets', 'Asset for long-term leased shop or warehouse space', 'IFRS 16'),
        ('Foreign Receivables -Wholesale', '1700', 'Asset', 'Current Assets', 'Amounts due from international wholesale customers', 'IAS 21'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Trade Payables', '2200', 'Liability', 'Current Liabilities', 'Money owed to suppliers for inventory purchases', 'IFRS 9'),
        ('Customer Deposits', '2700', 'Liability', 'Current Liabilities', 'Payments received in advance for ordered goods', 'IFRS 15'),
        ('Lease Liability -Shop Premises', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased premises', 'IFRS 16'),
        ('Retail Capital', '3000', 'Equity', 'Capital', 'Owners investment in the retail/wholesale business', 'IAS 1'),
        ('Drawings', '3100', 'Equity', 'Equity Changes', 'Owner withdrawals from the business', 'IAS 1'),
        ('Retail Sales Revenue', '4000', 'Income', 'Sales Revenue', 'Revenue generated from sales to end-consumers', 'IFRS 15'),
        ('Commission Income', '4100', 'Income', 'Other Income', 'Income from referring customers to third parties', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing parts of the premises or equipment', 'IFRS 16'),
        ('Stock Purchases', '6100', 'Expense', 'Cost of Sales', 'Direct cost of goods bought for resale', 'IAS 2'),
        ('Staff Wages', '6200', 'Expense', 'Operating Expenses', 'Compensation for shop staff and warehouse workers', 'IAS 19'),
        ('Utilities', '6300', 'Expense', 'Operating Expenses', 'Cost of electricity, water, and heating', 'IAS 1'),
        ('Depreciation', '7100', 'Expense', 'Depreciation & Amortization', 'Expense for usage of fixed assets (e.g., POS, furniture)', 'IAS 16'),
        ('Lease Amortization', '7110', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Stock Shrinkage', '8000', 'Adjustment', 'Other Adjustments', 'Adjustment for lost, stolen, or damaged inventory', 'IAS 2'),
        ('Prepaid Rental Adjustment', '8100', 'Adjustment', 'Other Adjustments', 'Reclassification of prepaid expense to actual rent expense', 'IAS 1'),
        ('Exchange Rate Adjustment -Trade Debtors', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for changes in foreign exchange rates on receivables', 'IAS 21'),
        ('Lease Reassessment Adjustment', '8300', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment due to change in lease terms or scope', 'IFRS 16'),
    ],
    "Transport": [
        ('Delivery Trucks', '1100', 'Asset', 'Property, Plant & Equipment', 'Tangible assets used for transporting goods', 'IAS 16'),
        ('Warehouse Building', '1110', 'Asset', 'Property, Plant & Equipment', 'Tangible assets for storage and logistics hub', 'IAS 16'),
        ('GPS Equipment', '1120', 'Asset', 'Property, Plant & Equipment', 'Tracking and navigation hardware', 'IAS 16'),
        ('Fuel Inventory', '1500', 'Asset', 'Inventories', 'Fuel held for vehicle use', 'IAS 2'),
        ('Accounts Receivable', '1700', 'Asset', 'Current Assets', 'Amounts due from clients for transport services', 'IFRS 15'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Loan Payable', '2100', 'Liability', 'Current Liabilities', 'Short-term portion of vehicle or property loans', 'IFRS 9'),
        ('Lease Obligations', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased trucks or warehouse space', 'IFRS 16'),
        ('Accounts Payable', '2200', 'Liability', 'Current Liabilities', 'Money owed to fuel, maintenance, and parts suppliers', 'IFRS 9'),
        ("Owner's Capital", '3000', 'Equity', 'Capital', 'Owners investment in the transport business', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the transport company', 'IAS 1'),
        ('Freight Revenue', '4000', 'Income', 'Service Revenue', 'Primary income from bulk cargo movement', 'IFRS 15'),
        ('Delivery Fees', '4100', 'Income', 'Service Revenue', 'Income from last-mile or small-package delivery', 'IFRS 15'),
        ('Storage Income', '4200', 'Income', 'Other Income', 'Income from warehousing and storage services', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing vehicles or facilities to others', 'IFRS 16'),
        ('Fuel Expense', '6100', 'Expense', 'Cost of Sales', 'Direct cost of fuel consumed for freight', 'IAS 2'),
        ('Vehicle Repairs & Maintenance', '6200', 'Expense', 'Cost of Sales', 'Direct cost of keeping vehicles operational', 'IAS 1'),
        ('Driver Salaries', '6300', 'Expense', 'Operating Expenses', 'Compensation for drivers and logistics staff', 'IAS 19'),
        ('Toll Fees', '6400', 'Expense', 'Operating Expenses', 'Costs associated with road and bridge tolls', 'IAS 1'),
        ('Fleet Insurance', '6500', 'Expense', 'Operating Expenses', 'Cost of insuring the vehicle fleet', 'IAS 1'),
        ('Depreciation - Vehicles', '7100', 'Expense', 'Depreciation & Amortization', 'Expense for usage of trucks and equipment', 'IAS 16'),
        ('Accrued Fuel Expense', '8000', 'Adjustment', 'Other Adjustments', 'Adjustment for unrecorded fuel consumption at period-end', 'IAS 2'),
        ('Prepaid Insurance Adjustment', '8100', 'Adjustment', 'Other Adjustments', 'Reclassification of prepaid insurance to actual expense', 'IAS 1'),
    ],
    "Logistics & Transport": [
        # ASSETS
        ('Fleet Vehicles', '1100', 'Asset', 'Property, Plant & Equipment',
        'Tangible assets used for logistics operations (trucks, vans, trailers)', 'IAS 16'),
        ('Warehouse Building', '1110', 'Asset', 'Property, Plant & Equipment',
        'Storage, depots, and logistics hub facilities', 'IAS 16'),
        ('GPS & Tracking Equipment', '1120', 'Asset', 'Property, Plant & Equipment',
        'Tracking, routing, telematics and navigation hardware', 'IAS 16'),
        ('Packaging Materials Inventory', '1505', 'Asset', 'Inventories',
        'Pallets, boxes, labels and packaging consumables held for use', 'IAS 2'),
        ('Fuel Inventory', '1500', 'Asset', 'Inventories',
        'Fuel held for vehicle use', 'IAS 2'),
        ('Accounts Receivable', '1700', 'Asset', 'Current Assets',
        'Amounts due from clients for logistics and transport services', 'IFRS 15'),
        ('Prepaid Logistics Costs', '1405', 'Asset', 'Current Assets',
        'Prepaid licenses, tracking subscriptions, permits and insurance', 'IAS 1'),

        # LIABILITIES
        ('Accounts Payable', '2200', 'Liability', 'Current Liabilities',
        'Money owed to suppliers (fuel, maintenance, tyres, subcontractors)', 'IFRS 9'),
        ('Accrued Expenses', '2210', 'Liability', 'Current Liabilities',
        'Accrued fleet, toll, repairs and driver-related costs', 'IAS 1'),
        ('Deferred Revenue', '2700', 'Liability', 'Current Liabilities',
        'Advance billings for logistics services not yet delivered', 'IFRS 15'),
        ('Loan Payable', '2100', 'Liability', 'Current Liabilities',
        'Short-term portion of vehicle/equipment loans', 'IFRS 9'),
        ('Lease Obligations', '2610', 'Liability', 'Non-Current Liabilities',
        'Long-term obligation for leased fleet vehicles or warehouses', 'IFRS 16'),

        # EQUITY
        ("Owner's Capital", '3000', 'Equity', 'Capital',
        'Owners investment in the logistics business', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings',
        'Accumulated profits/losses retained by the business', 'IAS 1'),

        # INCOME
        ('Logistics Service Revenue', '4000', 'Income', 'Service Revenue',
        'Primary income from logistics, freight handling and delivery services', 'IFRS 15'),
        ('Delivery Fees', '4100', 'Income', 'Service Revenue',
        'Income from last-mile delivery and courier services', 'IFRS 15'),
        ('Warehouse & Handling Income', '4200', 'Income', 'Other Income',
        'Income from warehousing, storage, and handling services', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income',
        'Income from leasing vehicles, trailers or storage space to others', 'IFRS 16'),

        # EXPENSES
        ('Fuel Expense', '6100', 'Expense', 'Cost of Sales',
        'Direct cost of fuel consumed for deliveries and freight operations', 'IAS 2'),
        ('Vehicle Repairs & Maintenance', '6200', 'Expense', 'Cost of Sales',
        'Direct cost of keeping fleet operational (repairs, tyres, servicing)', 'IAS 1'),
        ('Driver & Ops Salaries', '6300', 'Expense', 'Operating Expenses',
        'Compensation for drivers, dispatchers and logistics staff', 'IAS 19'),
        ('Toll Fees', '6400', 'Expense', 'Operating Expenses',
        'Costs associated with toll roads, route permits and border fees', 'IAS 1'),
        ('Fleet Insurance', '6500', 'Expense', 'Operating Expenses',
        'Cost of insuring fleet, cargo and operations', 'IAS 1'),
        ('Depreciation - Fleet & Equipment', '7100', 'Expense', 'Depreciation & Amortization',
        'Expense for usage of vehicles, trailers and tracking equipment', 'IAS 16'),

        # ADJUSTMENTS
        ('Accrued Logistics Expense', '8000', 'Adjustment', 'Other Adjustments',
        'Adjustment for unrecorded logistics costs at period-end', 'IAS 1'),
        ('Prepaid Expense Adjustment', '8100', 'Adjustment', 'Other Adjustments',
        'Reclassification of prepaid costs to actual expense', 'IAS 1'),
    ],

    "Private Healthcare": [
        ('Medical Equipment', '1100', 'Asset', 'Property, Plant & Equipment', 'Tangible assets for diagnosis and treatment', 'IAS 16'),
        ('Accounts Receivable -Insurers', '1700', 'Asset', 'Current Assets', 'Amounts due from insurance companies for patient care', 'IFRS 15'),
        ('Pharmaceutical Inventory', '1500', 'Asset', 'Inventories', 'Medicines and drugs held for patient use', 'IAS 2'),
        ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets', 'Asset for leased clinic or hospital premises', 'IFRS 16'),
        ('Intangible Asset -Healthcare Software', '1800', 'Asset', 'Intangible Assets', 'Non-physical asset like Electronic Medical Record (EMR) systems', 'IAS 38'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Medical Supplies Payable', '2200', 'Liability', 'Current Liabilities', 'Money owed to suppliers for consumables', 'IFRS 9'),
        ('Unearned Procedure Revenue', '2700', 'Liability', 'Current Liabilities', 'Payments received in advance for future procedures', 'IFRS 15'),
        ('Lease Liability', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased assets', 'IFRS 16'),
        ('Clinic Capital', '3000', 'Equity', 'Capital', 'Owners investment in the clinic/practice', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the clinic', 'IAS 1'),
        ('Medical Procedures Income', '4000', 'Income', 'Service Revenue', 'Revenue from surgical or diagnostic procedures', 'IFRS 15'),
        ('Consultation Fees', '4100', 'Income', 'Service Revenue', 'Revenue from patient consultations', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing space or equipment to other practitioners', 'IFRS 16'),
        ('Clinical Staff Salaries', '6100', 'Expense', 'Operating Expenses', 'Compensation for doctors, nurses, and support staff', 'IAS 19'),
        ('Pharmaceuticals Expense', '6200', 'Expense', 'Cost of Sales', 'Cost of medicines and drugs used in patient care', 'IAS 2'),
        ('Utilities & Sanitation', '6300', 'Expense', 'Operating Expenses', 'Cost of electricity, water, and hygiene services', 'IAS 1'),
        ('Depreciation -Medical Equipment', '7100', 'Expense', 'Depreciation & Amortization', 'Expense for usage of medical fixed assets', 'IAS 16'),
        ('Lease Amortization', '7110', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Amortization Adjustment -EMR Software', '8000', 'Adjustment', 'Depreciation & Amortization', 'Adjustment to intangible asset amortization', 'IAS 38'),
        ('Impairment -Clinical Assets', '8100', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for non-recoverable value of fixed assets', 'IAS 36'),
        ('Accrued Labour Expense', '8200', 'Adjustment', 'Other Adjustments', 'Adjustment for unrecorded wages at period-end', 'IAS 19'),
    ],
    "Hospitality": [
        ('Guestroom Furniture', '1100', 'Asset', 'Property, Plant & Equipment', 'Tangible assets within hotel guest rooms', 'IAS 16'),
        ('Bar Inventory', '1500', 'Asset', 'Inventories', 'Alcohol and other stock held for sale at the bar/restaurant', 'IAS 2'),
        ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets', 'Asset for leased hotel premises', 'IFRS 16'),
        ('Intangible Assets -Hospitality Licenses', '1800', 'Asset', 'Intangible Assets', 'Non-physical asset like liquor licenses or brand rights', 'IAS 38'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Advance Guest Payments', '2700', 'Liability', 'Current Liabilities', 'Payments received for future room bookings or events', 'IFRS 15'),
        ('Accrued Utilities', '2200', 'Liability', 'Current Liabilities', 'Estimated costs for un-invoiced electricity and water', 'IFRS 9'),
        ('Lease Liability', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased premises', 'IFRS 16'),
        ('Hospitality Fund Capital', '3000', 'Equity', 'Capital', 'Owners investment in the hotel/venue', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the establishment', 'IAS 1'),
        ('Room Revenue', '4000', 'Income', 'Sales Revenue', 'Revenue from the rental of guest rooms', 'IFRS 15'),
        ('Bar Sales', '4100', 'Income', 'Sales Revenue', 'Revenue from the sale of food and beverages at the bar', 'IFRS 15'),
        ('Event Hosting Revenue', '4200', 'Income', 'Service Revenue', 'Revenue from hosting conferences or weddings', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing out retail space within the hotel', 'IFRS 16'),
        ('Housekeeping Wages', '6100', 'Expense', 'Operating Expenses', 'Compensation for cleaning and maintenance staff', 'IAS 19'),
        ('Laundry Services', '6200', 'Expense', 'Operating Expenses', 'Cost of outsourced or internal laundry operations', 'IAS 1'),
        ('Marketing & Branding', '6300', 'Expense', 'Operating Expenses', 'Cost of advertising and brand promotion', 'IAS 1'),
        ('Depreciation -Furniture', '7100', 'Expense', 'Depreciation & Amortization', 'Expense for usage of guestroom fixed assets', 'IAS 16'),
        ('Lease Amortization', '7110', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Accrued Tour Commission', '8000', 'Adjustment', 'Other Adjustments', 'Adjustment for commission owed to tour operators/agents', 'IFRS 15'),
        ('Impairment -Hospitality Assets', '8100', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for non-recoverable value of fixed assets', 'IAS 36'),
    ],
    "Management Services": [
        ('Office Furniture', '1100', 'Asset', 'Property, Plant & Equipment', 'Tangible assets for administrative use', 'IAS 16'),
        ('Client Receivables', '1700', 'Asset', 'Current Assets', 'Amounts due from clients for management services', 'IFRS 15'),
        ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets', 'Asset for leased office premises', 'IFRS 16'),
        ('Intangible Asset -Licensing Rights', '1800', 'Asset', 'Intangible Assets', 'Non-physical asset representing rights to intellectual property', 'IAS 38'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Consultant Payable', '2200', 'Liability', 'Current Liabilities', 'Money owed to external consultants', 'IFRS 9'),
        ('Deferred Consulting Income', '2700', 'Liability', 'Current Liabilities', 'Payments received for consulting services not yet rendered', 'IFRS 15'),
        ('Lease Liability', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased assets', 'IFRS 16'),
        ('Owner Capital', '3000', 'Equity', 'Capital', 'Owners investment in the management firm', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the firm', 'IAS 1'),
        ('Retainer Income', '4000', 'Income', 'Service Revenue', 'Recurring revenue from long-term client contracts', 'IFRS 15'),
        ('Consulting Fees', '4100', 'Income', 'Service Revenue', 'Project-based revenue from consulting assignments', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing assets to others', 'IFRS 16'),
        ('Staff Salaries', '6100', 'Expense', 'Operating Expenses', 'Compensation paid to internal management staff', 'IAS 19'),
        ('Professional Fees', '6200', 'Expense', 'Operating Expenses', 'Cost of outsourced legal or accounting services', 'IAS 1'),
        ('Software Subscription', '6300', 'Expense', 'Operating Expenses', 'Cost of operational software licenses (SaaS)', 'IAS 38'),
        ('Depreciation -Office Furniture', '7100', 'Expense', 'Depreciation & Amortization', 'Expense for usage of office fixed assets', 'IAS 16'),
        ('Amortization -Licensing Rights', '7200', 'Expense', 'Depreciation & Amortization', 'Systematic expense of intangible rights', 'IAS 38'),
        ('Lease Amortization', '7110', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Accrued Consulting Revenue', '8000', 'Adjustment', 'Revenue Adjustments', 'Adjustment for revenue earned but not yet billed', 'IFRS 15'),
        ('Amortization Adjustment -Licensing Rights', '8100', 'Adjustment', 'Depreciation & Amortization', 'Adjustment to intangible asset amortization', 'IAS 38'),
        ('Impairment -Client Receivables', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for unrecoverable client debts', 'IFRS 9'),
    ],

    "Clubs & Associations": [
        # ─────────────────────────────
        # ASSETS – CURRENT (club-specific)
        # ─────────────────────────────
        ("Membership Fees Receivable", "1110", "Asset", "Current Assets",
        "Unpaid membership subscriptions due from members", "IFRS 9"),
        ("Bar Inventory", "1300", "Asset", "Current Assets",
        "Beverages and snacks held for sale at the bar", "IAS 2"),
        ("Merchandise Inventory", "1310", "Asset", "Current Assets",
        "Merchandise (kits, shirts, caps) held for sale", "IAS 2"),

        # ─────────────────────────────
        # ASSETS – NON-CURRENT (club-specific PPE)
        # ─────────────────────────────
        ("Clubhouse Buildings", "1500", "Asset", "Property, Plant & Equipment",
        "Clubhouse and permanent structures at cost", "IAS 16"),
        ("Sports Facilities & Grounds", "1510", "Asset", "Property, Plant & Equipment",
        "Pitches, courts and related field improvements", "IAS 16"),
        ("Sports Equipment", "1520", "Asset", "Property, Plant & Equipment",
        "Durable sports equipment (goals, nets, gym equipment)", "IAS 16"),
        ("Furniture and Fixtures", "1530", "Asset", "Property, Plant & Equipment",
        "Furniture, fittings and fixtures in clubhouse and bar", "IAS 16"),

        ("Accumulated Depreciation - Clubhouse", "1590", "Asset", "Accumulated Depreciation",
        "Accumulated depreciation on clubhouse buildings", "IAS 16"),
        ("Accumulated Depreciation - Sports Equipment", "1591", "Asset", "Accumulated Depreciation",
        "Accumulated depreciation on sports equipment", "IAS 16"),
        ("Accumulated Depreciation - Furniture", "1592", "Asset", "Accumulated Depreciation",
        "Accumulated depreciation on furniture and fixtures", "IAS 16"),

        # ─────────────────────────────
        # LIABILITIES – CURRENT
        # (exclude generic AP / Accrued from GENERAL list)
        # ─────────────────────────────
        ("Trade Payables", "2000", "Liability", "Current Liabilities",
        "Suppliers of goods and services payable by the club", "IFRS 9"),
        ("Subscriptions Received in Advance", "2200", "Liability", "Current Liabilities",
        "Membership subscriptions billed but relating to future periods", "IFRS 15"),
        ("Event Income Received in Advance", "2210", "Liability", "Current Liabilities",
        "Deposits and advance receipts for future events and facility hire", "IFRS 15"),
        ("Bank Overdraft", "2300", "Liability", "Current Liabilities",
        "Bank overdraft balance", "IFRS 9"),

        # ─────────────────────────────
        # LIABILITIES – NON-CURRENT
        # ─────────────────────────────
        ("Long-term Loan Payable", "2400", "Liability", "Non-Current Liabilities",
        "Long-term loans and other interest-bearing borrowings", "IFRS 9"),

        # ─────────────────────────────
        # FUNDS / EQUITY – CLUB STYLE
        # (no duplication of Owner Capital / Retained Earnings)
        # ─────────────────────────────
        ("Accumulated Fund", "3300", "Equity", "Club Funds",
        "Opening accumulated surplus/(deficit) of the club", "IAS 1"),
        ("Restricted Funds", "3310", "Equity", "Club Funds",
        "Designated funds (e.g. building fund, junior development fund)", "IAS 1"),
        ("Current Year Surplus / (Deficit)", "3320", "Equity", "Club Funds",
        "Current year surplus or deficit from income & expenditure", "IAS 1"),

        # ─────────────────────────────
        # EXPENSES – OPERATING / PROGRAMME
        # (only those NOT already in subindustry templates
        #  and NOT part of GENERAL_ACCOUNTS_LIST)
        # ─────────────────────────────
        ("Clubhouse Maintenance", "6010", "Expense", "Operating Expenses",
        "Repairs and maintenance of clubhouse and buildings", "IAS 16"),
        ("Utilities - Water & Electricity", "6030", "Expense", "Operating Expenses",
        "Electricity, water and related utility charges", "IAS 1"),
        ("Sports Equipment - Small Items", "6060", "Expense", "Programme Expenses",
        "Low-value sports equipment expensed on purchase", "IAS 1"),
        ("Insurance", "6070", "Expense", "Operating Expenses",
        "Insurance on clubhouse, grounds, equipment and public liability", "IAS 1"),
        ("Printing & Stationery", "6090", "Expense", "Administrative Expenses",
        "Printing, stationery and office consumables", "IAS 1"),
        ("Bank Charges", "6105", "Expense", "Administrative Expenses",
        "Bank charges and transaction fees", "IFRS 9"),
        ("Audit and Accounting Fees", "6110", "Expense", "Administrative Expenses",
        "Professional fees for audit and accounting services", "IAS 1"),
        ("Depreciation - Clubhouse", "6120", "Expense", "Depreciation & Amortization",
        "Depreciation charge on clubhouse buildings", "IAS 16"),
        ("Depreciation - Sports Equipment", "6121", "Expense", "Depreciation & Amortization",
        "Depreciation charge on sports equipment", "IAS 16"),
        ("Depreciation - Furniture & Fixtures", "6122", "Expense", "Depreciation & Amortization",
        "Depreciation charge on furniture and fixtures", "IAS 16"),
        ("Sundry Expenses", "6130", "Expense", "Operating Expenses",
        "Minor general expenses not classified elsewhere", "IAS 1"),
    ],

    "Manufacturing": [
        ('Plant & Machinery', '1100', 'Asset', 'Property, Plant & Equipment', 'Tangible assets for the production process', 'IAS 16'),
        ('Raw Material Inventory', '1500', 'Asset', 'Inventories', 'Unprocessed goods held for use in production', 'IAS 2'),
        ('Work-in-Progress Inventory', '1510', 'Asset', 'Inventories', 'Partially completed goods in the production line', 'IAS 2'),
        ('Finished Goods Inventory', '1520', 'Asset', 'Inventories', 'Completed products ready for sale', 'IAS 2'),
        ('Right-of-Use Asset', '1610', 'Asset', 'Non-Current Assets', 'Asset for leased factory or equipment', 'IFRS 16'),
        ('Intangible Asset -Production Patents', '1800', 'Asset', 'Intangible Assets', 'Non-physical asset representing exclusive right to a production method', 'IAS 38'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets', 'Short-term amount due from sub-leasing assets', 'IFRS 16'),
        ('Foreign Loans Payable', '2100', 'Liability', 'Current Liabilities', 'Short-term portion of loans denominated in a foreign currency', 'IAS 21'),
        ('Trade Payables', '2200', 'Liability', 'Current Liabilities', 'Money owed to raw material and parts suppliers', 'IFRS 9'),
        ('Provision -Warranty Claims', '2800', 'Liability', 'Provisions', 'Estimated future cost of honoring product warranty obligations', 'IAS 37'),
        ('Lease Liability -Equipment', '2610', 'Liability', 'Non-Current Liabilities', 'Long-term obligation for leased machinery', 'IFRS 16'),
        ('Share Capital', '3000', 'Equity', 'Capital', 'Investment by company shareholders', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings', 'Accumulated profits/losses retained by the company', 'IAS 1'),
        ('Product Sales Revenue', '4000', 'Income', 'Sales Revenue', 'Revenue generated from the sale of manufactured goods', 'IFRS 15'),
        ('Scrap Sales', '4100', 'Income', 'Other Income', 'Revenue from selling unusable waste material', 'IAS 1'),
        ('Lease Income', '4800', 'Income', 'Other Income', 'Income from leasing production assets to others', 'IFRS 16'),
        ('Raw Material Purchases', '6100', 'Expense', 'Cost of Sales', 'Cost of acquiring unprocessed goods', 'IAS 2'),
        ('Direct Labour Costs', '6200', 'Expense', 'Cost of Sales', 'Wages paid to production line workers', 'IAS 19'),
        ('Utility Costs -Industrial', '6300', 'Expense', 'Operating Expenses', 'Cost of power and utilities for the factory', 'IAS 1'),
        ('Depreciation -Plant', '7100', 'Expense', 'Depreciation & Amortization', 'Expense for usage of plant and machinery', 'IAS 16'),
        ('Amortization -Production Licenses', '7200', 'Expense', 'Depreciation & Amortization', 'Systematic expense of patents and licenses', 'IAS 38'),
        ('Lease Amortization', '7110', 'Expense', 'Depreciation & Amortization', 'Systematic expense of Right-of-Use asset', 'IFRS 16'),
        ('Inventory Adjustment', '8000', 'Adjustment', 'Other Adjustments', 'Adjustment for stock count differences or valuation changes', 'IAS 2'),
        ('Provision Adjustment -Warranty', '8100', 'Adjustment', 'Other Adjustments', 'Adjustment to the provision for warranty claims', 'IAS 37'),
        ('Impairment -Production Assets', '8200', 'Adjustment', 'Non-Operating Adjustments', 'Adjustment for non-recoverable value of production assets', 'IAS 36'),
    ],
    "Mining": [
        # ASSETS
        ("Mining Property, Plant & Equipment", "1100", "Asset", "Property, Plant & Equipment",
         "Heavy mining equipment (trucks, loaders, shovels, drill rigs)", "IAS 16"),
        ("Stripping Activity Asset", "1115", "Asset", "Property, Plant & Equipment",
         "Capitalised waste-stripping costs for surface mines", "IFRIC 20"),
        ("Mine Infrastructure", "1120", "Asset", "Property, Plant & Equipment",
         "Shafts, declines, processing plants and tailings dams", "IAS 16"),
        ("Mine Rehabilitation Trust Asset", "1055", "Asset", "Cash & Equivalents",
         "Restricted cash/investments set aside for closure and rehabilitation", "IFRIC 5"),
        ("Exploration & Evaluation Assets", "1805", "Asset", "Intangible Assets",
         "Capitalised exploration and evaluation expenditure", "IFRS 6"),
        ("Ore Stockpiles", "1505", "Asset", "Inventories",
         "Mined ore awaiting processing", "IAS 2"),
        ("Concentrate / Refined Metal Inventory", "1515", "Asset", "Inventories",
         "Processed concentrates or refined metal held for sale", "IAS 2"),
        ("Spare Parts & Consumables", "1525", "Asset", "Inventories",
         "Critical spares and consumables used in mining fleet and plant", "IAS 2"),
        ("Trade Receivables - Commodity Customers", "1700", "Asset", "Current Assets",
         "Amounts due from smelters/off-takers and commodity buyers", "IFRS 15"),
        ("Right-of-Use Asset - Mining Fleet", "1610", "Asset", "Non-Current Assets",
         "Leased mining equipment and vehicles", "IFRS 16"),
        ("Lease Receivable", "1710", "Asset", "Current Assets",
         "Amounts due from sub-leasing equipment or accommodation", "IFRS 16"),

        # LIABILITIES
        ("Trade Payables - Mining Operations", "2200", "Liability", "Current Liabilities",
         "Amounts due to suppliers, contractors and service providers", "IFRS 9"),
        ("Royalties & Mineral Rent Payable", "2205", "Liability", "Current Liabilities",
         "Amounts due to government/landowners for mineral royalties", None),
        ("Short-term Loans & Facility Drawings", "2100", "Liability", "Current Liabilities",
         "Current portion of bank facilities and shareholder loans", "IFRS 9"),
        ("Environmental Rehabilitation Provision", "2805", "Liability", "Provisions",
         "Present value of mine closure and rehabilitation obligations", "IAS 37"),
        ("Employee Benefit Provisions - Mining", "2810", "Liability", "Provisions",
         "Leave, bonuses and long-service obligations", "IAS 19"),
        ("Lease Liability - Mining Fleet", "2610", "Liability", "Non-Current Liabilities",
         "Long-term obligation for leased mining equipment", "IFRS 16"),

        # EQUITY
        ("Share Capital / Owners Equity", "3000", "Equity", "Capital",
         "Equity invested in the mining entity", "IAS 1"),
        ("Retained Earnings", "3100", "Equity", "Retained Earnings",
         "Accumulated profits or losses retained in the mine", "IAS 1"),
        ("Revaluation Reserve - Mining Assets", "3200", "Equity", "Other Reserves",
         "Revaluation surplus on PPE or mineral properties", "IAS 16"),

        # INCOME
        ("Ore Sales Revenue", "4000", "Income", "Sales Revenue",
         "Revenue from sale of run-of-mine ore or coal", "IFRS 15"),
        ("Concentrate / Metal Sales Revenue", "4010", "Income", "Sales Revenue",
         "Revenue from sale of concentrates or refined metal", "IFRS 15"),
        ("By-product Revenue", "4020", "Income", "Other Income",
         "Revenue from sale of by-products (e.g., slag, aggregate, acid)", "IFRS 15"),
        ("Toll Treatment / Processing Income", "4030", "Income", "Service Revenue",
         "Revenue from processing third-party ore", "IFRS 15"),
        ("Hedging Gains - Commodity Contracts", "4300", "Income", "Other Income",
         "Realised gains on commodity derivative contracts", "IFRS 9"),
        ("Lease Income", "4800", "Income", "Other Income",
         "Income from leasing equipment, camp or facilities", "IFRS 16"),

        # EXPENSES
        ("Mining Contractor Costs", "6100", "Expense", "Cost of Sales",
         "Drilling, blasting, loading and hauling costs", "IAS 2"),
        ("Processing / Beneficiation Costs", "6110", "Expense", "Cost of Sales",
         "Crushing, milling, flotation, smelting and refining", "IAS 2"),
        ("Mining Labour Costs", "6120", "Expense", "Cost of Sales",
         "Salaries and wages for mine production employees", "IAS 19"),
        ("Site Utilities - Power & Water", "6300", "Expense", "Operating Expenses",
         "Electricity, water and other utilities at mine and plant", "IAS 1"),
        ("Safety, Health & Environmental Costs", "6310", "Expense", "Operating Expenses",
         "PPE, training, monitoring and compliance programmes", "IAS 1"),
        ("Royalties Expense", "6320", "Expense", "Operating Expenses",
         "Mineral royalties and production-based taxes", None),
        ("Exploration Expense", "6330", "Expense", "Operating Expenses",
         "Exploration costs expensed as incurred", "IFRS 6"),
        ("Site Administration & Camp Costs", "6340", "Expense", "Operating Expenses",
         "Accommodation, catering and general administration at site", "IAS 1"),
        ("Depreciation - Mining Fleet & Plant", "7100", "Expense", "Depreciation & Amortization",
         "Depreciation of mining PPE", "IAS 16"),
        ("Depreciation - Stripping Asset", "7110", "Expense", "Depreciation & Amortization",
         "Amortisation of capitalised stripping costs", "IFRIC 20"),
        ("Amortisation - Exploration & Evaluation", "7120", "Expense", "Depreciation & Amortization",
         "Amortisation of capitalised exploration and evaluation assets", "IFRS 6"),
        ("Rehabilitation Accretion Expense", "7200", "Expense", "Other Expense",
         "Unwinding of discount on rehabilitation provision", "IAS 37"),

        # ADJUSTMENTS
        ("Inventory NRV Adjustment - Ore & Metals", "8000", "Adjustment", "Other Adjustments",
         "Write-down to net realisable value for commodity inventories", "IAS 2"),
        ("Impairment - Mining CGUs", "8200", "Adjustment", "Non-Operating Adjustments",
         "Impairment losses on mining cash-generating units", "IAS 36"),
        ("Rehabilitation Provision Re-estimate", "8300", "Adjustment", "Non-Operating Adjustments",
         "Adjustment for changes in closure cost assumptions or discount rate", "IAS 37"),
        ("Hedging Fair Value Adjustment", "8400", "Adjustment", "Non-Operating Adjustments",
         "Fair value remeasurement of commodity derivatives", "IFRS 9"),
    ],

    "Banking & Financial Services": [
        # ASSETS
        ("Cash & Balances with Central Bank", "1005", "Asset", "Cash & Equivalents",
         "Cash on hand and reserve balances with central bank", "IAS 7"),
        ("Loans & Advances to Customers", "1705", "Asset", "Current Assets",
         "Customer loans and overdrafts at amortised cost", "IFRS 9"),
        ("Investment Securities - FVOCI", "1715", "Asset", "Current Assets",
         "Debt instruments measured at fair value through OCI", "IFRS 9"),
        ("Trading Portfolio - FVTPL", "1725", "Asset", "Current Assets",
         "Trading securities measured at fair value through profit or loss", "IFRS 9"),
        ("Right-of-Use Asset - Branch Premises", "1610", "Asset", "Non-Current Assets",
         "Leased branches and office premises", "IFRS 16"),
        ("Intangible Assets - Core Banking Software", "1800", "Asset", "Intangible Assets",
         "Core systems and licenses", "IAS 38"),

        # LIABILITIES
        ("Customer Deposits", "2205", "Liability", "Current Liabilities",
         "Retail and corporate customer deposit accounts", "IFRS 9"),
        ("Wholesale Funding / Interbank Borrowings", "2105", "Liability", "Current Liabilities",
         "Funding from other financial institutions", "IFRS 9"),
        ("Derivative Liabilities - Trading", "2215", "Liability", "Current Liabilities",
         "Negative fair value of derivative positions", "IFRS 9"),
        ("Lease Liability - Branch Premises", "2610", "Liability", "Non-Current Liabilities",
         "Long-term lease commitments for branches", "IFRS 16"),

        # EQUITY
        ("Share Capital", "3000", "Equity", "Capital",
         "Issued share capital of the bank", "IAS 1"),
        ("Retained Earnings", "3100", "Equity", "Retained Earnings",
         "Accumulated retained profits", "IAS 1"),
        ("Regulatory Reserves", "3200", "Equity", "Other Reserves",
         "Reserves required by prudential regulation", None),

        # INCOME / EXPENSE
        ("Interest Income - Loans & Advances", "4000", "Income", "Interest Income",
         "Interest earned on customer loans", "IFRS 9"),
        ("Interest Income - Investment Securities", "4005", "Income", "Interest Income",
         "Interest on debt instruments", "IFRS 9"),
        ("Interest Expense - Deposits & Borrowings", "6005", "Expense", "Interest Expense",
         "Interest paid on deposits and funding", "IFRS 9"),
        ("Fee & Commission Income", "4100", "Income", "Service Revenue",
         "Account fees, advisory and guarantee fees", "IFRS 15"),
        ("Trading & Investment Income", "4200", "Income", "Other Income",
         "Fair value gains and trading income", "IFRS 9"),
        ("Foreign Exchange Trading Income", "4300", "Income", "Other Income",
         "FX dealing gains", "IAS 21"),

        # EXPENSES
        ("Staff Costs - Banking Operations", "6100", "Expense", "Operating Expenses",
         "Salaries, bonuses and benefits", "IAS 19"),
        ("IT & Systems Expenses", "6200", "Expense", "Operating Expenses",
         "Core banking, cybersecurity and infrastructure", "IAS 1"),
        ("Occupancy Costs - Branch Network", "6210", "Expense", "Operating Expenses",
         "Non-lease occupancy related costs", "IAS 1"),
        ("Regulatory & Compliance Costs", "6220", "Expense", "Operating Expenses",
         "Prudential, audit and compliance expenses", "IAS 1"),
        ("Depreciation - Equipment & Fixtures", "7100", "Expense", "Depreciation & Amortization",
         "Depreciation of ATMs, office equipment, etc.", "IAS 16"),
        ("Amortisation - Core Software", "7110", "Expense", "Depreciation & Amortization",
         "Amortisation of banking software", "IAS 38"),
        ("Expected Credit Loss (ECL) - Loans", "7200", "Expense", "Other Expense",
         "Impairment allowance on financial assets", "IFRS 9"),

        # ADJUSTMENTS
        ("Fair Value Adjustment - Trading Book", "8000", "Adjustment", "Other Adjustments",
         "Period-end fair value adjustment on trading instruments", "IFRS 9"),
        ("ECL Model Re-measurement", "8200", "Adjustment", "Non-Operating Adjustments",
         "Adjustment for revised credit risk parameters", "IFRS 9"),
    ],

    "Telecommunications": [
        ("Network Infrastructure", "1100", "Asset", "Property, Plant & Equipment",
         "Towers, fibre, switches and related equipment", "IAS 16"),
        ("Spectrum Licenses", "1805", "Asset", "Intangible Assets",
         "Licenses to use radio frequency spectrum", "IAS 38"),
        ("Subscriber Acquisition Costs - Capitalised", "1810", "Asset", "Intangible Assets",
         "Incremental costs of obtaining contracts", "IFRS 15"),
        ("Right-of-Use Asset - Towers & Sites", "1610", "Asset", "Non-Current Assets",
         "Leased towers, rooftops and data centres", "IFRS 16"),
        ("Handset Inventory", "1500", "Asset", "Inventories",
         "Handsets and devices held for sale", "IAS 2"),
        ("Contract Assets - Postpaid", "1705", "Asset", "Current Assets",
         "Unbilled revenue for mobile and data services", "IFRS 15"),
        ("Trade Receivables - Subscribers", "1700", "Asset", "Current Assets",
         "Amounts due from customers and dealers", "IFRS 15"),

        ("Trade Payables - Network Vendors", "2200", "Liability", "Current Liabilities",
         "Amounts due to equipment and service vendors", "IFRS 9"),
        ("Deferred Revenue - Airtime & Data", "2700", "Liability", "Current Liabilities",
         "Prepaid airtime and data not yet used", "IFRS 15"),
        ("Lease Liability - Towers & Sites", "2610", "Liability", "Non-Current Liabilities",
         "Long-term tower and site lease obligations", "IFRS 16"),

        ("Share Capital", "3000", "Equity", "Capital",
         "Equity invested in the telecoms entity", "IAS 1"),
        ("Retained Earnings", "3100", "Equity", "Retained Earnings",
         "Accumulated profits/losses retained", "IAS 1"),

        ("Voice Revenue", "4000", "Income", "Sales Revenue",
         "Revenue from mobile and fixed-line voice services", "IFRS 15"),
        ("Data Revenue", "4010", "Income", "Sales Revenue",
         "Revenue from mobile and fixed data services", "IFRS 15"),
        ("SMS & Value-Added Services Revenue", "4020", "Income", "Sales Revenue",
         "Revenue from SMS, ringback tones and VAS", "IFRS 15"),
        ("Interconnect & Roaming Revenue", "4030", "Income", "Sales Revenue",
         "Fees from other operators for interconnect and roaming", "IFRS 15"),
        ("Equipment / Handset Sales", "4040", "Income", "Sales Revenue",
         "Revenue from sale of devices and CPE", "IFRS 15"),
        ("Tower Lease Income", "4800", "Income", "Other Income",
         "Income from leasing tower space to other operators", "IFRS 16"),

        ("Network Operating Costs", "6100", "Expense", "Operating Expenses",
         "Power, site rentals, repairs and maintenance", "IAS 1"),
        ("Subscriber Acquisition & Retention Costs", "6110", "Expense", "Operating Expenses",
         "Commissions and handset subsidies not capitalised", "IFRS 15"),
        ("Spectrum & License Fees", "6120", "Expense", "Operating Expenses",
         "Ongoing licence and regulatory fees", "IAS 38"),
        ("Staff Costs", "6200", "Expense", "Operating Expenses",
         "Salaries and benefits", "IAS 19"),
        ("Marketing & Promotions", "6300", "Expense", "Operating Expenses",
         "Advertising, sponsorship and promotions", "IAS 1"),
        ("Depreciation - Network Infrastructure", "7100", "Expense", "Depreciation & Amortization",
         "Depreciation of towers, fibre and equipment", "IAS 16"),
        ("Amortisation - Spectrum & Intangibles", "7110", "Expense", "Depreciation & Amortization",
         "Amortisation of licenses and subscriber acquisition costs", "IAS 38"),

        ("Deferred Revenue Adjustment - Prepaid", "8000", "Adjustment", "Other Adjustments",
         "Adjustment for unused airtime/data balances", "IFRS 15"),
        ("Impairment - Network Assets", "8200", "Adjustment", "Non-Operating Adjustments",
         "Impairment of CGUs or specific network assets", "IAS 36"),
    ],

    "Media & Entertainment": [
        ("Production Equipment", "1100", "Asset", "Property, Plant & Equipment",
         "Cameras, lighting and studio equipment", "IAS 16"),
        ("Content Library", "1805", "Asset", "Intangible Assets",
         "Capitalised production and acquired content rights", "IAS 38"),
        ("Work-in-Progress - Productions", "1505", "Asset", "Inventories",
         "Costs incurred on productions in progress", "IAS 2"),
        ("Receivables - Broadcasters & Platforms", "1700", "Asset", "Current Assets",
         "Amounts due from broadcasters and streaming platforms", "IFRS 15"),

        ("Trade Payables - Production", "2200", "Liability", "Current Liabilities",
         "Amounts owed to cast, crew and vendors", "IFRS 9"),
        ("Deferred Revenue - Sponsorship & Licenses", "2700", "Liability", "Current Liabilities",
         "Revenue billed in advance for rights and sponsorships", "IFRS 15"),

        ("Share Capital", "3000", "Equity", "Capital",
         "Equity invested in the media business", "IAS 1"),
        ("Retained Earnings", "3100", "Equity", "Retained Earnings",
         "Accumulated profits/losses retained", "IAS 1"),

        ("Advertising Revenue", "4000", "Income", "Sales Revenue",
         "Revenue from advertising slots and campaigns", "IFRS 15"),
        ("Content Licensing Revenue", "4010", "Income", "Sales Revenue",
         "Licensing of content to third parties", "IFRS 15"),
        ("Subscription Revenue", "4020", "Income", "Sales Revenue",
         "Subscription fees from viewers/listeners", "IFRS 15"),

        ("Production Costs", "6100", "Expense", "Cost of Sales",
         "Direct costs of creating content", "IAS 2"),
        ("Talent Fees", "6110", "Expense", "Operating Expenses",
         "Actors, presenters, performers and royalties", "IAS 19"),
        ("Marketing & Publicity", "6300", "Expense", "Operating Expenses",
         "Promotion of productions and channels", "IAS 1"),
        ("Depreciation - Production Equipment", "7100", "Expense", "Depreciation & Amortization",
         "Depreciation of studio and production gear", "IAS 16"),
        ("Amortisation - Content Library", "7110", "Expense", "Depreciation & Amortization",
         "Amortisation of capitalised content", "IAS 38"),

        ("Content Impairment Adjustment", "8200", "Adjustment", "Non-Operating Adjustments",
         "Write-down of underperforming content assets", "IAS 36"),
    ],
    "Automotive Services": [
        ('Workshop Equipment', '1100', 'Asset', 'Property, Plant & Equipment',
         'Lifts, tools and diagnostic equipment used in the workshop', 'IAS 16'),
        ('Spray Booth & Panel Tools', '1110', 'Asset', 'Property, Plant & Equipment',
         'Specialised spray-painting and panel beating equipment', 'IAS 16'),
        ('Parts & Tyre Inventory', '1500', 'Asset', 'Inventories',
         'Spare parts, tyres and consumables held for sale or fitment', 'IAS 2'),
        ('Work-in-Progress Jobs', '1510', 'Asset', 'Inventories',
         'Unfinished repair jobs at reporting date', 'IAS 2'),
        ('Right-of-Use Asset - Workshop Premises', '1610', 'Asset', 'Non-Current Assets',
         'Leased workshop or fitment centre premises', 'IFRS 16'),
        ('Trade Receivables - Workshop', '1700', 'Asset', 'Current Assets',
         'Amounts due from customers and insurance companies', 'IFRS 15'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets',
         'Short-term amounts due from sub-leasing bays or equipment', 'IFRS 16'),

        ('Trade Payables - Parts Suppliers', '2200', 'Liability', 'Current Liabilities',
         'Amounts owed to parts, paint and tyre suppliers', 'IFRS 9'),
        ('Customer Deposits - Repairs', '2700', 'Liability', 'Current Liabilities',
         'Deposits received for repair or fitment work not yet completed', 'IFRS 15'),
        ('Lease Liability - Workshop Premises', '2610', 'Liability', 'Non-Current Liabilities',
         'Long-term obligation for leased workshop premises', 'IFRS 16'),

        ("Owner's Capital - Workshop", '3000', 'Equity', 'Capital',
         'Owner investment in the automotive services business', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings',
         'Accumulated profits/losses retained by the workshop', 'IAS 1'),

        ('Labour Revenue - Workshop', '4000', 'Income', 'Service Revenue',
         'Revenue from labour and diagnostic services', 'IFRS 15'),
        ('Parts & Tyre Sales', '4010', 'Income', 'Sales Revenue',
         'Revenue from parts and tyre sales and fitment', 'IFRS 15'),
        ('Insurance Claim Recovery Income', '4020', 'Income', 'Other Income',
         'Income from insurers for accident repair work', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income',
         'Income from leasing bays or equipment to third parties', 'IFRS 16'),

        ('Mechanic & Technician Wages', '6100', 'Expense', 'Cost of Sales',
         'Direct labour cost of mechanics and technicians', 'IAS 19'),
        ('Paint & Panel Materials', '6110', 'Expense', 'Cost of Sales',
         'Paint, body filler and consumables used in repairs', 'IAS 2'),
        ('Workshop Utilities', '6300', 'Expense', 'Operating Expenses',
         'Electricity, compressed air and other utilities', 'IAS 1'),
        ('Workshop Rent (Non-IFRS16)', '6310', 'Expense', 'Operating Expenses',
         'Short-term/low-value workshop rentals', 'IFRS 16'),
        ('Advertising & Promotions', '6400', 'Expense', 'Operating Expenses',
         'Marketing costs and promotions', 'IAS 1'),
        ('Depreciation - Workshop Equipment', '7100', 'Expense', 'Depreciation & Amortization',
         'Depreciation of workshop tools and equipment', 'IAS 16'),
        ('Lease Amortization', '7110', 'Expense', 'Depreciation & Amortization',
         'Systematic expense of Right-of-Use asset for premises', 'IFRS 16'),

        ('Inventory Write-down - Parts', '8000', 'Adjustment', 'Other Adjustments',
         'Write-down of obsolete or damaged parts', 'IAS 2'),
        ('Accrued Wages Adjustment', '8100', 'Adjustment', 'Other Adjustments',
         'Adjustment for unrecorded workshop wages at period-end', 'IAS 19'),
        ('Impairment - Workshop Assets', '8200', 'Adjustment', 'Non-Operating Adjustments',
         'Impairment of workshop PPE where not recoverable', 'IAS 36'),
    ],

    "Engineering & Technical": [
        ('Engineering Equipment', '1100', 'Asset', 'Property, Plant & Equipment',
         'Survey, testing and engineering equipment', 'IAS 16'),
        ('Design Software & Tools', '1800', 'Asset', 'Intangible Assets',
         'Specialised engineering and CAD software', 'IAS 38'),
        ('Work-in-Progress - Engineering Projects', '1500', 'Asset', 'Inventories',
         'Unbilled time and costs on engineering projects', 'IFRS 15'),
        ('Right-of-Use Asset - Offices', '1610', 'Asset', 'Non-Current Assets',
         'Leased office and lab facilities', 'IFRS 16'),
        ('Trade Receivables - Engineering', '1700', 'Asset', 'Current Assets',
         'Amounts due from clients for engineering work', 'IFRS 15'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets',
         'Amounts due from sub-leasing lab/office space', 'IFRS 16'),

        ('Trade Payables', '2200', 'Liability', 'Current Liabilities',
         'Amounts owed to suppliers and subcontractors', 'IFRS 9'),
        ('Project Retentions Payable', '2210', 'Liability', 'Current Liabilities',
         'Amounts retained by clients pending completion', 'IFRS 15'),
        ('Deferred Project Revenue', '2700', 'Liability', 'Current Liabilities',
         'Billings in advance of engineering performance', 'IFRS 15'),
        ('Lease Liability - Offices', '2610', 'Liability', 'Non-Current Liabilities',
         'Long-term lease obligations for offices and labs', 'IFRS 16'),

        ('Engineering Capital', '3000', 'Equity', 'Capital',
         'Owner or shareholder investment in the engineering firm', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings',
         'Accumulated profits/losses retained by the firm', 'IAS 1'),

        ('Engineering Consulting Fees', '4000', 'Income', 'Service Revenue',
         'Revenue from engineering consulting services', 'IFRS 15'),
        ('Design & Drawing Income', '4010', 'Income', 'Service Revenue',
         'Revenue from design, modelling and drafting services', 'IFRS 15'),
        ('Testing & Certification Income', '4020', 'Income', 'Service Revenue',
         'Revenue from testing, commissioning and certification', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income',
         'Income from leasing specialised equipment to clients', 'IFRS 16'),

        ('Professional Staff Salaries', '6100', 'Expense', 'Operating Expenses',
         'Salaries and wages of engineers and technical staff', 'IAS 19'),
        ('Project Travel & Site Costs', '6200', 'Expense', 'Operating Expenses',
         'Travel, accommodation and site visit costs', 'IAS 1'),
        ('Specialist Software Subscription', '6300', 'Expense', 'Operating Expenses',
         'Recurring subscription for engineering tools', 'IAS 38'),
        ('Depreciation - Engineering Equipment', '7100', 'Expense', 'Depreciation & Amortization',
         'Depreciation of engineering equipment', 'IAS 16'),
        ('Amortization - Software', '7110', 'Expense', 'Depreciation & Amortization',
         'Amortization of engineering software', 'IAS 38'),

        ('Accrued Project Revenue', '8000', 'Adjustment', 'Revenue Adjustments',
         'Revenue earned but not yet billed on projects', 'IFRS 15'),
        ('Impairment - Project WIP', '8200', 'Adjustment', 'Non-Operating Adjustments',
         'Impairment of uncollectible project costs', 'IAS 36'),
    ],

    "Security Services": [
        ('Security Equipment', '1100', 'Asset', 'Property, Plant & Equipment',
         'CCTV cameras, access control, radios and vehicles', 'IAS 16'),
        ('Control Room Infrastructure', '1110', 'Asset', 'Property, Plant & Equipment',
         'Monitors, servers and control room fit-out', 'IAS 16'),
        ('Uniforms & Protective Gear Inventory', '1500', 'Asset', 'Inventories',
         'Uniforms and protective equipment held for use', 'IAS 2'),
        ('Right-of-Use Asset - Guarding Premises', '1610', 'Asset', 'Non-Current Assets',
         'Leased offices, control rooms or depots', 'IFRS 16'),
        ('Trade Receivables - Security Contracts', '1700', 'Asset', 'Current Assets',
         'Amounts due from guarding and monitoring clients', 'IFRS 15'),
        ('Lease Receivable', '1710', 'Asset', 'Current Assets',
         'Amounts due from sub-leasing equipment or space', 'IFRS 16'),

        ('Trade Payables - Security Vendors', '2200', 'Liability', 'Current Liabilities',
         'Amounts owed to suppliers and subcontractors', 'IFRS 9'),
        ('Payroll Liabilities - Guards', '2210', 'Liability', 'Current Liabilities',
         'PAYE, UIF and other payroll-related payables', 'IAS 19'),
        ('Deferred Income - Prepaid Security', '2700', 'Liability', 'Current Liabilities',
         'Prepaid contracts for guarding or monitoring', 'IFRS 15'),
        ('Lease Liability - Premises & Towers', '2610', 'Liability', 'Non-Current Liabilities',
         'Long-term obligation for leased premises and towers', 'IFRS 16'),

        ('Security Services Capital', '3000', 'Equity', 'Capital',
         'Owner or shareholder investment in the security company', 'IAS 1'),
        ('Retained Earnings', '3100', 'Equity', 'Retained Earnings',
         'Accumulated profits/losses retained by the entity', 'IAS 1'),

        ('Guarding Revenue', '4000', 'Income', 'Service Revenue',
         'Revenue from guarding and on-site protection', 'IFRS 15'),
        ('Alarm Monitoring Revenue', '4010', 'Income', 'Service Revenue',
         'Revenue from alarm and control room monitoring', 'IFRS 15'),
        ('Technical Security Systems Revenue', '4020', 'Income', 'Sales Revenue',
         'Revenue from supply and installation of security systems', 'IFRS 15'),
        ('Lease Income', '4800', 'Income', 'Other Income',
         'Income from leasing security equipment', 'IFRS 16'),

        ('Guard Wages & Overtime', '6100', 'Expense', 'Cost of Sales',
         'Direct labour cost of security guards', 'IAS 19'),
        ('Patrol Vehicle Fuel & Maintenance', '6110', 'Expense', 'Cost of Sales',
         'Fuel and maintenance of patrol vehicles', 'IAS 1'),
        ('Alarm & Communication Costs', '6200', 'Expense', 'Operating Expenses',
         'SIM, data and communication for monitoring', 'IAS 1'),
        ('Uniforms & Protective Gear Expense', '6210', 'Expense', 'Operating Expenses',
         'Cost of uniforms and protective equipment issued', 'IAS 2'),
        ('Control Room Utilities & Rent', '6300', 'Expense', 'Operating Expenses',
         'Electricity, rent and utilities for control rooms', 'IAS 1'),
        ('Depreciation - Security Equipment', '7100', 'Expense', 'Depreciation & Amortization',
         'Depreciation of cameras, radios and related PPE', 'IAS 16'),
        ('Lease Amortization', '7110', 'Expense', 'Depreciation & Amortization',
         'Systematic expense of Right-of-Use asset', 'IFRS 16'),

        ('Accrued Guarding Hours', '8000', 'Adjustment', 'Other Adjustments',
         'Guarding hours worked but not yet invoiced', 'IFRS 15'),
        ('Impairment - Security Equipment', '8200', 'Adjustment', 'Non-Operating Adjustments',
         'Impairment of damaged or obsolete security hardware', 'IAS 36'),
    ],
}

# --------------------------------------------------------------
#              SUB-INDUSTRY TEMPLATES (COMPLETE)
# --------------------------------------------------------------

SUBINDUSTRY_TEMPLATES: Dict[str, Dict[str, ListAccountRow]] = {
    "Professional Services": {
        "Auditing & Accounting": [
            ("Audit Fees", "4010", "Income", "Service Revenue",
             "Revenue from statutory and voluntary audits", "IFRS 15"),
            ("Assurance & Review Fees", "4020", "Income", "Service Revenue",
             "Review engagements and agreed-upon procedures", "IFRS 15"),
            ("Tax Advisory Income", "4030", "Income", "Service Revenue",
             "Tax consulting and compliance services", "IFRS 15"),
            ("Professional Indemnity Insurance", "6510", "Expense", "Operating Expenses",
             "Professional liability cover", "IAS 1"),
            ("CPD & Accreditation Costs", "6520", "Expense", "Operating Expenses",
             "Continuous professional development and accreditation", "IAS 1"),
        ],
        "Architecture": [
            ("Architectural Design Fees", "4015", "Income", "Service Revenue",
             "Concept, schematic and detailed design services", "IFRS 15"),
            ("Site Inspection Fees", "4025", "Income", "Service Revenue",
             "On-site supervision/inspection revenue", "IFRS 15"),
            ("Planning & Submission Fees Recovery", "4035", "Income", "Other Income",
             "Recoveries for plan submissions and approvals", "IFRS 15"),
            ("Professional Indemnity Insurance", "6510", "Expense", "Operating Expenses",
             "Professional liability cover", "IAS 1"),
            ("CAD/BIM Software Subscription", "6530", "Expense", "Operating Expenses",
             "CAD/BIM software costs", "IAS 38"),
        ],
        "Legal Services": [
            ("Legal Advisory Fees", "4012", "Income", "Service Revenue",
             "Consultations and legal opinions", "IFRS 15"),
            ("Litigation Fees", "4022", "Income", "Service Revenue",
             "Court appearances and litigation work", "IFRS 15"),
            ("Retainer Income", "4032", "Income", "Service Revenue",
             "Monthly retainers for ongoing legal services", "IFRS 15"),
            ("Professional Indemnity Insurance", "6510", "Expense", "Operating Expenses",
             "Professional liability cover", "IAS 1"),
            ("Court Filing Fees", "6540", "Expense", "Operating Expenses",
             "Court filing and process server costs", "IAS 1"),
        ],
        "Engineering Consulting": [
            ("Engineering Consulting Fees", "4017", "Income", "Service Revenue",
             "Civil/mechanical/electrical consulting services", "IFRS 15"),
            ("Project Management Fees", "4027", "Income", "Service Revenue",
             "Engineering project and construction management", "IFRS 15"),
            ("Testing & Certification Income", "4037", "Income", "Service Revenue",
             "Testing, verification and certifications", "IFRS 15"),
            ("Professional Indemnity Insurance", "6510", "Expense", "Operating Expenses",
             "Professional liability cover", "IAS 1"),
            ("Specialist Software Tools", "6550", "Expense", "Operating Expenses",
             "FEA/CAD/SCADA software costs", "IAS 38"),
        ],
    },

    "Automotive Services": {
        "Auto Repair Workshop": [
            ("Workshop Labour Revenue", "4120", "Income", "Service Revenue",
             "Revenue from labour and diagnostics", "IFRS 15"),
            ("Service Bay Consumables", "6120", "Expense", "Cost of Sales",
             "Oils, lubricants and small workshop consumables", "IAS 2"),
        ],
        "Auto Electrical": [
            ("Auto Electrical Services Revenue", "4125", "Income", "Service Revenue",
             "Revenue from auto electrical work", "IFRS 15"),
            ("Specialist Electrical Parts", "6125", "Expense", "Cost of Sales",
             "Relays, alternators and electrical components", "IAS 2"),
        ],
        "Tyre & Fitment": [
            ("Tyre Sales & Fitment Revenue", "4130", "Income", "Sales Revenue",
             "Revenue from tyre sales and wheel services", "IFRS 15"),
            ("Wheel Weights & Valves", "6130", "Expense", "Cost of Sales",
             "Consumables used in wheel balancing and fitment", "IAS 2"),
        ],
        "Panel Beating": [
            ("Panel Repair Revenue", "4135", "Income", "Service Revenue",
             "Revenue from panel beating and body repair", "IFRS 15"),
            ("Body Filler & Paint Materials", "6135", "Expense", "Cost of Sales",
             "Filler, thinners and repair materials", "IAS 2"),
        ],
        "Spray Painting": [
            ("Spray Painting Revenue", "4140", "Income", "Service Revenue",
             "Revenue from spray painting jobs", "IFRS 15"),
            ("Paint & Clearcoat Materials", "6140", "Expense", "Cost of Sales",
             "Paint systems and related consumables", "IAS 2"),
        ],
    },

    "Construction": {
        "Residential Building Contractor": [
            ("Residential Contract Income", "4051", "Income", "Sales Revenue",
             "Home builds and renovations", "IFRS 15"),
            ("Retention Receivable", "1715", "Asset", "Current Assets",
             "Amounts due on completion", "IFRS 15"),
            ("Site Establishment", "6355", "Expense", "Operating Expenses",
             "Site setup and preliminaries", "IAS 1"),
        ],
        "Civil Engineering": [
            ("Civil Works Income", "4052", "Income", "Sales Revenue",
             "Infrastructure, roads, bridges", "IFRS 15"),
            ("Plant Hire Income", "4053", "Income", "Other Income",
             "Internal/external plant hire", "IFRS 15"),
            ("Environmental Compliance Costs", "6356", "Expense", "Operating Expenses",
             "Permits and environmental monitoring", "IAS 1"),
        ],
        "Electrical & Mechanical": [
            ("E&M Contract Income", "4054", "Income", "Sales Revenue",
             "Electrical/mechanical installations", "IFRS 15"),
            ("Commissioning Income", "4055", "Income", "Service Revenue",
             "Testing and commissioning fees", "IFRS 15"),
            ("Specialist Tools & Calibration", "6357", "Expense", "Operating Expenses",
             "Meters and calibration costs", "IAS 1"),
        ],
    },

    "Security Services": {
        "Guarding": [
            ("Guarding Contract Revenue", "4150", "Income", "Service Revenue",
             "Revenue from manned guarding contracts", "IFRS 15"),
            ("Guard Training Costs", "6370", "Expense", "Operating Expenses",
             "Training, firearm competency and refresher courses", "IAS 1"),
        ],
        "Alarm Monitoring": [
            ("Monitoring & Response Revenue", "4155", "Income", "Service Revenue",
             "Revenue from alarm monitoring and armed response", "IFRS 15"),
            ("Alarm Communication Costs", "6375", "Expense", "Operating Expenses",
             "GSM, radio and IP communication costs", "IAS 1"),
        ],
        "Technical Security Systems": [
            ("System Installation Revenue", "4160", "Income", "Sales Revenue",
             "Revenue from installation of CCTV and access control", "IFRS 15"),
            ("Maintenance Contract Revenue", "4165", "Income", "Service Revenue",
             "Revenue from maintenance contracts on installed systems", "IFRS 15"),
            ("Installation Materials & Cabling", "6380", "Expense", "Cost of Sales",
             "Cables, brackets and installation consumables", "IAS 2"),
        ],
    },

    # =========================
    # LOGISTICS & TRANSPORT (private/logistics operators)
    # =========================
    "Logistics & Transport": {
        # With spaces (matches UI)
        "Courier / Last Mile": [
            ("Courier Revenue", "4091", "Income", "Service Revenue",
             "Parcel and last-mile delivery services", "IFRS 15"),
            ("Fuel Surcharges", "4092", "Income", "Other Income",
             "Surcharges billed to clients for fuel price movements", "IFRS 15"),
        ],
        "Freight / Logistics": [
            ("Freight Forwarding Income", "4093", "Income", "Service Revenue",
             "Income from bulk and long-haul freight services", "IFRS 15"),
            ("Warehouse Handling Income", "4094", "Income", "Other Income",
             "Handling, storage and cross-dock income", "IFRS 15"),
        ],
        "Public Transport": [
            ("Passenger Fare Revenue", "4095", "Income", "Service Revenue",
             "Revenue from scheduled transport services", "IFRS 15"),
            ("Subsidy Income - Public Transport", "4096", "Income", "Grant Income",
             "Government or municipal transport subsidies", "IFRS 15"),
        ],
        "Fleet Services": [
            ("Fleet Management Fees", "4097", "Income", "Service Revenue",
             "Revenue from managing third-party fleets", "IFRS 15"),
            ("Telematics Subscription Revenue", "4098", "Income", "Service Revenue",
             "Revenue from tracking and telematics services", "IFRS 15"),
        ],

        # Backward-compatible keys (no spaces)
        "Courier/Last Mile": [
            ("Courier Revenue", "4091", "Income", "Service Revenue",
             "Parcel and last-mile delivery services", "IFRS 15"),
            ("Fuel Surcharges", "4092", "Income", "Other Income",
             "Surcharges billed to clients for fuel price movements", "IFRS 15"),
        ],
        "Freight/Logistics": [
            ("Freight Forwarding Income", "4093", "Income", "Service Revenue",
             "Income from bulk and long-haul freight services", "IFRS 15"),
            ("Warehouse Handling Income", "4094", "Income", "Other Income",
             "Handling, storage and cross-dock income", "IFRS 15"),
        ],
    },

    # =========================
    # TRANSPORT (private transport-only industry)
    # =========================
    "Transport": {
        # Make these match your UI list under "Transport"
        "Courier / Last Mile": [
            ("Courier Revenue", "4091", "Income", "Service Revenue",
             "Parcel and last-mile delivery services", "IFRS 15"),
            ("Fuel Surcharges", "4092", "Income", "Other Income",
             "Surcharges billed to clients for fuel price movements", "IFRS 15"),
        ],
        "Freight / Logistics": [
            ("Freight Forwarding Income", "4093", "Income", "Service Revenue",
             "Income from bulk and long-haul freight services", "IFRS 15"),
            ("Warehouse Handling Income", "4094", "Income", "Other Income",
             "Handling, storage and cross-dock income", "IFRS 15"),
        ],
        "Public Transport": [
            ("Passenger Fare Revenue", "4095", "Income", "Service Revenue",
             "Revenue from passenger transport services", "IFRS 15"),
        ],

        # Backward compatible
        "Courier/Last Mile": [
            ("Courier Revenue", "4091", "Income", "Service Revenue",
             "Parcel/last-mile delivery", "IFRS 15"),
            ("Fuel Surcharges", "4092", "Income", "Other Income",
             "Surcharges billed to clients", "IFRS 15"),
        ],
        "Freight/Logistics": [
            ("Freight Forwarding Income", "4093", "Income", "Service Revenue",
             "Freight forwarding and logistics", "IFRS 15"),
            ("Warehouse Handling Income", "4094", "Income", "Other Income",
             "Handling and warehouse services", "IFRS 15"),
        ],
    },

    # =========================
    # NPO TRANSPORT (municipal/state/public service)
    # =========================
    "NPO Transport": {
        "Public Transport": [
            ("Fare Revenue - Public Transport", "4075", "Income", "Service Revenue",
             "Passenger fares for public/municipal transport services", "IFRS NPO"),
            ("Government Subsidy - Transport", "4076", "Income", "Grant Income",
             "Operating subsidies from government/municipality", "IFRS NPO"),
            ("Concession Tickets / Passes", "4077", "Income", "Service Revenue",
             "Discounted passes and concession ticket income", "IFRS NPO"),

            ("Fuel & Lubricants - Fleet", "6315", "Expense", "Program Expenses",
             "Fuel and lubricants used to deliver transport services", "IAS 1"),
            ("Vehicle Maintenance - Fleet", "6316", "Expense", "Program Expenses",
             "Repairs, tyres, servicing and fleet upkeep", "IAS 16"),
            ("Driver Wages - Fleet", "6317", "Expense", "Program Expenses",
             "Drivers/crew directly delivering the service", "IAS 19"),
        ],
        "Fleet Services": [
            ("Service Revenue - Fleet Operations", "4080", "Income", "Service Revenue",
             "Income from operating or managing a public fleet", "IFRS NPO"),
            ("Workshop & Maintenance Recoveries", "4081", "Income", "Other Income",
             "Recoveries and maintenance-related income", "IFRS NPO"),

            ("Fleet Insurance", "6515", "Expense", "Program Expenses",
             "Insurance for service delivery fleet", "IAS 1"),
            ("Fleet Licenses & Permits", "6516", "Expense", "Program Expenses",
             "Licenses, permits, compliance costs", "IAS 1"),
        ],
    },

    "Hospitality": {
        "Hotel": [
            ("Room Revenue", "4000", "Income", "Sales Revenue",
             "Guestroom rentals", "IFRS 15"),
            ("Minibar/Ancillary Sales", "4121", "Income", "Sales Revenue",
             "Minibar and ancillary items", "IFRS 15"),
            ("OTA Commission Expense", "6361", "Expense", "Operating Expenses",
             "Commissions to booking platforms", "IAS 1"),
        ],
        "Events & Catering": [
            ("Event Revenue", "4200", "Income", "Service Revenue",
             "Venue hire and catering fees", "IFRS 15"),
            ("Function Deposits (Deferred)", "2705", "Liability", "Current Liabilities",
             "Deposits for future events", "IFRS 15"),
            ("Catering Consumables", "6362", "Expense", "Cost of Sales",
             "Disposable items and consumables", "IAS 2"),
        ],
    },

    "NPO Education": {
        "Primary Education": [
            ("School Fees - Primary", "4061", "Income", "Service Revenue",
             "Learner fees and charges", "IFRS NPO"),
            ("Learning Materials - Primary", "6211", "Expense", "Program Expenses",
             "Books and classroom resources", "IAS 2"),
        ],
        "Higher Education": [
            ("Tuition - Higher Ed", "4062", "Income", "Service Revenue",
             "Tertiary tuition and fees", "IFRS NPO"),
            ("Research Grant Income", "4063", "Income", "Grant Income",
             "Grants for research projects", "IFRS NPO"),
        ],
    },

    "NPO Healthcare": {
        "Clinic": [
            ("Patient Fees - Clinic", "4071", "Income", "Service Revenue",
             "Consultations and treatments", "IFRS NPO"),
            ("Essential Medicines", "6300", "Expense", "Program Expenses",
             "Medicines used in care", "IAS 2"),
        ],
        "Hospital": [
            ("Theatre Income", "4072", "Income", "Service Revenue",
             "Surgical procedures", "IFRS NPO"),
            ("ICU Services", "4073", "Income", "Service Revenue",
             "Critical care services", "IFRS NPO"),
        ],
    },

    "Retail & Wholesale": {
        "Wholesale": [
            ("Wholesale Sales", "4081", "Income", "Sales Revenue",
             "Bulk sales to retailers", "IFRS 15"),
            ("Freight Recovered", "4082", "Income", "Other Income",
             "Shipping recharges to customers", "IFRS 15"),
            ("Volume Rebates", "6368", "Expense", "Operating Expenses",
             "Customer rebates and discounts", "IAS 1"),
        ],
        "E-commerce Retail": [
            ("Online Sales", "4083", "Income", "Sales Revenue",
             "Direct-to-consumer online sales", "IFRS 15"),
            ("Marketplace Fees", "6369", "Expense", "Operating Expenses",
             "Fees charged by marketplaces", "IAS 1"),
        ],
    },

    "Mining": {
        "Open-Pit Mining": [
            ("Waste Stripping Costs - Open Pit", "6130", "Expense", "Cost of Sales",
             "Current period waste-stripping activity in open pits", "IFRIC 20"),
            ("Haul Road Maintenance", "6345", "Expense", "Operating Expenses",
             "Construction and maintenance of haul roads", "IAS 16"),
            ("Slope Monitoring & Geotechnical Costs", "6350", "Expense", "Operating Expenses",
             "Monitoring of pit walls and geotechnical studies", "IAS 1"),
        ],
        "Underground Mining": [
            ("Decline & Shaft Development Costs", "6140", "Expense", "Cost of Sales",
             "Development of declines, shafts and access ways", "IAS 16"),
            ("Ventilation & Cooling Costs", "6355", "Expense", "Operating Expenses",
             "Ventilation, refrigeration and air quality systems", "IAS 1"),
            ("Ground Support & Rock Engineering", "6360", "Expense", "Operating Expenses",
             "Support, bolting and ground control", "IAS 1"),
        ],
        "Quarrying & Aggregates": [
            ("Aggregate Sales Revenue", "4050", "Income", "Sales Revenue",
             "Sale of stone, sand and aggregate products", "IFRS 15"),
            ("Crusher Wear Parts & Liners", "6150", "Expense", "Cost of Sales",
             "Crusher liners, screens and wear parts", "IAS 2"),
            ("Rehabilitation - Quarry Faces & Pits", "2815", "Liability", "Provisions",
             "Provision for progressive rehabilitation of quarry faces", "IAS 37"),
        ],
        "Coal Mining": [
            ("Coal Sales Revenue", "4060", "Income", "Sales Revenue",
             "Sale of raw and washed coal products", "IFRS 15"),
            ("Washed Coal Inventory", "1526", "Asset", "Inventories",
             "Washed coal held for sale", "IAS 2"),
            ("Emission Levies & Carbon Taxes", "6365", "Expense", "Operating Expenses",
             "Levies and environmental/carbon taxes", None),
        ],
        "Gold & PGM Mining": [
            ("Gold & PGM Sales Revenue", "4070", "Income", "Sales Revenue",
             "Revenue from gold and platinum group metals", "IFRS 15"),
            ("Refining & Smelting Charges", "6155", "Expense", "Cost of Sales",
             "Refinery and smelter treatment charges", "IAS 2"),
            ("Hedging Gains/Losses - Precious Metals", "4310", "Income", "Other Income",
             "Net gains or losses on precious metal hedging", "IFRS 9"),
        ],
    },

    "Banking & Financial Services": {
        "Retail Banking": [
            ("Account Maintenance Fees", "4110", "Income", "Service Revenue",
             "Monthly account and service fees", "IFRS 15"),
            ("ATM Network Costs", "6230", "Expense", "Operating Expenses",
             "Running and maintaining ATM network", "IAS 1"),
        ],
        "Corporate & Investment Banking": [
            ("Advisory & Deal Fees", "4120", "Income", "Service Revenue",
             "M&A, capital raising and advisory fees", "IFRS 15"),
            ("Custody & Asset Management Fees", "4130", "Income", "Service Revenue",
             "Portfolio and custody services", "IFRS 15"),
        ],
    },

    "Telecommunications": {
        "Mobile Network Operator": [
            ("Prepaid Airtime Revenue", "4050", "Income", "Sales Revenue",
             "Revenue from prepaid airtime sales", "IFRS 15"),
            ("Postpaid Contract Revenue", "4055", "Income", "Sales Revenue",
             "Revenue from postpaid subscriber contracts", "IFRS 15"),
            ("SIM & Starter Pack Costs", "6160", "Expense", "Cost of Sales",
             "Cost of SIM cards and starter packs", "IAS 2"),
        ],
        "Internet Service Provider": [
            ("Fixed Broadband Revenue", "4065", "Income", "Sales Revenue",
             "Income from fixed-line broadband services", "IFRS 15"),
            ("Content Delivery & Peering Costs", "6170", "Expense", "Operating Expenses",
             "Costs of peering, transit and CDN", "IAS 1"),
        ],
        "Pay TV Operator": [
            ("Subscription Revenue", "4075", "Income", "Sales Revenue",
             "Revenue from pay TV subscriptions", "IFRS 15"),
            ("Content Licensing Fees", "6180", "Expense", "Operating Expenses",
             "Fees paid for content licensing", "IAS 1"),
        ],
    },
    "Sports & Social Clubs": {
        "Sports Club": [
        # ===== MEMBERSHIP & CLUB OPERATING INCOME =====
        ("Membership Subscriptions", "4010", "Income", "Membership Income",
         "Annual or monthly membership fees", "IFRS 15"),
        ("Joining Fees", "4011", "Income", "Membership Income",
         "Entrance or joining fees from new members", "IFRS 15"),
        ("Match & Participation Fees", "4012", "Income", "Activity Income",
         "Fees charged for matches, tournaments or competitions", "IFRS 15"),
        ("Facility Hire Income", "4013", "Income", "Other Operating Income",
         "Income earned from renting pitches, courts or clubhouse", "IFRS 15"),
        ("Sponsorship Income", "4014", "Income", "Sponsorships & Donations",
         "Corporate sponsorships, signage and brand rights", "IAS 20"),
        ("Donations & Grants", "4015", "Income", "Sponsorships & Donations",
         "Voluntary donations, grants, funding and contributions", "IAS 20"),
        ("Fundraising Event Income", "4016", "Income", "Fundraising Income",
         "Event ticket sales and fundraising campaigns", "IFRS 15"),

        # ===== BAR & CATERING REVENUE =====
        ("Bar Sales", "4020", "Income", "Trading Income",
         "Sales from beverages, snacks and concessions", "IFRS 15"),
        ("Catering Income", "4021", "Income", "Trading Income",
         "Event or catering related income", "IFRS 15"),
        ("Merchandise Sales", "4022", "Income", "Trading Income",
         "Sales of club merchandise, shirts, kits, etc.", "IFRS 15"),

        # ===== CLUB-SPECIFIC COGS =====
        ("Cost of Bar Sales", "5010", "Expense", "Cost of Sales",
         "Cost of beverages and snacks sold", "IAS 2"),
        ("Cost of Catering & Events", "5011", "Expense", "Cost of Sales",
         "Food supplies and catering COGS", "IAS 2"),
        ("Cost of Merchandise Sold", "5012", "Expense", "Cost of Sales",
         "Club merchandise cost of sales", "IAS 2"),

        # ===== PROGRAM / SPORTS EXPENSES =====
        ("Grounds & Pitch Maintenance", "6105", "Expense", "Programme Expenses",
         "Sports facility upkeep, grass management, irrigation, etc.", "IAS 1"),
        ("Coaching & Training Costs", "6106", "Expense", "Programme Expenses",
         "Coaches, clinics, academy training and program costs", "IAS 1"),
        ("League & Affiliation Fees", "6107", "Expense", "Programme Expenses",
         "League registration, governing body affiliation fees", "IAS 1"),
        ("Match & Competition Costs", "6108", "Expense", "Programme Expenses",
         "Referees, match day expenses, kits for competitions", "IAS 1"),
        ("Sports Equipment - Consumables", "6109", "Expense", "Programme Expenses",
         "Balls, nets, bibs, cones, low-value items expensed", "IAS 1"),

        # ===== CLUBHOUSE EXPENSES =====
        ("Clubhouse Repairs & Maintenance", "6115", "Expense", "Operating Expenses",
         "Repairs to buildings, clubhouse and public spaces", "IAS 16"),
        ("Bar Supplies (Non-COGS)", "6116", "Expense", "Operating Expenses",
         "Consumables for bar operations not classified as inventory", "IAS 1"),

        # ===== ADMIN / EVENT / GENERAL =====
        ("Fundraising Event Expenses", "6120", "Expense", "Fundraising Expenses",
         "Venue hire, printing, ticketing and marketing for events", "IAS 1"),
        ("Marketing & Promotion", "6121", "Expense", "Operating Expenses",
         "Club marketing, social media, signage and campaigns", "IAS 1"),
        ("Volunteer Appreciation Costs", "6122", "Expense", "Operating Expenses",
         "Volunteer socials, thank-you events and engagements", "IAS 1"),
    ],

    # ──────────────────────────────
    # κοινων / community style club
    # ──────────────────────────────
    "Social Club": [
        ("Membership Subscriptions", "4010", "Income", "Membership Income",
         "Member annual or monthly dues", "IFRS 15"),
        ("Social Event Income", "4025", "Income", "Other Operating Income",
         "Ticket sales for social events and gatherings", "IFRS 15"),
        ("Venue Hire Income", "4026", "Income", "Other Operating Income",
         "Income from hiring the clubhouse / venue", "IFRS 15"),
        ("Sundry Donations", "4027", "Income", "Sponsorships & Donations",
         "General donations from members or public", "IAS 20"),

        ("Catering Income", "4021", "Income", "Trading Income",
         "Income from food services during events", "IFRS 15"),

        ("Catering Supplies (COGS)", "5015", "Expense", "Cost of Sales",
         "Food and beverage supplies for events", "IAS 2"),
        ("Event Marketing", "6125", "Expense", "Operating Expenses",
         "Advertising and flyers for social events", "IAS 1"),
        ("Member Engagement Costs", "6126", "Expense", "Operating Expenses",
         "Functions, socials and member engagement expenses", "IAS 1"),
    ],

    # ──────────────────────────────
    # more formal recreation association
    # ──────────────────────────────
    "Recreational Association": [
        ("Membership Subscriptions", "4010", "Income", "Membership Income",
         "Annual dues and activity fees", "IFRS 15"),
        ("Facility Rental Income", "4013", "Income", "Other Operating Income",
         "Grounds, courts or hall rental income", "IFRS 15"),
        ("Fundraising Income", "4016", "Income", "Fundraising Income",
         "Event-based fundraising campaigns", "IFRS 15"),

        ("Event Catering Income", "4029", "Income", "Trading Income",
         "Catering or food stall income", "IFRS 15"),

        ("Catering COGS", "5030", "Expense", "Cost of Sales",
         "Consumables used for catering income", "IAS 2"),
        ("Grounds Maintenance", "6105", "Expense", "Programme Expenses",
         "Facility & grounds repair and upkeep", "IAS 1"),
        ("Recreational Program Costs", "6110", "Expense", "Programme Expenses",
         "Programs, classes, activities, instructors", "IAS 1"),
    ],

    "Professional Association": [
        # ───────────────────────────────────────────
        # MEMBERSHIP & PROGRAM INCOME
        # ───────────────────────────────────────────
        ("Membership Subscriptions", "4500", "Income", "Membership Income",
         "Annual or monthly professional membership fees", "IFRS 15"),
        ("Accreditation & Certification Fees", "4510", "Income", "Membership Income",
         "Income from member examinations, accreditation, or certifications", "IFRS 15"),
        ("Continuing Professional Development (CPD) Fees", "4520", "Income", "Membership Income",
         "Income from CPD workshops, professional training, and seminars", "IFRS 15"),
        ("Conference & Convention Fees", "4530", "Income", "Event Income",
         "Registration fees for professional conferences and conventions", "IFRS 15"),
        ("Journal & Publication Subscriptions", "4540", "Income", "Publication Income",
         "Income from academic journals, magazines, or industry publications", "IFRS 15"),
        ("Standards & Technical Documents Sales", "4550", "Income", "Publication Income",
         "Income from technical documents, guidelines, standards, manuals", "IFRS 15"),

        # ───────────────────────────────────────────
        # SPONSORSHIPS, GRANTS & OTHER INCOME
        # ───────────────────────────────────────────
        ("Corporate Sponsorships", "4700", "Income", "Sponsorships & Grants",
         "Sponsorship income from corporations or professional suppliers", "IAS 20"),
        ("Government or Institutional Grants", "4710", "Income", "Sponsorships & Grants",
         "Restricted or unrestricted grants from state or academic institutions", "IAS 20"),
        ("Donations from Members & Supporters", "4720", "Income", "Donation & Fundraising Income",
         "Voluntary contributions supporting professional initiatives", "IAS 20"),
        ("Advertising & Vendor Booth Income", "4730", "Income", "Event Trading Income",
         "Income from expo booths, adverts in journals or websites", "IFRS 15"),

        # ───────────────────────────────────────────
        # COST OF PROGRAMS / PUBLICATIONS
        # (if program costs must be separated from normal OPEX)
        # ───────────────────────────────────────────
        ("Cost of Publications", "5200", "Expense", "Cost of Programs",
         "Printing, editing and layout costs for journals, standards, magazines", "IAS 2"),
        ("Cost of Conferences", "5210", "Expense", "Cost of Programs",
         "Venue hire, technology, catering, and logistics for conventions", "IAS 2"),

        # ───────────────────────────────────────────
        # OPERATING / MEMBER SERVICES
        # (professional association–specific expenses)
        # ───────────────────────────────────────────
        ("Member Services & Support", "6200", "Expense", "Programme Expenses",
         "Member communication, services, benefits, and helpdesk", "IAS 1"),
        ("Accreditation & Examination Costs", "6210", "Expense", "Programme Expenses",
         "Accreditation panels, examiners, markers, and assessment tools", "IAS 1"),
        ("Standards Development & Technical Committees", "6220", "Expense", "Programme Expenses",
         "Committee costs for standards development and professional regulation", "IAS 1"),
        ("Policy, Advocacy & Lobbying", "6230", "Expense", "Programme Expenses",
         "Advocacy work, lobbying, public policy and professional representation", "IAS 1"),
        ("Scholarships, Awards & Research Grants", "6240", "Expense", "Programme Expenses",
         "Scholarships, bursaries, and grants for academic or professional research", "IAS 20"),
        ("Professional Conferences & Outreach", "6250", "Expense", "Programme Expenses",
         "Costs of promotional events, outreach, workshops, awareness activities", "IAS 1"),

        # ───────────────────────────────────────────
        # PUBLICATION & CONTENT EXPENSES
        # ───────────────────────────────────────────
        ("Editorial & Peer Review Costs", "6260", "Expense", "Programme Expenses",
         "Editorial, review board and peer review programme costs", "IAS 1"),
        ("Digital Platform & Publishing Software", "6270", "Expense", "Operating Expenses",
         "Software, CMS, website, journal platforms and licensing", "IAS 38"),
        ],
    },
      
    "Information Technology": {

        # =========================
        # Software Development
        # =========================
        "Software Development": [
            ("Software Subscription Revenue", "4001", "Income", "Service Revenue",
             "Recurring SaaS subscriptions and maintenance contracts", "IFRS 15"),
            ("Custom Development Revenue", "4002", "Income", "Service Revenue",
             "Custom software builds, milestones, and project delivery", "IFRS 15"),
            ("Cloud Hosting Costs", "6201", "Expense", "Operating Expenses",
             "Cloud compute/storage costs directly supporting delivery", "IAS 1"),
            ("Software Tools & Licenses", "6202", "Expense", "Operating Expenses",
             "Developer tools subscriptions and software licenses expensed", "IAS 38"),
            ("Capitalised Development Costs", "1801", "Asset", "Intangible Assets",
             "Capitalised development costs when recognition criteria are met", "IAS 38"),
            ("Amortization - Capitalised Development", "7111", "Expense", "Depreciation & Amortization",
             "Amortization of capitalised development costs", "IAS 38"),
        ],
        "SoftwareDevelopment": [  # backward-compatible key
            ("Software Subscription Revenue", "4001", "Income", "Service Revenue",
             "Recurring SaaS subscriptions and maintenance contracts", "IFRS 15"),
            ("Custom Development Revenue", "4002", "Income", "Service Revenue",
             "Custom software builds, milestones, and project delivery", "IFRS 15"),
            ("Cloud Hosting Costs", "6201", "Expense", "Operating Expenses",
             "Cloud compute/storage costs directly supporting delivery", "IAS 1"),
            ("Software Tools & Licenses", "6202", "Expense", "Operating Expenses",
             "Developer tools subscriptions and software licenses expensed", "IAS 38"),
            ("Capitalised Development Costs", "1801", "Asset", "Intangible Assets",
             "Capitalised development costs when recognition criteria are met", "IAS 38"),
            ("Amortization - Capitalised Development", "7111", "Expense", "Depreciation & Amortization",
             "Amortization of capitalised development costs", "IAS 38"),
        ],

        # =========================
        # Managed IT Services
        # =========================
        "Managed IT Services": [
            ("Managed Services Revenue", "4010", "Income", "Service Revenue",
             "Monthly managed services and support retainers", "IFRS 15"),
            ("Service Desk Revenue", "4011", "Income", "Service Revenue",
             "Helpdesk / support ticket revenue and SLA-based billing", "IFRS 15"),
            ("Vendor Pass-Through Income", "4012", "Income", "Other Income",
             "Markups or handling fees on third-party vendor services", "IFRS 15"),
            ("Subcontractor - IT Support", "6101", "Expense", "Cost of Sales",
             "Outsourced engineers or support staff directly delivering services", "IAS 1"),
            ("Software Subscriptions Payable", "2205", "Liability", "Current Liabilities",
             "Subscription/vendor amounts owed for software services", "IAS 1"),
            ("Deferred Revenue - Support Contracts", "2701", "Liability", "Current Liabilities",
             "Advance billings for support contracts not yet delivered", "IFRS 15"),
        ],
        "ManagedITServices": [
            ("Managed Services Revenue", "4010", "Income", "Service Revenue",
             "Monthly managed services and support retainers", "IFRS 15"),
            ("Service Desk Revenue", "4011", "Income", "Service Revenue",
             "Helpdesk / support ticket revenue and SLA-based billing", "IFRS 15"),
            ("Vendor Pass-Through Income", "4012", "Income", "Other Income",
             "Markups or handling fees on third-party vendor services", "IFRS 15"),
            ("Subcontractor - IT Support", "6101", "Expense", "Cost of Sales",
             "Outsourced engineers or support staff directly delivering services", "IAS 1"),
            ("Software Subscriptions Payable", "2205", "Liability", "Current Liabilities",
             "Subscription/vendor amounts owed for software services", "IAS 1"),
            ("Deferred Revenue - Support Contracts", "2701", "Liability", "Current Liabilities",
             "Advance billings for support contracts not yet delivered", "IFRS 15"),
        ],

        # =========================
        # Networking & Infrastructure
        # =========================
        "Networking & Infrastructure": [
            ("Network Installation Revenue", "4020", "Income", "Service Revenue",
             "Installation, configuration, and infrastructure deployment services", "IFRS 15"),
            ("Hardware Resale Revenue", "4021", "Income", "Sales Revenue",
             "Routers, switches, devices resold to customers", "IFRS 15"),
            ("Hardware Purchases", "6001", "Expense", "Cost of Sales",
             "Cost of networking equipment sold or deployed to customers", "IAS 2"),
            ("Project Subcontractors - Installations", "6102", "Expense", "Cost of Sales",
             "External installers or technicians for infrastructure projects", "IAS 1"),
            ("Inventory - Networking Hardware", "1503", "Asset", "Current Assets",
             "Networking devices held for resale or deployment", "IAS 2"),
            ("Warranties Provision - Hardware", "2501", "Liability", "Non-Current Liabilities",
             "Provision for warranty obligations on supplied equipment", "IAS 37"),
        ],
        "NetworkingInfrastructure": [
            ("Network Installation Revenue", "4020", "Income", "Service Revenue",
             "Installation, configuration, and infrastructure deployment services", "IFRS 15"),
            ("Hardware Resale Revenue", "4021", "Income", "Sales Revenue",
             "Routers, switches, devices resold to customers", "IFRS 15"),
            ("Hardware Purchases", "6001", "Expense", "Cost of Sales",
             "Cost of networking equipment sold or deployed to customers", "IAS 2"),
            ("Project Subcontractors - Installations", "6102", "Expense", "Cost of Sales",
             "External installers or technicians for infrastructure projects", "IAS 1"),
            ("Inventory - Networking Hardware", "1503", "Asset", "Current Assets",
             "Networking devices held for resale or deployment", "IAS 2"),
            ("Warranties Provision - Hardware", "2501", "Liability", "Non-Current Liabilities",
             "Provision for warranty obligations on supplied equipment", "IAS 37"),
        ],

        # =========================
        # Cybersecurity
        # =========================
        "Cybersecurity": [
            ("Security Monitoring Revenue", "4030", "Income", "Service Revenue",
             "SOC monitoring, MDR, and managed security services", "IFRS 15"),
            ("Penetration Testing Revenue", "4031", "Income", "Service Revenue",
             "Pen tests, audits, and security assessments", "IFRS 15"),
            ("Security Software Revenue", "4032", "Income", "Sales Revenue",
             "Resale or licensing of security software products", "IFRS 15"),
            ("Security Tools & Subscriptions", "6203", "Expense", "Operating Expenses",
             "Security tooling subscriptions used in delivery", "IAS 1"),
            ("Incident Response Costs", "6103", "Expense", "Cost of Sales",
             "Direct costs incurred during security incident response delivery", "IAS 1"),
            ("Professional Indemnity Insurance", "6511", "Expense", "Operating Expenses",
             "Cyber / PI cover for client-facing security engagements", "IAS 1"),
        ],
    }
 }


# ==============================================================
#                 INDUSTRY PROFILES / BUSINESS RULES
# ==============================================================

# Simple profile flags per industry.
# These drive apply_business_rules(...) on the final merged COA:
#   - is_service_only: strip generic COGS + Inventories
#   - uses_inventory:  if False, strip all Inventories
#   - uses_cogs:       if False, strip all Expense/Cost of Sales rows
def apply_business_rules(
    industry: str,
    subindustry: Optional[str],
    rows: ListAccountRow,
) -> ListAccountRow:
    """
    Apply high-level industry rules on the *final* merged COA.
    Example: strip Cost of Sales for pure service firms, remove Inventories
    where not used, etc.
    """
    profile = get_industry_profile(industry, subindustry)

    uses_inventory = profile["uses_inventory"]
    uses_cogs      = profile["uses_cogs"]
    is_service_only = profile["is_service_only"]

    filtered: ListAccountRow = []

    for name, code, category, reporting_group, description, ifrs_tag in rows:
        # 1) Service-only: no classic Cost of Sales and no Inventories
        if is_service_only:
            if category == "Expense" and reporting_group == "Cost of Sales":
                continue
            if category == "Asset" and reporting_group == "Inventories":
                continue

        # 2) Explicit no-inventory flag
        if not uses_inventory and reporting_group == "Inventories":
            continue

        # 3) Explicit no-COGS flag
        if not uses_cogs and category == "Expense" and reporting_group == "Cost of Sales":
            continue

        filtered.append((name, code, category, reporting_group, description, ifrs_tag))

    return filtered


# ==============================================================
# HELPERS (AFTER build_coa)
# ==============================================================

from typing import Dict, Any

def _code_sort_key(code: Any):
    s = str(code or "").strip()

    # 1) Pure numeric codes first (template-style)
    try:
        return (0, int(s), s)
    except ValueError:
        pass

    # 2) Reporting codes like BS_CA_1700 / PL_REV_4000
    #    Sort by numeric suffix if present
    parts = s.split("_")
    if parts:
        try:
            return (1, int(parts[-1]), s)
        except ValueError:
            pass

    # 3) Fallback: stable string sort
    return (2, 10**9, s)


def _rows_to_tree(rows: ListAccountRow) -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
    tree: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}

    for name, code, category, reporting_group, description, ifrs_tag in rows:
        cat = tree.setdefault(category, {})
        grp = cat.setdefault(reporting_group, [])
        grp.append({
            "code": code,
            "name": name,
            "section": category,
            "category": reporting_group,
            "description": description,
            "standard": ifrs_tag,
            "posting": True,
        })

    for cat in tree.values():
        for grp_list in cat.values():
            grp_list.sort(key=lambda x: _code_sort_key(x.get("code")))

    return tree


# Convert a single tuple row into a dict
def _row_to_dict(r):
    if isinstance(r, dict):
        return r

    if isinstance(r, tuple):
        # safe getter
        def g(i, default=None):
            return r[i] if len(r) > i else default

        return {
            "template_code": g(0),
            "name": g(1),
            "code": g(2),
            "section": g(3),
            "category": g(4),
            "subcategory": g(5),
            "description": g(6),
            "standard": g(7),
            "industry": g(8),
            "sub_industry": g(9),
            "is_general": g(10),
            "posting": g(11),
        }

    raise TypeError(f"Unexpected row type: {type(r)}")

def build_coa_flat(industry: str, subindustry: Optional[str] = None) -> List[Dict[str, Any]]:
    rows = build_coa(industry, subindustry)
    return [_row_to_dict(r) for r in rows]
def build_coa_tree(industry: str, subindustry: Optional[str] = None) -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
    rows = build_coa(industry, subindustry)
    return _rows_to_tree(rows)

INDUSTRY_CATALOG: Dict[str, List[str]] = {
    **{k: [] for k in INDUSTRY_TEMPLATES.keys()},
    **{k: sorted(v.keys()) for k, v in SUBINDUSTRY_TEMPLATES.items()},
}


# ==============================================================
#                         HELPERS / API
# ==============================================================

def list_industries() -> List[str]:
    return sorted(INDUSTRY_TEMPLATES.keys())

def list_subindustries(industry: str) -> List[str]:
    return INDUSTRY_CATALOG.get(industry, [])

def get_industry_catalog() -> Dict[str, List[str]]:
    return {i: list_subindustries(i) for i in list_industries()}

def _choose_template(industry: str, subindustry: Optional[str]) -> ListAccountRow:
    """
    Selection logic:
      - If subindustry is provided and exists, return subindustry rows.
      - Else return the base industry rows.
    """
    if subindustry:
        sub_map = SUBINDUSTRY_TEMPLATES.get(industry, {})
        rows = sub_map.get(subindustry)
        if rows:
            return rows
    return INDUSTRY_TEMPLATES.get(industry, [])

def build_coa(industry: str, subindustry: Optional[str] = None) -> ListAccountRow:
    """
    PURE function:

      FINAL COA = GENERAL + INDUSTRY + SUBINDUSTRY (if provided)

    Priority on code collisions:
      1) Subindustry rows override industry + general.
      2) Industry rows override general.
      3) Collided GENERAL rows are not lost – they are re-numbered
         starting at DISPLACED_CODE_BASE (9000, 9001, ...).

    This fixes the old behaviour where we did:
        GENERAL + (industry OR subindustry)
    and ensures we now get:
        GENERAL + industry + subindustry
    for cases like Professional Services / Auditing & Accounting.
    """

    # 1) Fetch raw templates
    industry_rows = INDUSTRY_TEMPLATES.get(industry, [])
    sub_rows: ListAccountRow = []
    if subindustry:
        sub_rows = SUBINDUSTRY_TEMPLATES.get(industry, {}).get(subindustry, [])

    # If nothing is defined at all, bail out
    if not industry_rows and not sub_rows:
        return []

    coa_map: Dict[str, AccountRow] = {}
    displaced: List[AccountRow] = []

    # 2) Load GENERAL first (lowest priority)
    for acc in GENERAL_ACCOUNTS_LIST:
        coa_map[acc[1]] = acc

    # Helper to overlay rows with optional displacement of GENERAL
    def overlay(rows: ListAccountRow):
        nonlocal coa_map, displaced
        for acc in rows:
            code = acc[1]
            if code in coa_map:
                existing = coa_map[code]
                # Only track displaced GENERAL rows for renumbering
                if existing in GENERAL_ACCOUNTS_LIST:
                    displaced.append(existing)
            coa_map[code] = acc

    # 3) Overlay INDUSTRY template (medium priority)
    overlay(industry_rows)

    # 4) Overlay SUBINDUSTRY template (highest priority)
    overlay(sub_rows)

    # 5) Re-number displaced GENERAL rows to 9000+ so they’re not lost
    next_code = DISPLACED_CODE_BASE
    for acc in displaced:
        new_row = list(acc)
        try:
            # If the original general code was already >= 9000, don't touch it
            if int(new_row[1]) >= DISPLACED_CODE_BASE:
                continue
        except ValueError:
            # Non-numeric codes just get moved into the gap at the end
            pass

        # Find the next free code starting at DISPLACED_CODE_BASE
        while str(next_code) in coa_map:
            next_code += 1

        new_row[1] = str(next_code)
        coa_map[new_row[1]] = tuple(new_row)  # type: ignore
        next_code += 1

    # 6) Return sorted by numeric code (with a safe fallback)
    def _key(r: AccountRow):
        try:
            return (int(r[1]), r[0])
        except ValueError:
            return (10**9, r[0])

    final_rows: ListAccountRow = sorted(coa_map.values(), key=_key)

    # --- DEBUG: inspect row shape for /api/coa/flat ---
    if final_rows:
        r0 = final_rows[0]
        print("DEBUG build_coa -> first row:", r0)
        print("DEBUG build_coa -> type:", type(r0))
        if isinstance(r0, tuple):
            print("DEBUG build_coa -> tuple len:", len(r0))
        elif isinstance(r0, dict):
            print("DEBUG build_coa -> dict keys:", list(r0.keys()))
    # --- end debug ---

    # 7) Apply high-level industry rules (strip irrelevant accounts)   
    final_rows = apply_business_rules(industry, subindustry, final_rows)

    # ✅ convert template tuples to dicts so /coa/flat can never IndexError
    final_rows = [
        _template_row_to_dict(r, industry, subindustry) if isinstance(r, tuple) else r
        for r in final_rows
    ]

    return final_rows

def canonical_subindustry_key(industry_template: str, sub_norm: Optional[str]) -> Optional[str]:
    """
    Return the canonical subindustry key for this industry_template, or None if not valid.
    Matches:
      - exact
      - case-insensitive
      - space-insensitive
      - SUB_INDUSTRY_ALIASES (optional)
    """
    if not sub_norm:
        return None

    sub_map: Dict[str, object] = SUBINDUSTRY_TEMPLATES.get(industry_template, {}) or {}
    if not sub_map:
        return None

    # 0) Alias map (normalize known variants first)
    s0 = SUB_INDUSTRY_ALIASES.get(sub_norm.lower(), sub_norm)
    s0 = SUB_INDUSTRY_ALIASES.get(s0.replace(" ", "").lower(), s0)

    # a) exact
    if s0 in sub_map:
        return s0

    # b) case-insensitive
    lower_lookup = {k.lower(): k for k in sub_map.keys()}
    hit = lower_lookup.get(s0.lower())
    if hit:
        return hit

    # c) space-insensitive (Software Development -> SoftwareDevelopment)
    compact_lookup = {k.replace(" ", "").lower(): k for k in sub_map.keys()}
    hit = compact_lookup.get(s0.replace(" ", "").lower())
    if hit:
        return hit

    return None

def _template_row_to_dict(r, industry, subindustry):
    # Adjust these indexes to match YOUR templates
    # Most likely: (name, code, section, category, subcategory, description?, posting?)
    name = r[0] if len(r) > 0 else None
    code = r[1] if len(r) > 1 else None
    section = r[2] if len(r) > 2 else None
    category = r[3] if len(r) > 3 else None
    subcategory = r[4] if len(r) > 4 else None
    description = r[5] if len(r) > 5 else None
    posting = r[6] if len(r) > 6 else True  # default True

    return {
        "template_code": None,
        "name": name,
        "code": code,
        "section": section,
        "category": category,
        "subcategory": subcategory,
        "description": description,
        "standard": None,
        "industry": industry,
        "sub_industry": subindustry,
        "is_general": False,   # you can set True for GENERAL rows if you want
        "posting": bool(posting),
    }

def get_industry_template(industry: str, subindustry: Optional[str] = None) -> ListAccountRow:
    # 1) normalize display names (UI)
    ind_norm, sub_norm, _, _ = normalize_industry_pair(industry, subindustry)

    # 2) map UI/display industry -> template industry key
    ind_key = (ind_norm or "").strip()
    ind_template = TEMPLATE_INDUSTRY_ALIASES.get(ind_key.lower(), ind_key)

    # 3) canonicalize subindustry key for this industry_template
    sub_key = canonical_subindustry_key(ind_template, sub_norm)

    # 4) choose template using TEMPLATE keys
    rows = _choose_template(ind_template, sub_key)
    return rows or []

def initialize_coa(db_service, company_id: int, industry: str, sub_industry: Optional[str] = None) -> int:
    ind_norm, sub_norm, ind_slug, sub_slug = normalize_industry_pair(industry, sub_industry)

    from BackEnd.Services.coa_seed_service import seed_company_coa_once

    res = seed_company_coa_once(
        db_service,
        company_id=company_id,
        industry=ind_slug or slugify(ind_norm) or slugify(industry),
        sub_industry=sub_slug,
        source="pool",
        # OPTIONAL: pass display names too if you want to store them somewhere
        # industry_display=ind_norm,
        # sub_industry_display=sub_norm,
    )
    return int(res.get("inserted") or 0)

