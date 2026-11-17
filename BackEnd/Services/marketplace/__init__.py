"""
Marketplace Orders, Fees, and Remittance Settlement Module for FinSage.
Supports multi-tenant isolation, inventory FIFO costing, journal posting,
and remittance reconciliation.
"""
from .ddl import ensure_marketplace_tables, get_marketplace_ddl_sql, seed_default_marketplace_account
from .models import (
    MarketplaceAccount,
    MarketplaceOrder,
    MarketplaceOrderLine,
    MarketplaceFee,
    MarketplaceRemittance,
    MarketplaceRemittanceLine,
    MarketplaceSettlementAllocation,
)
from .order_service import MarketplaceOrderService
from .posting_service import MarketplacePostingService
from .fee_service import MarketplaceFeeService
from .remittance_service import MarketplaceRemittanceService
from .reconciliation_service import MarketplaceReconciliationService
from .routes import marketplace_bp

__all__ = [
    "ensure_marketplace_tables",
    "get_marketplace_ddl_sql",
    "seed_default_marketplace_account",
    "MarketplaceOrderService",
    "MarketplacePostingService",
    "MarketplaceFeeService",
    "MarketplaceRemittanceService",
    "MarketplaceReconciliationService",
    "marketplace_bp",
    "MarketplaceAccount",
    "MarketplaceOrder",
    "MarketplaceOrderLine",
    "MarketplaceFee",
    "MarketplaceRemittance",
    "MarketplaceRemittanceLine",
    "MarketplaceSettlementAllocation",
]
