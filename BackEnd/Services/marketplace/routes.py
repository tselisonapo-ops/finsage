"""
Flask Blueprint for Marketplace Orders, Fees, Remittances, and Reconciliation.
Provides company-scoped REST endpoints for:
  - Dashboard KPIs and summary aging
  - Marketplace Orders (listing, creating, posting to GL, reversing)
  - Marketplace Fees (listing, creating, posting, reversing)
  - Remittance Advice Processing & Matching (PDF/TXT upload or raw text)
  - Subledger vs General Ledger Reconciliation
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import traceback
from datetime import date
from typing import Any, Dict, Optional

from flask import Blueprint, current_app, g, jsonify, request
from BackEnd.Services.auth_middleware import require_auth

from .fee_service import MarketplaceFeeService
from .order_service import MarketplaceOrderService
from .posting_service import MarketplacePostingService
from .reconciliation_service import MarketplaceReconciliationService
from .remittance_service import MarketplaceRemittanceService

logger = logging.getLogger(__name__)

marketplace_bp = Blueprint("marketplace", __name__)

ALLOWED_EXTS = {".pdf", ".txt"}


def _get_db():
    db = current_app.config.get("DB_SERVICE") or current_app.config.get("db_service")
    if not db:
        from BackEnd.Services.db_service import db_service
        db = db_service
    return db


_ENSURED_COMPANIES: set[int] = set()


def _ensure_tables_for_company(company_id: int):
    cid = int(company_id)
    if cid not in _ENSURED_COMPANIES:
        try:
            db = _get_db()
            db.ensure_marketplace_tables(cid)
            _ENSURED_COMPANIES.add(cid)
        except Exception as e:
            logger.warning("Could not auto-ensure marketplace tables for company_%s: %s", cid, e)


def _auth_check(company_id: int):
    user = getattr(g, "current_user", {}) or {}
    if not user:
        return None, (jsonify({"error": "Not authenticated"}), 401)
    # Check tenant access
    if int(user.get("company_id") or 0) != int(company_id):
        # Allow system admins or delegated accountants if applicable
        if not user.get("is_admin") and not user.get("is_platform_admin"):
            return None, (jsonify({"error": "Not authorised for this company"}), 403)
    _ensure_tables_for_company(company_id)
    return user, None


def _extract_text_from_file(file) -> str:
    """Extract text from uploaded PDF or TXT file."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise ValueError(f"Unsupported file type '{ext}'. Use .pdf or .txt.")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        if ext == ".pdf":
            try:
                proc = subprocess.run(
                    ["pdftotext", "-layout", tmp_path, "-"],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    check=False,
                )
            except FileNotFoundError:
                raise RuntimeError("PDF processing requires 'pdftotext' on the server.")
            except subprocess.TimeoutExpired:
                raise RuntimeError("PDF text extraction timed out.")

            if proc.returncode != 0:
                raise RuntimeError(f"pdftotext error: {proc.stderr[:300]}")
            text = proc.stdout
        else:
            with open(tmp_path, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()

        if not text.strip():
            raise ValueError("Uploaded file contains no readable text.")
        return text
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ═════════════════════════════════════════════════════════════════════════════
# 1. Dashboard & Overview
# ═════════════════════════════════════════════════════════════════════════════

@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/dashboard", methods=["GET"])
@require_auth
def get_marketplace_dashboard(company_id: int):
    """Aggregate dashboard metrics, KPIs, and aging."""
    user, err = _auth_check(company_id)
    if err:
        return err

    db = _get_db()
    recon_svc = MarketplaceReconciliationService(db)
    mkt = request.args.get("marketplace", "MAKRO")

    try:
        summary = recon_svc.get_dashboard_summary(company_id, marketplace_code=mkt)
        return jsonify({"ok": True, "dashboard": summary}), 200
    except Exception as e:
        logger.exception("Marketplace dashboard error: %s", e)
        return jsonify({"error": str(e)}), 500


# ═════════════════════════════════════════════════════════════════════════════
# 2. Marketplace Orders
# ═════════════════════════════════════════════════════════════════════════════

@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/orders", methods=["GET"])
@require_auth
def list_marketplace_orders(company_id: int):
    """List marketplace orders with optional filtering."""
    user, err = _auth_check(company_id)
    if err:
        return err

    db = _get_db()
    order_svc = MarketplaceOrderService(db)

    account_id = request.args.get("account_id", type=int)
    status = request.args.get("status")
    limit = min(request.args.get("limit", default=50, type=int), 200)
    offset = request.args.get("offset", default=0, type=int)

    filters = {}
    if request.args.get("marketplace"):
        filters["marketplace_code"] = request.args.get("marketplace")
    if status:
        filters["order_status"] = status
    if request.args.get("settlement_status"):
        filters["settlement_status"] = request.args.get("settlement_status")
    if request.args.get("search"):
        filters["search"] = request.args.get("search")

    try:
        orders_res = order_svc.list_orders(
            company_id,
            filters=filters,
            limit=limit,
            offset=offset,
        )
        items = orders_res.get("items", []) if isinstance(orders_res, dict) else orders_res
        pagination = orders_res.get("pagination", {}) if isinstance(orders_res, dict) else {}
        return jsonify({"ok": True, "orders": items, "count": pagination.get("total", len(items)), "pagination": pagination}), 200
    except Exception as e:
        logger.exception("List orders error: %s", e)
        return jsonify({"error": str(e)}), 500


@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/orders/<int:order_id>", methods=["GET"])
@require_auth
def get_marketplace_order(company_id: int, order_id: int):
    """Get single marketplace order details, lines, and allocations."""
    user, err = _auth_check(company_id)
    if err:
        return err

    db = _get_db()
    order_svc = MarketplaceOrderService(db)

    try:
        order = order_svc.get_order(company_id, order_id)
        if not order:
            return jsonify({"error": f"Order {order_id} not found"}), 404
        return jsonify({"ok": True, "order": order}), 200
    except Exception as e:
        logger.exception("Get order error: %s", e)
        return jsonify({"error": str(e)}), 500


@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/orders", methods=["POST"])
@require_auth
def create_marketplace_orders(company_id: int):
    """Create or bulk-import marketplace orders."""
    user, err = _auth_check(company_id)
    if err:
        return err

    payload = request.get_json(silent=True) or {}
    db = _get_db()
    order_svc = MarketplaceOrderService(db)
    user_id = user.get("id")

    try:
        if "orders" in payload and isinstance(payload["orders"], list):
            res = order_svc.bulk_import_orders(
                company_id,
                payload["orders"],
            )
            return jsonify({"ok": True, "result": res}), 201
        else:
            created = order_svc.create_order(company_id, payload)
            order_obj = created.get("order") if isinstance(created, dict) else created
            order_id = created.get("order_id") if isinstance(created, dict) else (order_obj.get("id") if isinstance(order_obj, dict) else None)
            return jsonify({"ok": True, "order": order_obj, "order_id": order_id, "action": created.get("action", "created") if isinstance(created, dict) else "created"}), 201
    except ValueError as ve:
        return jsonify({"error": str(ve), "type": "validation_error"}), 400
    except Exception as e:
        logger.exception("Create order error: %s", e)
        return jsonify({"error": str(e)}), 500


@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/orders/<int:order_id>/post", methods=["POST"])
@require_auth
def post_marketplace_order(company_id: int, order_id: int):
    """Post an order to GL (Sales Journal + COGS Journal via FIFO)."""
    user, err = _auth_check(company_id)
    if err:
        return err

    db = _get_db()
    posting_svc = MarketplacePostingService(db)
    user_id = user.get("id")

    data = request.get_json(silent=True) or {}
    acc_date = data.get("accounting_date")

    try:
        res = posting_svc.post_order_to_gl(
            company_id,
            order_id,
            recognition_date=acc_date,
            user_id=user_id,
        )
        return jsonify({"ok": True, "posting": res}), 200
    except ValueError as ve:
        return jsonify({"error": str(ve), "type": "validation_error"}), 400
    except Exception as e:
        logger.exception("Post order error: %s", e)
        return jsonify({"error": str(e)}), 500


@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/orders/<int:order_id>/reverse", methods=["POST"])
@require_auth
def reverse_marketplace_order(company_id: int, order_id: int):
    """Reverse an order posting (Sales Reversal + Inventory Reversal)."""
    user, err = _auth_check(company_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "User requested reversal")
    rev_date = data.get("reversal_date")

    db = _get_db()
    posting_svc = MarketplacePostingService(db)
    user_id = user.get("id")

    try:
        res = posting_svc.reverse_order_posting(
            company_id,
            order_id,
            reason=reason,
            user_id=user_id,
        )
        return jsonify({"ok": True, "reversal": res}), 200
    except ValueError as ve:
        return jsonify({"error": str(ve), "type": "validation_error"}), 400
    except Exception as e:
        logger.exception("Reverse order error: %s", e)
        return jsonify({"error": str(e)}), 500


@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/orders/batch-post", methods=["POST"])
@require_auth
def batch_post_marketplace_orders(company_id: int):
    """Batch post multiple approved orders to GL."""
    user, err = _auth_check(company_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    order_ids = data.get("order_ids") or []
    if not order_ids:
        return jsonify({"error": "order_ids list is required"}), 400

    db = _get_db()
    posting_svc = MarketplacePostingService(db)
    user_id = user.get("id")

    try:
        results = posting_svc.batch_post_orders(company_id, order_ids, user_id=user_id)
        return jsonify({"ok": True, "results": results}), 200
    except Exception as e:
        logger.exception("Batch post orders error: %s", e)
        return jsonify({"error": str(e)}), 500


# ═════════════════════════════════════════════════════════════════════════════
# 3. Marketplace Fees
# ═════════════════════════════════════════════════════════════════════════════

@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/fees", methods=["GET"])
@require_auth
def list_marketplace_fees(company_id: int):
    """List marketplace fees."""
    user, err = _auth_check(company_id)
    if err:
        return err

    db = _get_db()
    fee_svc = MarketplaceFeeService(db)

    account_id = request.args.get("account_id", type=int)
    remittance_id = request.args.get("remittance_id", type=int)
    fee_type = request.args.get("fee_type")
    limit = min(request.args.get("limit", default=100, type=int), 500)
    offset = request.args.get("offset", default=0, type=int)

    try:
        fees = fee_svc.list_fees(
            company_id,
            account_id=account_id,
            remittance_id=remittance_id,
            fee_type=fee_type,
            limit=limit,
            offset=offset,
        )
        return jsonify({"ok": True, "fees": fees, "count": len(fees)}), 200
    except Exception as e:
        logger.exception("List fees error: %s", e)
        return jsonify({"error": str(e)}), 500


@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/fees", methods=["POST"])
@require_auth
def create_marketplace_fee(company_id: int):
    """Create a manual or standalone marketplace fee."""
    user, err = _auth_check(company_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    db = _get_db()
    fee_svc = MarketplaceFeeService(db)
    user_id = user.get("id")

    try:
        fee = fee_svc.create_fee(company_id, data)
        return jsonify({"ok": True, "fee": fee}), 201
    except ValueError as ve:
        return jsonify({"error": str(ve), "type": "validation_error"}), 400
    except Exception as e:
        logger.exception("Create fee error: %s", e)
        return jsonify({"error": str(e)}), 500


@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/fees/<int:fee_id>/post", methods=["POST"])
@require_auth
def post_marketplace_fee(company_id: int, fee_id: int):
    """Post an individual fee to the General Ledger."""
    user, err = _auth_check(company_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    acc_date = data.get("accounting_date")

    db = _get_db()
    fee_svc = MarketplaceFeeService(db)
    user_id = user.get("id")

    try:
        res = fee_svc.post_fee_to_gl(company_id, fee_id, user_id=user_id)
        return jsonify({"ok": True, "posting": res}), 200
    except ValueError as ve:
        return jsonify({"error": str(ve), "type": "validation_error"}), 400
    except Exception as e:
        logger.exception("Post fee error: %s", e)
        return jsonify({"error": str(e)}), 500


@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/fees/<int:fee_id>/reverse", methods=["POST"])
@require_auth
def reverse_marketplace_fee(company_id: int, fee_id: int):
    """Reverse a fee GL posting."""
    user, err = _auth_check(company_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "User requested reversal")

    db = _get_db()
    fee_svc = MarketplaceFeeService(db)
    user_id = user.get("id")

    try:
        res = fee_svc.reverse_fee_posting(company_id, fee_id, reason=reason, user_id=user_id)
        return jsonify({"ok": True, "reversal": res}), 200
    except ValueError as ve:
        return jsonify({"error": str(ve), "type": "validation_error"}), 400
    except Exception as e:
        logger.exception("Reverse fee error: %s", e)
        return jsonify({"error": str(e)}), 500


# ═════════════════════════════════════════════════════════════════════════════
# 4. Remittance Processing & Matching
# ═════════════════════════════════════════════════════════════════════════════

@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/remittances/process", methods=["POST"])
@require_auth
def process_remittance_advice(company_id: int):
    """
    Process Makro Remittance Advice:
      - Accepts PDF / TXT upload or raw text payload.
      - Matches orders and returns.
      - Auto-captures and posts commission & transport fees.
      - Posts Bank Settlement Journal.
      - Records exact settlement allocations.
      - Supports vat_mode: 'standard', 'zero_rated', 'non_recoverable'.
      - Supports dry_run: true (preview) vs false (post).
    """
    user, err = _auth_check(company_id)
    if err:
        return err

    db = _get_db()
    remit_svc = MarketplaceRemittanceService(db)
    user_id = user.get("id")

    # Check for file upload vs JSON text
    text = ""
    dry_run = True
    vat_mode = "standard"
    auto_capture_fees = True
    auto_post_unposted = True
    bank_account_code = "BS_CA_1000"

    if request.files and "file" in request.files:
        uploaded_file = request.files["file"]
        if not uploaded_file.filename:
            return jsonify({"error": "Empty file uploaded"}), 400
        try:
            text = _extract_text_from_file(uploaded_file)
        except Exception as e:
            return jsonify({"error": f"Failed to extract file text: {e}"}), 400

        dry_run = request.form.get("dry_run", "true").lower() in ("true", "1", "yes")
        vat_mode = request.form.get("vat_mode", "standard").lower().strip()
        auto_capture_fees = request.form.get("auto_capture_fees", "true").lower() in ("true", "1")
        auto_post_unposted = request.form.get("auto_post_unposted_orders", "true").lower() in ("true", "1")
        bank_account_code = request.form.get("bank_account_code", "BS_CA_1000")
    else:
        json_data = request.get_json(silent=True) or {}
        text = json_data.get("text") or json_data.get("raw_text") or ""
        dry_run = bool(json_data.get("dry_run", True))
        vat_mode = str(json_data.get("vat_mode", "standard")).lower().strip()
        auto_capture_fees = bool(json_data.get("auto_capture_fees", True))
        auto_post_unposted = bool(json_data.get("auto_post_unposted_orders", True))
        bank_account_code = json_data.get("bank_account_code", "BS_CA_1000")

    if not text.strip():
        return jsonify({"error": "No remittance advice text or file provided"}), 400

    try:
        res = remit_svc.process_remittance(
            company_id,
            text,
            marketplace_code="MAKRO",
            auto_capture_fees=auto_capture_fees,
            auto_post_unposted_orders=auto_post_unposted,
            bank_account_code=bank_account_code,
            vat_mode=vat_mode,
            dry_run=dry_run,
            user_id=user_id,
        )

        # For dry-run previews, also provide parsed header & line preview
        if dry_run:
            from BackEnd.Services.makro_posting.parser import RemittanceParser
            parser = RemittanceParser()
            header, lines = parser.parse(text)
            res["preview_header"] = {
                "vendor_name": header.vendor_name,
                "marketplace_name": header.marketplace_name,
                "payment_date": header.payment_date.isoformat(),
                "payment_reference_no": header.payment_reference_no,
                "seller_id": header.seller_id,
                "vendor_sap_no": header.vendor_sap_no,
                "bank_account_number": header.bank_account_number,
                "branch_code": header.branch_code,
                "total_sales": float(header.total_sales),
                "total_commission": float(header.total_commission),
                "total_transport": float(header.total_transport),
                "total_net_payment": float(header.total_net_payment),
            }
            res["preview_lines"] = [
                {
                    "order_id": l.order_id,
                    "date": l.order_date.isoformat(),
                    "gross": float(l.gross),
                    "commission": float(l.commission),
                    "transport": float(l.transport),
                    "net_payment": float(l.net_payment),
                    "is_return": l.is_return,
                }
                for l in lines[:25]
            ]

        return jsonify({"ok": True, "result": res}), 200

    except ValueError as ve:
        return jsonify({"error": str(ve), "type": "validation_error"}), 400
    except Exception as e:
        logger.exception("Remittance processing error: %s", e)
        return jsonify({"error": str(e), "traceback": traceback.format_exc()[:1500]}), 500


@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/remittances/<int:remittance_id>", methods=["GET"])
@require_auth
def get_marketplace_remittance(company_id: int, remittance_id: int):
    """Retrieve full remittance record with matched lines and allocations."""
    user, err = _auth_check(company_id)
    if err:
        return err

    db = _get_db()
    remit_svc = MarketplaceRemittanceService(db)

    try:
        remit = remit_svc.get_remittance(company_id, remittance_id)
        if not remit:
            return jsonify({"error": f"Remittance {remittance_id} not found"}), 404
        return jsonify({"ok": True, "remittance": remit}), 200
    except Exception as e:
        logger.exception("Get remittance error: %s", e)
        return jsonify({"error": str(e)}), 500


# ═════════════════════════════════════════════════════════════════════════════
# 5. Reconciliation & Audit
# ═════════════════════════════════════════════════════════════════════════════

@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/reconciliation", methods=["GET"])
@require_auth
def get_marketplace_reconciliation(company_id: int):
    """Reconcile Marketplace Receivable subledger against General Ledger control account."""
    user, err = _auth_check(company_id)
    if err:
        return err

    db = _get_db()
    recon_svc = MarketplaceReconciliationService(db)
    mkt = request.args.get("marketplace", "MAKRO")

    try:
        recon = recon_svc.reconcile_marketplace_account(company_id, marketplace_code=mkt)
        return jsonify({"ok": True, "reconciliation": recon}), 200
    except Exception as e:
        logger.exception("Reconciliation error: %s", e)
        return jsonify({"error": str(e)}), 500


@marketplace_bp.route("/api/companies/<int:company_id>/marketplace/reconciliation/remittance/<int:remittance_id>", methods=["GET"])
@require_auth
def get_remittance_reconciliation(company_id: int, remittance_id: int):
    """Reconcile a specific remittance advice."""
    user, err = _auth_check(company_id)
    if err:
        return err

    db = _get_db()
    recon_svc = MarketplaceReconciliationService(db)

    try:
        recon = recon_svc.reconcile_remittance(company_id, remittance_id)
        return jsonify({"ok": True, "reconciliation": recon}), 200
    except Exception as e:
        logger.exception("Remittance reconciliation error: %s", e)
        return jsonify({"error": str(e)}), 500
