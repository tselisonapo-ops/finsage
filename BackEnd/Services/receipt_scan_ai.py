"""
BackEnd/Services/receipt_scan_ai.py

Receipt / supplier-invoice AI extraction + draft journal builder.

Design rules (per product spec):
- OCR/AI only READS the document (vendor, doc no, date, lines, tax, total).
  It NEVER decides accounting. All accounting decisions (which accounts,
  how to split net/VAT, balancing) happen in build_draft_journal(), which
  works from the company's own COA and produces balanced lines.
- The document is ALWAYS stored upstream (receipt_scan_routes) — even if
  extraction fails, the audit trail survives and the user can fill the
  draft manually.

Extraction engines (tried in order, first available wins):
  1. "openai_compatible"  — vision LLM via an OpenAI-compatible API
                            (enable with FS_RECEIPT_AI_PROVIDER=openai_compatible
                             + FS_RECEIPT_AI_BASE_URL / FS_RECEIPT_AI_API_KEY
                             / FS_RECEIPT_AI_MODEL)
  2. "pdf_text"           — text-layer extraction from PDFs (pypdf), regex heuristics
  3. "none"               — returns empty facts; UI lets the user key the draft in.
                            The document row still exists with status uploaded.

No hard dependency is added to the project: pypdf / network calls are fully
guarded imports. If nothing is available the pipeline still works end-to-end.
"""

import base64
import json
import os
import re
import urllib.request
import urllib.error
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

# ────────────────────────────────────────────────────────────────
# Public helpers
# ────────────────────────────────────────────────────────────────

def _round2(x) -> float:
    try:
        return round(float(x) + 0.0, 2)
    except (TypeError, ValueError):
        return 0.0


def _parse_amount(raw) -> Optional[float]:
    """
    Accepts South-African and generic formats:
      "R1 150.00", "1 150,00", "1,150.00", "1150", "ZAR 1150.00"
    Returns float or None.
    """
    if raw is None:
        return None

    s = str(raw).strip()
    if not s:
        return None

    # strip currency tokens / letters
    s = re.sub(r"(ZAR|USD|EUR|GBP)", "", s, flags=re.IGNORECASE).strip()
    s = s.lstrip("R").strip()
    s = re.sub(r"[^0-9.,\-]", "", s)

    if not s:
        return None

    # "1 150,00" (SA) → dots as thousand sep removed, comma decimal
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        # decide: comma as decimal (2 digits after) or thousands
        tail = s.split(",")[-1]
        s = s.replace(",", ".") if len(tail) == 2 else s.replace(",", "")
    elif s.count(".") > 1:
        # "1.150.000,00"-style leftovers → keep last as decimal
        parts = s.split(".")
        s = "".join(parts[:-1]) + "." + parts[-1]

    try:
        return round(float(s), 2)
    except ValueError:
        return None


def _norm_date(raw) -> Optional[str]:
    """Normalise many date formats to ISO YYYY-MM-DD."""
    if not raw:
        return None
    s = str(raw).strip()

    fmts = (
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y", "%d %B %Y",
        "%b %d, %Y", "%B %d, %Y", "%d.%m.%Y", "%Y/%m/%d",
    )
    for f in fmts:
        try:
            return datetime.strptime(s, f).date().isoformat()
        except ValueError:
            continue

    m = re.search(r"(\d{1,2})[ /\-.](\d{1,2}|[A-Za-z]{3,9})[ /\-.](\d{2,4})", s)
    if m:
        d_, mon, y = m.group(1), m.group(2), m.group(3)
        if len(y) == 2:
            y = "20" + y
        for f in ("%d %m %Y", "%d %b %Y", "%d %B %Y"):
            try:
                return datetime.strptime(f"{int(d_):02d} {mon} {y}", f).date().isoformat()
            except ValueError:
                continue
    return None


# ────────────────────────────────────────────────────────────────
# Engine 1: OpenAI-compatible vision model (optional)
# ────────────────────────────────────────────────────────────────

_OPENAI_COMPAT_SYSTEM_PROMPT = """You are an accounts-payable data-capture engine.
Read the receipt / tax invoice image or text and return ONLY a JSON object, no prose:
{
  "doc_type": "supplier_receipt" | "supplier_invoice",
  "vendor": "",
  "vendor_vat_no": "",
  "doc_no": "",
  "doc_date": "YYYY-MM-DD or empty",
  "currency": "ZAR",
  "line_items": [{"description": "", "amount": 0.00}],
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "total_amount": 0.00,
  "vat_rate_percent": 15,
  "paid_by": "unknown" | "cash" | "bank" | "card"
}
Rules: copy values exactly from the document; use 0.00 when a value is not shown;
amounts are numbers, not strings; do not invent values."""


def _extract_via_openai_compatible(file_path: str, mime_type: str) -> Optional[Dict[str, Any]]:
    provider = (os.getenv("FS_RECEIPT_AI_PROVIDER") or "").strip().lower()
    if provider not in ("openai_compatible", "openai"):
        return None

    api_key = os.getenv("FS_RECEIPT_AI_API_KEY") or ""
    base_url = (os.getenv("FS_RECEIPT_AI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("FS_RECEIPT_AI_MODEL") or "gpt-4o-mini"
    if not api_key:
        return None

    is_image = (mime_type or "").lower().startswith("image/")
    content: List[Dict[str, Any]] = [{"type": "text", "text": "Extract the invoice/receipt facts as JSON."}]

    if is_image:
        with open(file_path, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{b64}"},
        })
    else:
        text = _pdf_text(file_path)
        if not text:
            return None
        content[0]["text"] += "\n\nDocument text:\n" + text[:12000]

    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": _OPENAI_COMPAT_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        "temperature": 0,
        "max_tokens": 1200,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        txt = (payload.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
        m = re.search(r"\{.*\}", txt, flags=re.DOTALL)
        if not m:
            return None
        facts = json.loads(m.group(0))
        facts["_engine"] = "openai_compatible"
        return facts
    except (urllib.error.URLError, KeyError, ValueError, json.JSONDecodeError, OSError):
        return None


# ────────────────────────────────────────────────────────────────
# Engine 2: PDF text layer + heuristics
# ────────────────────────────────────────────────────────────────

def _pdf_text(file_path: str) -> Optional[str]:
    try:
        try:
            from pypdf import PdfReader  # type: ignore
        except ImportError:
            from PyPDF2 import PdfReader  # type: ignore

        reader = PdfReader(file_path)
        chunks = []
        for page in reader.pages[:5]:
            try:
                chunks.append(page.extract_text() or "")
            except Exception:
                continue
        return "\n".join(c for c in chunks if c.strip()) or None
    except Exception:
        return None


_TOTAL_RE = re.compile(
    r"(?:grand\s+total|invoice\s+total|total\s+due|amount\s+due|total\s+amount|balance\s+due|total)"
    r"[^0-9R]{0,20}R?\s*([0-9][0-9\s.,]*)", re.IGNORECASE)
_SUBTOTAL_RE = re.compile(
    r"(?:subtotal|sub-total|sub\s+total|net\s+amount)[^0-9R]{0,20}R?\s*([0-9][0-9\s.,]*)", re.IGNORECASE)
_VAT_RE = re.compile(
    r"(?:vat|tax)\s*(?:amount)?[^0-9R@(\n]{0,16}(?:@\s*\d+(?:\.\d+)?%|\(\d+(?:\.\d+)?%\))?"
    r"[^0-9R\n]{0,12}R?\s*([0-9][0-9\s.,]*)", re.IGNORECASE)
_VAT_RATE_RE = re.compile(r"(?:vat|tax)[^\n]{0,30}?(\d{1,2}(?:\.\d+)?)\s*%", re.IGNORECASE)
_DOCNO_RE = re.compile(
    r"(?:tax\s+invoice|invoice|receipt|inv|ref(?:erence)?|doc(?:ument)?)\s*(?:no\.?|nr\.?|number|#|:)\s*"
    r"([A-Z0-9][A-Z0-9\-/_.]{2,})", re.IGNORECASE)
_VENDOR_HINT_RE = re.compile(r"^(.{2,60}?)(?:\s+(?:pty|ltd|cc|inc|close corporation)\b.*)$", re.IGNORECASE)


def _extract_via_pdf_text(file_path: str, mime_type: str) -> Optional[Dict[str, Any]]:
    if not (mime_type or "").lower().endswith("pdf"):
        return None

    text = _pdf_text(file_path)
    if not text:
        return None

    facts: Dict[str, Any] = {}

    m = _TOTAL_RE.search(text)
    total = _parse_amount(m.group(1)) if m else None

    m = _SUBTOTAL_RE.search(text)
    subtotal = _parse_amount(m.group(1)) if m else None

    m = _VAT_RE.search(text)
    vat = _parse_amount(m.group(1)) if m else None

    m = _VAT_RATE_RE.search(text)
    vat_rate = float(m.group(1)) if m else None

    m = _DOCNO_RE.search(text)
    doc_no = m.group(1).strip() if m else None

    doc_date = _norm_date(text)
    if not doc_date:
        dm = re.search(r"(\d{1,2}[ /.\-][A-Za-z0-9]{3,9}[ /.\-]\d{2,4}|\d{4}-\d{2}-\d{2})", text)
        doc_date = _norm_date(dm.group(1)) if dm else None

    lines: List[Dict[str, Any]] = []
    for ln in text.splitlines():
        lm = re.match(r"^(.{3,60}?)\s{2,}R?\s*([0-9][0-9\s.,]{2,})$", ln.strip())
        if lm:
            amt = _parse_amount(lm.group(2))
            if amt and amt != total:
                lines.append({"description": lm.group(1).strip()[:120], "amount": amt})
        if len(lines) >= 20:
            break

    # vendor: first short line near the top that isn't a heading keyword
    vendor = None
    for ln in text.splitlines()[:8]:
        cand = ln.strip()
        if 2 < len(cand) <= 60 and not re.search(
                r"tax invoice|invoice|receipt|statement|date|vat|tel|email|www\.|page", cand, re.IGNORECASE):
            vm = _VENDOR_HINT_RE.match(cand)
            vendor = (vm.group(1) if vm else cand).strip()
            break

    if total is None and vat is None and not doc_no and not lines:
        return None

    facts.update({
        "doc_type": "supplier_invoice" if re.search(r"tax invoice|invoice", text[:400], re.IGNORECASE)
                    else "supplier_receipt",
        "vendor": vendor or "",
        "vendor_vat_no": "",
        "doc_no": doc_no or "",
        "doc_date": doc_date or "",
        "currency": "ZAR",
        "line_items": lines,
        "subtotal": subtotal or 0.0,
        "tax_amount": vat or 0.0,
        "total_amount": total or 0.0,
        "vat_rate_percent": vat_rate or 15,
        "paid_by": "unknown",
        "_engine": "pdf_text",
    })
    return facts


# ────────────────────────────────────────────────────────────────
# Public extraction entry point
# ────────────────────────────────────────────────────────────────

def extract_document(file_path: str, mime_type: str) -> Dict[str, Any]:
    """
    Returns:
      {
        "facts": {...normalised facts...},
        "confidence": float 0..1,
        "field_confidence": {field: 0..1},
        "engine": "openai_compatible"|"pdf_text"|"none",
        "needs_review": bool
      }
    Never raises — failures degrade to engine "none".
    """
    raw: Optional[Dict[str, Any]] = None
    try:
        raw = _extract_via_openai_compatible(file_path, mime_type)
    except Exception:
        raw = None

    if not raw:
        try:
            raw = _extract_via_pdf_text(file_path, mime_type)
        except Exception:
            raw = None

    if not raw:
        return {
            "facts": _normalise_facts({}),
            "confidence": 0.0,
            "field_confidence": {},
            "engine": "none",
            "needs_review": True,
        }

    engine = raw.pop("_engine", "openai_compatible")
    facts = _normalise_facts(raw)
    conf = _confidence(facts, engine)
    return {
        "facts": facts,
        "confidence": conf,
        "field_confidence": _field_confidence(facts, engine),
        "engine": engine,
        "needs_review": conf < 0.75,
    }


def _normalise_facts(raw: Dict[str, Any]) -> Dict[str, Any]:
    total = _parse_amount(raw.get("total_amount"))
    vat = _parse_amount(raw.get("tax_amount"))
    subtotal = _parse_amount(raw.get("subtotal"))

    # reconcile: prefer total; derive the missing piece
    if total and vat and not subtotal:
        subtotal = _round2(total - vat)
    elif total and subtotal and vat is None:
        vat = _round2(total - subtotal)
    elif subtotal and vat and not total:
        total = _round2(subtotal + vat)

    items = []
    for it in (raw.get("line_items") or [])[:50]:
        if not isinstance(it, dict):
            continue
        amt = _parse_amount(it.get("amount"))
        desc = str(it.get("description") or "").strip()
        if desc and amt:
            items.append({"description": desc[:200], "amount": amt})

    doc_date = _norm_date(raw.get("doc_date"))

    return {
        "doc_type": str(raw.get("doc_type") or "supplier_receipt")[:24],
        "vendor": str(raw.get("vendor") or "").strip()[:160],
        "vendor_vat_no": str(raw.get("vendor_vat_no") or "").strip()[:40],
        "doc_no": str(raw.get("doc_no") or "").strip()[:60],
        "doc_date": doc_date or "",
        "currency": (str(raw.get("currency") or "ZAR").strip().upper() or "ZAR")[:3],
        "line_items": items,
        "subtotal": subtotal or 0.0,
        "tax_amount": vat or 0.0,
        "total_amount": total or 0.0,
        "vat_rate_percent": float(raw.get("vat_rate_percent") or 15),
        "paid_by": str(raw.get("paid_by") or "unknown").strip().lower()[:12],
    }


_CONF_BASE = {"openai_compatible": 0.9, "pdf_text": 0.55}


def _field_confidence(facts: Dict[str, Any], engine: str) -> Dict[str, float]:
    base = _CONF_BASE.get(engine, 0.0)
    out: Dict[str, float] = {}

    def f(key: str, value: Any, penalty: float = 0.35) -> None:
        ok = value not in (None, "", 0, 0.0, [])
        out[key] = round(base if ok else max(0.0, base - penalty), 2)

    f("vendor", facts.get("vendor"))
    f("doc_no", facts.get("doc_no"))
    f("doc_date", facts.get("doc_date"))
    f("total_amount", facts.get("total_amount"))
    f("tax_amount", facts.get("tax_amount"))
    return out


def _confidence(facts: Dict[str, Any], engine: str) -> float:
    fc = _field_confidence(facts, engine)
    if not fc:
        return 0.0
    core = ["vendor", "total_amount", "doc_date"]
    vals = [fc.get(k, 0.0) for k in core] + [fc.get("doc_no", 0.0) * 0.5]
    return round(sum(vals) / len(vals), 2)


# ────────────────────────────────────────────────────────────────
# Draft journal builder — THE ONLY place accounting is decided
# ────────────────────────────────────────────────────────────────

# expense keyword → COA name match priority (first hit wins)
_EXPENSE_HINTS: List[Tuple[str, str]] = [
    (r"fuel|petrol|diesel", "Fuel"),
    (r"electricity|power|utilities", "Utilities"),
    (r"rent(al)?\b", "Rent"),
    (r"stationery|office suppl", "Office supplies"),
    (r"office expense", "Office expenses"),
    (r"telephone|mobile|cellphone|phone", "Telephone"),
    (r"internet|hosting|domain", "Internet"),
    (r"software|subscription|saas|licence|license", "Software"),
    (r"bank fee|bank charge", "Bank charges"),
    (r"insurance", "Insurance"),
    (r"cleaning", "Cleaning"),
    (r"security", "Security"),
    (r"repair|maintenance", "Repairs"),
    (r"travel|flight|airfare", "Travel"),
    (r"meal|catering|entertainment", "Meals"),
    (r"advertis|marketing", "Marketing"),
    (r"courier|postage|shipping", "Courier"),
    (r"training|course", "Training"),
    (r"consumable", "Consumables"),
    (r"salary|wage|payroll", "Salaries"),
    (r"audit|accounting|bookkeep", "Accounting fees"),
    (r"legal|attorney", "Legal fees"),
    (r"consult", "Consulting fees"),
]


def _resolve_coa_accounts(db_service, company_id: int) -> Dict[str, Any]:
    rows = db_service.fetch_all(
        f"""
        SELECT code, name, category
        FROM company_{int(company_id)}.coa
        WHERE company_id = %s
        """,
        (int(company_id),),
    ) or []

    return {
        "rows": rows,
        "by_code": {str(r.get("code") or "").strip(): r for r in rows if r.get("code")},
        "expense_rows": [r for r in rows
                         if str(r.get("category") or "").lower().startswith("expense")],
    }


def _find_account(rows: List[Dict[str, Any]], patterns: List[str]) -> Optional[Dict[str, Any]]:
    for pat in patterns:
        for r in rows:
            name = str(r.get("name") or "")
            if re.search(pat, name, re.IGNORECASE):
                return r
    return None


def build_draft_journal(
    db_service,
    company_id: int,
    facts: Dict[str, Any],
    doc_id: int,
    credit_hint: str = "ap",           # "ap" | "bank"
    field_confidence: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Turns extracted FACTS into a balanced draft journal using the company's COA.
    Mirrors the frontend's inclusive-VAT maths (splitVatGross): amounts on
    supplier documents are VAT-inclusive by default.

    Returns a draft dict:
      { date, ref, description, currency, gross_amount, net_amount, vat_amount,
        credit_hint, confidence, needs_review,
        lines: [{account_code, account_name, debit, credit, memo}] }
    Lines are guaranteed balanced when amounts are non-zero.
    """
    accounts = _resolve_coa_accounts(db_service, company_id)
    rows = accounts["rows"]

    total = _round2(facts.get("total_amount") or 0.0)
    vat = _round2(facts.get("tax_amount") or 0.0)

    if total and vat > total:
        vat = 0.0
    if total and not vat:
        rate = float(facts.get("vat_rate_percent") or 15) / 100.0
        if 0 < rate < 1:
            net = _round2(total / (1 + rate))
            vat = _round2(total - net)

    net = _round2(total - vat) if total else 0.0

    # ── expense (debit) account: keyword match on vendor + line items ──
    expense_row = None
    vendor_desc = " ".join(
        [str(facts.get("vendor") or "")]
        + [str(i.get("description") or "") for i in facts.get("line_items")[:5]]
    ).lower()

    for pat, _label in _EXPENSE_HINTS:
        if re.search(pat, vendor_desc):
            expense_row = _find_account(accounts["expense_rows"], [pat])
            if expense_row:
                break

    if not expense_row:
        suspense = _find_account(rows, [r"suspense", r"awaiting allocation", r"unallocated"])
        expense_row = suspense or (accounts["expense_rows"][0] if accounts["expense_rows"] else None)

    # ── VAT input account ─────────────────────────────────────
    vat_row = _find_account(rows, [r"input\s*vat", r"vat\s*input", r"vat receivable"])
    # fall back to the frontend's hard fallback only if it truly exists in this COA
    if not vat_row and "BS_CA_1410" in accounts["by_code"]:
        vat_row = accounts["by_code"]["BS_CA_1410"]

    # ── credit side: AP (default) or bank ─────────────────────
    if credit_hint == "bank":
        credit_row = _find_account(rows, [r"^bank\b", r"bank account", r"current account", r"cheque"])
        if not credit_row and "BS_CA_1000" in accounts["by_code"]:
            credit_row = accounts["by_code"]["BS_CA_1000"]
    else:
        credit_row = _find_account(rows, [r"accounts?\s+payable", r"trade\s+payable", r"creditors?\b"])
    if not credit_row:
        credit_row = _find_account(rows, [r"payable", r"creditor"])

    lines: List[Dict[str, Any]] = []

    if total > 0:
        if net > 0:
            lines.append({
                "account_code": (expense_row or {}).get("code") or "",
                "account_name": (expense_row or {}).get("name") or "",
                "debit": net,
                "credit": 0.0,
                "memo": (facts.get("vendor") or "Supplier expense")[:120],
            })
        if vat > 0:
            lines.append({
                "account_code": (vat_row or {}).get("code") or "",
                "account_name": (vat_row or {}).get("name") or "Input VAT",
                "debit": vat,
                "credit": 0.0,
                "memo": "Input VAT",
            })
        lines.append({
            "account_code": (credit_row or {}).get("code") or "",
            "account_name": (credit_row or {}).get("name") or "",
            "debit": 0.0,
            "credit": _round2(net + vat),
            "memo": (facts.get("vendor") or "Supplier")[:120],
        })

        # flag unresolved codes so the UI forces a pick before posting
        for ln in lines:
            if not ln["account_code"]:
                ln["needs_account"] = True
    else:
        lines.append({
            "account_code": "",
            "account_name": "",
            "debit": 0.0,
            "credit": 0.0,
            "memo": (facts.get("vendor") or "")[:120],
            "needs_account": True,
            "needs_amount": True,
        })

    confidence = _confidence(facts, facts.get("_engine") or "none") if facts else 0.0

    return {
        "date": facts.get("doc_date") or date.today().isoformat(),
        "ref": facts.get("doc_no") or f"RSCPT-{int(doc_id)}",
        "description": (f"{facts.get('vendor') or 'Supplier'} "
                        f"{facts.get('doc_type') or 'document'} "
                        f"{facts.get('doc_no') or ''}").strip()[:180],
        "currency": facts.get("currency") or "ZAR",
        "gross_amount": _round2(net + vat),
        "net_amount": net,
        "vat_amount": vat,
        "credit_hint": credit_hint,
        "confidence": confidence,
        "needs_review": True,
        "lines": lines,
    }
