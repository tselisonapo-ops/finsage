# BackEnd/Services/bank_service.py
import csv
import json
import hashlib
import re
import io
from io import StringIO
from datetime import datetime, date
from decimal import Decimal
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from BackEnd.Services.company_context import get_company_context  # ✅ add this import

INV_TOKEN_RE = re.compile(r"\bINV[-\s]?[A-Z]{1,6}[-\s]?\d+\b", re.IGNORECASE)

def extract_invoice_ref(text: str) -> str | None:
    if not text:
        return None
    m = INV_TOKEN_RE.search(text)
    if not m:
        return None
    return m.group(0).replace(" ", "").upper()

def extract_invoice_candidates(text: str) -> list[str]:
    if not text:
        return []
    return [normalize_invoice_candidate(m.group(0)) for m in INV_TOKEN_RE.finditer(text)]

def is_fee(text: str) -> bool:
    t = (text or "").lower()
    return any(k in t for k in ("bank charge", "monthly fee", "service fee", "charges", "commission", "bank fees"))

def is_interest(text: str) -> bool:
    t = (text or "").lower()
    return "interest" in t or t.startswith("int ")

def _pick_delimiter(sample: str) -> str:
    return ";" if sample.count(";") > sample.count(",") else ","

def _to_date(v):
    if not v:
        return None
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    return None

def _to_amount(v):
    if v is None:
        return Decimal("0")
    s = str(v).strip().replace(" ", "").replace(",", "")
    if s == "":
        return Decimal("0")
    return Decimal(s)

def _norm(x):
    return " ".join((x or "").strip().lower().split())

def fingerprint_line(line_date, amount, description, reference, running_balance=None) -> str:
    s = f"{line_date}|{amount}|{_norm(description)}|{_norm(reference)}|{running_balance or ''}"
    return hashlib.sha1(s.encode("utf-8")).hexdigest()

def normalize_invoice_candidate(s: str) -> str:
    return s.upper().replace(" ", "").replace("_", "-")

def _clean(s: Any) -> str:
    return ("" if s is None else str(s)).strip()


def _parse_decimal_amount(raw: str) -> Decimal:
    """
    Accepts: "1,234.56", "-150", "(150.00)", "150.00-"
    """
    s = _clean(raw)
    if not s:
        return Decimal("0")

    # Handle parentheses negative e.g. (150.00)
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1].strip()

    # Handle trailing minus e.g. 150.00-
    if s.endswith("-"):
        neg = True
        s = s[:-1].strip()

    # Remove thousands separators and currency symbols
    s = s.replace(",", "")
    for sym in ["R", "$", "€", "£"]:
        if sym in s:
            s = s.replace(sym, "").strip()

    val = Decimal(s)  # can raise if invalid
    return -val if neg else val


def _parse_date(raw: str) -> date:
    """
    Tries common formats:
    YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, etc.
    """
    s = _clean(raw)
    if not s:
        raise ValueError("Empty date")

    # normalize separators
    s2 = s.replace(".", "/").replace("-", "/")

    fmts = [
        "%Y/%m/%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%d/%m",
    ]
    for f in fmts:
        try:
            return datetime.strptime(s2, f).date()
        except ValueError:
            pass

    # last resort: try YYYY-MM-DD exactly (if user left dashes)
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"Unrecognized date format: {raw!r}")


@dataclass
class CsvMapping:
    date: str
    amount: str
    description: str
    reference: Optional[str] = None

class BankService:
    def __init__(self, db):
        self.db = db

    def _resolve_currency(self, company_id: int, bank_account_id: int | None, explicit: str | None) -> str:
        # 1) explicit param (if caller passes one)
        if explicit and str(explicit).strip():
            return str(explicit).strip().upper()

        # 2) bank account currency
        if bank_account_id:
            acc = self.db.get_company_bank_account(company_id, int(bank_account_id))
            cur = (acc or {}).get("currency")
            if cur and str(cur).strip():
                return str(cur).strip().upper()

        # 3) company base currency
        ctx = get_company_context(self.db, company_id) or {}
        cur = ctx.get("currency")
        if cur and str(cur).strip():
            return str(cur).strip().upper()

        # 4) final fallback
        return "USD"

    def ingest_statement_csv(
        self,
        *,
        company_id: int,
        bank_account_id: int | None,
        file_name: str,
        file_bytes: bytes,
        uploaded_by: int | None,
        mapping_json: str | None = None,
        currency: str | None = None,  # ✅ change default from "ZAR" to None
    ) -> int:
        # ✅ decide currency at runtime (global SaaS)
        currency = self._resolve_currency(company_id, bank_account_id, currency)

        file_hash = hashlib.sha256(file_bytes).hexdigest()
        import_id = self.db.create_bank_import(
            company_id=company_id,
            bank_account_id=bank_account_id,
            file_name=file_name,
            file_ext="csv",
            file_hash=file_hash,
            uploaded_by=uploaded_by,
            currency=currency,
        )

        text = file_bytes.decode("utf-8", errors="replace")
        delim = _pick_delimiter(text[:2000])
        rdr = csv.DictReader(StringIO(text), delimiter=delim)

        mapping = json.loads(mapping_json) if mapping_json else self._suggest_mapping(rdr.fieldnames or [])

        col_date = mapping.get("date")
        col_desc = mapping.get("description")
        col_ref  = mapping.get("reference")
        col_bal  = mapping.get("balance")
        col_amt  = mapping.get("amount")
        col_deb  = mapping.get("debit")
        col_cre  = mapping.get("credit")

        lines = []
        for row in rdr:
            line_date = _to_date(row.get(col_date))
            desc = row.get(col_desc)
            ref  = row.get(col_ref)
            bal  = row.get(col_bal)

            running_balance = _to_amount(bal) if bal not in (None, "") else None

            if col_amt:
                amount = _to_amount(row.get(col_amt))
            else:
                debit  = _to_amount(row.get(col_deb))
                credit = _to_amount(row.get(col_cre))
                amount = credit - debit  # receipts +, payments -

            fp = fingerprint_line(line_date, amount, desc, ref, running_balance)

            lines.append({
                "line_date": line_date,
                "value_date": None,
                "amount": float(amount),
                "currency": currency,  # ✅ now correct per company/bank account
                "description": desc,
                "reference": ref,
                "counterparty": None,
                "running_balance": str(running_balance) if running_balance is not None else None,
                "fingerprint": fp,
            })

        self.db.insert_bank_statement_lines(company_id, import_id, lines)
        return import_id

    def auto_match_reconciliation(self, *, company_id: int, reconciliation_id: int):
        items = self.db.fetch_all("""
            SELECT
            i.id AS recon_item_id,
            l.amount,
            l.description,
            l.reference
            FROM public.bank_recon_items i
            JOIN public.bank_statement_lines l ON l.id = i.statement_line_id
            WHERE i.company_id=%s
            AND i.reconciliation_id=%s
            AND i.match_status='unmatched'
        """, (company_id, reconciliation_id))

        matched = 0
        suggested = 0

        for it in items:
            amount = Decimal(str(it["amount"]))
            text = f"{it.get('description') or ''} {it.get('reference') or ''}"

            # ✅ Receipts only
            if amount > 0:
                candidates = extract_invoice_candidates(text)
                for cand in candidates:
                    inv = self.db.find_invoice_by_number_like(company_id, cand)
                    if inv:
                        self.db.mark_recon_item_matched(
                            company_id,
                            it["recon_item_id"],
                            match_type="receipt",
                            matched_object_type="invoice",
                            matched_object_id=inv["id"],
                        )
                        matched += 1
                        break
                else:
                    continue
                continue

            # Fees / interest suggestions
            if amount < 0 and is_fee(text):
                self.db.mark_recon_item_suggested(company_id, it["recon_item_id"], "fee")
                suggested += 1
            elif is_interest(text):
                self.db.mark_recon_item_suggested(company_id, it["recon_item_id"], "interest")
                suggested += 1

        return {
            "matched": matched,
            "suggested": suggested,
            "processed": len(items),
        }
    
    def preview_csv(self, data: bytes) -> Dict[str, Any]:
        text = data.decode("utf-8-sig", errors="ignore")  # utf-8-sig handles BOM nicely
        reader = csv.DictReader(io.StringIO(text))

        rows = []
        for i, row in enumerate(reader):
            if i >= 5:
                break
            rows.append(row)

        if not rows:
            return {"columns": [], "rows": [], "suggested_mapping": {}}

        columns = list(rows[0].keys())

        # naive mapping guess
        mapping: Dict[str, str] = {}
        for c in columns:
            cl = (c or "").lower()
            if "date" in cl or "transaction date" in cl:
                mapping.setdefault("date", c)
            elif "amount" in cl or "value" in cl or "debit" in cl or "credit" in cl:
                # still map to amount; user can override
                mapping.setdefault("amount", c)
            elif "desc" in cl or "narration" in cl or "details" in cl:
                mapping.setdefault("description", c)
            elif "ref" in cl or "reference" in cl:
                mapping.setdefault("reference", c)

        return {"columns": columns, "rows": rows, "suggested_mapping": mapping}

