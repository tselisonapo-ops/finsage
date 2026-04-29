from flask import Blueprint, request, jsonify, g, current_app, make_response
from sqlalchemy import String
import psycopg2
from BackEnd.Services.auth_middleware import _corsify, require_auth
from .invoice_routes import _deny_if_wrong_company
from BackEnd.Services.credit_policy import (
                                            should_auto_post_bill, 
                                            can_post_bills, 
                                            can_release_payment, 
                                            can_approve_payment, 
                                            can_prepare_payment,
                                            normalize_policy_mode

                            )
from BackEnd.Services.company import company_policy
from BackEnd.Services.db_service import db_service
from BackEnd.Services.assets.ppe_db import get_conn
from BackEnd.Services.assets import service as ppe_service
from BackEnd.Services.assets import posting as asset_posting

# import your helpers: _corsify, _deny_if_wrong_company, db_service

ap_bp = Blueprint("ap", __name__)

def build_bill_journal_lines(bill: dict, company_id: int) -> dict:
    if bill is None or not isinstance(bill, dict):
        raise TypeError("Bill must be a dict")

    from decimal import Decimal, ROUND_HALF_UP

    def money(x) -> float:
        return float(Decimal(str(x or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    def resolve_control_posting_code(company_id: int, setting_value: str, label: str) -> str:
        val = (setting_value or "").strip()
        if not val:
            raise ValueError(f"{label} control not set (public.company_account_settings)")

        row = db_service.get_account_row_for_posting(company_id, val)
        if not row:
            raise ValueError(f"{label} control '{val}' not found in COA")

        code = (row[1] or "").strip()
        if not code:
            raise ValueError(f"{label} control resolved blank posting code")
        return code

    def resolve_posting_code(raw_code: str) -> str:
        k = (raw_code or "").strip()
        if not k:
            raise ValueError("Missing account_code on bill line")
        row = db_service.get_account_row_for_posting(company_id, k)
        if not row:
            raise ValueError(f"Account '{k}' not found in COA")
        posting_code = (row[1] or "").strip()
        if not posting_code:
            raise ValueError(f"Resolved posting code blank for '{k}'")
        return posting_code

    # -----------------------------
    # 0) Enforce vendor invoice number (traceability)
    # -----------------------------
    st = (bill.get("status") or "draft").strip().lower()
    if st in {"approved", "posted"}:
        if not (bill.get("number") or "").strip():
            raise ValueError("VENDOR_INVOICE_NUMBER_REQUIRED|Vendor invoice number is required before approving/posting this bill")

    asset_acq_id = bill.get("asset_acquisition_id")
    if asset_acq_id:
        schema = f"company_{int(company_id)}"
        try:
            acq_rows = db_service.fetch_all(
                f"""
                SELECT id, asset_id, funding_source, posted_journal_id
                FROM {schema}.asset_acquisitions
                WHERE company_id=%s AND id=%s
                LIMIT 1
                """,
                (int(company_id), int(asset_acq_id)),
            ) or []
        except Exception:
            acq_rows = []

        acq = acq_rows[0] if acq_rows else None
        if acq:
            funding = (acq.get("funding_source") or "").strip().lower()
            if funding == "vendor_credit":
                raise ValueError(
                    "ASSET_ACQUISITION_LINKED|Vendor-credit asset bills must post via asset acquisition, not normal AP bill journal."
                )
    # -----------------------------
    # 1) Controls
    # -----------------------------
    settings = db_service.get_company_account_settings(company_id) or {}
    AP_ACCOUNT  = resolve_control_posting_code(company_id, settings.get("ap_control_code"), "AP")
    VAT_ACCOUNT = resolve_control_posting_code(company_id, settings.get("vat_input_code"), "VAT input")

    # GRNI control (fallback to ppv_control_code if you used it earlier)
    grni_raw = (settings.get("grni_control_code") or settings.get("ppv_control_code") or "").strip()
    GRNI_ACCOUNT = None
    if grni_raw:
        try:
            GRNI_ACCOUNT = resolve_control_posting_code(company_id, grni_raw, "GRNI")
        except Exception:
            GRNI_ACCOUNT = None  # allow non-inventory bills to still work

    # -----------------------------
    # 2) Bill lines + totals
    # -----------------------------
    lines = bill.get("lines") or []
    if not lines:
        raise ValueError("Bill has no lines")

    disc_amt  = money(bill.get("discount_amount") or 0.0)
    other_amt = money(bill.get("other_amount") or bill.get("other") or 0.0)

    by_acct_gross: dict[str, float] = {}
    subtotal_net = 0.0
    vatable_by_rate: dict[float, float] = {}

    # IMPORTANT: use NET = qty*unit_price (line discounts already baked into stored net_amount in DB;
    # if you want to respect stored net_amount, prefer it when present.)
    for ln in lines:
        acct = resolve_posting_code(ln.get("account_code"))

        qty  = float(ln.get("quantity") or 0.0)
        up   = float(ln.get("unit_price") or 0.0)
        rate = float(ln.get("vat_rate") or 0.0)

        net = ln.get("net_amount")
        if net is None:
            net = money(max(0.0, qty * up))
        else:
            net = money(net)

        subtotal_net = money(subtotal_net + net)
        by_acct_gross[acct] = money(by_acct_gross.get(acct, 0.0) + net)

        if rate > 0:
            vatable_by_rate[rate] = money(vatable_by_rate.get(rate, 0.0) + net)

    disc_amt = max(0.0, min(disc_amt, subtotal_net))

    # Allocate header discount + other across accounts (keeps your current behavior)
    by_acct_after: dict[str, float] = {}
    for acct, amt in by_acct_gross.items():
        share = (amt / subtotal_net) if subtotal_net > 0 else 0.0
        disc_share  = money(disc_amt * share)
        other_share = money(other_amt * share) if other_amt != 0 else 0.0
        by_acct_after[acct] = money(max(0.0, amt - disc_share) + other_share)

    # VAT computed on discounted base (other does NOT affect VAT in your earlier approach)
    vat_total = 0.0
    if subtotal_net > 0:
        for rate, base in vatable_by_rate.items():
            share = (base / subtotal_net) if subtotal_net > 0 else 0.0
            disc_share = money(disc_amt * share)
            base_after = money(max(0.0, base - disc_share))
            vat_total = money(vat_total + money(base_after * (rate / 100.0)))
    vat_total = money(vat_total)

    net_after   = money(max(0.0, subtotal_net - disc_amt + other_amt))
    gross_total = money(net_after + vat_total)

    # -----------------------------
    # 3) Pull GRNI links (if any)
    # -----------------------------
    schema = f"company_{int(company_id)}"

    grni_links = bill.get("grni_links")
    if grni_links is None and bill.get("id"):
        # DB fallback
        try:
            grni_links = db_service.fetch_all(
                f"""
                SELECT receipt_tx_id, amount
                FROM {schema}.bill_grni_links
                WHERE company_id=%s AND bill_id=%s
                """,
                (int(company_id), int(bill["id"])),
            ) or []
        except Exception:
            grni_links = []
    if not isinstance(grni_links, list):
        grni_links = []

    grni_linked_amt = money(sum(float(x.get("amount") or 0.0) for x in grni_links)) if grni_links else 0.0

    # Goods base after discount but BEFORE "other"
    goods_net_after_discount = money(max(0.0, subtotal_net - disc_amt))

    # If links exist, GRNI must be configured
    if grni_linked_amt > 0 and not GRNI_ACCOUNT:
        raise ValueError("GRNI_NOT_CONFIGURED|set grni_control_code in public.company_account_settings")

    # Safety: linked amount cannot exceed goods portion (exclude other charges)
    if grni_linked_amt > goods_net_after_discount + 0.0001:
        raise ValueError(
            f"GRNI_LINK_EXCEEDS_GOODS|linked={grni_linked_amt} goods_net_after_discount={goods_net_after_discount}"
        )

    # -----------------------------
    # 4) Build journal lines
    # -----------------------------
    jlines: list[dict] = []

    # helper: detect inventory-ish lines (requires UI to send item_type; otherwise treat as expense)
    def _is_inventory_line(ln: dict) -> bool:
        # 1) explicit flag if present
        item_type = str(ln.get("item_type") or "").strip().lower()
        if item_type:
            return item_type == "inventory"

        # 2) reliable fallback: if the line posts to GRNI control account, it's inventory
        try:
            acct = resolve_posting_code(ln.get("account_code"))
            if GRNI_ACCOUNT and acct == GRNI_ACCOUNT:
                return True
        except Exception:
            pass

        # 3) optional extra fallback
        if ln.get("item_id") or ln.get("sku"):
            return True

        return False

    if grni_linked_amt > 0:
        # A) Dr GRNI for matched receipts (goods only, EX VAT)
        jlines.append({
            "account_code": GRNI_ACCOUNT,
            "dc": "D",
            "amount": money(grni_linked_amt),
        })

        # ✅ If this bill is basically ONLY the GRN goods (no extra service/charge lines),
        # then DO NOT debit expense lines again (otherwise you double-debit and go unbalanced).
        net_after_discount = money(max(0.0, subtotal_net - disc_amt))  # goods base before "other"
        pure_grni_bill = abs(net_after_discount - money(grni_linked_amt)) <= 0.01

        if not pure_grni_bill:
            # B) Dr ONLY non-inventory expenses (services/charges)
            non_inv_totals: dict[str, float] = {}
            for ln in lines:
                if _is_inventory_line(ln):
                    continue

                acct = resolve_posting_code(ln.get("account_code"))
                net = ln.get("net_amount")
                if net is None:
                    qty = float(ln.get("quantity") or 0.0)
                    up  = float(ln.get("unit_price") or 0.0)
                    net = money(max(0.0, qty * up))
                else:
                    net = money(net)

                if net > 0:
                    non_inv_totals[acct] = money(non_inv_totals.get(acct, 0.0) + net)

            # Optional: if you want "other" to post as an expense, add it here
            # non_inv_totals[DEFAULT_OTHER_ACCOUNT] = money(non_inv_totals.get(DEFAULT_OTHER_ACCOUNT, 0.0) + other_amt)

            for acct, amt in non_inv_totals.items():
                if amt > 0:
                    jlines.append({"account_code": acct, "dc": "D", "amount": money(amt)})

    else:
        # No GRNI => expense-style posting (your existing logic)
        for acct, amt in by_acct_after.items():
            amt = money(amt)
            if amt != 0.0:
                jlines.append({"account_code": acct, "dc": "D", "amount": amt})

    # VAT input
    if vat_total:
        jlines.append({"account_code": VAT_ACCOUNT, "dc": "D", "amount": money(vat_total)})

    # AP credit
    jlines.append({"account_code": AP_ACCOUNT, "dc": "C", "amount": money(gross_total)})

    # -----------------------------
    # 5) Balance check
    # -----------------------------
    print("---- BILL POST DEBUG ----")
    print("grni_linked_amt:", grni_linked_amt)
    print("vat_total:", vat_total)
    print("gross_total:", gross_total)
    print("jlines:", jlines)

    debits  = money(sum(money(x["amount"]) for x in jlines if x.get("dc") == "D"))
    credits = money(sum(money(x["amount"]) for x in jlines if x.get("dc") == "C"))
    if money(debits - credits) != 0.0:
        raise ValueError(f"Bill journal not balanced (D={debits}, C={credits})")

    return {
        "lines": jlines,
        "ap_account": AP_ACCOUNT,
        "vat_account": VAT_ACCOUNT,
        "grni_account": GRNI_ACCOUNT,
        "totals": {
            "subtotal_net": subtotal_net,
            "discount_amount": disc_amt,
            "other_amount": other_amt,
            "goods_net_after_discount": goods_net_after_discount,
            "grni_linked": grni_linked_amt,
            "vat_total": vat_total,
            "gross_total": gross_total,
        },
    }

def post_bill_with_asset_awareness(company_id: int, bill_id: int, payload: dict | None = None):
    bill = db_service.get_bill_full(company_id, bill_id)
    if not bill:
        raise Exception("Bill not found")

    number = (bill.get("number") or "").strip()
    if not number:
        raise Exception("Vendor invoice number is required before posting")

    asset_id = bill.get("asset_id")
    asset_acq_id = bill.get("asset_acquisition_id")

    # --------------------------------------------------
    # Asset-linked flow
    # --------------------------------------------------
    if asset_id and asset_acq_id:
        with get_conn(company_id) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                acq = ppe_service.get_acquisition(cur, company_id, int(asset_acq_id))
                if not acq:
                    raise Exception("Linked asset acquisition not found")

                if int(acq.get("asset_id") or 0) != int(asset_id):
                    raise Exception("Bill asset_id does not match linked acquisition asset_id")

                funding = (acq.get("funding_source") or "").strip().lower()
                already_posted = bool(acq.get("posted_journal_id"))

                # vendor_credit -> use acquisition posting as source of truth
                if funding == "vendor_credit":
                    if already_posted:
                        raise Exception(
                            "Linked vendor-credit asset acquisition is already posted. Normal bill GL posting is blocked."
                        )

                    ppe_service.patch_acquisition_posting_fields(
                        cur,
                        company_id,
                        int(asset_acq_id),
                        posting_date=bill.get("bill_date"),
                        reference=number or None,
                    )

                    user = getattr(g, "current_user", {}) or {}
                    jid = asset_posting.post_acquisition(
                        cur,
                        company_id,
                        int(asset_acq_id),
                        user=user,
                    )

                    schema = f"company_{int(company_id)}"
                    cur.execute(f"""
                        UPDATE {schema}.bills
                        SET status='approved',
                            notes = COALESCE(notes, '') || CASE
                                WHEN COALESCE(notes, '') = '' THEN ''
                                ELSE E'\n'
                            END || %s,
                            updated_at=NOW()
                        WHERE id=%s
                    """, (
                        f"Linked to asset acquisition {asset_acq_id}; GL posted via acquisition journal {jid}.",
                        int(bill_id),
                    ))

                    conn.commit()

                    return {
                        "journal_id": int(jid),
                        "mode": "asset_acquisition",
                        "asset_id": int(asset_id),
                        "asset_acquisition_id": int(asset_acq_id),
                    }

                # grni -> continue into normal AP flow
                elif funding == "grni":
                    pass

    # --------------------------------------------------
    # Normal / GRNI bill flow
    # --------------------------------------------------
    settings = db_service.get_company_account_settings(company_id) or {}
    grni_raw = (settings.get("grni_control_code") or settings.get("ppv_control_code") or "").strip()

    links = bill.get("grni_links") or []
    has_grni_rows = isinstance(links, list) and len(links) > 0
    linked_amt = sum(float(x.get("amount") or 0) for x in links)

    # Enforce GRNI matching only for bills that actually carry GRNI link rows.
    # Normal AP bills must not be blocked just because a GRNI account exists in settings.
    if grni_raw and has_grni_rows and linked_amt <= 0:
        raise Exception("Link this bill to a Goods Receipt (GRNI) before posting.")
    
    built = build_bill_journal_lines(bill, company_id)
    jid = db_service.post_bill_to_gl(company_id, bill_id, jlines=built["lines"])

    return {
        "journal_id": int(jid),
        "mode": "normal_bill",
        "built": built,
    }

def vendor_compliance_check(company_id: int, vendor_id: int, *, cur=None) -> dict:
    """
    Returns vendor compliance assessment + docs status.

    - required_docs: comes from vendors.missing_docs (your UI checkboxes)
    - strict_missing: docs not satisfied under strict rule (typically approved-only)
    - assisted_missing: docs not satisfied under assisted rule (uploaded OR approved counts)
    """
    v = db_service.get_vendor_by_id(company_id, vendor_id, cur=cur) or {}

    required_docs = v.get("missing_docs") or []
    # required_docs can be JSON string depending on fetch behavior
    if isinstance(required_docs, str):
        import json
        required_docs = json.loads(required_docs) if required_docs else []
    required_docs = [
        str(x).strip().lower()
        for x in (required_docs or [])
        if str(x).strip()
    ]

    docs = db_service.list_vendor_documents(company_id, vendor_id, cur=cur) or []

    # Build sets of doc_types we "have"
    have_uploaded_or_approved = set()
    have_approved_only = set()

    for d in docs:
        dt = str(d.get("doc_type") or "").strip().lower()
        st = str(d.get("status") or "").strip().lower()
        if not dt:
            continue

        if st in {"uploaded", "approved"}:
            have_uploaded_or_approved.add(dt)

        if st == "approved":
            have_approved_only.add(dt)

    # Two missing sets (your “soften assisted” requirement)
    assisted_missing = [dt for dt in required_docs if dt not in have_uploaded_or_approved]
    strict_missing   = [dt for dt in required_docs if dt not in have_approved_only]

    compliance_required = bool(v.get("compliance_required", False))

    # Status is mostly informational; keep your current approach
    # If anything missing strictly -> not verified
    status = "verified" if not strict_missing else (v.get("compliance_status") or "draft")

    return {
        "vendor_id": int(vendor_id),
        "compliance_required": compliance_required,
        "required": required_docs,
        "missing_strict": strict_missing,
        "missing_assisted": assisted_missing,
        "status": status,
        # optional debug info (safe to remove if you want)
        "counts": {
            "docs_total": len(docs),
            "have_soft": len(have_uploaded_or_approved),
            "have_approved": len(have_approved_only),
        },
    }

@ap_bp.route("/api/companies/<int:company_id>/vendors", methods=["GET","POST","OPTIONS"])
@require_auth
def api_vendors(company_id: int):
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

    if request.method == "GET":
        include_inactive = request.args.get("include_inactive") == "1"
        rows = db_service.list_vendors(company_id, include_inactive=include_inactive) or []
        return jsonify({"ok": True, "data": rows}), 200

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "Vendor name is required"}), 400

    data.setdefault("is_active", True)

    try:
        vid = int(db_service.insert_vendor(company_id, data) or 0)
        if vid <= 0:
            raise ValueError("insert_vendor returned no id")
        vend = db_service.get_vendor(company_id, vid) or {}
        # ✅ AUDIT: vendor created
        try:
            actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or None
            db_service.audit_log(
                company_id,
                actor_user_id=actor_user_id,
                module="ap",
                action="create_vendor",
                severity="info",
                entity_type="vendor",
                entity_id=str(vid),
                entity_ref=vend.get("name") or name,
                before_json={},
                after_json={"vendor": vend},
                message=f"Created vendor: {vend.get('name') or name}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_vendors (POST)")

        return jsonify({"ok": True, "data": vend}), 201
    except Exception as ex:
        current_app.logger.exception("insert vendor failed")
        return jsonify({"ok": False, "error": "Failed to create vendor", "detail": str(ex)}), 500


@ap_bp.route("/api/companies/<int:company_id>/vendors/<int:vendor_id>", methods=["GET","PUT","DELETE","OPTIONS"])
@require_auth
def api_vendor_detail(company_id: int, vendor_id: int):
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

    if request.method == "GET":
        v = db_service.get_vendor(company_id, vendor_id)
        if not v:
            return jsonify({"ok": False, "error": "Vendor not found"}), 404
        return jsonify({"ok": True, "data": v}), 200

    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        before_v = db_service.get_vendor(company_id, vendor_id) or {}

        # Optional: auto-approve on save if you want (no KYC)
        # user_id = payload.get("user_id") or payload.get("sub")
        # if user_id and "approved_by_user_id" not in data:
        #     data["approved_by_user_id"] = int(user_id)

        try:
            ok = db_service.update_vendor(company_id, vendor_id, **data)
            if not ok:
                return jsonify({"ok": False, "error": "Vendor not found / not updated"}), 404
            v = db_service.get_vendor(company_id, vendor_id) or {}
            # ✅ AUDIT: vendor updated
            try:
                actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or None
                db_service.audit_log(
                    company_id,
                    actor_user_id=actor_user_id,
                    module="ap",
                    action="update_vendor",
                    severity="info",
                    entity_type="vendor",
                    entity_id=str(vendor_id),
                    entity_ref=v.get("name") or before_v.get("name"),
                    before_json={"vendor": before_v, "patch": data},
                    after_json={"vendor": v},
                    message=f"Updated vendor: {v.get('name') or vendor_id}",
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed in api_vendor_detail (PUT)")

            return jsonify({"ok": True, "data": v}), 200
        except Exception as ex:
            current_app.logger.exception("update vendor failed")
            return jsonify({"ok": False, "error": str(ex)}), 400

    # DELETE (soft by default)
    hard = request.args.get("hard") == "1"
    try:
        ok = db_service.delete_vendor(company_id, vendor_id, hard=hard)
        before_v = db_service.get_vendor(company_id, vendor_id) or {}
        if not ok:
            # ✅ AUDIT: vendor deleted/archived
            try:
                actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or None
                db_service.audit_log(
                    company_id,
                    actor_user_id=actor_user_id,
                    module="ap",
                    action="delete_vendor" if hard else "archive_vendor",
                    severity="info",
                    entity_type="vendor",
                    entity_id=str(vendor_id),
                    entity_ref=before_v.get("name"),
                    before_json={"vendor": before_v},
                    after_json={"hard": bool(hard)},
                    message=("Hard deleted vendor" if hard else "Archived vendor") + f": {before_v.get('name') or vendor_id}",
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed in api_vendor_detail (DELETE)")

            return jsonify({"ok": False, "error": "Vendor not found"}), 404
        return jsonify({"ok": True, "deleted": True, "hard": hard}), 200
    except Exception as ex:
        current_app.logger.exception("delete vendor failed")
        return jsonify({"ok": False, "error": str(ex)}), 400
    
@ap_bp.route("/api/companies/<int:company_id>/bills", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_bills(company_id: int):
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

    if request.method == "GET":
        statuses = request.args.getlist("status") or None
        vendor_id = request.args.get("vendor_id", type=int)
        limit = request.args.get("limit", default=200, type=int)
        rows = db_service.list_company_bills(company_id, statuses=statuses, vendor_id=vendor_id, limit=limit)
        return jsonify({"ok": True, "data": rows}), 200

    if request.method != "POST":
        return jsonify({"ok": False, "error": f"Method {request.method} not allowed"}), 405

    data = request.get_json(silent=True) or {}

    raw_header = data.get("header")
    if isinstance(raw_header, dict) and raw_header:
        header = dict(raw_header)
    else:
        header = {
            "vendor_id": data.get("vendor_id"),
            "bill_date": data.get("bill_date"),
            "due_date": data.get("due_date"),
            "currency": data.get("currency"),
            "notes": data.get("notes"),
            "status": data.get("status"),
            "number": data.get("number"),
            "other_amount": data.get("other_amount"),
            "discount_amount": data.get("discount_amount"),
            "discount_rate": data.get("discount_rate"),
            "asset_id": data.get("asset_id"),
            "asset_acquisition_id": data.get("asset_acquisition_id"),
            "posting_mode": data.get("posting_mode"),
        }

    lines = data.get("lines") or []
    grni_links = data.get("grni_links") or []

    if "other_amount" in header and "other" not in header:
        header["other"] = header.get("other_amount")

    if "discount" in header and "discount_amount" not in header:
        header["discount_amount"] = header.get("discount")

    def _to_float(v, d=0.0):
        try:
            return float(v if v is not None else d)
        except Exception:
            return d

    header["other"] = _to_float(header.get("other"), 0.0)
    header["discount_amount"] = _to_float(header.get("discount_amount"), 0.0)
    header["discount_rate"] = _to_float(header.get("discount_rate"), 0.0)

    vendor_id = header.get("vendor_id")
    if vendor_id in (None, ""):
        return jsonify({"ok": False, "error": "vendor_id is required"}), 400

    if not header.get("bill_date"):
        return jsonify({"ok": False, "error": "bill_date is required"}), 400

    if not isinstance(lines, list) or not lines:
        return jsonify({"ok": False, "error": "At least one bill line is required"}), 400

    try:
        header["vendor_id"] = int(vendor_id)
    except Exception:
        return jsonify({"ok": False, "error": f"vendor_id must be an integer, got {vendor_id!r}"}), 400

    try:
        if header.get("asset_id") not in (None, "", 0, "0"):
            header["asset_id"] = int(header["asset_id"])
        else:
            header["asset_id"] = None

        if header.get("asset_acquisition_id") not in (None, "", 0, "0"):
            header["asset_acquisition_id"] = int(header["asset_acquisition_id"])
        else:
            header["asset_acquisition_id"] = None
    except Exception:
        return jsonify({
            "ok": False,
            "error": "asset_id and asset_acquisition_id must be integers when provided"
        }), 400

    number = (header.get("number") or "").strip()
    bill_status = (header.get("status") or "draft").strip().lower()

    if bill_status != "draft" and not number:
        return jsonify({"ok": False, "error": "Vendor invoice number is required before approving/posting"}), 400

    dup = db_service.find_duplicate_vendor_bill_number(
        company_id=company_id,
        vendor_id=header["vendor_id"],
        number=number,
        exclude_bill_id=None,
    )

    if dup:
        dup_status = (dup.get("status") or "").strip().lower()

        # Allow reuse if previous bill is reversed
        if dup_status not in ("draft", "void", "written_off", "reversed"):
            return jsonify({
                "ok": False,
                "error": "This vendor invoice number already exists for that vendor",
                "duplicate_bill_id": dup.get("id"),
                "duplicate_status": dup_status,
            }), 409

    explicit_draft = (bill_status == "draft")

    pol = company_policy(company_id)
    mode = pol["mode"]
    policy = pol["policy"] or {}
    company_profile = pol["company"] or {}

    if (not explicit_draft) and should_auto_post_bill(mode, policy):
        bill_status = "approved"

    header["status"] = bill_status

    is_asset_acq_bill = (
        header.get("asset_id") not in (None, "", 0, "0")
        and header.get("asset_acquisition_id") not in (None, "", 0, "0")
        and str(header.get("posting_mode") or "").strip().lower() == "asset_acquisition"
    )

    try:
        bid = db_service.insert_bill_with_lines(company_id, header, lines)
        db_service.ensure_bill_grni_link_table(company_id)
        db_service.replace_bill_grni_links(company_id, bid, grni_links)

        try:
            actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or None
            after_bill = db_service.get_bill_full(company_id, bid) or {}
            db_service.audit_log(
                company_id,
                actor_user_id=actor_user_id,
                module="ap",
                action="create_bill",
                severity="info",
                entity_type="bill",
                entity_id=str(bid),
                entity_ref=after_bill.get("number") or header.get("number") or f"BILL-{bid}",
                before_json={"input": {"header": header, "lines_count": len(lines), "grni_links": grni_links}},
                after_json={"bill": after_bill},
                message=f"Created bill {after_bill.get('number') or bid}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_bills (POST)")

        if is_asset_acq_bill:
            out = db_service.get_bill_full(company_id, bid) or {}

            asset_journal_id = out.get("posted_journal_id")

            # Better: link bill to acquisition journal if available
            db_service.mark_asset_bill_as_accounted_via_acquisition(
                company_id,
                bid,
                asset_acquisition_id=header.get("asset_acquisition_id"),
            )

            out = db_service.get_bill_full(company_id, bid) or {}
            out["_posting_mode"] = "asset_acquisition"
            out["_posting_skipped"] = True
            out["_skip_reason"] = "GL already handled by asset acquisition journal."
            return jsonify({"ok": True, "data": out}), 201

        if explicit_draft:
            out = db_service.get_bill_full(company_id, bid) or {}
            return jsonify({"ok": True, "data": out}), 201

        if should_auto_post_bill(mode, policy):
            user = getattr(g, "current_user", {}) or {}
            if not can_post_bills(user, company_profile, mode):
                return jsonify({"ok": False, "error": "Not allowed to post bills"}), 403

            result = post_bill_with_asset_awareness(company_id, bid, payload)

            out = db_service.get_bill_full(company_id, bid) or {}
            out["_posted_journal_id"] = result.get("journal_id")
            out["_posting_mode"] = result.get("mode")

            try:
                actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or None
                db_service.audit_log(
                    company_id,
                    actor_user_id=actor_user_id,
                    module="ap",
                    action="post_bill",
                    severity="info",
                    entity_type="bill",
                    entity_id=str(bid),
                    entity_ref=out.get("number") or f"BILL-{bid}",
                    before_json={},
                    after_json={"posted_journal_id": int(result.get("journal_id") or 0)},
                    message=f"Posted bill {out.get('number') or bid}",
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed in api_bills (POST auto-post)")

            return jsonify({"ok": True, "data": out}), 201

        out = db_service.get_bill_full(company_id, bid) or {}
        return jsonify({"ok": True, "data": out}), 201

    except Exception as ex:
        current_app.logger.exception("create bill failed")
        return jsonify({"ok": False, "error": str(ex)}), 400
    
@ap_bp.route("/api/companies/<int:company_id>/bills/<int:bill_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def api_bill_post(company_id: int, bill_id: int):
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

    try:
        bill = db_service.get_bill_full(company_id, bill_id)
        if not bill:
            return jsonify({"ok": False, "error": "Bill not found"}), 404

        # ==========================================================
        # APPROVAL GATE: Bill posting
        # Assisted / Controlled + AP review enabled
        # ==========================================================
        pol = company_policy(company_id)
        mode = (pol.get("mode") or "owner_managed").strip().lower()
        policy = pol.get("policy") or {}

        ap_review_enabled = bool(
            policy.get("ap_review_enabled", False)
            or policy.get("bill_review_enabled", False)
            or policy.get("require_bill_review", False)
        )

        if mode in {"assisted", "controlled"} and ap_review_enabled:
            payload_jwt = getattr(request, "jwt_payload", {}) or {}
            actor_user_id = int(payload_jwt.get("user_id") or payload_jwt.get("sub") or 0)

            entity_type = "bill"
            entity_id = str(bill_id)
            module = "ap"
            action = "post_bill"
            dedupe_key = f"{company_id}:{module}:{action}:{entity_type}:{entity_id}"

            req = db_service.create_approval_request(
                company_id,
                entity_type=entity_type,
                entity_id=entity_id,
                entity_ref=bill.get("number") or f"BILL-{bill_id}",
                module=module,
                action=action,
                requested_by_user_id=int(actor_user_id),
                amount=float(bill.get("total_amount") or 0.0),
                currency=bill.get("currency"),
                risk_level="medium",
                dedupe_key=dedupe_key,
                payload_json={"bill": {"id": bill_id}},
            )

            return jsonify({"ok": False, "error": "APPROVAL_REQUIRED", "approval_request": req}), 202

        result = post_bill_with_asset_awareness(company_id, bill_id, payload)

        try:
            actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or None
            db_service.audit_log(
                company_id,
                actor_user_id=actor_user_id,
                module="ap",
                action="post_bill",
                severity="info",
                entity_type="bill",
                entity_id=str(bill_id),
                entity_ref=bill.get("number") or f"BILL-{bill_id}",
                before_json={"status": bill.get("status")},
                after_json={"journal_id": int(result.get("journal_id") or 0), "mode": result.get("mode")},
                message=f"Posted bill {bill.get('number') or bill_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_bill_post")

        return jsonify({
            "ok": True,
            **result
        }), 200

    except Exception as ex:
        current_app.logger.exception("post bill failed")
        return jsonify({"ok": False, "error": str(ex)}), 400
        
@ap_bp.route("/api/companies/<int:company_id>/bills/<int:bill_id>", methods=["GET", "PUT", "OPTIONS"])
@require_auth
def api_bill_detail(company_id: int, bill_id: int):
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

    # --------------------------
    # Load bill once (GET + PUT rules)
    # --------------------------
    bill = db_service.get_bill_full(company_id, bill_id)
    before_bill = bill  # already loaded above
    if not bill:
        return jsonify({"ok": False, "error": "Bill not found"}), 404

    current_status = str(bill.get("status") or "").lower().strip()

    # --------------------------
    # GET (read / review)
    # --------------------------
    if request.method == "GET":
        # ✅ allow viewing for ANY status
        return jsonify({"ok": True, "data": bill}), 200

    # --------------------------
    # PUT (update)
    # --------------------------
    if request.method != "PUT":
        return jsonify({"ok": False, "error": f"Method {request.method} not allowed"}), 405

    # ✅ block edits only (not viewing)
    if current_status in {"posted", "paid", "pending_review"}:
        return jsonify({"ok": False, "error": f"Bill is {current_status} and cannot be edited"}), 409

    data = request.get_json(silent=True) or {}
    header = data.get("header") or {}
    lines  = data.get("lines") or []
    grni_links = data.get("grni_links") or []

    # ============================
    # ✅ NORMALIZE UI FIELD NAMES
    # ============================
    if "other_amount" in header and "other" not in header:
        header["other"] = header.get("other_amount")

    if "discount" in header and "discount_amount" not in header:
        header["discount_amount"] = header.get("discount")

    def _to_float(v, d=0.0):
        try:
            return float(v if v is not None else d)
        except Exception:
            return d

    header["other"] = _to_float(header.get("other"), 0.0)
    header["discount_amount"] = _to_float(header.get("discount_amount"), 0.0)
    header["discount_rate"] = _to_float(header.get("discount_rate"), 0.0)

    # --------------------------
    # Validation
    # --------------------------
    if not header.get("vendor_id"):
        return jsonify({"ok": False, "error": "vendor_id is required"}), 400

    if not header.get("bill_date"):
        return jsonify({"ok": False, "error": "bill_date is required"}), 400

    if not isinstance(lines, list) or not lines:
        return jsonify({"ok": False, "error": "At least one bill line is required"}), 400

    number = (header.get("number") or "").strip()
    target_status = (header.get("status") or bill.get("status") or "draft").strip().lower()

    # allow blank only for draft
    if target_status != "draft" and not number:
        return jsonify({"ok": False, "error": "Vendor invoice number is required before approving/posting"}), 400

    # --------------------------
    # ✅ DUPLICATE CHECK (UPDATE – exclude THIS bill)
    # Allow duplicates only if the OTHER matching bill is draft (or void/written_off if you want)
    # --------------------------
    dup = db_service.find_duplicate_vendor_bill_number(
        company_id=company_id,
        vendor_id=header["vendor_id"],
        number=number,
        exclude_bill_id=bill_id,
    )

    if dup:
        dup_status = (dup.get("status") or "").strip().lower()

        if dup_status not in ("draft", "void", "written_off", "reversed"):
            return jsonify({
                "ok": False,
                "error": "This vendor invoice number already exists for that vendor",
                "duplicate_bill_id": dup.get("id"),
                "duplicate_status": dup_status,
            }), 409

    # --------------------------
    # Status rules (match create)
    # --------------------------
    bill_status = (header.get("status") or "draft").strip().lower()
    explicit_draft = (bill_status == "draft")

    pol = company_policy(company_id)
    mode = pol.get("mode")
    policy = pol.get("policy") or {}

    if (not explicit_draft) and should_auto_post_bill(mode, policy):
        bill_status = "approved"

    header["status"] = bill_status

    is_asset_acq_bill = (
        header.get("asset_id")
        and header.get("asset_acquisition_id")
        and str(header.get("posting_mode") or "").strip().lower() == "asset_acquisition"
    )

    try:
        ok = db_service.update_bill_with_lines(company_id, bill_id, header, lines)
        db_service.ensure_bill_grni_link_table(company_id)
        db_service.replace_bill_grni_links(company_id, bill_id, grni_links)                
        if not ok:
            return jsonify({"ok": False, "error": "Bill not found / not updated"}), 404

        out = db_service.get_bill_full(company_id, bill_id) or {}
        # ✅ AUDIT: bill updated
        try:
            actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or None
            db_service.audit_log(
                company_id,
                actor_user_id=actor_user_id,
                module="ap",
                action="update_bill",
                severity="info",
                entity_type="bill",
                entity_id=str(bill_id),
                entity_ref=out.get("number") or before_bill.get("number") or f"BILL-{bill_id}",
                before_json={"bill": before_bill, "patch": {"header": header, "lines_count": len(lines), "grni_links": grni_links}},
                after_json={"bill": out},
                message=f"Updated bill {out.get('number') or bill_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_bill_detail (PUT)")

        return jsonify({"ok": True, "data": out}), 200

    except Exception as ex:
        current_app.logger.exception("update bill failed")
        return jsonify({"ok": False, "error": str(ex)}), 400

@ap_bp.route(
    "/api/companies/<int:company_id>/ap/bills/<int:bill_id>/allocate_payment",
    methods=["POST", "OPTIONS"],
)
@require_auth
def allocate_bill_payment(company_id: int, bill_id: int):
    from decimal import Decimal
    from datetime import datetime

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

    try:
        # -----------------------------
        # Validate inputs
        # -----------------------------
        amount = Decimal(str(data.get("amount") or "0")).quantize(Decimal("0.01"))
        if amount <= Decimal("0.00"):
            raise ValueError("Allocation amount must be > 0")

        payment_id = int(data.get("payment_id") or 0)
        if payment_id <= 0:
            raise ValueError("payment_id is required")

        user_id = payload.get("user_id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None

        # -----------------------------
        # Load bill early (needed for approval request + validation)
        # -----------------------------
        bill = db_service.get_bill_by_id(int(company_id), int(bill_id))
        if not bill:
            raise ValueError("Bill not found")

        bill_vendor_id = int(bill.get("vendor_id") or 0)
        if not bill_vendor_id:
            raise ValueError("Bill missing vendor_id")

        bill_status = str(bill.get("status") or "").strip().lower()
        if bill_status in {"void", "cancelled", "written_off"}:
            raise ValueError(f"Cannot allocate payment to bill in status '{bill_status}'")

        # ==========================================================
        # APPROVAL GATE: Bill allocation
        # - Controlled: always goes to approvals (unless you later add owner bypass)
        # - Assisted: goes to approvals when ap_review_enabled, BUT owner bypasses
        # - Owner-managed: no approvals
        # ==========================================================
        cp = company_policy(company_id) or {}
        mode = str(cp.get("mode") or "owner_managed").strip().lower()
        policy = cp.get("policy") or {}
        company_profile = cp.get("company") or {}

        ap_review_enabled = bool(cp.get("ap_review_enabled", False))  # ✅ already computed by company_policy()

        user = getattr(g, "current_user", None) or {}
        owner_user_id = company_profile.get("owner_user_id")
        is_owner = owner_user_id is not None and str(owner_user_id) == str(user.get("id"))

        review_required = (
            (mode == "controlled")
            or (mode == "assisted" and ap_review_enabled and not is_owner)
        )

        if review_required:
            payload_jwt = getattr(request, "jwt_payload", {}) or {}
            actor_user_id = int(payload_jwt.get("user_id") or payload_jwt.get("sub") or 0) or None

            # ✅ dedupe per bill+payment+amount (double-click safe)
            amt_key = str(amount)  # already quantized to 0.01
            dedupe_key = f"{company_id}:ap:allocate_bill_payment:bill:{bill_id}:pay:{payment_id}:amt:{amt_key}"

            # ✅ Load payment draft to include prefill fields
            pay = db_service.get_vendor_payment_by_id(int(company_id), int(payment_id)) or {}

            payload_json = {
                "bill_id": int(bill_id),
                "payment_id": int(payment_id),
                "amount": str(amount),

                # ✅ payment draft fields to prefill UI
                "payment_date": (pay.get("payment_date") or ""),
                "bank_account_id": (pay.get("bank_account_id") or ""),
                "reference": (pay.get("reference") or ""),
                "description": (pay.get("description") or ""),

                # ✅ WHT
                "wht_rate": (pay.get("wht_rate") or ""),
                "wht_amount": (pay.get("wht_amount") or ""),
                "wht_ledger_code": (pay.get("wht_ledger_code") or ""),
                "wht_reason": (pay.get("wht_reason") or ""),
            }

            req = db_service.create_approval_request(
                company_id,
                entity_type="bill",
                entity_id=str(bill_id),
                entity_ref=bill.get("number") or f"BILL-{bill_id}",
                module="ap",
                action="allocate_bill_payment",
                requested_by_user_id=int(actor_user_id or 0),
                amount=float(amount),
                currency=bill.get("currency"),
                risk_level="low" if mode == "assisted" else "medium",
                dedupe_key=dedupe_key,
                payload_json=payload_json,  # ✅ USE THE FULL PAYLOAD
            )
            return jsonify({"ok": False, "error": "APPROVAL_REQUIRED", "approval_request": req}), 202

        # -----------------------------
        # Load payment (ensure same company, allowed status)
        # -----------------------------
        pay = db_service.get_vendor_payment_by_id(int(company_id), int(payment_id))
        if not pay:
            raise ValueError("Vendor payment not found")

        pay_status = str(pay.get("status") or "").strip().lower()
        allowed = {"draft", "approved", "released"}
        if pay_status not in allowed:
            raise ValueError(f"Cannot allocate on a payment in status '{pay_status}'")

        pay_vendor_id = int(pay.get("vendor_id") or 0)
        if not pay_vendor_id:
            raise ValueError("Payment missing vendor_id")

        if pay_vendor_id != bill_vendor_id:
            raise ValueError("Payment vendor does not match bill vendor")

        # -----------------------------
        # Allocation
        # -----------------------------
        out = db_service.allocate_vendor_payment_to_bill(
            int(company_id),
            payment_id=int(payment_id),
            bill_id=int(bill_id),
            amount=amount,
        )

        # AUDIT
        try:
            actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or None
            db_service.audit_log(
                company_id,
                actor_user_id=actor_user_id,
                module="ap",
                action="allocate_bill_payment",
                severity="info",
                entity_type="bill",
                entity_id=str(bill_id),
                entity_ref=bill.get("number") or f"BILL-{bill_id}",
                before_json={},
                after_json={"payment_id": int(payment_id), "amount": str(amount)},
                message=f"Allocated payment {payment_id} to bill {bill.get('number') or bill_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in allocate_bill_payment")

        return jsonify({"ok": True, "data": out, "payment_id": int(payment_id)}), 200

    except Exception as e:
        current_app.logger.exception("❌ allocate_bill_payment failed")
        return jsonify({"ok": False, "error": str(e)}), 400
    
@ap_bp.route("/api/companies/<int:company_id>/vendors/archive_duplicates", methods=["POST","OPTIONS"])
@require_auth
def api_vendor_archive_duplicates(company_id: int):
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

    try:
        out = db_service.archive_duplicate_vendors(company_id)
        return jsonify({"ok": True, "data": out}), 200
    except Exception as ex:
        current_app.logger.exception("archive dup vendors failed")
        return jsonify({"ok": False, "error": str(ex)}), 400

@ap_bp.route(
    "/api/companies/<int:company_id>/ap/vendor_payments",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_create_vendor_payment(company_id: int):
    """
    Workflow rules:
      - Always create a DRAFT payment first (single insert path).
      - owner_managed: auto-APPROVE (no review gate)
      - assisted:
          - review false -> auto-APPROVE
          - review true  -> keep DRAFT; owner approves later
      - controlled:
          - review is ALWAYS required -> keep DRAFT; approval later
      - Never release here. Client must allocate -> release.
    """
    from decimal import Decimal
    from datetime import datetime

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

    try:
        # -----------------------------
        # Validate inputs
        # -----------------------------
        vendor_id = int(data.get("vendor_id") or 0)
        if vendor_id <= 0:
            raise ValueError("vendor_id is required")

        amount = Decimal(str(data.get("amount") or "0")).quantize(Decimal("0.01"))
        if amount <= Decimal("0.00"):
            raise ValueError("amount must be > 0")

        payment_date_raw = (data.get("payment_date") or data.get("date") or "").strip()
        payment_date = (
            datetime.strptime(payment_date_raw, "%Y-%m-%d").date()
            if payment_date_raw
            else datetime.utcnow().date()
        )

        bank_account_id = data.get("bank_account_id")
        bank_account_id = int(bank_account_id) if bank_account_id else None
        if not bank_account_id:
            raise ValueError("bank_account_id is required")

        reference = (data.get("reference") or "").strip() or None
        description = (data.get("description") or "").strip() or None

        wht_rate = Decimal(str(data.get("wht_rate") or "0")).quantize(Decimal("0.000001"))
        wht_amount = Decimal(str(data.get("wht_amount") or "0")).quantize(Decimal("0.01"))
        wht_ledger_code = (data.get("wht_ledger_code") or "").strip() or None
        wht_reason = (data.get("wht_reason") or "").strip() or None

        # who created it (JWT: sub or user_id)
        user_id = payload.get("user_id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None
        if not user_id:
            return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

        # -----------------------------
        # Policy + permission gate
        # -----------------------------
        cp = company_policy(int(company_id)) or {}
        policy = cp if isinstance(cp, dict) else {}

        company_profile = policy.get("company")
        company_profile = company_profile if isinstance(company_profile, dict) else {}

        user = getattr(g, "current_user", None) or {}
        role = (user.get("user_role") or user.get("company_role") or "other").strip().lower()
        user["user_role"] = role  # normalize for helper funcs

        if not can_prepare_payment(user, company_profile, policy):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|prepare_payment"}), 403

        # mode: owner_managed | assisted | controlled (normalize_policy_mode should output these)
        mode = (normalize_policy_mode(policy) or "").strip().lower()

        # review flag (assisted uses it; controlled ignores it because always review)
        ap_review_enabled = bool(policy.get("ap_review_enabled", False))

        # -----------------------------
        # Decide review_required per your rules
        # -----------------------------
        if mode == "owner_managed":
            review_required = False
        elif mode == "assisted":
            review_required = ap_review_enabled  # if true -> draft, owner approves later
        elif mode == "controlled":
            review_required = True               # ALWAYS
        else:
            # safest default: require review
            review_required = True

        # -----------------------------
        # Create draft (single insert path)
        # -----------------------------
        out = db_service.create_vendor_payment_draft(
            company_id=company_id,
            vendor_id=vendor_id,
            payment_date=payment_date,
            amount=amount,
            bank_account_id=bank_account_id,
            reference=reference,
            description=description,
            created_by=user_id,
            wht_rate=wht_rate,
            wht_amount=wht_amount,
            wht_ledger_code=wht_ledger_code,
            wht_reason=wht_reason,
        )

        payment_id = int(out.get("payment_id") or 0)
        if payment_id <= 0:
            raise ValueError("Failed to create vendor payment")

        # ✅ AUDIT: created draft
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="ap",
                action="create_vendor_payment",
                severity="info",
                entity_type="vendor_payment",
                entity_id=str(payment_id),
                entity_ref=reference or f"PAY-{payment_id}",
                before_json={"input": data, "mode": mode, "review_required": review_required},
                after_json={"payment": out},
                message=f"Created vendor payment {payment_id} (draft)",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_create_vendor_payment (create)")

        # -----------------------------
        # If review required -> stay draft
        # -----------------------------
        if review_required:
            out["status"] = "draft"
            out["mode"] = mode
            out["review_required"] = True
            return jsonify({
                "ok": True,
                "data": out,
                "workflow": "draft",
                "next": "approve_then_allocate_then_release",
            }), 201

        # -----------------------------
        # No review required -> auto-approve (owner_managed OR assisted with review off)
        # -----------------------------
        db_service.approve_vendor_payment(
            company_id=int(company_id),
            payment_id=payment_id,
            user_id=int(user_id),
        )

        # ✅ AUDIT: auto-approved
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="ap",
                action="approve_vendor_payment",
                severity="info",
                entity_type="vendor_payment",
                entity_id=str(payment_id),
                entity_ref=reference or f"PAY-{payment_id}",
                before_json={"status": "draft"},
                after_json={"status": "approved"},
                message=f"Auto-approved vendor payment {payment_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_create_vendor_payment (auto-approve)")

        out["status"] = "approved"
        out["mode"] = mode
        out["review_required"] = False
        return jsonify({
            "ok": True,
            "data": out,
            "workflow": "approved",
            "next": "allocate_then_release",
        }), 201

    except Exception as e:
        current_app.logger.exception("❌ create vendor payment failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@ap_bp.route(
    "/api/companies/<int:company_id>/ap/vendor_payments/<int:payment_id>/release",
    methods=["POST", "OPTIONS"],
)
@require_auth
def release_vendor_payment_api(company_id: int, payment_id: int):
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

    try:
        user = getattr(g, "current_user", None) or {}
        user_id = user.get("id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None

        # ==========================================================
        # (A) Load policy + mode ONCE (from db_service.get_company_profile)
        # ==========================================================
        cp = company_policy(int(company_id)) or {}
        mode = str(cp.get("mode") or "owner_managed").strip().lower()
        policy = cp.get("policy") or {}
        company_profile = cp.get("company") or {}

        user = getattr(g, "current_user", None) or {}
        company_role = (user.get("user_role") or user.get("company_role") or "other").strip().lower()

        owner_user_id = company_profile.get("owner_user_id")
        is_owner = owner_user_id is not None and str(owner_user_id) == str(user.get("id"))
        
        # ==========================================================
        # (B) Permission gate (general)
        # ==========================================================
        if not can_release_payment(user, company_profile, mode, company_role):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|release_payment"}), 403

        # ==========================================================
        # (C) CONTROLLED MODE: CFO/admin/owner must EXECUTE release
        #     ✅ NO approval request here
        # ==========================================================
        if mode == "controlled":
            role = (user.get("user_role") or user.get("company_role") or "").strip().lower()
            owner_user_id = (company_profile or {}).get("owner_user_id")
            is_owner = owner_user_id is not None and str(owner_user_id) == str(user.get("id"))

            if role not in {"cfo", "admin"} and not is_owner:
                return jsonify({"ok": False, "error": "CFO_REQUIRED|release_payment"}), 403

        # ==========================================================
        # (D) Load payment (needed for vendor + approval payload)
        # ==========================================================
        pay = db_service.get_vendor_payment_by_id(int(company_id), int(payment_id))
        if not pay:
            return jsonify({"ok": False, "error": "Payment not found"}), 404

        # ==========================================================
        # (E) ASSISTED MODE: create approval request for release (if review enabled)
        #     ✅ only assisted creates approval request here
        # ==========================================================
        assisted_review_enabled = (
            mode == "assisted"
            and bool(policy.get("ap_review_enabled", False))
            and not is_owner
        )        
        if assisted_review_enabled:
            actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or None

            entity_type = "vendor_payment"
            entity_id = str(payment_id)
            module = "ap"
            action = "release_payment"
            dedupe_key = f"{company_id}:{module}:{action}:{entity_type}:{entity_id}"

            req = db_service.create_approval_request(
                company_id,
                entity_type=entity_type,
                entity_id=entity_id,
                entity_ref=pay.get("reference") or f"PAY-{payment_id}",
                module=module,
                action=action,
                requested_by_user_id=int(actor_user_id or 0),
                amount=float(pay.get("amount") or 0.0),
                currency=pay.get("currency"),
                risk_level="high",
                dedupe_key=dedupe_key,
                payload_json={"payment": {"id": int(payment_id)}},
            )

            return jsonify({"ok": False, "error": "APPROVAL_REQUIRED", "approval_request": req}), 202

        # ==========================================================
        # (F) Vendor compliance enforcement
        #     - controlled: strict + block (if compliance_required)
        #     - assisted: warn only
        # ==========================================================
        vendor_id = int(pay.get("vendor_id") or 0)
        if vendor_id <= 0:
            return jsonify({"ok": False, "error": "Payment missing vendor_id"}), 400

        cc = vendor_compliance_check(int(company_id), int(vendor_id))
        required = bool(cc.get("compliance_required"))
        missing_strict = cc.get("missing_strict") or []
        missing_assisted = cc.get("missing_assisted") or []

        warnings = []

        if mode == "controlled" and required and missing_strict:
            return jsonify({
                "ok": False,
                "error": "VENDOR_COMPLIANCE_MISSING",
                "vendor_id": vendor_id,
                "missing": missing_strict,
                "required_docs": cc.get("required") or [],
                "status": cc.get("status"),
            }), 409

        if mode == "assisted" and missing_assisted:
            warnings = missing_assisted

        # ✅ ADD THIS BLOCK HERE (before release_vendor_payment)
        st = str(pay.get("status") or "").strip().lower()
        if st == "draft":
            # If we are here, it means the actor is allowed to execute release
            # (CFO/admin/owner in controlled, or owner/manager in assisted depending on your gating).
            db_service.approve_vendor_payment(
                company_id=int(company_id),
                payment_id=int(payment_id),
                user_id=int(user_id) if user_id is not None else None,
            )
            # refresh pay if you want (not required, but good hygiene)
            pay = db_service.get_vendor_payment_by_id(int(company_id), int(payment_id)) or pay

        # ==========================================================
        # (G) EXECUTE release (posts GL etc)
        # ==========================================================
        out = db_service.release_vendor_payment(
            company_id=int(company_id),
            payment_id=int(payment_id),
            user_id=user_id,
        )

        return jsonify({"ok": True, "data": out, "warnings": warnings}), 200

    except Exception as e:
        current_app.logger.exception("❌ release_vendor_payment_api failed")
        return jsonify({"ok": False, "error": str(e)}), 400
    
@ap_bp.route(
  "/api/companies/<int:company_id>/ap/vendor_payments",
  methods=["GET", "OPTIONS"],
)
@require_auth
def api_list_vendor_payments(company_id: int):
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

    try:
        # query params
        status = (request.args.get("status") or "").strip().lower()  # draft|approved|released|...
        vendor_id = request.args.get("vendor_id")
        vendor_id = int(vendor_id) if vendor_id else None

        limit = request.args.get("limit")
        try:
            limit = int(limit or 200)
        except Exception:
            limit = 200
        limit = max(1, min(limit, 500))

        rows = db_service.list_vendor_payments(
            company_id=int(company_id),
            status=(status or None),
            vendor_id=vendor_id,
            limit=limit,
        )
        return jsonify({"ok": True, "data": rows}), 200

    except Exception as e:
        current_app.logger.exception("❌ list vendor payments failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@ap_bp.route(
  "/api/companies/<int:company_id>/ap/vendor_payments/<int:payment_id>",
  methods=["GET", "OPTIONS"],
)
@require_auth
def api_get_vendor_payment(company_id: int, payment_id: int):
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

    try:
        out = db_service.get_vendor_payment_full(int(company_id), int(payment_id))
        if not out:
            return jsonify({"ok": False, "error": "Payment not found"}), 404
        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("❌ get vendor payment failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@ap_bp.route(
  "/api/companies/<int:company_id>/ap/vendor_payments/<int:payment_id>/approve",
  methods=["POST", "OPTIONS"],
)
@require_auth
def approve_vendor_payment_api(company_id: int, payment_id: int):
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

    try:
        user = getattr(g, "current_user", None) or {}
        user_id = user.get("id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None
        if not user_id:
            return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

        # ✅ Company policy + profile
        cp = company_policy(int(company_id)) or {}
        mode = str(cp.get("mode") or "owner_managed").strip().lower()
        company_profile = cp.get("company") or {}

        # ✅ role already applied by require_auth/get_user_context
        company_role = (user.get("user_role") or user.get("company_role") or "other").strip().lower()

        # 🔒 permission gate
        if not can_approve_payment(user, company_profile, mode):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|approve_payment"}), 403

        # ✅ Payment must exist and belong to company
        pay = db_service.get_vendor_payment_by_id(int(company_id), int(payment_id))
        if not pay:
            return jsonify({"ok": False, "error": "Payment not found"}), 404

        st = str(pay.get("status") or "").strip().lower()
        if st != "draft":
            return jsonify({"ok": False, "error": f"Cannot approve payment in status '{st}'"}), 400

        # ✅ Approve (service should stamp approved_by/approved_at + status)
        out = db_service.approve_vendor_payment(
            company_id=int(company_id),
            payment_id=int(payment_id),
            user_id=user_id,
        )

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("❌ approve_vendor_payment_api failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@ap_bp.route(
  "/api/companies/<int:company_id>/ap/vendor_payments/<int:payment_id>/void",
  methods=["POST", "OPTIONS"],
)
@require_auth
def void_vendor_payment_api(company_id: int, payment_id: int):
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
    reason = (data.get("reason") or "").strip() or None

    try:
        user = g.current_user or {}
        user_id = int(user.get("id") or payload.get("sub"))

        cp = company_policy(company_id)
        mode = cp.get("mode")
        company_profile = cp.get("company") or {}
        company_role = (user.get("user_role") or "").lower()

        # 🔒 permission: allow approvers (and owner) to void
        if not can_approve_payment(user, company_profile, mode):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|void_payment"}), 403

        out = db_service.void_vendor_payment(
            company_id=company_id,
            payment_id=payment_id,
            user_id=user_id,
            reason=reason,
        )
        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("❌ void_vendor_payment_api failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@ap_bp.route(
    "/api/companies/<int:company_id>/ap/bills/<int:bill_id>/reverse",
    methods=["POST", "OPTIONS"],
)
@require_auth
def reverse_bill_api(company_id: int, bill_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}
    if isinstance(data, str):
        import json
        data = json.loads(data) if data else {}

    current_app.logger.warning(
        "HIT reverse_bill_api company_id=%s bill_id=%s data=%s",
        company_id, bill_id, data
    )

    try:
        user = getattr(g, "current_user", None) or {}
        user_id = user.get("id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None

        reason = str(data.get("reason") or "").strip()
        reversal_date = str(data.get("date") or data.get("reversal_date") or "").strip() or None

        cp = company_policy(int(company_id)) or {}
        mode = str(cp.get("mode") or "owner_managed").strip().lower()
        company_profile = cp.get("company") or {}
        company_role = str(
            user.get("user_role") or user.get("company_role") or "other"
        ).strip().lower()

        if not can_approve_payment(user, company_profile, mode):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|reverse_bill"}), 403

        rid = db_service.reverse_posted_bill(
            company_id=int(company_id),
            bill_id=int(bill_id),
            reason=reason,
            reversed_by=user_id,
            reversal_date=reversal_date,
        )

        return jsonify({"ok": True, "data": {"reversal_journal_id": rid}}), 200

    except Exception as e:
        current_app.logger.exception("❌ reverse_bill_api failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@ap_bp.route(
  "/api/companies/<int:company_id>/ap/bills/<int:bill_id>/writeoff",
  methods=["POST", "OPTIONS"],
)
@require_auth
def writeoff_bill_api(company_id: int, bill_id: int):
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
    if isinstance(data, str):
        import json
        data = json.loads(data) if data else {}

    try:
        user = getattr(g, "current_user", None) or {}
        user_id = user.get("id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None

        # permission gate (same pattern you’re using)
        cp = company_policy(int(company_id)) or {}
        mode = str(cp.get("mode") or "owner_managed").strip().lower()
        company_profile = cp.get("company") or {}
        company_role = (user.get("user_role") or user.get("company_role") or "other").strip().lower()

        if not can_approve_payment(user, company_profile, mode):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|writeoff_bill"}), 403

        acct = (data.get("writeoff_account_code") or "").strip()
        reason = (data.get("reason") or "").strip()
        date_str = (data.get("date") or data.get("writeoff_date") or "").strip() or None

        vat_adjust = bool(data.get("vat_adjust", False))
        vat_input_account = (data.get("vat_input_account") or "").strip() or None

        jid = db_service.writeoff_bill(
            company_id=int(company_id),
            bill_id=int(bill_id),
            writeoff_account_code=acct,
            reason=reason,
            written_off_by=user_id,
            writeoff_date=date_str,
            vat_adjust=vat_adjust,
            vat_input_account=vat_input_account,
        )

        return jsonify({"ok": True, "data": {"writeoff_journal_id": jid}}), 200

    except Exception as e:
        current_app.logger.exception("❌ writeoff_bill_api failed")
        return jsonify({"ok": False, "error": str(e)}), 400
