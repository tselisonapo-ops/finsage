"""
Marketplace Orders Service for FinSage.
Handles order import, manual capture, calculation, duplicate detection,
retrieval, search, and status management.
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)


def q_money(v: Any) -> Decimal:
    """Quantize to 2 decimal places (currency)."""
    if v is None or v == "":
        return Decimal("0.00")
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def q_qty(v: Any) -> Decimal:
    """Quantize to 4 decimal places (inventory quantity)."""
    if v is None or v == "":
        return Decimal("0.0000")
    return Decimal(str(v)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def q_rate(v: Any) -> Decimal:
    """Quantize to 4 decimal places (tax / discount rate)."""
    if v is None or v == "":
        return Decimal("0.0000")
    return Decimal(str(v)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


class MarketplaceOrderService:
    """
    Dedicated service for managing marketplace orders.
    Keeps marketplace orders isolated from regular customer invoices.
    """

    def __init__(self, db_service: Any):
        self.db = db_service

    # -------------------------------------------------------------------------
    # Helper: Context Runner
    # -------------------------------------------------------------------------

    def _execute(self, func, cur=None):
        if cur is not None:
            return func(cur)
        with self.db._conn_cursor() as (_c, _cur):
            return func(_cur)

    # -------------------------------------------------------------------------
    # Marketplace Account Resolver
    # -------------------------------------------------------------------------

    def get_marketplace_account(
        self,
        company_id: int,
        account_id_or_code: Union[int, str],
        *,
        cur=None,
    ) -> Dict[str, Any]:
        """Fetch marketplace account by ID or code (e.g. 'MAKRO')."""
        schema = f"company_{int(company_id)}"

        def _run(cursor):
            if isinstance(account_id_or_code, int) or str(account_id_or_code).isdigit():
                sql = f"SELECT * FROM {schema}.marketplace_accounts WHERE company_id = %s AND id = %s LIMIT 1;"
                params = (company_id, int(account_id_or_code))
            else:
                code = str(account_id_or_code).strip().upper()
                sql = f"SELECT * FROM {schema}.marketplace_accounts WHERE company_id = %s AND UPPER(code) = %s LIMIT 1;"
                params = (company_id, code)

            cursor.execute(sql, params)
            row = cursor.fetchone()
            if not row:
                # If code is MAKRO, seed default account
                from .ddl import seed_default_marketplace_account
                acc_id = seed_default_marketplace_account(cursor, company_id, str(account_id_or_code).upper())
                cursor.execute(f"SELECT * FROM {schema}.marketplace_accounts WHERE id = %s LIMIT 1;", (acc_id,))
                row = cursor.fetchone()

            if not row:
                raise ValueError(f"Marketplace account '{account_id_or_code}' not found for company_{company_id}")

            return dict(row) if hasattr(row, "keys") else row

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Line & Order Calculations
    # -------------------------------------------------------------------------

    def calculate_line(
        self,
        line: Dict[str, Any],
        default_vat_rate: Decimal = Decimal("0.1500"),
    ) -> Dict[str, Any]:
        """
        Calculate gross, net, VAT and line totals.
        Selling prices for South African marketplaces (like Makro) are VAT-inclusive.
        """
        qty = q_qty(line.get("quantity") or 1)
        if qty <= 0:
            raise ValueError(f"Order line quantity must be greater than zero, got {qty}")

        unit_price = q_money(line.get("unit_price") or 0)
        if unit_price < 0:
            raise ValueError(f"Unit price cannot be negative, got {unit_price}")

        discount = q_money(line.get("discount") or 0)
        is_taxable = line.get("is_taxable", True)

        raw_vat_rate = line.get("vat_rate")
        vat_rate = q_rate(raw_vat_rate) if raw_vat_rate is not None else default_vat_rate

        # Gross = (quantity * unit_price) - discount
        gross_amount = q_money((qty * unit_price) - discount)
        if gross_amount < 0:
            gross_amount = Decimal("0.00")

        if is_taxable and vat_rate > 0:
            divisor = Decimal("1.0000") + vat_rate
            net_amount = q_money(gross_amount / divisor)
            vat_amount = gross_amount - net_amount
        else:
            net_amount = gross_amount
            vat_amount = Decimal("0.00")
            vat_rate = Decimal("0.0000")

        return {
            "inventory_item_id": line.get("inventory_item_id"),
            "sku": (line.get("sku") or "").strip() or None,
            "product_description": (line.get("product_description") or "").strip() or "Marketplace Item",
            "quantity": qty,
            "unit_price": unit_price,
            "discount": discount,
            "vat_rate": vat_rate,
            "vat_amount": vat_amount,
            "net_amount": net_amount,
            "gross_amount": gross_amount,
            "unit_cost": q_money(line.get("unit_cost") or 0),
            "total_cost": q_money(line.get("total_cost") or 0),
            "meta": line.get("meta") or {},
        }

    # -------------------------------------------------------------------------
    # Inventory Item Resolver
    # -------------------------------------------------------------------------

    def resolve_inventory_item(
        self,
        company_id: int,
        sku: Optional[str],
        item_id: Optional[int],
        cursor,
    ) -> Optional[Dict[str, Any]]:
        """Look up inventory item by ID or SKU."""
        schema = f"company_{int(company_id)}"
        if item_id:
            cursor.execute(f"""
                SELECT id, sku, name, description, sales_price, purchase_cost, track_stock, is_active
                FROM {schema}.inventory_items
                WHERE company_id = %s AND id = %s
                LIMIT 1;
            """, (company_id, int(item_id)))
            row = cursor.fetchone()
            return dict(row) if row else None

        if sku:
            clean_sku = str(sku).strip()
            cursor.execute(f"""
                SELECT id, sku, name, description, sales_price, purchase_cost, track_stock, is_active
                FROM {schema}.inventory_items
                WHERE company_id = %s AND (LOWER(sku) = LOWER(%s) OR barcode = %s)
                ORDER BY is_active DESC, id ASC
                LIMIT 1;
            """, (company_id, clean_sku, clean_sku))
            row = cursor.fetchone()
            return dict(row) if row else None

        return None

    # -------------------------------------------------------------------------
    # Create / Capture Order
    # -------------------------------------------------------------------------

    def create_order(
        self,
        company_id: int,
        payload: Dict[str, Any],
        *,
        on_conflict: str = "error",  # 'error', 'skip', 'update_draft'
        cur=None,
    ) -> Dict[str, Any]:
        """
        Create a marketplace order and its order lines.
        Ensures external_order_number uniqueness per (company_id, marketplace_account_id).
        """
        company_id = int(company_id)
        schema = f"company_{company_id}"

        # 1. Resolve marketplace account
        acc_ref = payload.get("marketplace_account_id") or payload.get("marketplace_code") or "MAKRO"

        def _run(cursor):
            account = self.get_marketplace_account(company_id, acc_ref, cur=cursor)
            account_id = account["id"]
            default_vat_rate = Decimal(str(account.get("default_vat_rate") or "0.1500"))
            currency = str(payload.get("currency") or account.get("currency") or "ZAR").strip().upper()

            # 2. Validate external order number
            ext_order_num = str(payload.get("external_order_number") or "").strip()
            if not ext_order_num:
                raise ValueError("MISSING_EXTERNAL_ORDER_NUMBER|external_order_number is required")

            # 3. Duplicate check
            cursor.execute(f"""
                SELECT id, order_status, settlement_status, gross_amount, net_amount, vat_amount, posted_journal_id
                FROM {schema}.marketplace_orders
                WHERE company_id = %s AND marketplace_account_id = %s AND external_order_number = %s
                LIMIT 1;
            """, (company_id, account_id, ext_order_num))
            existing = cursor.fetchone()

            if existing:
                existing_dict = dict(existing)
                existing_id = existing_dict["id"]
                if on_conflict == "error":
                    raise ValueError(
                        f"DUPLICATE_ORDER|External order '{ext_order_num}' already exists with ID {existing_id}"
                    )
                elif on_conflict == "skip":
                    return {
                        "action": "skipped",
                        "reason": "duplicate",
                        "order_id": existing_id,
                        "order": self.get_order(company_id, existing_id, cur=cursor),
                    }
                elif on_conflict == "update_draft":
                    if existing_dict.get("order_status") not in ("imported", "draft"):
                        raise ValueError(
                            f"CANNOT_UPDATE_ORDER|Order {existing_id} is already '{existing_dict.get('order_status')}' and cannot be overwritten."
                        )
                    # Delete existing lines to replace
                    cursor.execute(f"DELETE FROM {schema}.marketplace_order_lines WHERE order_id = %s;", (existing_id,))
                    order_id = existing_id
                else:
                    raise ValueError(f"Invalid on_conflict option: {on_conflict}")
            else:
                order_id = None

            # 4. Process lines & calculate totals
            raw_lines = payload.get("lines") or []
            if not isinstance(raw_lines, list) or not raw_lines:
                raise ValueError("MISSING_ORDER_LINES|An order must have at least one line item")

            processed_lines: List[Dict[str, Any]] = []
            total_gross = Decimal("0.00")
            total_net = Decimal("0.00")
            total_vat = Decimal("0.00")
            total_discount = Decimal("0.00")

            for idx, raw_l in enumerate(raw_lines, start=1):
                calc_l = self.calculate_line(raw_l, default_vat_rate)
                calc_l["line_number"] = idx

                # Auto-resolve inventory item if SKU is given
                item_info = self.resolve_inventory_item(
                    company_id,
                    calc_l["sku"],
                    calc_l["inventory_item_id"],
                    cursor,
                )
                if item_info:
                    calc_l["inventory_item_id"] = item_info["id"]
                    if not calc_l["sku"]:
                        calc_l["sku"] = item_info.get("sku")
                    if calc_l["product_description"] == "Marketplace Item" and item_info.get("name"):
                        calc_l["product_description"] = item_info["name"]

                processed_lines.append(calc_l)
                total_gross += calc_l["gross_amount"]
                total_net += calc_l["net_amount"]
                total_vat += calc_l["vat_amount"]
                total_discount += calc_l["discount"]

            # 5. Order date & fulfilment date
            order_date = payload.get("order_date") or date.today()
            if hasattr(order_date, "isoformat"):
                order_date = order_date.isoformat()[:10]
            else:
                order_date = str(order_date)[:10]

            fulfilment_date = payload.get("fulfilment_date")
            if fulfilment_date:
                if hasattr(fulfilment_date, "isoformat"):
                    fulfilment_date = fulfilment_date.isoformat()[:10]
                else:
                    fulfilment_date = str(fulfilment_date)[:10]

            order_status = (payload.get("order_status") or "imported").strip().lower()
            customer_name = (payload.get("customer_name") or "").strip() or None
            shipping_address = (payload.get("shipping_address") or "").strip() or None
            notes = (payload.get("notes") or "").strip() or None
            raw_payload = payload.get("raw_payload") or {}

            # 6. Insert or Update Header
            if order_id:
                cursor.execute(f"""
                    UPDATE {schema}.marketplace_orders SET
                        order_date = %s,
                        fulfilment_date = %s,
                        currency = %s,
                        order_status = %s,
                        gross_amount = %s,
                        net_amount = %s,
                        vat_amount = %s,
                        discount_amount = %s,
                        customer_name = %s,
                        shipping_address = %s,
                        notes = %s,
                        raw_payload = %s::jsonb,
                        updated_at = NOW()
                    WHERE id = %s;
                """, (
                    order_date, fulfilment_date, currency, order_status,
                    total_gross, total_net, total_vat, total_discount,
                    customer_name, shipping_address, notes,
                    self._to_json(raw_payload), order_id
                ))
            else:
                cursor.execute(f"""
                    INSERT INTO {schema}.marketplace_orders (
                        company_id,
                        marketplace_account_id,
                        external_order_number,
                        order_date,
                        fulfilment_date,
                        currency,
                        order_status,
                        settlement_status,
                        gross_amount,
                        net_amount,
                        vat_amount,
                        discount_amount,
                        customer_name,
                        shipping_address,
                        notes,
                        raw_payload
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, 'unsettled',
                        %s, %s, %s, %s, %s, %s, %s, %s::jsonb
                    )
                    RETURNING id;
                """, (
                    company_id, account_id, ext_order_num,
                    order_date, fulfilment_date, currency, order_status,
                    total_gross, total_net, total_vat, total_discount,
                    customer_name, shipping_address, notes,
                    self._to_json(raw_payload)
                ))
                res = cursor.fetchone()
                order_id = res[0] if isinstance(res, (tuple, list)) else res.get("id")

            # 7. Insert Order Lines
            for line in processed_lines:
                cursor.execute(f"""
                    INSERT INTO {schema}.marketplace_order_lines (
                        company_id,
                        order_id,
                        line_number,
                        inventory_item_id,
                        sku,
                        product_description,
                        quantity,
                        unit_price,
                        discount,
                        vat_rate,
                        vat_amount,
                        net_amount,
                        gross_amount,
                        unit_cost,
                        total_cost,
                        meta
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
                    );
                """, (
                    company_id, order_id, line["line_number"],
                    line["inventory_item_id"], line["sku"],
                    line["product_description"],
                    line["quantity"], line["unit_price"], line["discount"],
                    line["vat_rate"], line["vat_amount"], line["net_amount"], line["gross_amount"],
                    line["unit_cost"], line["total_cost"],
                    self._to_json(line["meta"])
                ))

            logger.info("Marketplace order %s created (ext_ref=%s, company=%s)", order_id, ext_order_num, company_id)
            return {
                "action": "created" if not existing else "updated",
                "order_id": order_id,
                "order": self.get_order(company_id, order_id, cur=cursor),
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Bulk Import Orders
    # -------------------------------------------------------------------------

    def bulk_import_orders(
        self,
        company_id: int,
        orders_payload: List[Dict[str, Any]],
        *,
        on_conflict: str = "skip",
        cur=None,
    ) -> Dict[str, Any]:
        """Import a batch of orders (e.g. from a marketplace export or webhook)."""
        created = []
        skipped = []
        errors = []

        def _run(cursor):
            for idx, order_data in enumerate(orders_payload):
                ext_ref = order_data.get("external_order_number") or f"row_{idx}"
                try:
                    res = self.create_order(
                        company_id,
                        order_data,
                        on_conflict=on_conflict,
                        cur=cursor,
                    )
                    if res["action"] in ("created", "updated"):
                        created.append({
                            "external_order_number": ext_ref,
                            "order_id": res["order_id"],
                            "status": res["order"]["order_status"],
                            "gross_amount": float(res["order"]["gross_amount"]),
                        })
                    else:
                        skipped.append({
                            "external_order_number": ext_ref,
                            "order_id": res.get("order_id"),
                            "reason": res.get("reason", "skipped"),
                        })
                except Exception as e:
                    errors.append({
                        "external_order_number": ext_ref,
                        "error": str(e),
                    })

            return {
                "total": len(orders_payload),
                "created_count": len(created),
                "skipped_count": len(skipped),
                "error_count": len(errors),
                "created": created,
                "skipped": skipped,
                "errors": errors,
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Get Order by ID
    # -------------------------------------------------------------------------

    def get_order(
        self,
        company_id: int,
        order_id: int,
        *,
        cur=None,
    ) -> Optional[Dict[str, Any]]:
        """Retrieve complete order details including lines, marketplace account, and journals."""
        schema = f"company_{int(company_id)}"

        def _run(cursor):
            cursor.execute(f"""
                SELECT 
                    o.*,
                    ma.code AS marketplace_code,
                    ma.name AS marketplace_name,
                    ma.receivable_account_code,
                    j.ref AS posted_journal_ref,
                    cj.ref AS cogs_journal_ref,
                    rj.ref AS reversal_journal_ref
                FROM {schema}.marketplace_orders o
                JOIN {schema}.marketplace_accounts ma ON ma.id = o.marketplace_account_id
                LEFT JOIN {schema}.journal j ON j.id = o.posted_journal_id
                LEFT JOIN {schema}.journal cj ON cj.id = o.cogs_journal_id
                LEFT JOIN {schema}.journal rj ON rj.id = o.reversal_journal_id
                WHERE o.company_id = %s AND o.id = %s
                LIMIT 1;
            """, (company_id, int(order_id)))
            row = cursor.fetchone()
            if not row:
                return None

            order = dict(row)

            # Convert Dates & Decimals for JSON serialization
            self._serialize_fields(order)

            # Fetch lines
            cursor.execute(f"""
                SELECT 
                    l.*,
                    ii.sku AS item_sku,
                    ii.name AS item_name,
                    ii.track_stock
                FROM {schema}.marketplace_order_lines l
                LEFT JOIN {schema}.inventory_items ii ON ii.id = l.inventory_item_id
                WHERE l.order_id = %s
                ORDER BY l.line_number ASC;
            """, (int(order_id),))
            line_rows = cursor.fetchall() or []
            lines = []
            for lr in line_rows:
                ld = dict(lr)
                self._serialize_fields(ld)
                lines.append(ld)

            order["lines"] = lines
            return order

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Get Order by External Reference
    # -------------------------------------------------------------------------

    def get_order_by_external_ref(
        self,
        company_id: int,
        marketplace_code: str,
        external_order_number: str,
        *,
        cur=None,
    ) -> Optional[Dict[str, Any]]:
        """Retrieve order by external reference and marketplace code."""
        schema = f"company_{int(company_id)}"

        def _run(cursor):
            cursor.execute(f"""
                SELECT o.id
                FROM {schema}.marketplace_orders o
                JOIN {schema}.marketplace_accounts ma ON ma.id = o.marketplace_account_id
                WHERE o.company_id = %s 
                  AND UPPER(ma.code) = %s 
                  AND LOWER(TRIM(o.external_order_number)) = LOWER(TRIM(%s))
                LIMIT 1;
            """, (company_id, marketplace_code.strip().upper(), external_order_number.strip()))
            row = cursor.fetchone()
            if not row:
                return None
            order_id = row[0] if isinstance(row, (tuple, list)) else row.get("id")
            return self.get_order(company_id, order_id, cur=cursor)

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # List / Search Orders with Pagination
    # -------------------------------------------------------------------------

    def list_orders(
        self,
        company_id: int,
        filters: Optional[Dict[str, Any]] = None,
        *,
        limit: int = 50,
        offset: int = 0,
        cur=None,
    ) -> Dict[str, Any]:
        """List and search orders with filtering and pagination."""
        schema = f"company_{int(company_id)}"
        filters = filters or {}

        def _run(cursor):
            where_clauses = [f"o.company_id = %s"]
            params: List[Any] = [company_id]

            if filters.get("marketplace_code"):
                where_clauses.append("UPPER(ma.code) = %s")
                params.append(filters["marketplace_code"].strip().upper())

            if filters.get("order_status"):
                where_clauses.append("o.order_status = %s")
                params.append(filters["order_status"].strip().lower())

            if filters.get("settlement_status"):
                where_clauses.append("o.settlement_status = %s")
                params.append(filters["settlement_status"].strip().lower())

            if filters.get("start_date"):
                where_clauses.append("o.order_date >= %s")
                params.append(filters["start_date"])

            if filters.get("end_date"):
                where_clauses.append("o.order_date <= %s")
                params.append(filters["end_date"])

            search = (filters.get("search") or "").strip()
            if search:
                where_clauses.append("""(
                    o.external_order_number ILIKE %s OR
                    o.customer_name ILIKE %s OR
                    EXISTS (
                        SELECT 1 FROM {schema}.marketplace_order_lines ol
                        WHERE ol.order_id = o.id AND (ol.sku ILIKE %s OR ol.product_description ILIKE %s)
                    )
                )""".format(schema=schema))
                wildcard = f"%{search}%"
                params.extend([wildcard, wildcard, wildcard, wildcard])

            where_sql = " AND ".join(where_clauses)

            # Count total
            count_sql = f"""
                SELECT COUNT(*) 
                FROM {schema}.marketplace_orders o
                JOIN {schema}.marketplace_accounts ma ON ma.id = o.marketplace_account_id
                WHERE {where_sql};
            """
            cursor.execute(count_sql, tuple(params))
            total_row = cursor.fetchone()
            total = total_row[0] if isinstance(total_row, (tuple, list)) else total_row.get("count", 0)

            # Fetch page
            fetch_sql = f"""
                SELECT 
                    o.id,
                    o.company_id,
                    o.marketplace_account_id,
                    ma.code AS marketplace_code,
                    ma.name AS marketplace_name,
                    o.external_order_number,
                    o.order_date,
                    o.fulfilment_date,
                    o.currency,
                    o.order_status,
                    o.settlement_status,
                    o.gross_amount,
                    o.net_amount,
                    o.vat_amount,
                    o.discount_amount,
                    o.total_cost,
                    o.customer_name,
                    o.posted_journal_id,
                    o.cogs_journal_id,
                    o.reversal_journal_id,
                    o.posted_at,
                    o.created_at,
                    (SELECT COUNT(*) FROM {schema}.marketplace_order_lines ol WHERE ol.order_id = o.id) AS line_count
                FROM {schema}.marketplace_orders o
                JOIN {schema}.marketplace_accounts ma ON ma.id = o.marketplace_account_id
                WHERE {where_sql}
                ORDER BY o.order_date DESC, o.id DESC
                LIMIT %s OFFSET %s;
            """
            fetch_params = list(params) + [limit, offset]
            cursor.execute(fetch_sql, tuple(fetch_params))
            rows = cursor.fetchall() or []

            items = []
            for r in rows:
                item = dict(r)
                self._serialize_fields(item)
                items.append(item)

            pages = math.ceil(total / limit) if limit > 0 else 1

            return {
                "items": items,
                "pagination": {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "pages": pages,
                },
            }

        return self._execute(_run, cur)

    # -------------------------------------------------------------------------
    # Status Management & Approvals
    # -------------------------------------------------------------------------

    def update_order_status(
        self,
        company_id: int,
        order_id: int,
        new_status: str,
        *,
        reason: Optional[str] = None,
        user_id: Optional[int] = None,
        cur=None,
    ) -> Dict[str, Any]:
        """
        Transition order status with safety controls:
          imported -> draft -> approved -> cancelled
        Posted status transition is handled via posting_service in Phase 3.
        """
        schema = f"company_{int(company_id)}"
        target_status = new_status.strip().lower()

        allowed_statuses = ("imported", "draft", "approved", "posted", "cancelled", "returned")
        if target_status not in allowed_statuses:
            raise ValueError(f"Invalid order status '{target_status}'. Must be one of {allowed_statuses}")

        def _run(cursor):
            cursor.execute(f"""
                SELECT id, order_status, posted_journal_id, external_order_number
                FROM {schema}.marketplace_orders
                WHERE company_id = %s AND id = %s
                FOR UPDATE;
            """, (company_id, int(order_id)))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Marketplace order {order_id} not found")

            curr = dict(row)
            curr_status = curr["order_status"]
            posted_jid = curr.get("posted_journal_id")

            # Protection rules:
            if curr_status == "posted" and target_status in ("imported", "draft"):
                raise ValueError(
                    f"INVALID_STATUS_TRANSITION|Order {order_id} has already been posted to GL (journal {posted_jid}). It cannot be moved back to {target_status}."
                )

            if target_status == "cancelled":
                if curr_status == "posted":
                    raise ValueError(
                        f"CANNOT_CANCEL_POSTED_ORDER|Order {order_id} is already posted. It must be reversed rather than cancelled."
                    )
                cursor.execute(f"""
                    UPDATE {schema}.marketplace_orders SET
                        order_status = 'cancelled',
                        cancelled_at = NOW(),
                        cancelled_by = %s,
                        cancellation_reason = %s,
                        updated_at = NOW()
                    WHERE id = %s;
                """, (user_id, reason or "Cancelled by user", int(order_id)))
            else:
                cursor.execute(f"""
                    UPDATE {schema}.marketplace_orders SET
                        order_status = %s,
                        updated_at = NOW()
                    WHERE id = %s;
                """, (target_status, int(order_id)))

            logger.info("Order %s status changed from '%s' to '%s'", order_id, curr_status, target_status)
            return self.get_order(company_id, order_id, cur=cursor)

        return self._execute(_run, cur)

    def cancel_order(
        self,
        company_id: int,
        order_id: int,
        reason: str,
        *,
        user_id: Optional[int] = None,
        cur=None,
    ) -> Dict[str, Any]:
        """Cancel an unposted order."""
        return self.update_order_status(
            company_id,
            order_id,
            "cancelled",
            reason=reason,
            user_id=user_id,
            cur=cur,
        )

    # -------------------------------------------------------------------------
    # Internal Helpers
    # -------------------------------------------------------------------------

    @staticmethod
    def _to_json(val: Any) -> str:
        import json
        if isinstance(val, str):
            return val
        return json.dumps(val or {}, default=str)

    @staticmethod
    def _serialize_fields(data: Dict[str, Any]):
        for k, v in list(data.items()):
            if isinstance(v, Decimal):
                data[k] = float(v)
            elif isinstance(v, (date, datetime)):
                data[k] = v.isoformat()
