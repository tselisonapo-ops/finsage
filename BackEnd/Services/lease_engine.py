# BackEnd/Services/lease_engine.py

from __future__ import annotations
from dataclasses import dataclass, asdict
from datetime import date
from typing import List, Literal, Optional, Dict, Any

from dateutil.relativedelta import relativedelta


LeaseRole = Literal["lessee", "lessor"]
PaymentFrequency = Literal["monthly", "quarterly", "annually"]
PaymentTiming = Literal["arrears", "advance"]

@dataclass
class LeaseInput:
    company_id: int
    role: LeaseRole
    lease_name: str
    start_date: date
    end_date: date

    payment_amount: float = 0.0
    payment_frequency: PaymentFrequency = "monthly"
    payment_timing: str = "arrears"
    annual_rate: float = 0.0

    initial_direct_costs: float = 0.0
    residual_value: float = 0.0
    vat_rate: float = 0.0

    # legacy (keep)
    lease_liability_account: Optional[str] = None

    # ✅ NEW (preferred)
    lease_liability_current_account: Optional[str] = None
    lease_liability_non_current_account: Optional[str] = None

    rou_asset_account: Optional[str] = None
    interest_expense_account: Optional[str] = None
    depreciation_expense_account: Optional[str] = None
    direct_costs_offset_account: Optional[str] = None


@dataclass
class LeasePeriod:
    """Single period in the lease amortisation table."""
    period_no: int
    period_start: date
    period_end: date
    opening_liability: float
    interest: float
    payment: float
    principal: float
    closing_liability: float
    depreciation: float
    vat_portion: float = 0.0
    net_payment: float = 0.0


@dataclass
class LeasePVRow:
    """
    Row for the lease liability build-up / PV table.
    This is mostly for disclosure / transparency to the user.
    """
    period_no: int
    period_start: date
    period_end: date
    discount_factor: float
    payment: float
    net_payment: float
    pv_of_payment: float
    cumulative_pv: float
    opening_liability: float
    interest: float
    principal: float
    closing_liability: float


@dataclass
class LeaseScheduleResult:
    """Aggregate result returned to API / posting engine."""
    lease_input: LeaseInput
    lease_term_months: int
    opening_lease_liability: float
    opening_rou_asset: float
    periods: List[LeasePeriod]
    pv_table: List[LeasePVRow]


# ----------------- helpers ----------------- #

from datetime import timedelta

def _months_term(start: date, end_inclusive: date) -> int:
    """
    Lease term in months, counting partial months as 1 month.
    Uses end_exclusive = end_inclusive + 1 day so that:
    2026-01-07 → 2027-01-06 becomes exactly 12 months.
    """
    end_exclusive = end_inclusive + timedelta(days=1)
    rd = relativedelta(end_exclusive, start)

    months = rd.years * 12 + rd.months
    if rd.days > 0:
        months += 1
    return max(months, 0)


def _periods_in_term(term_months: int, freq: PaymentFrequency) -> int:
    if freq == "monthly":
        return term_months
    if freq == "quarterly":
        return (term_months + 2) // 3  # round up
    if freq == "annually":
        return (term_months + 11) // 12
    raise ValueError(f"Unsupported frequency: {freq}")


def _periodic_rate(annual_rate: float, freq: PaymentFrequency) -> float:
    if annual_rate <= 0:
        return 0.0
    if freq == "monthly":
        return annual_rate / 12.0
    if freq == "quarterly":
        return annual_rate / 4.0
    if freq == "annually":
        return annual_rate
    raise ValueError(f"Unsupported frequency: {freq}")


def _add_period(start: date, freq: PaymentFrequency) -> date:
    if freq == "monthly":
        return start + relativedelta(months=+1)
    if freq == "quarterly":
        return start + relativedelta(months=+3)
    if freq == "annually":
        return start + relativedelta(years=+1)
    raise ValueError(f"Unsupported frequency: {freq}")


def present_value_of_lease(
    payment: float,
    periods: int,
    periodic_rate: float,
    residual_value: float = 0.0,
    payment_timing: PaymentTiming = "arrears",
) -> float:
    """
    PV of lease payments + PV of residual (if any).
    - arrears: ordinary annuity
    - advance: annuity due
    """
    if periods <= 0:
        return float(residual_value or 0.0)

    if periodic_rate == 0:
        pv_annuity = payment * periods
        pv_residual = residual_value
        return pv_annuity + pv_residual

    factor = (1 - (1 + periodic_rate) ** (-periods)) / periodic_rate
    pv_annuity = payment * factor
    if payment_timing == "advance":
        pv_annuity *= (1 + periodic_rate)

    pv_residual = residual_value / ((1 + periodic_rate) ** periods)
    return pv_annuity + pv_residual

def _liability_split_current_noncurrent(
    result: LeaseScheduleResult,
    as_of: date,
) -> tuple[float, float]:
    """
    Returns (current_portion, non_current_portion) of lease liability as at 'as_of'.
    Current portion = principal payable within 12 months after as_of.
    """
    opening = float(result.opening_lease_liability)

    cutoff = as_of + timedelta(days=365)  # ok for accounting; if you want exact 12 months use relativedelta(months=+12)
    current = 0.0

    for p in result.periods:
        # only include periods after as_of
        if p.period_end <= as_of:
            continue
        # principal amounts whose due date falls within next 12 months
        if p.period_end <= cutoff:
            current += float(p.principal)

    current = round(min(current, opening), 2)
    non_current = round(opening - current, 2)
    return current, non_current

# ----------------- core engine ----------------- #

def build_lease_schedule(lease: LeaseInput) -> LeaseScheduleResult:
    """
    Core lease engine:
      - determines term
      - computes opening liability and ROU
      - builds period-by-period amortisation schedule
      - builds PV / cumulative liability table
      - adds straight-line depreciation of ROU over lease term
    """
    term_months = _months_term(lease.start_date, lease.end_date)
    n_periods = _periods_in_term(term_months, lease.payment_frequency)
    r = _periodic_rate(lease.annual_rate, lease.payment_frequency)

    # Split VAT if required (assuming payment_amount is gross)
    if lease.vat_rate > 0.0:
        vat_factor = 1 + lease.vat_rate
        net_payment = lease.payment_amount / vat_factor
        vat_per_payment = lease.payment_amount - net_payment
    else:
        net_payment = lease.payment_amount
        vat_per_payment = 0.0

    # PV based on net payment only (lease liability excludes VAT)
    opening_liability = present_value_of_lease(
        payment=net_payment,
        periods=n_periods,
        periodic_rate=r,
        residual_value=lease.residual_value,
        payment_timing=lease.payment_timing,   # ✅
    )

    # ROU asset normally: liability +/- initial direct costs + prepaid lease etc.
    opening_rou = opening_liability + lease.initial_direct_costs

    # Straight-line depreciation over total months
    monthly_depreciation = opening_rou / term_months if term_months > 0 else 0.0

    # Build schedule + PV table
    periods: List[LeasePeriod] = []
    pv_rows: List[LeasePVRow] = []

    opening = opening_liability
    period_start = lease.start_date
    cumulative_pv = 0.0

    for i in range(1, n_periods + 1):
        period_end = _add_period(period_start, lease.payment_frequency) - relativedelta(days=1)

        # Discounting must match the amortisation periodic rate r
        if r > 0:
            exp = (i - 1) if lease.payment_timing == "advance" else i
            discount_factor = 1.0 / ((1.0 + r) ** exp)
        else:
            discount_factor = 1.0

        pv_of_payment = net_payment * discount_factor

        cumulative_pv += pv_of_payment

        # Interest & principal using periodic rate
        if lease.payment_timing == "advance":
            # Pay first, then interest accrues on remaining balance
            principal = net_payment
            after_payment = opening - principal
            interest = after_payment * r if r > 0 else 0.0
            closing = after_payment + interest
        else:
            # Arrears: interest first, then payment
            interest = opening * r if r > 0 else 0.0
            principal = net_payment - interest
            closing = opening - principal

        # If this is the last period, correct rounding drift so closing → 0
        if i == n_periods:
            # force closing to 0 by adjusting principal
            closing_correction = closing
            closing = 0.0
            principal = principal + closing_correction

        # Depreciation for this period = monthly_dep * months_in_this_period
        months_this_period = _months_term(period_start, period_end)
        depreciation = monthly_depreciation * months_this_period

        periods.append(
            LeasePeriod(
                period_no=i,
                period_start=period_start,
                period_end=period_end,
                opening_liability=round(opening, 2),
                interest=round(interest, 2),
                payment=round(lease.payment_amount, 2),
                principal=round(principal, 2),
                closing_liability=round(closing, 2),
                depreciation=round(depreciation, 2),
                vat_portion=round(vat_per_payment, 2),
                net_payment=round(net_payment, 2),
            )
        )

        pv_rows.append(
            LeasePVRow(
                period_no=i,
                period_start=period_start,
                period_end=period_end,
                discount_factor=round(discount_factor, 6),
                payment=round(lease.payment_amount, 2),
                net_payment=round(net_payment, 2),
                pv_of_payment=round(pv_of_payment, 2),
                cumulative_pv=round(cumulative_pv, 2),
                opening_liability=round(opening, 2),
                interest=round(interest, 2),
                principal=round(principal, 2),
                closing_liability=round(closing, 2),
            )
        )

        opening = closing
        period_start = period_end + relativedelta(days=1)

    return LeaseScheduleResult(
        lease_input=lease,
        lease_term_months=term_months,
        opening_lease_liability=round(opening_liability, 2),
        opening_rou_asset=round(opening_rou, 2),
        periods=periods,
        pv_table=pv_rows,
    )


def compute_initial_balances(lease: LeaseInput) -> Dict[str, float]:
    """
    Convenience helper: returns the initial ROU and lease liability
    (what you need for the day-1 journal).
    """
    result = build_lease_schedule(lease)
    return {
        "lease_liability": result.opening_lease_liability,
        "rou_asset": result.opening_rou_asset,
    }


# ---------------------------------------------------------------
#  Posting-rule entry point for IFRS 16 (used by posting_rules.py)
# ---------------------------------------------------------------

def handle_ifrs16_lease_entry(ui_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Called by dispatch_posting_rule(.) when account has ifrs_tag = 'IFRS 16'.
    It just tells the UI to open the lease wizard and suggests a role.
    """
    side = (ui_payload.get("side") or "").lower()
    account_code = ui_payload.get("account_code")

    # Simple heuristic: credit → lessee, debit → lessor (for now we only support lessee)
    role: LeaseRole = "lessee"
    if side == "debit":
        role = "lessor"

    return {
        "mode": "wizard",          # tells UI not to post plain JE yet
        "wizard": "lease",
        "role": role,
        "account_code": account_code,
    }


# ---------------------------------------------------------------
#  Helpers to expose schedule in JSON (for your UI)
# ---------------------------------------------------------------

def schedule_to_json(result: LeaseScheduleResult) -> Dict[str, Any]:
    """
    Convert LeaseScheduleResult into a JSON-friendly dict:
      {
        "lease_input": {... a subset ...},
        "lease_term_months": ...,
        "opening_lease_liability": ...,
        "opening_rou_asset": ...,
        "schedule": [...],
        "pv_table": [...]
      }
    """
    lease = result.lease_input

    # summarise lease input for UI (don’t leak accounts if you don’t want to)
    lease_input_json = {
        "lease_name": lease.lease_name,
        "role": lease.role,
        "start_date": lease.start_date.isoformat(),
        "end_date": lease.end_date.isoformat(),
        "payment_amount": lease.payment_amount,
        "payment_frequency": lease.payment_frequency,
        "payment_timing": lease.payment_timing,   # ✅ add this
        "annual_rate": lease.annual_rate,
        "initial_direct_costs": lease.initial_direct_costs,
        "residual_value": lease.residual_value,
        "vat_rate": lease.vat_rate,
    }

    schedule_json: List[Dict[str, Any]] = []
    for p in result.periods:
        schedule_json.append(
            {
                "period_no": p.period_no,
                "period_start": p.period_start.isoformat(),
                "period_end": p.period_end.isoformat(),
                "opening_liability": float(p.opening_liability),
                "interest": float(p.interest),
                "payment": float(p.payment),
                "principal": float(p.principal),
                "closing_liability": float(p.closing_liability),
                "depreciation": float(p.depreciation),
                "vat_portion": float(p.vat_portion),
                "net_payment": float(p.net_payment),
                "payment_timing": lease.payment_timing,   # ✅ new field
            }
        )

    pv_json: List[Dict[str, Any]] = []
    for row in result.pv_table:
        pv_json.append(
            {
                "period_no": row.period_no,
                "period_start": row.period_start.isoformat(),
                "period_end": row.period_end.isoformat(),
                "discount_factor": float(row.discount_factor),
                "payment": float(row.payment),
                "net_payment": float(row.net_payment),
                "pv_of_payment": float(row.pv_of_payment),
                "cumulative_pv": float(row.cumulative_pv),
                "opening_liability": float(row.opening_liability),
                "interest": float(row.interest),
                "principal": float(row.principal),
                "closing_liability": float(row.closing_liability),
                "payment_timing": lease.payment_timing,   # ✅ optional
            }
        )

    return {
        "lease_input": lease_input_json,
        "lease_term_months": result.lease_term_months,
        "opening_lease_liability": result.opening_lease_liability,
        "opening_rou_asset": result.opening_rou_asset,
        "schedule": schedule_json,
        "pv_table": pv_json,
    }
