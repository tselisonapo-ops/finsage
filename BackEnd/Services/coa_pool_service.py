import re
from typing import Any, Dict, List, Tuple, Optional
from collections import defaultdict
from BackEnd.Services.db_service import db_service
from BackEnd.Services.db_service import _bucket_from_category_section, BUCKET_BASE

def _safe(s: Any) -> str:
    return str(s or "").strip()

def _slug(s: str) -> str:
    s = _safe(s).lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s[:80] or "x"

def _row_to_dict(r: Any) -> Dict[str, Any]:
    """
    Supports:
      - dict rows
      - tuple/list rows: (name, code, category, section, description, standard)
    """
    if isinstance(r, dict):
        return {
            "name": _safe(r.get("name")),
            "code": _safe(r.get("code")),
            "category": _safe(r.get("category") or r.get("section")),
            "section": _safe(r.get("section") or r.get("category")),
            "description": _safe(r.get("description")),
            "standard": _safe(r.get("standard") or r.get("ifrs_tag") or r.get("ifrs_ref")),
            "posting": bool(r.get("posting", True)),
        }

    # tuple/list fallback
    rr = list(r) if isinstance(r, (list, tuple)) else []
    return {
        "name": _safe(rr[0] if len(rr) > 0 else ""),
        "code": _safe(rr[1] if len(rr) > 1 else ""),
        "category": _safe(rr[2] if len(rr) > 2 else ""),
        "section": _safe(rr[3] if len(rr) > 3 else ""),
        "description": _safe(rr[4] if len(rr) > 4 else ""),
        "standard": _safe(rr[5] if len(rr) > 5 else ""),
        "posting": True,
    }


def _make_template_code(d: Dict[str, Any], *, scope: str, industry: str = "", sub_industry: str = "") -> str:
    raw_code = _safe(d.get("code"))
    if raw_code:
        # ✅ make it unique across scopes/industries
        if scope == "GENERAL":
            return f"G::{raw_code}"
        if scope == "INDUSTRY":
            return f"I::{_slug(industry)}::{raw_code}"
        return f"S::{_slug(industry)}::{_slug(sub_industry)}::{raw_code}"

    # fallback deterministic
    parts = [scope, _slug(industry), _slug(sub_industry), _slug(d.get("section","")), _slug(d.get("category","")), _slug(d.get("name",""))]
    return "::".join([p for p in parts if p])

def build_pool_rows_from_templates(
    *,
    industry: str,
    sub_industry: str,
    GENERAL_ACCOUNTS_LIST,
    INDUSTRY_TEMPLATES,
    SUBINDUSTRY_TEMPLATES,
) -> List[Dict[str, Any]]:
    pool_rows: List[Dict[str, Any]] = []

    # -------- general
    for r in (GENERAL_ACCOUNTS_LIST or []):
        d = _row_to_dict(r)
        pool_rows.append({
            "template_code": _make_template_code(d, scope="GENERAL"),
            "name": d["name"],
            "code": d["code"] or None,
            "section": d["section"] or None,
            "category": d["category"] or None,
            "description": d["description"] or None,
            "standard": d["standard"] or None,
            "industry": None,
            "sub_industry": None,
            "is_general": True,
            "posting": bool(d.get("posting", True)),
        })

    # -------- industry
    for r in (INDUSTRY_TEMPLATES.get(industry) or []):
        d = _row_to_dict(r)
        pool_rows.append({
            "template_code": _make_template_code(d, scope="INDUSTRY", industry=industry),
            "name": d["name"],
            "code": d["code"] or None,
            "section": d["section"] or None,
            "category": d["category"] or None,
            "description": d["description"] or None,
            "standard": d["standard"] or None,
            "industry": industry,
            "sub_industry": None,
            "is_general": False,
            "posting": bool(d.get("posting", True)),
        })

    # -------- subindustry
    sub_map = SUBINDUSTRY_TEMPLATES.get(industry) or {}
    for r in (sub_map.get(sub_industry) or []):
        d = _row_to_dict(r)
        pool_rows.append({
            "template_code": _make_template_code(d, scope="SUB", industry=industry, sub_industry=sub_industry),
            "name": d["name"],
            "code": d["code"] or None,
            "section": d["section"] or None,
            "category": d["category"] or None,
            "description": d["description"] or None,
            "standard": d["standard"] or None,
            "industry": industry,
            "sub_industry": sub_industry,
            "is_general": False,
            "posting": bool(d.get("posting", True)),
        })

    # de-dupe by template_code (last wins)
    uniq: Dict[str, Dict[str, Any]] = {}
    for p in pool_rows:
        uniq[p["template_code"]] = p
    return list(uniq.values())



def sync_company_coa_from_pool(db_service, company_id: int, industry: str, sub_industry: str) -> int:
    schema = f"company_{company_id}"

    existing_tc = set()
    for r in (db_service.fetch_all(f"SELECT template_code FROM {schema}.coa WHERE template_code IS NOT NULL;") or []):
        tc = (r.get("template_code") if isinstance(r, dict) else r[0]) or ""
        existing_tc.add(str(tc).strip())

    pool = db_service.fetch_all("""
        SELECT template_code, name, code, section, category,
            NULL::text AS subcategory,
            description, standard, posting,
            industry, sub_industry, is_general
        FROM public.coa_pool

        WHERE
            is_general = TRUE
            OR (industry = %s AND sub_industry IS NULL)
            OR (industry = %s AND sub_industry = %s)
        ORDER BY template_code;
    """, (industry, industry, sub_industry)) or []

    # cache “next code” per family so we don’t query max for every row
    next_code_cache: dict[str, int] = {}

    missing = []
    for p in pool:
        tc = (p.get("template_code") or "").strip()
        if not tc or tc in existing_tc:
            continue

        category = p.get("category") or ""
        section = p.get("section") or ""
        subcat = p.get("subcategory") or ""
        std = p.get("standard") or ""

        family = _bucket_from_category_section(category, section, subcat, std)
        base = BUCKET_BASE.get(family, 6000)  # safe fallback

        if family not in next_code_cache:
            next_code_cache[family] = _next_code_for_family(db_service, schema, family, base)

        code_numeric = next_code_cache[family]
        next_code_cache[family] += 1

        missing.append({
            "template_code": tc,
            "name": p.get("name") or "",
            "code": str(code_numeric),                 # ✅ company code
            "code_family": family,                     # ✅
            "code_numeric": int(code_numeric),         # ✅
            "section": section,
            "category": category,
            "subcategory": subcat,
            "description": p.get("description") or "",
            "standard": std,
            "posting": bool(p.get("posting", True)),
            # optionally keep pool.code somewhere if you care:
            # "reporting_description": f"POOL_CODE={p.get('code')}"
        })

    if not missing:
        return 0

    return db_service.insert_coa(company_id, missing)

def _next_code_for_family(db_service, schema: str, family: str, base: int) -> int:
    row = db_service.fetch_one(
        f"""
        SELECT COALESCE(MAX(code_numeric), 0) AS max_num
        FROM {schema}.coa
        WHERE code_family = %s
        """,
        (family,),
    )
    max_num = 0
    if row:
        max_num = row.get("max_num") if isinstance(row, dict) else row[0]

    # If family unused, start at base, else increment
    if not max_num or max_num < base:
        return base
    return int(max_num) + 1
