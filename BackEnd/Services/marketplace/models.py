"""
Data models and dataclasses for Marketplace Orders, Fees, and Remittances.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional


@dataclass
class MarketplaceAccount:
    id: int
    company_id: int
    code: str
    name: str
    currency: str = "ZAR"
    receivable_account_code: str = "BS_CA_9002"
    sales_revenue_account_code: str = "PL_REV_4000"
    sales_returns_account_code: Optional[str] = "PL_REV_ADJ_8000"
    commission_expense_account_code: Optional[str] = "PL_OPEX_6390"
    transport_expense_account_code: Optional[str] = "PL_OPEX_6795"
    other_expense_account_code: Optional[str] = "PL_OPEX_6390"
    vat_output_account_code: str = "BS_CL_2310"
    vat_input_account_code: str = "BS_CA_1410"
    cogs_account_code: Optional[str] = "PL_COS_5000"
    inventory_account_code: Optional[str] = "BS_CA_1500"
    settlement_bank_account_id: Optional[int] = None
    default_vat_rate: Decimal = Decimal("0.1500")
    is_active: bool = True
    settings: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class MarketplaceOrderLine:
    id: Optional[int] = None
    company_id: int = 0
    order_id: int = 0
    line_number: int = 1
    inventory_item_id: Optional[int] = None
    sku: Optional[str] = None
    product_description: str = ""
    quantity: Decimal = Decimal("1.0000")
    unit_price: Decimal = Decimal("0.0000")
    discount: Decimal = Decimal("0.0000")
    vat_rate: Decimal = Decimal("0.1500")
    vat_amount: Decimal = Decimal("0.00")
    net_amount: Decimal = Decimal("0.00")
    gross_amount: Decimal = Decimal("0.00")
    unit_cost: Decimal = Decimal("0.0000")
    total_cost: Decimal = Decimal("0.0000")
    inventory_tx_id: Optional[int] = None
    meta: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class MarketplaceOrder:
    id: Optional[int] = None
    company_id: int = 0
    marketplace_account_id: int = 0
    external_order_number: str = ""
    order_date: date = field(default_factory=date.today)
    fulfilment_date: Optional[date] = None
    currency: str = "ZAR"
    order_status: str = "imported"  # 'imported', 'draft', 'approved', 'posted', 'cancelled', 'returned'
    settlement_status: str = "unsettled"  # 'unsettled', 'partially_settled', 'settled'
    gross_amount: Decimal = Decimal("0.00")
    net_amount: Decimal = Decimal("0.00")
    vat_amount: Decimal = Decimal("0.00")
    discount_amount: Decimal = Decimal("0.00")
    total_cost: Decimal = Decimal("0.0000")
    customer_name: Optional[str] = None
    shipping_address: Optional[str] = None
    posted_journal_id: Optional[int] = None
    cogs_journal_id: Optional[int] = None
    reversal_journal_id: Optional[int] = None
    posted_at: Optional[datetime] = None
    posted_by: Optional[int] = None
    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[int] = None
    cancellation_reason: Optional[str] = None
    notes: Optional[str] = None
    raw_payload: Dict[str, Any] = field(default_factory=dict)
    lines: List[MarketplaceOrderLine] = field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class MarketplaceFee:
    id: Optional[int] = None
    company_id: int = 0
    marketplace_account_id: int = 0
    order_id: Optional[int] = None
    external_order_number: Optional[str] = None
    fee_type: str = "commission"  # 'commission', 'transport', 'advertising', etc.
    fee_date: date = field(default_factory=date.today)
    amount_before_vat: Decimal = Decimal("0.00")
    vat_rate: Decimal = Decimal("0.1500")
    vat_amount: Decimal = Decimal("0.00")
    total_fee: Decimal = Decimal("0.00")
    currency: str = "ZAR"
    source_reference: Optional[str] = None
    description: Optional[str] = None
    posting_status: str = "draft"  # 'draft', 'approved', 'posted', 'reversed'
    expense_account_code: Optional[str] = None
    posted_journal_id: Optional[int] = None
    reversal_journal_id: Optional[int] = None
    posted_at: Optional[datetime] = None
    posted_by: Optional[int] = None
    remittance_line_id: Optional[int] = None
    raw_payload: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class MarketplaceRemittanceLine:
    id: Optional[int] = None
    company_id: int = 0
    remittance_id: int = 0
    line_number: int = 1
    line_type: str = "sale"  # 'sale', 'return', 'fee_adjustment', 'other'
    external_order_number: str = ""
    order_date: Optional[date] = None
    sales_gross: Decimal = Decimal("0.00")
    sales_net: Decimal = Decimal("0.00")
    sales_vat: Decimal = Decimal("0.00")
    commission_gross: Decimal = Decimal("0.00")
    commission_net: Decimal = Decimal("0.00")
    commission_vat: Decimal = Decimal("0.00")
    transport_gross: Decimal = Decimal("0.00")
    transport_net: Decimal = Decimal("0.00")
    transport_vat: Decimal = Decimal("0.00")
    net_amount: Decimal = Decimal("0.00")
    matched_order_id: Optional[int] = None
    match_status: str = "unmatched"  # 'matched', 'unmatched', 'discrepancy', 'ignored'
    discrepancy_details: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class MarketplaceRemittance:
    id: Optional[int] = None
    company_id: int = 0
    marketplace_account_id: int = 0
    payment_reference_no: str = ""
    payment_date: date = field(default_factory=date.today)
    currency: str = "ZAR"
    sales_total: Decimal = Decimal("0.00")
    returns_total: Decimal = Decimal("0.00")
    commission_total: Decimal = Decimal("0.00")
    transport_total: Decimal = Decimal("0.00")
    other_deductions_total: Decimal = Decimal("0.00")
    net_payment_total: Decimal = Decimal("0.00")
    status: str = "imported"  # 'imported', 'matched', 'partially_settled', 'settled', 'reconciled'
    bank_account_id: Optional[int] = None
    bank_transaction_id: Optional[int] = None
    settlement_journal_id: Optional[int] = None
    idempotency_hash: str = ""
    raw_text: Optional[str] = None
    parsed_payload: Dict[str, Any] = field(default_factory=dict)
    lines: List[MarketplaceRemittanceLine] = field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class MarketplaceSettlementAllocation:
    id: Optional[int] = None
    company_id: int = 0
    remittance_id: int = 0
    settlement_journal_id: int = 0
    order_id: Optional[int] = None
    fee_id: Optional[int] = None
    allocation_type: str = "order_gross"  # 'order_gross', 'order_return', 'fee_deduction', 'fee_refund', 'unallocated_balance'
    allocated_amount: Decimal = Decimal("0.00")
    created_at: Optional[datetime] = None
