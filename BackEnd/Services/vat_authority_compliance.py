from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


MONEY = Decimal("0.01")


def money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY, rounding=ROUND_HALF_UP)


def norm_country(value: Any) -> str:
    return str(value or "").strip().upper()


def authority_from_country(country: Any) -> str:
    c = norm_country(country)
    if c in {"ZA", "RSA", "SOUTH AFRICA"}:
        return "SARS"
    if c in {"LS", "LES", "LESOTHO"}:
        return "RSL"
    if c in {"BW", "BOT", "BOTSWANA"}:
        return "BURS"
    return "GENERIC"


AUTHORITY_PROFILES = {
    "SARS": {
        "country_code": "ZA",
        "form_code": "VAT201",
        "spec_version": "VAT201-2025-05",
        "standard_rate": Decimal("0.15"),
        "requires_box_classification": True,
    },
    "RSL": {
        "country_code": "LS",
        "form_code": "VAT_RETURN",
        "spec_version": "RSL-VAT-2026",
        "standard_rate": Decimal("0.15"),
        "electricity_rate": Decimal("0.10"),
        "requires_box_classification": True,
    },
    "BURS": {
        "country_code": "BW",
        "form_code": "VAT002.1",
        "spec_version": "VAT002.1",
        "standard_rate": Decimal("0.12"),
        "requires_box_classification": True,
    },
    "GENERIC": {
        "country_code": None,
        "form_code": "VAT",
        "spec_version": "GENERIC-1",
        "standard_rate": Decimal("0"),
        "requires_box_classification": False,
    },
}


def authority_profile(authority_code: str) -> dict:
    return dict(AUTHORITY_PROFILES.get(str(authority_code or "").upper(), AUTHORITY_PROFILES["GENERIC"]))


def _last_business_day(year: int, month: int) -> date:
    d = date(year, month, monthrange(year, month)[1])
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def _previous_business_day(d: date) -> date:
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def authority_due_date(authority_code: str, period_end: date, *, filing_channel: str = "electronic") -> date:
    authority = str(authority_code or "").upper()
    channel = str(filing_channel or "electronic").lower()

    if authority == "RSL":
        # RSL VAT: 20th of the month following the tax period.
        y = period_end.year + (1 if period_end.month == 12 else 0)
        m = 1 if period_end.month == 12 else period_end.month + 1
        return date(y, m, 20)

    if authority == "BURS":
        # BURS: 25 days after end of the tax period.
        return period_end + timedelta(days=25)

    if authority == "SARS":
        y = period_end.year + (1 if period_end.month == 12 else 0)
        m = 1 if period_end.month == 12 else period_end.month + 1
        if channel in {"efiling", "electronic", "sars_efiling"}:
            return _last_business_day(y, m)
        return _previous_business_day(date(y, m, 25))

    return period_end + timedelta(days=25)


# ---------------------------------------------------------------------------
# Classification codes expected from FinSage transaction classification.
# These are intentionally jurisdiction-neutral. The authority adapter maps
# them to the official return fields.
# ---------------------------------------------------------------------------
OUTPUT_CLASSES = {
    "standard",
    "standard_capital",
    "zero",
    "zero_export",
    "exempt",
    "accommodation_long",
    "accommodation_short",
    "change_in_use",
    "other_adjustment",
    "capital_zero",
    "capital_exempt",
}
INPUT_CLASSES = {
    "local_other",
    "local_capital",
    "import_other",
    "import_capital",
    "second_hand",
    "change_in_use",
    "bad_debt",
    "other_adjustment",
    "transfer_duty",
}


def _d(v: Any) -> Decimal:
    return Decimal(str(v or 0))


def _line_value(line: dict) -> Decimal:
    # taxable_value is exclusive unless gross_value explicitly provided.
    return money(line.get("taxable_value") or line.get("value_ex_vat") or 0)


def _line_gross(line: dict, rate: Decimal) -> Decimal:
    if line.get("gross_value") not in (None, ""):
        return money(line.get("gross_value"))
    base = _line_value(line)
    vat = money(line.get("vat_amount"))
    if base:
        return money(base + vat)
    # Last-resort derivation from VAT. This only works for standard-rated lines.
    if rate > 0 and vat:
        return money(vat / rate * (Decimal("1") + rate))
    return Decimal("0.00")


def _sum(lines: list[dict], *, side: str | None = None, cls: str | set[str] | None = None, field: str = "vat_amount") -> Decimal:
    classes = {cls} if isinstance(cls, str) else (set(cls) if cls else None)
    total = Decimal("0")
    for line in lines:
        if side and str(line.get("vat_side") or "").lower() != side:
            continue
        if classes is not None and str(line.get("vat_class") or "") not in classes:
            continue
        total += _d(line.get(field))
    return money(total)


def build_sars_vat201(lines: list[dict], *, vat_rate: Decimal = Decimal("0.15")) -> dict:
    f = {str(i): Decimal("0.00") for i in range(1, 39)}
    f.update({"1A": Decimal("0.00"), "2A": Decimal("0.00"), "4A": Decimal("0.00"),
              "14A": Decimal("0.00"), "15A": Decimal("0.00")})

    for line in lines:
        side = str(line.get("vat_side") or "").lower()
        cls = str(line.get("vat_class") or "")
        vat = money(line.get("vat_amount"))
        base = _line_value(line)
        gross = _line_gross(line, vat_rate)

        if side == "output":
            if cls == "standard":
                f["1"] += gross
                f["4"] += vat
            elif cls == "standard_capital":
                f["1A"] += gross
                f["4A"] += vat
            elif cls == "zero":
                f["2"] += base
            elif cls == "zero_export":
                f["2A"] += base
            elif cls == "exempt":
                f["3"] += base
            elif cls == "accommodation_long":
                f["5"] += base
            elif cls == "accommodation_short":
                f["7"] += base
            elif cls == "change_in_use":
                f["10"] += gross
                f["11"] += vat
            elif cls == "other_adjustment":
                f["12"] += vat

        elif side == "input":
            if cls == "local_capital":
                f["14"] += vat
            elif cls == "import_capital":
                f["14A"] += vat
            elif cls in {"local_other", "second_hand", "transfer_duty"}:
                f["15"] += vat
            elif cls == "import_other":
                f["15A"] += vat
            elif cls == "change_in_use":
                f["16"] += vat
            elif cls == "bad_debt":
                f["17"] += vat
            elif cls == "other_adjustment":
                f["18"] += vat

    # SARS auto-calculated fields.
    f["6"] = money(f["5"] * Decimal("0.60"))
    f["8"] = money(f["6"] + f["7"])
    f["9"] = money(f["8"] * vat_rate)
    f["13"] = money(f["4"] + f["4A"] + f["9"] + f["11"] + f["12"])
    f["19"] = money(f["14"] + f["14A"] + f["15"] + f["15A"] + f["16"] + f["17"] + f["18"])
    f["20"] = money(f["13"] - f["19"])

    return {
        "authority_code": "SARS",
        "form_code": "VAT201",
        "fields": {k: float(money(v)) for k, v in f.items()},
        "output_tax": float(f["13"]),
        "input_tax": float(f["19"]),
        "net_vat": float(f["20"]),
    }


def build_burs_vat002(lines: list[dict], *, vat_rate: Decimal = Decimal("0.12")) -> dict:
    boxes = {
        "goods_services_exempt_value": Decimal("0"),
        "goods_services_zero_value": Decimal("0"),
        "goods_services_standard_value": Decimal("0"),
        "goods_services_standard_output_tax": Decimal("0"),
        "capital_sold_exempt_value": Decimal("0"),
        "capital_sold_zero_value": Decimal("0"),
        "capital_sold_standard_value": Decimal("0"),
        "capital_sold_standard_output_tax": Decimal("0"),
        "adjustments_standard_value": Decimal("0"),
        "adjustments_output_tax": Decimal("0"),
        "local_purchases_value": Decimal("0"),
        "local_purchases_input_tax": Decimal("0"),
        "local_capital_value": Decimal("0"),
        "local_capital_input_tax": Decimal("0"),
        "imported_purchases_value": Decimal("0"),
        "imported_purchases_input_tax": Decimal("0"),
        "imported_capital_value": Decimal("0"),
        "imported_capital_input_tax": Decimal("0"),
        "second_hand_value": Decimal("0"),
        "second_hand_input_tax": Decimal("0"),
        "adjustments_input_value": Decimal("0"),
        "adjustments_input_tax": Decimal("0"),
        "transfer_duty_value": Decimal("0"),
        "transfer_duty_input_tax": Decimal("0"),
    }

    for line in lines:
        side = str(line.get("vat_side") or "").lower()
        cls = str(line.get("vat_class") or "")
        vat = money(line.get("vat_amount"))
        base = _line_value(line)

        if side == "output":
            if cls == "exempt":
                boxes["goods_services_exempt_value"] += base
            elif cls in {"zero", "zero_export"}:
                boxes["goods_services_zero_value"] += base
            elif cls == "standard":
                boxes["goods_services_standard_value"] += base
                boxes["goods_services_standard_output_tax"] += vat
            elif cls == "capital_exempt":
                boxes["capital_sold_exempt_value"] += base
            elif cls == "capital_zero":
                boxes["capital_sold_zero_value"] += base
            elif cls == "standard_capital":
                boxes["capital_sold_standard_value"] += base
                boxes["capital_sold_standard_output_tax"] += vat
            elif cls in {"change_in_use", "other_adjustment"}:
                boxes["adjustments_standard_value"] += base
                boxes["adjustments_output_tax"] += vat

        elif side == "input":
            keymap = {
                "local_other": ("local_purchases_value", "local_purchases_input_tax"),
                "local_capital": ("local_capital_value", "local_capital_input_tax"),
                "import_other": ("imported_purchases_value", "imported_purchases_input_tax"),
                "import_capital": ("imported_capital_value", "imported_capital_input_tax"),
                "second_hand": ("second_hand_value", "second_hand_input_tax"),
                "other_adjustment": ("adjustments_input_value", "adjustments_input_tax"),
                "bad_debt": ("adjustments_input_value", "adjustments_input_tax"),
                "change_in_use": ("adjustments_input_value", "adjustments_input_tax"),
                "transfer_duty": ("transfer_duty_value", "transfer_duty_input_tax"),
            }
            if cls in keymap:
                vkey, tkey = keymap[cls]
                boxes[vkey] += base
                boxes[tkey] += vat

    output_tax = money(
        boxes["goods_services_standard_output_tax"]
        + boxes["capital_sold_standard_output_tax"]
        + boxes["adjustments_output_tax"]
    )
    input_tax = money(sum((v for k, v in boxes.items() if k.endswith("_input_tax")), Decimal("0")))
    net = money(output_tax - input_tax)

    return {
        "authority_code": "BURS",
        "form_code": "VAT002.1",
        "boxes": {k: float(money(v)) for k, v in boxes.items()},
        "output_tax": float(output_tax),
        "input_tax": float(input_tax),
        "net_vat": float(net),
    }


def build_rsl_vat_return(lines: list[dict]) -> dict:
    # RSL has multiple VAT rates: 0%, 10% electricity, and 15% standard /
    # telecommunications. Keep the payload explicit by rate and tax side.
    buckets = {
        "output_standard_15_value": Decimal("0"),
        "output_standard_15_tax": Decimal("0"),
        "output_electricity_10_value": Decimal("0"),
        "output_electricity_10_tax": Decimal("0"),
        "output_zero_value": Decimal("0"),
        "output_exempt_value": Decimal("0"),
        "output_adjustments_tax": Decimal("0"),
        "input_local_tax": Decimal("0"),
        "input_capital_tax": Decimal("0"),
        "input_import_tax": Decimal("0"),
        "input_adjustments_tax": Decimal("0"),
    }

    for line in lines:
        side = str(line.get("vat_side") or "").lower()
        cls = str(line.get("vat_class") or "")
        rate = _d(line.get("vat_rate"))
        vat = money(line.get("vat_amount"))
        base = _line_value(line)

        if side == "output":
            if cls in {"zero", "zero_export"}:
                buckets["output_zero_value"] += base
            elif cls == "exempt":
                buckets["output_exempt_value"] += base
            elif cls in {"change_in_use", "other_adjustment"}:
                buckets["output_adjustments_tax"] += vat
            elif rate == Decimal("0.10"):
                buckets["output_electricity_10_value"] += base
                buckets["output_electricity_10_tax"] += vat
            else:
                buckets["output_standard_15_value"] += base
                buckets["output_standard_15_tax"] += vat
        elif side == "input":
            if cls in {"local_capital", "import_capital"}:
                buckets["input_capital_tax"] += vat
            elif cls in {"import_other"}:
                buckets["input_import_tax"] += vat
            elif cls in {"change_in_use", "bad_debt", "other_adjustment"}:
                buckets["input_adjustments_tax"] += vat
            else:
                buckets["input_local_tax"] += vat

    output_tax = money(
        buckets["output_standard_15_tax"]
        + buckets["output_electricity_10_tax"]
        + buckets["output_adjustments_tax"]
    )
    input_tax = money(
        buckets["input_local_tax"]
        + buckets["input_capital_tax"]
        + buckets["input_import_tax"]
        + buckets["input_adjustments_tax"]
    )
    net = money(output_tax - input_tax)

    return {
        "authority_code": "RSL",
        "form_code": "VAT_RETURN",
        "boxes": {k: float(money(v)) for k, v in buckets.items()},
        "output_tax": float(output_tax),
        "input_tax": float(input_tax),
        "net_vat": float(net),
    }


def validate_classification(lines: list[dict], authority_code: str) -> list[dict]:
    errors = []
    for line in lines:
        side = str(line.get("vat_side") or "").lower()
        cls = str(line.get("vat_class") or "").strip()
        line_id = line.get("ledger_line_id") or line.get("id")
        if side not in {"input", "output"}:
            errors.append({"code": "VAT_SIDE_MISSING", "line_id": line_id, "message": "VAT side is missing."})
            continue
        valid = INPUT_CLASSES if side == "input" else OUTPUT_CLASSES
        if not cls:
            errors.append({"code": "VAT_CLASS_MISSING", "line_id": line_id, "message": "Authority VAT classification is required."})
        elif cls not in valid:
            errors.append({"code": "VAT_CLASS_INVALID", "line_id": line_id, "message": f"Unsupported VAT class '{cls}'."})

        if line.get("classification_confirmed") is False:
            errors.append({"code": "VAT_CLASS_UNCONFIRMED", "line_id": line_id, "message": "Suggested VAT classification must be confirmed before filing."})

        # Zero/exempt transactions need a taxable/base value even though VAT is zero.
        if cls in {"zero", "zero_export", "exempt", "capital_zero", "capital_exempt"} and _line_value(line) == 0:
            errors.append({"code": "VAT_BASE_MISSING", "line_id": line_id, "message": f"{cls} requires a transaction value."})

    return errors


def build_authority_return(authority_code: str, lines: list[dict]) -> dict:
    authority = str(authority_code or "").upper()
    errors = validate_classification(lines, authority)

    if authority == "SARS":
        result = build_sars_vat201(lines)
    elif authority == "RSL":
        result = build_rsl_vat_return(lines)
    elif authority == "BURS":
        result = build_burs_vat002(lines)
    else:
        output_tax = _sum(lines, side="output")
        input_tax = _sum(lines, side="input")
        result = {
            "authority_code": "GENERIC",
            "form_code": "VAT",
            "output_tax": float(output_tax),
            "input_tax": float(input_tax),
            "net_vat": float(money(output_tax - input_tax)),
        }

    result["validation_errors"] = errors
    result["validation_status"] = "valid" if not errors else "needs_classification"
    result["classification_complete"] = not errors
    result["spec_version"] = authority_profile(authority).get("spec_version")
    return result