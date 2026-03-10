"""Add banking tables (statement import + reconciliation)

Revision ID: a814ca472844
Revises:
Create Date: 2025-12-09 19:27:38.499541
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a814ca472844"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------
    # public.bank_statement_imports
    # -----------------------------
    op.create_table(
        "bank_statement_imports",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.BigInteger(), nullable=False),
        sa.Column("bank_account_id", sa.BigInteger(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False, server_default="upload"),
        sa.Column("file_name", sa.Text(), nullable=False),
        sa.Column("file_ext", sa.Text(), nullable=False),
        sa.Column("file_hash", sa.Text(), nullable=False),
        sa.Column("uploaded_by", sa.BigInteger(), nullable=True),
        sa.Column("uploaded_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("statement_start_date", sa.Date(), nullable=True),
        sa.Column("statement_end_date", sa.Date(), nullable=True),
        sa.Column("currency", sa.Text(), nullable=True, server_default="ZAR"),
        sa.Column("status", sa.Text(), nullable=False, server_default="uploaded"),  # uploaded|parsed|failed
        sa.Column("error", sa.Text(), nullable=True),
        schema="public",
    )

    op.create_index("idx_bsi_company", "bank_statement_imports", ["company_id"], schema="public")
    op.create_index("idx_bsi_bankacct", "bank_statement_imports", ["bank_account_id"], schema="public")
    op.create_index(
        "uq_bsi_company_hash",
        "bank_statement_imports",
        ["company_id", "file_hash"],
        unique=True,
        schema="public",
    )

    # -----------------------------
    # public.bank_statement_lines
    # -----------------------------
    op.create_table(
        "bank_statement_lines",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.BigInteger(), nullable=False),
        sa.Column("import_id", sa.BigInteger(), nullable=False),
        sa.Column("line_date", sa.Date(), nullable=True),
        sa.Column("value_date", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", sa.Text(), nullable=False, server_default="ZAR"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("reference", sa.Text(), nullable=True),
        sa.Column("counterparty", sa.Text(), nullable=True),
        sa.Column("running_balance", sa.Numeric(18, 2), nullable=True),
        sa.Column("fingerprint", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["import_id"],
            ["public.bank_statement_imports.id"],
            ondelete="CASCADE",
        ),
        schema="public",
    )

    op.create_index("idx_bsl_company", "bank_statement_lines", ["company_id"], schema="public")
    op.create_index("idx_bsl_import", "bank_statement_lines", ["import_id"], schema="public")
    op.create_index("idx_bsl_date", "bank_statement_lines", ["line_date"], schema="public")
    op.create_index("idx_bsl_amount", "bank_statement_lines", ["amount"], schema="public")
    op.create_index(
        "uq_bsl_import_fingerprint",
        "bank_statement_lines",
        ["import_id", "fingerprint"],
        unique=True,
        schema="public",
    )

    # -----------------------------
    # public.bank_reconciliations
    # -----------------------------
    op.create_table(
        "bank_reconciliations",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.BigInteger(), nullable=False),
        sa.Column("bank_account_id", sa.BigInteger(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="draft"),  # draft|in_review|closed
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("reviewed_by", sa.BigInteger(), nullable=True),
        sa.Column("reviewed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("closed_by", sa.BigInteger(), nullable=True),
        sa.Column("closed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        schema="public",
    )

    op.create_index("idx_br_company", "bank_reconciliations", ["company_id"], schema="public")
    op.create_index("idx_br_bankacct", "bank_reconciliations", ["bank_account_id"], schema="public")

    # -----------------------------
    # public.bank_recon_items
    # -----------------------------
    op.create_table(
        "bank_recon_items",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.BigInteger(), nullable=False),
        sa.Column("reconciliation_id", sa.BigInteger(), nullable=False),
        sa.Column("statement_line_id", sa.BigInteger(), nullable=False),

        sa.Column("match_status", sa.Text(), nullable=False, server_default="unmatched"),  # unmatched|matched|partial|excluded
        sa.Column("match_type", sa.Text(), nullable=True),  # receipt|payment|transfer|fee|interest|other

        sa.Column("matched_object_type", sa.Text(), nullable=True),  # invoice_receipt|bill_payment|journal|transfer
        sa.Column("matched_object_id", sa.BigInteger(), nullable=True),

        sa.Column("created_journal_id", sa.BigInteger(), nullable=True),

        sa.Column("excluded_reason", sa.Text(), nullable=True),

        sa.Column("prepared_by", sa.BigInteger(), nullable=True),
        sa.Column("prepared_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("reviewed_by", sa.BigInteger(), nullable=True),
        sa.Column("reviewed_at", sa.TIMESTAMP(timezone=True), nullable=True),

        sa.ForeignKeyConstraint(
            ["reconciliation_id"],
            ["public.bank_reconciliations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["statement_line_id"],
            ["public.bank_statement_lines.id"],
            ondelete="RESTRICT",
        ),
        schema="public",
    )

    op.create_index("idx_bri_recon", "bank_recon_items", ["reconciliation_id"], schema="public")
    op.create_index("idx_bri_line", "bank_recon_items", ["statement_line_id"], schema="public")
    op.create_index(
        "uq_bri_recon_line",
        "bank_recon_items",
        ["reconciliation_id", "statement_line_id"],
        unique=True,
        schema="public",
    )


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_index("uq_bri_recon_line", table_name="bank_recon_items", schema="public")
    op.drop_index("idx_bri_line", table_name="bank_recon_items", schema="public")
    op.drop_index("idx_bri_recon", table_name="bank_recon_items", schema="public")
    op.drop_table("bank_recon_items", schema="public")

    op.drop_index("idx_br_bankacct", table_name="bank_reconciliations", schema="public")
    op.drop_index("idx_br_company", table_name="bank_reconciliations", schema="public")
    op.drop_table("bank_reconciliations", schema="public")

    op.drop_index("uq_bsl_import_fingerprint", table_name="bank_statement_lines", schema="public")
    op.drop_index("idx_bsl_amount", table_name="bank_statement_lines", schema="public")
    op.drop_index("idx_bsl_date", table_name="bank_statement_lines", schema="public")
    op.drop_index("idx_bsl_import", table_name="bank_statement_lines", schema="public")
    op.drop_index("idx_bsl_company", table_name="bank_statement_lines", schema="public")
    op.drop_table("bank_statement_lines", schema="public")

    op.drop_index("uq_bsi_company_hash", table_name="bank_statement_imports", schema="public")
    op.drop_index("idx_bsi_bankacct", table_name="bank_statement_imports", schema="public")
    op.drop_index("idx_bsi_company", table_name="bank_statement_imports", schema="public")
    op.drop_table("bank_statement_imports", schema="public")
