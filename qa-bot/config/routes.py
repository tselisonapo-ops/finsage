from __future__ import annotations

from config.settings import settings


def _join(path: str) -> str:
    return f"{settings.api_base_url.rstrip('/')}/{path.lstrip('/')}"


CID = settings.company_id

ROUTES = {
    "login": settings.login_url,

    # Banking
    "bank_accounts": _join(f"/api/companies/{CID}/bank_accounts"),
    "bank_statement_preview": _join(f"/api/companies/{CID}/bank_statements/preview"),
    "bank_statement_import": _join(f"/api/companies/{CID}/bank_statements/import"),
    "bank_statements": _join(f"/api/companies/{CID}/bank_statements"),
    "bank_reconciliations": _join(f"/api/companies/{CID}/bank_reconciliations"),
    "bank_reconciliation_items": _join(f"/api/companies/{CID}/bank_reconciliations/{{recon_id}}/items"),
    "bank_recon_exclude_item": _join(f"/api/companies/{CID}/bank_reconciliations/items/{{recon_item_id}}/exclude"),
    "bank_recon_attach_journal": _join(f"/api/companies/{CID}/bank_reconciliations/items/{{recon_item_id}}/attach_journal"),
    "bank_recon_match_item": _join(f"/api/companies/{CID}/bank_reconciliations/{{recon_id}}/items/{{item_id}}/match"),
    "bank_import_create_reconciliation": _join(f"/api/companies/{CID}/bank_statements/{{import_id}}/create_reconciliation"),
    "bank_recon_auto_match": _join(f"/api/companies/{CID}/bank_reconciliations/{{recon_id}}/auto_match"),

    # GL
    "journals": _join(f"/api/companies/{CID}/journal"),

    # AR
    "invoices": _join(f"/api/companies/{CID}/invoices"),
    "invoice_detail": _join(f"/api/companies/{CID}/invoices/{{invoice_id}}"),

    # AP
    "vendors": _join(f"/api/companies/{CID}/vendors"),
    "vendor_detail": _join(f"/api/companies/{CID}/vendors/{{vendor_id}}"),
    "bills": _join(f"/api/companies/{CID}/bills"),
    "bill_detail": _join(f"/api/companies/{CID}/bills/{{bill_id}}"),
    "bill_post": _join(f"/api/companies/{CID}/bills/{{bill_id}}/post"),

    # Vendor payments
    "vendor_payment_create": _join(f"/api/companies/{CID}/vendors/payments"),
    "vendor_payment_approve": _join(f"/api/companies/{CID}/vendors/payments/{{payment_id}}/approve"),

    # Leases
    "leases": _join(f"/api/companies/{CID}/leases"),
    "lease_detail": _join(f"/api/companies/{CID}/leases/{{lease_id}}"),
    "lease_schedule": _join(f"/api/companies/{CID}/leases/{{lease_id}}/schedule"),
    "lease_monthly_due": _join(f"/api/companies/{CID}/leases/monthly_due"),
    "lease_post_month": _join(f"/api/companies/{CID}/leases/{{lease_id}}/period/{{period_no}}/post"),
    "lease_payments": _join(f"/api/companies/{CID}/leases/{{lease_id}}/payments"),
    "lease_modifications": _join(f"/api/companies/{CID}/leases/{{lease_id}}/modifications"),
    "lease_modification_post": _join(f"/api/companies/{CID}/leases/modifications/{{mod_id}}/post"),
    "lease_terminations": _join(f"/api/companies/{CID}/leases/{{lease_id}}/terminations"),
    "lease_termination_post": _join(f"/api/companies/{CID}/leases/terminations/{{term_id}}/post"),

    # Approvals / Assets
    "approvals": _join(f"/api/companies/{CID}/approvals"),
    "assets": _join(f"/api/companies/{CID}/assets"),
    "asset_acquisitions": _join(f"/api/companies/{CID}/assets/{{asset_id}}/acquisitions"),
    "post_acquisition": _join(f"/api/companies/{CID}/asset-acquisitions/{{acq_id}}/post"),
    "depreciation_run": _join(f"/api/companies/{CID}/depreciation/run"),
    "depreciation_post": _join(f"/api/companies/{CID}/depreciation/{{dep_id}}/post"),
}