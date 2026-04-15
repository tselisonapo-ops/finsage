from datetime import datetime
from decimal import Decimal
from operator import inv
from flask import request, jsonify, make_response, current_app
import json
from flask import Blueprint
from BackEnd.Services.auth_middleware import _corsify, require_auth

from BackEnd.Services.db_service import db_service

invoices_bp = Blueprint("invoices_bp", __name__)

def _extract_company_ids(payload) -> set[int]:
    ids = set()

    # primary company_id
    primary = payload.get("company_id")
    try:
        if primary is not None:
            ids.add(int(primary))
    except Exception:
        pass

    # companies can be:
    # - [1,2]
    # - ["1","2"]
    # - [{"id":1}, {"id":2}]
    # - [{"company_id":1}, ...]
    companies = payload.get("companies") or []
    if isinstance(companies, (list, tuple)):
        for c in companies:
            try:
                if isinstance(c, dict):
                    if "id" in c:
                        ids.add(int(c["id"]))
                    elif "company_id" in c:
                        ids.add(int(c["company_id"]))
                else:
                    ids.add(int(c))
            except Exception:
                continue

    return ids


def _deny_if_wrong_company(
    payload,
    company_id: int,
    *,
    db_service,
    engagement_id: int | None = None,
):
    role = (payload.get("role") or "").strip().lower()
    if role == "admin":
        return None

    user_id = payload.get("user_id") or payload.get("sub")
    try:
        user_id = int(user_id) if user_id is not None else None
    except Exception:
        user_id = None

    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        target_company_id = int(company_id)
    except Exception:
        return jsonify({"ok": False, "error": "AUTH|invalid_company_id"}), 400

    token_company_id = payload.get("token_company_id", payload.get("company_id"))
    try:
        token_company_id = int(token_company_id) if token_company_id is not None else None
    except Exception:
        token_company_id = None

    allowed_company_ids = (
        payload.get("token_allowed_company_ids")
        or payload.get("allowed_company_ids")
        or []
    )
    try:
        allowed_company_ids = [int(x) for x in allowed_company_ids]
    except Exception:
        allowed_company_ids = []

    # direct access
    if target_company_id == token_company_id:
        return None

    if target_company_id in allowed_company_ids:
        return None

    # delegated access through engagement workspaces
    candidate_home_company_ids = []
    if token_company_id is not None:
        candidate_home_company_ids.append(token_company_id)

    for cid in allowed_company_ids:
        if cid not in candidate_home_company_ids:
            candidate_home_company_ids.append(cid)

    for home_company_id in candidate_home_company_ids:
        try:
            with db_service._conn_cursor() as (_, cur):
                delegated_ok = db_service.user_has_delegated_company_access(
                    cur,
                    user_id=user_id,
                    company_id=home_company_id,
                    target_company_id=target_company_id,
                    engagement_id=engagement_id,
                )
            if delegated_ok:
                return None
        except Exception as e:
            print("DELEGATED ACCESS CHECK FAILED", {
                "user_id": user_id,
                "home_company_id": home_company_id,
                "target_company_id": target_company_id,
                "engagement_id": engagement_id,
                "error": str(e),
            })

    return jsonify({"ok": False, "error": "Access denied for this company"}), 403

# =========================
# ROUTE: Allocate payment
# =========================

@invoices_bp.route(
    "/api/companies/<int:company_id>/invoices/<int:invoice_id>/allocate_payment",
    methods=["POST", "OPTIONS"]
)
@require_auth
def allocate_invoice_payment(company_id: int, invoice_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or None

    before_inv = db_service.get_invoice_with_lines(company_id, int(invoice_id)) or {}
    before_json = {
        "status": before_inv.get("status"),
        "total": before_inv.get("total"),
        "balance": before_inv.get("balance"),
        "paid_total": before_inv.get("paid_total"),
        "currency": before_inv.get("currency"),
        "number": before_inv.get("number"),
        "customer_id": before_inv.get("customer_id"),
    }

    try:
        amount = Decimal(str(data.get("amount") or "0")).quantize(Decimal("0.01"))

        payment_date_raw = (data.get("date") or "").strip()
        payment_date = (
            datetime.strptime(payment_date_raw, "%Y-%m-%d").date()
            if payment_date_raw
            else datetime.utcnow().date()
        )

        bank_account_id = data.get("bank_account_id")
        bank_account_id = int(bank_account_id) if bank_account_id else None

        reference = (data.get("reference") or "").strip() or None
        description = (data.get("description") or "").strip() or None
        ar_ledger_code = (data.get("ar_ledger_code") or "").strip() or None

        out = db_service.allocate_payment_to_invoice(
            company_id=company_id,
            invoice_id=invoice_id,
            amount=amount,
            payment_date=payment_date,
            bank_account_id=bank_account_id,
            reference=reference,
            description=description,
            user_id=actor_user_id,
            ar_ledger_code=ar_ledger_code,
        )

        inv = db_service.get_invoice_with_lines(company_id, int(invoice_id)) or {}
        revenue_contract_id = inv.get("revenue_contract_id")

        # only this mirror step is optional / non-blocking
        if revenue_contract_id:
            try:
                db_service.record_revenue_cash_event(
                    company_id=company_id,
                    contract_id=int(revenue_contract_id),
                    data={
                        "event_date": str(payment_date),
                        "event_type": "receipt",
                        "source_invoice_id": int(invoice_id),
                        "source_receipt_id": int(out.get("receipt_id")) if out.get("receipt_id") else None,
                        "amount": float(amount),
                        "currency": inv.get("currency") or "ZAR",
                        "notes": f"Cash received for invoice {inv.get('number')}",
                        "payload_json": {
                            "customer_id": int(inv.get("customer_id") or 0),
                            "source": "ar_receipt",
                            "invoice_number": inv.get("number"),
                        },
                    },
                    user_id=actor_user_id or 0,
                )
            except Exception:
                current_app.logger.exception("⚠️ revenue cash event failed")

        after_inv = db_service.get_invoice_with_lines(company_id, int(invoice_id)) or {}
        after_json = {
            "status": after_inv.get("status"),
            "total": after_inv.get("total"),
            "balance": after_inv.get("balance"),
            "paid_total": after_inv.get("paid_total"),
            "currency": after_inv.get("currency"),
            "number": after_inv.get("number"),
        }

        try:
            journal_id = out.get("journal_id") if isinstance(out, dict) else None
            currency = (
                (out.get("currency") if isinstance(out, dict) else None)
                or after_inv.get("currency")
                or before_inv.get("currency")
            )

            entity_ref = after_inv.get("number") or before_inv.get("number") or None

            db_service.audit_log(
                company_id,
                actor_user_id=actor_user_id or 0,
                module="ar",
                action="allocate_payment",
                severity="info",
                entity_type="invoice",
                entity_id=str(invoice_id),
                entity_ref=str(entity_ref) if entity_ref else None,
                journal_id=int(journal_id) if journal_id else None,
                customer_id=int(before_inv.get("customer_id") or 0) or None,
                amount=float(amount),
                currency=str(currency) if currency else None,
                before_json=before_json,
                after_json={
                    "input": {
                        "amount": str(amount),
                        "payment_date": str(payment_date),
                        "bank_account_id": bank_account_id,
                        "reference": reference,
                        "description": description,
                        "ar_ledger_code": ar_ledger_code,
                    },
                    "result": out,
                    "invoice_after": after_json,
                },
                message=f"Allocated payment to invoice {entity_ref or invoice_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in allocate_invoice_payment")

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception(
            "❌ allocate_invoice_payment failed (company_id=%s invoice_id=%s)",
            company_id, invoice_id
        )

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=actor_user_id or 0,
                module="ar",
                action="allocate_payment_failed",
                severity="error",
                entity_type="invoice",
                entity_id=str(invoice_id),
                entity_ref=str(before_inv.get("number")) if before_inv.get("number") else None,
                customer_id=int(before_inv.get("customer_id") or 0) or None,
                amount=float(Decimal(str(data.get("amount") or "0"))),
                currency=str(before_inv.get("currency")) if before_inv.get("currency") else None,
                before_json=before_json,
                after_json={"error": str(e)},
                message=f"Payment allocation failed for invoice {before_inv.get('number') or invoice_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in allocate_invoice_payment error handler")

        return jsonify({"ok": False, "error": str(e)}), 400
    
@invoices_bp.route("/api/companies/<int:company_id>/invoices/<int:invoice_id>", methods=["GET", "OPTIONS"])
@require_auth
def get_invoice(company_id: int, invoice_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    inv = db_service.get_invoice_full(company_id, invoice_id)  # includes relations + lines
    if not inv:
        return jsonify({"ok": False, "error": "Invoice not found"}), 404

    return jsonify({"ok": True, "data": inv}), 200

@invoices_bp.route("/api/companies/<int:company_id>/invoices", methods=["GET", "OPTIONS"])
@require_auth
def list_invoices(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    # Optional filters from query string:
    # /invoices?status=posted&status=draft&customer_id=1&limit=200
    statuses = request.args.getlist("status") or None
    customer_id = request.args.get("customer_id", type=int)
    limit = request.args.get("limit", default=200, type=int)

    rows = db_service.list_company_invoices_filtered(
        company_id=company_id,
        statuses=statuses,
        customer_id=customer_id,
        limit=limit,
    )

    return jsonify({"ok": True, "data": rows}), 200

def build_invoice_journal_lines(inv: dict, company_id: int) -> dict:
    # ✅ GUARD: detect wrong type / missing invoice early
    if inv is None:
        raise ValueError("Invoice payload is None (likely loaded before commit / wrong connection)")
    if not isinstance(inv, dict):
        raise TypeError(f"build_invoice_journal_lines expected dict, got {type(inv)}")

    from decimal import Decimal, ROUND_HALF_UP

    def money(x) -> float:
        return float(Decimal(str(x or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    # ---------- 1) Load settings ----------
    settings = db_service.get_company_account_settings(company_id) or {}

    def _ensure_control_defaults_if_missing():
        """
        Safety net:
        - ensure control accounts exist in company_{id}.coa
        - ensure company_account_settings points to them (only if NULL)
        """
        try:
            db_service.ensure_required_control_accounts(company_id)

            db_service.execute_sql("""
            INSERT INTO public.company_account_settings (
                company_id, ar_control_code, vat_output_code, vat_input_code, sales_discount_code, updated_at
            )
            VALUES (%s,%s,%s,%s,%s,NOW())
            ON CONFLICT (company_id) DO UPDATE SET
                ar_control_code     = COALESCE(public.company_account_settings.ar_control_code, EXCLUDED.ar_control_code),
                vat_output_code     = COALESCE(public.company_account_settings.vat_output_code, EXCLUDED.vat_output_code),
                vat_input_code      = COALESCE(public.company_account_settings.vat_input_code,  EXCLUDED.vat_input_code),
                sales_discount_code = COALESCE(public.company_account_settings.sales_discount_code, EXCLUDED.sales_discount_code),
                updated_at = NOW();
            """, (
            company_id,
            "BS_CA_9002",
            "BS_CL_2310",
            "BS_CA_1410",
            "PL_REVADJ_8000",
            ))

        except Exception:
            pass

    AR_RAW   = (settings.get("ar_control_code") or "").strip()
    VAT_RAW  = (settings.get("vat_output_code") or "").strip()
    DISC_RAW = (settings.get("sales_discount_code") or "").strip()

    # ---------- 2) Auto-backfill if missing ----------
    if not AR_RAW or not VAT_RAW or not DISC_RAW:
        _ensure_control_defaults_if_missing()
        settings = db_service.get_company_account_settings(company_id) or {}
        AR_RAW   = (settings.get("ar_control_code") or "").strip()
        VAT_RAW  = (settings.get("vat_output_code") or "").strip()
        DISC_RAW = (settings.get("sales_discount_code") or "").strip()

    # ---------- 3) Validate ----------
    if not AR_RAW:
        raise ValueError("AR control account not set. Set public.company_account_settings.ar_control_code")
    if not VAT_RAW:
        raise ValueError("VAT output account not set. Set public.company_account_settings.vat_output_code")

    # ✅ Resolve to POSTING codes
    ar_row  = db_service.get_account_row_for_posting(company_id, AR_RAW)
    vat_row = db_service.get_account_row_for_posting(company_id, VAT_RAW)

    if not ar_row:
        raise ValueError(f"AR control code '{AR_RAW}' not found in company COA (code/template_code).")
    if not vat_row:
        raise ValueError(f"VAT output code '{VAT_RAW}' not found in company COA (code/template_code).")

    AR_ACCOUNT  = (ar_row[1] or "").strip()
    VAT_ACCOUNT = (vat_row[1] or "").strip()

    if not AR_ACCOUNT:
        raise ValueError("AR control account resolved blank (check COA).")
    if not VAT_ACCOUNT:
        raise ValueError("VAT output account resolved blank (check COA).")

    # ---------- 4) Invoice lines ----------
    lines = inv.get("lines") or []
    if not lines:
        raise ValueError("Invoice has no lines")

    # ---------- IFRS 15 detection ----------
    revenue_contract_id = inv.get("revenue_contract_id")
    ifrs15_accounts = None
    settlement_pattern = ""

    if revenue_contract_id:
        ifrs15_accounts = db_service.resolve_ifrs15_accounts(company_id)

        contract = db_service.fetch_one(f"""
            SELECT payload_json
            FROM {db_service.company_schema(company_id)}.revenue_contracts
            WHERE id = %s
            LIMIT 1
        """, (int(revenue_contract_id),)) or {}

        payload_json = contract.get("payload_json") or {}
        if isinstance(payload_json, str):
            try:
                payload_json = json.loads(payload_json)
            except Exception:
                payload_json = {}

        settlement_pattern = (
            payload_json.get("settlement_pattern") or ""
        ).strip().lower()

    if ifrs15_accounts and not settlement_pattern:
        raise ValueError("Settlement pattern not set for revenue contract")

    def resolve_posting_code(raw_code: str) -> str:
        c = (raw_code or "").strip()
        if not c:
            raise ValueError("Missing account_code on invoice line")
        row = db_service.get_account_row_for_posting(company_id, c)
        if not row:
            raise ValueError(f"Account '{c}' not found in company COA (code/template_code).")
        code = (row[1] or "").strip()
        if not code:
            raise ValueError(f"Resolved posting code blank for '{c}'")
        return code

    # ---------- 5) Compute totals (gross before HEADER discount) ----------
    revenue_by_acct: dict[str, float] = {}

    net_gross = 0.0          # sum of line net BEFORE header discount
    vatable_gross = 0.0      # net portion that has VAT (vat_rate > 0)

    # Track VAT basis by rate in case you later support multiple VAT rates
    vatable_by_rate: dict[float, float] = {}

    for ln in lines:
        rev_code = resolve_posting_code(ln.get("account_code"))

        qty  = float(ln.get("quantity") or 0.0)
        up   = float(ln.get("unit_price") or 0.0)

        # line-level discount (already stored per line)
        disc_line = float(ln.get("discount_amount") or 0.0)
        rate = float(ln.get("vat_rate") or 0.0)

        net = max(0.0, (qty * up) - disc_line)
        net = money(net)

        net_gross += net
        revenue_by_acct[rev_code] = revenue_by_acct.get(rev_code, 0.0) + net

        if rate > 0:
            vatable_gross += net
            vatable_by_rate[rate] = money(vatable_by_rate.get(rate, 0.0) + net)

    net_gross = money(net_gross)
    vatable_gross = money(vatable_gross)

    # ---------- 6) Header discount (Option A) ----------
    # IMPORTANT: inv["discount_amount"] should be HEADER discount amount ONLY
    # (not line discounts) to avoid double-counting.
    # ---------- 6) Header discount (Option A) ----------
    disc_rate = float(inv.get("discount_rate") or 0.0)
    disc_rate = max(0.0, min(disc_rate, 1.0))

    # Header discount amount
    header_disc_amt = money(net_gross * disc_rate)

    # Clamp so discount never exceeds revenue
    header_disc_amt = max(0.0, min(header_disc_amt, net_gross))

    # ✅ Other charges / income (header-level adjustment)
    other_amt = float(inv.get("other_amount") or inv.get("other") or 0.0)
    other_amt = money(other_amt)

    # Allocate discount proportionally to vatable base
    disc_on_vatable_total = (
        money(header_disc_amt * (vatable_gross / net_gross))
        if net_gross > 0 else 0.0
    )

    # Recompute VAT after discount
    vat_total = 0.0

    if vatable_gross > 0 and header_disc_amt > 0:
        for rate, base in vatable_by_rate.items():
            share = (base / vatable_gross) if vatable_gross > 0 else 0.0
            disc_share = money(disc_on_vatable_total * share)
            base_after = money(max(0.0, base - disc_share))
            vat_total += money(base_after * (rate / 100.0))
    else:
        for rate, base in vatable_by_rate.items():
            vat_total += money(base * (rate / 100.0))

    vat_total = money(vat_total)

    # ✅ FINAL totals (corrected)
    net_after   = money(net_gross - header_disc_amt + other_amt)
    gross_total = money(net_after + vat_total)

    # ---------- 7) Resolve discount account (only if needed) ----------
    DISCOUNT_ACCOUNT = ""
    if header_disc_amt > 0:
        if not DISC_RAW:
            raise ValueError("Sales discount account not set. Set public.company_account_settings.sales_discount_code")
        disc_row = db_service.get_account_row_for_posting(company_id, DISC_RAW)
        if not disc_row:
            raise ValueError(f"Sales discount code '{DISC_RAW}' not found in company COA (code/template_code).")
        DISCOUNT_ACCOUNT = (disc_row[1] or "").strip()
        if not DISCOUNT_ACCOUNT:
            raise ValueError("Sales discount account resolved blank (check COA).")

    OTHER_ACCOUNT = ""
    if other_amt != 0:
        # try settings first (optional column you can add later in public.company_account_settings)
        other_raw = (settings.get("other_income_code") or "").strip()
        if other_raw:
            other_row = db_service.get_account_row_for_posting(company_id, other_raw)
            if other_row:
                OTHER_ACCOUNT = (other_row[1] or "").strip()

        # fallback to first revenue account used on invoice
        if not OTHER_ACCOUNT and revenue_by_acct:
            OTHER_ACCOUNT = next(iter(revenue_by_acct.keys()))

    # ---------- 8) Build journal lines ----------
    # Dr AR = gross after discount + VAT after discount
    jlines = [{"account_code": AR_ACCOUNT, "dc": "D", "amount": gross_total}]

    remaining_contract_asset = 0.0

    if ifrs15_accounts and revenue_contract_id:
        contract = db_service.fetch_one(f"""
            SELECT COALESCE(contract_asset_balance,0) AS ca
            FROM {db_service.company_schema(company_id)}.revenue_contracts
            WHERE id = %s
            LIMIT 1
        """, (int(revenue_contract_id),)) or {}

        remaining_contract_asset = money(contract.get("ca") or 0.0)
        
    # Cr Revenue = gross revenue before header discount (per account)
    for acct, amt in revenue_by_acct.items():
        amt = money(amt)
        if not amt:
            continue

        # 🔥 IFRS 15 override
        if ifrs15_accounts:
            invoice_amt = amt

            if remaining_contract_asset > 0:
                clear_amt = min(remaining_contract_asset, invoice_amt)
                clear_amt = money(clear_amt)

                if clear_amt > 0:
                    jlines.append({
                        "account_code": ifrs15_accounts["contract_asset_account"],
                        "dc": "C",
                        "amount": clear_amt
                    })

                remaining = money(invoice_amt - clear_amt)
                remaining_contract_asset = money(remaining_contract_asset - clear_amt)

                if remaining > 0:
                    jlines.append({
                        "account_code": ifrs15_accounts["contract_liability_account"],
                        "dc": "C",
                        "amount": remaining
                    })
            else:
                jlines.append({
                    "account_code": ifrs15_accounts["contract_liability_account"],
                    "dc": "C",
                    "amount": invoice_amt
                })

            continue

        # ✅ NORMAL REVENUE (NO CONTRACT)
        jlines.append({
            "account_code": acct,
            "dc": "C",
            "amount": amt
        })
    
    # ✅ Other income/charges line
    if other_amt != 0:
        if not OTHER_ACCOUNT:
            raise ValueError("other_amount present but could not resolve OTHER_ACCOUNT (set company_account_settings.other_income_code).")

        if other_amt > 0:
            jlines.append({"account_code": OTHER_ACCOUNT, "dc": "C", "amount": other_amt})
        else:
            # negative other means a reduction (debit)
            jlines.append({"account_code": OTHER_ACCOUNT, "dc": "D", "amount": abs(other_amt)})

    # Dr Discount (revenue adjustment) = header discount
    if header_disc_amt > 0:
        jlines.append({"account_code": DISCOUNT_ACCOUNT, "dc": "D", "amount": header_disc_amt})

    # Cr VAT output = VAT after discount
    if vat_total:
        jlines.append({"account_code": VAT_ACCOUNT, "dc": "C", "amount": vat_total})

    # ---------- 9) Balance check ----------
    debits  = sum(money(x["amount"]) for x in jlines if x["dc"] == "D")
    credits = sum(money(x["amount"]) for x in jlines if x["dc"] == "C")
    if money(debits - credits) != 0.0:
        raise ValueError(f"Journal not balanced (D={debits}, C={credits})")

    return {
        "lines": jlines,
        "ar_account": AR_ACCOUNT,
        "vat_account": VAT_ACCOUNT,
        "discount_account": DISCOUNT_ACCOUNT or None,
        "ar_raw": AR_RAW,
        "vat_raw": VAT_RAW,
        "discount_raw": DISC_RAW,
        "totals": {
            "net_gross": net_gross,
            "header_discount": header_disc_amt,
            "vat_total": vat_total,
            "gross_total": gross_total,
        }
    }

