from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass, asdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, List, Optional

from dateutil.relativedelta import relativedelta


@dataclass
class LessorBillingPeriod:
    period_no: int
    period_start: date
    period_end: date
    bill_date: date
    due_date: date
    amount_net: float
    vat_amount: float
    amount_gross: float

@dataclass
class LessorClassificationResult:
    classification: str
    proposed_classification: str
    overridden: bool
    override_reason: Optional[str]
    indicators: Dict[str, bool]
    lease_term_months: int
    economic_life_months: int
    lease_term_ratio: float
    pv_fair_value_ratio: float
    present_value_lease_payments: float
    fair_value: float
    reasons: List[str]
    warnings: List[str]

@dataclass
class FinanceLeasePeriod:
    period_no: int
    period_start: date
    period_end: date
    payment_date: date

    opening_net_investment: float
    lease_payment: float
    finance_income: float
    principal_reduction: float
    closing_net_investment: float

    current_portion: float = 0.0
    noncurrent_portion: float = 0.0

@dataclass
class OperatingLeasePeriod:
    period_no: int
    period_start: date
    period_end: date
    contractual_income: float
    straight_line_income: float
    initial_direct_cost_expense: float
    accrued_rent_movement: float
    deferred_rent_movement: float
    accrued_rent_balance: float
    deferred_rent_balance: float

def _money(value: Any) -> float:
    return round(float(value or 0.0), 2)


def _frequency_delta(frequency: str) -> relativedelta:
    frequency = (frequency or "monthly").strip().lower()

    if frequency == "weekly":
        return relativedelta(weeks=1)

    if frequency == "monthly":
        return relativedelta(months=1)

    if frequency == "quarterly":
        return relativedelta(months=3)

    if frequency == "annually":
        return relativedelta(years=1)

    raise ValueError(f"Unsupported billing frequency: {frequency}")


def _bill_date_for_period(
    period_start: date,
    period_end: date,
    *,
    billing_timing: str,
    bill_day_of_month: Optional[int],
) -> date:
    base = (
        period_start
        if (billing_timing or "arrears").lower() == "advance"
        else period_end
    )

    if not bill_day_of_month:
        return base

    day = min(
        max(int(bill_day_of_month), 1),
        monthrange(base.year, base.month)[1],
    )

    return date(base.year, base.month, day)


def _split_amount(
    billing_amount: float,
    billing_basis: str,
    vat_rate: float,
) -> tuple[float, float, float]:
    amount = _money(billing_amount)
    vat_rate = float(vat_rate or 0.0)
    basis = (billing_basis or "gross").lower()

    if basis == "net":
        net = amount
        vat = _money(net * vat_rate)
        gross = _money(net + vat)
        return net, vat, gross

    gross = amount

    if vat_rate <= 0:
        return gross, 0.0, gross

    net = _money(gross / (1 + vat_rate))
    vat = _money(gross - net)

    return net, vat, gross


def build_lessor_billing_schedule(
    lease: Dict[str, Any],
    *,
    through_date: Optional[date] = None,
) -> List[Dict[str, Any]]:
    start_date = lease.get("start_date")
    end_date = lease.get("end_date") or through_date

    if not isinstance(start_date, date):
        raise ValueError("Lessor lease start_date is required")

    if not end_date:
        raise ValueError(
            "An end_date or through_date is required for schedule generation"
        )

    if not isinstance(end_date, date):
        raise ValueError("Invalid lessor lease end_date")

    if end_date < start_date:
        raise ValueError("end_date cannot be before start_date")

    delta = _frequency_delta(lease.get("billing_frequency"))
    timing = (lease.get("billing_timing") or "arrears").lower()
    terms_days = int(lease.get("payment_terms_days") or 0)

    net, vat, gross = _split_amount(
        lease.get("billing_amount"),
        lease.get("billing_basis"),
        lease.get("vat_rate"),
    )

    rows: List[LessorBillingPeriod] = []
    period_start = start_date
    period_no = 1

    while period_start <= end_date:
        next_start = period_start + delta
        period_end = min(next_start - timedelta(days=1), end_date)

        bill_date = _bill_date_for_period(
            period_start,
            period_end,
            billing_timing=timing,
            bill_day_of_month=lease.get("bill_day_of_month"),
        )

        rows.append(
            LessorBillingPeriod(
                period_no=period_no,
                period_start=period_start,
                period_end=period_end,
                bill_date=bill_date,
                due_date=bill_date + timedelta(days=terms_days),
                amount_net=net,
                vat_amount=vat,
                amount_gross=gross,
            )
        )

        period_start = next_start
        period_no += 1

    return [
        {
            **asdict(row),
            "period_start": row.period_start.isoformat(),
            "period_end": row.period_end.isoformat(),
            "bill_date": row.bill_date.isoformat(),
            "due_date": row.due_date.isoformat(),
        }
        for row in rows
    ]


class LessorLeaseEngine:
    VALID_CLASSIFICATIONS = {"operating", "finance"}

    def build_billing_schedule(
        self,
        lease: Dict[str, Any],
        *,
        through_date: Optional[date] = None,
    ) -> List[Dict[str, Any]]:
        return build_lessor_billing_schedule(
            lease,
            through_date=through_date,
        )

    def classify_lessor_lease(
        self,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not isinstance(data, dict):
            raise ValueError("Classification data must be an object")

        term = self._positive_int(
            data.get("lease_term_months")
        )

        life = self._positive_int(
            data.get("economic_life_months")
        )

        fair_value = self._decimal(
            data.get("fair_value")
            or data.get(
                "underlying_asset_fair_value"
            )
        )

        pv = self._decimal(
            data.get("pv_lease_payments")
            or data.get("present_value_lease_payments")
        )

        major_threshold = self._rate(
            data.get("major_part_threshold"),
            Decimal("0.75"),
        )

        fair_value_threshold = self._rate(
            data.get("substantially_all_threshold"),
            Decimal("0.90"),
        )

        life_ratio = (
            Decimal(term) / Decimal(life)
            if life > 0
            else Decimal("0")
        )

        pv_ratio = (
            pv / fair_value
            if fair_value > 0
            else Decimal("0")
        )

        indicators = {
            "ownership_transfers": self._bool(
                data.get("transfer_of_ownership")
                or data.get("ownership_transfers")
            ),
            "purchase_option_reasonably_certain": self._bool(
                data.get("purchase_option_expected")
                or data.get(
                    "purchase_option_reasonably_certain"
                )
            ),
            "major_part_of_economic_life": (
                life > 0
                and life_ratio >= major_threshold
            ),
            "substantially_all_fair_value": (
                fair_value > 0
                and pv_ratio >= fair_value_threshold
            ),
            "specialised_asset": self._bool(
                data.get("specialised_asset")
            ),
        }

        proposed = (
            "finance"
            if any(indicators.values())
            else "operating"
        )

        raw_override = data.get(
            "classification_override"
        )

        if isinstance(raw_override, bool):
            override = (
                str(
                    data.get(
                        "lease_classification"
                    ) or ""
                ).strip().lower()
                if raw_override
                else ""
            )
        else:
            override = str(
                raw_override or ""
            ).strip().lower()

        override_reason = str(
            data.get("classification_override_reason") or ""
        ).strip() or None

        if override and override not in self.VALID_CLASSIFICATIONS:
            raise ValueError(
                "classification_override must be "
                "operating or finance"
            )

        overridden = bool(
            override and override != proposed
        )

        if overridden and not override_reason:
            raise ValueError(
                "classification_override_reason is required"
            )

        classification = override or proposed

        result = LessorClassificationResult(
            classification=classification,
            proposed_classification=proposed,
            overridden=overridden,
            override_reason=override_reason,
            indicators=indicators,
            lease_term_months=term,
            economic_life_months=life,
            lease_term_ratio=self._decimal_float(
                life_ratio
            ),
            pv_fair_value_ratio=self._decimal_float(
                pv_ratio
            ),
            present_value_lease_payments=float(
                pv.quantize(
                    Decimal("0.01"),
                    rounding=ROUND_HALF_UP,
                )
            ),
            fair_value=float(
                fair_value.quantize(
                    Decimal("0.01"),
                    rounding=ROUND_HALF_UP,
                )
            ),
            reasons=self._classification_reasons(
                indicators,
                life_ratio,
                pv_ratio,
            ),
            warnings=self._classification_warnings(
                term,
                life,
                fair_value,
                pv,
            ),
        )

        return asdict(result)

    def classify_and_validate(
        self,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        self.validate_classification_data(data)
        return self.classify_lessor_lease(data)

    def validate_classification_data(
        self,
        data: Dict[str, Any],
    ) -> None:
        if not isinstance(data, dict):
            raise ValueError("Classification data must be an object")

        term = self._positive_int(
            data.get("lease_term_months")
        )

        if term <= 0:
            raise ValueError(
                "lease_term_months must be greater than zero"
            )

        if self._decimal(data.get("fair_value")) < 0:
            raise ValueError("fair_value cannot be negative")

        if self._decimal(
            data.get("pv_lease_payments")
            or data.get("present_value_lease_payments")
        ) < 0:
            raise ValueError(
                "present value cannot be negative"
            )

    @staticmethod
    def _classification_reasons(
        indicators: Dict[str, bool],
        life_ratio: Decimal,
        pv_ratio: Decimal,
    ) -> List[str]:
        reasons = []

        if indicators["ownership_transfers"]:
            reasons.append(
                "Ownership transfers at the end of the lease."
            )

        if indicators[
            "purchase_option_reasonably_certain"
        ]:
            reasons.append(
                "The purchase option is reasonably certain "
                "to be exercised."
            )

        if indicators["major_part_of_economic_life"]:
            reasons.append(
                "The lease term covers a major part of the "
                f"asset's economic life "
                f"({float(life_ratio * 100):.2f}%)."
            )

        if indicators[
            "substantially_all_fair_value"
        ]:
            reasons.append(
                "The present value represents substantially "
                f"all of the fair value "
                f"({float(pv_ratio * 100):.2f}%)."
            )

        if indicators["specialised_asset"]:
            reasons.append(
                "The underlying asset is specialised."
            )

        if not reasons:
            reasons.append(
                "No finance lease indicator was identified."
            )

        return reasons

    @staticmethod
    def _classification_warnings(
        term: int,
        life: int,
        fair_value: Decimal,
        pv: Decimal,
    ) -> List[str]:
        warnings = []

        if term <= 0:
            warnings.append("Lease term was not supplied.")

        if life <= 0:
            warnings.append(
                "Economic life was not supplied; the "
                "economic-life test was not performed."
            )

        if fair_value <= 0:
            warnings.append(
                "Fair value was not supplied; the "
                "fair-value test was not performed."
            )

        if pv <= 0:
            warnings.append(
                "Present value of lease payments was "
                "not supplied."
            )

        return warnings

    @staticmethod
    def _decimal(
        value: Any,
        default: Decimal = Decimal("0"),
    ) -> Decimal:
        if value in (None, ""):
            return default

        try:
            return Decimal(
                str(value).replace(",", "").strip()
            )
        except (
            InvalidOperation,
            TypeError,
            ValueError,
        ):
            return default

    @classmethod
    def _rate(
        cls,
        value: Any,
        default: Decimal,
    ) -> Decimal:
        rate = cls._decimal(value, default)

        if rate > 1:
            rate /= Decimal("100")

        return max(
            Decimal("0"),
            min(rate, Decimal("1")),
        )

    @staticmethod
    def _positive_int(value: Any) -> int:
        try:
            return max(int(value or 0), 0)
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value

        return str(value or "").strip().lower() in {
            "1",
            "true",
            "yes",
            "y",
            "on",
        }

    @staticmethod
    def _decimal_float(value: Decimal) -> float:
        return float(
            value.quantize(
                Decimal("0.000001"),
                rounding=ROUND_HALF_UP,
            )
        )

    # =========================================================
    # FINANCE LEASE
    # =========================================================

    @staticmethod
    def _current_period_count(
        frequency: str,
    ) -> int:
        values = {
            "weekly": 52,
            "monthly": 12,
            "quarterly": 4,
            "annually": 1,
        }

        frequency = (
            frequency or "monthly"
        ).strip().lower()

        if frequency not in values:
            raise ValueError(
                f"Unsupported frequency: {frequency}"
            )

        return values[frequency]


    @classmethod
    def _receivable_split(
        cls,
        schedule: List[Dict[str, Any]],
        *,
        opening_net_investment: Any,
        frequency: str,
        start_index: int = 0,
    ) -> tuple[Decimal, Decimal]:
        opening = cls._decimal(
            opening_net_investment
        )

        if opening <= 0:
            return (
                Decimal("0.00"),
                Decimal("0.00"),
            )

        current_periods = (
            cls._current_period_count(
                frequency
            )
        )

        end_index = min(
            start_index + current_periods,
            len(schedule),
        )

        current = sum(
            (
                cls._decimal(
                    schedule[index].get(
                        "principal_reduction"
                    )
                )
                for index in range(
                    start_index,
                    end_index,
                )
            ),
            Decimal("0"),
        )

        current = max(
            Decimal("0"),
            min(current, opening),
        )

        noncurrent = max(
            Decimal("0"),
            opening - current,
        )

        return (
            cls._money_decimal(current),
            cls._money_decimal(noncurrent),
        )


    @classmethod
    def _apply_receivable_splits(
        cls,
        schedule: List[Dict[str, Any]],
        *,
        frequency: str,
    ) -> List[Dict[str, Any]]:
        for index, row in enumerate(schedule):
            current, noncurrent = (
                cls._receivable_split(
                    schedule,
                    opening_net_investment=row.get(
                        "opening_net_investment"
                    ),
                    frequency=frequency,
                    start_index=index,
                )
            )

            row["current_portion"] = float(
                current
            )

            row["noncurrent_portion"] = float(
                noncurrent
            )

        return schedule

    @classmethod
    def _net_lease_payment(
        cls,
        lease: Dict[str, Any],
    ) -> Decimal:
        amount=cls._decimal(
            lease.get("billing_amount")
            or lease.get("lease_payment")
        )

        if amount<=0:
            raise ValueError(
                "billing_amount must be greater than zero"
            )

        basis=str(
            lease.get("billing_basis") or "gross"
        ).strip().lower()

        if basis not in {"gross","net"}:
            raise ValueError(
                "billing_basis must be gross or net"
            )

        vat_rate=cls._decimal(
            lease.get("vat_rate")
        )

        if vat_rate>1:
            vat_rate/=Decimal("100")

        if vat_rate<0:
            raise ValueError("vat_rate cannot be negative")

        return cls._money_decimal(
            amount/(Decimal("1")+vat_rate)
            if basis=="gross" and vat_rate>0
            else amount
        )

    def preview_lessor_terms(
        self,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        classification = (
            self.classify_and_validate(data)
        )

        resolved = classification[
            "classification"
        ]

        if resolved == "operating":
            terms = (
                self.preview_operating_lease_terms(
                    data
                )
            )

            return {
                "classification": classification,
                "terms": terms,
            }

        terms = self.preview_finance_lease_terms(
            data
        )

        fair_value = self._decimal(
            data.get("fair_value")
            or data.get(
                "underlying_asset_fair_value"
            )
        )

        pv_payments = self._decimal(
            terms.get(
                "initial_net_investment"
            )
        )

        classification["present_value_lease_payments"] = (
            float(
                self._money_decimal(
                    pv_payments
                )
            )
        )

        classification["pv_fair_value_ratio"] = (
            self._decimal_float(
                pv_payments / fair_value
            )
            if fair_value > 0
            else 0
        )

        return {
            "classification": classification,
            "terms": terms,
        }

    def preview_operating_lease_terms(
        self,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        period_count = self._preview_period_count(
            data
        )

        frequency = (
            data.get("billing_frequency")
            or "monthly"
        ).strip().lower()

        timing = (
            data.get("billing_timing")
            or "arrears"
        ).strip().lower()

        if timing not in {
            "arrears",
            "advance",
        }:
            raise ValueError(
                "billing_timing must be "
                "arrears or advance"
            )

        billing_amount = self._decimal(
            data.get("billing_amount")
        )

        if billing_amount <= 0:
            raise ValueError(
                "billing_amount must be greater "
                "than zero for an operating lease"
            )

        billing_basis = (
            data.get("billing_basis")
            or "gross"
        ).strip().lower()

        if billing_basis not in {
            "gross",
            "net",
        }:
            raise ValueError(
                "billing_basis must be gross or net"
            )

        vat_rate = self._decimal(
            data.get("vat_rate")
        )

        if billing_basis == "gross":
            if vat_rate > 0:
                contractual_per_period = (
                    billing_amount
                    / (
                        Decimal("1")
                        + vat_rate
                    )
                )
            else:
                contractual_per_period = (
                    billing_amount
                )
        else:
            contractual_per_period = (
                billing_amount
            )

        contractual_per_period = (
            self._money_decimal(
                contractual_per_period
            )
        )

        lease_incentives = self._decimal(
            data.get("lease_incentives")
            or data.get("incentive_amount")
        )

        initial_direct_costs = self._decimal(
            data.get("initial_direct_costs")
        )

        total_contractual = (
            contractual_per_period
            * Decimal(period_count)
        )

        total_income = (
            total_contractual
            - lease_incentives
        )

        straight_line_per_period = (
            self._money_decimal(
                total_income
                / Decimal(period_count)
            )
        )

        direct_cost_per_period = (
            self._money_decimal(
                initial_direct_costs
                / Decimal(period_count)
            )
        )

        accrued_balance = Decimal("0")
        deferred_balance = Decimal("0")
        rows: List[Dict[str, Any]] = []

        for period_no in range(
            1,
            period_count + 1,
        ):
            contractual = (
                contractual_per_period
            )

            straight_line = (
                straight_line_per_period
            )

            difference = self._money_decimal(
                straight_line - contractual
            )

            accrued_movement = Decimal("0")
            deferred_movement = Decimal("0")

            if difference > 0:
                accrued_movement = difference

            elif difference < 0:
                deferred_movement = abs(
                    difference
                )

            net_balance = (
                accrued_balance
                - deferred_balance
                + accrued_movement
                - deferred_movement
            )

            if net_balance > 0:
                accrued_balance = net_balance
                deferred_balance = Decimal("0")

            elif net_balance < 0:
                accrued_balance = Decimal("0")
                deferred_balance = abs(
                    net_balance
                )

            else:
                accrued_balance = Decimal("0")
                deferred_balance = Decimal("0")

            rows.append({
                "period_no": period_no,

                "contractual_income": float(
                    self._money_decimal(
                        contractual
                    )
                ),

                "straight_line_income": float(
                    self._money_decimal(
                        straight_line
                    )
                ),

                "initial_direct_cost_expense":
                    float(
                        self._money_decimal(
                            direct_cost_per_period
                        )
                    ),

                "accrued_rent_movement": float(
                    self._money_decimal(
                        accrued_movement
                    )
                ),

                "deferred_rent_movement": float(
                    self._money_decimal(
                        deferred_movement
                    )
                ),

                "accrued_rent_balance": float(
                    self._money_decimal(
                        accrued_balance
                    )
                ),

                "deferred_rent_balance": float(
                    self._money_decimal(
                        deferred_balance
                    )
                ),
            })

        total_recognised = sum(
            (
                self._decimal(
                    row["straight_line_income"]
                )
                for row in rows
            ),
            Decimal("0"),
        )

        rounding_difference = (
            self._money_decimal(
                total_income
                - total_recognised
            )
        )

        if rows and rounding_difference:
            last = rows[-1]

            last["straight_line_income"] = (
                float(
                    self._money_decimal(
                        self._decimal(
                            last[
                                "straight_line_income"
                            ]
                        )
                        + rounding_difference
                    )
                )
            )

        straight_line_total = sum(
            (
                self._decimal(
                    row["straight_line_income"]
                )
                for row in rows
            ),
            Decimal("0"),
        )

        direct_cost_total = sum(
            (
                self._decimal(
                    row[
                        "initial_direct_cost_expense"
                    ]
                )
                for row in rows
            ),
            Decimal("0"),
        )

        return {
            "classification": "operating",
            "period_count": period_count,

            "message": (
                "Operating lease income is "
                "recognised on a straight-line "
                "basis unless another systematic "
                "basis is more representative."
            ),

            "periodic_rental": float(
                self._money_decimal(
                    billing_amount
                )
            ),

            "contractual_income": float(
                self._money_decimal(
                    total_contractual
                )
            ),

            "straight_line_income": float(
                self._money_decimal(
                    straight_line_total
                )
            ),

            "initial_direct_cost_expense":
                float(
                    self._money_decimal(
                        direct_cost_total
                    )
                ),

            "closing_accrued_rent": (
                float(
                    self._money_decimal(
                        rows[-1][
                            "accrued_rent_balance"
                        ]
                    )
                )
                if rows
                else 0.0
            ),

            "closing_deferred_rent": (
                float(
                    self._money_decimal(
                        rows[-1][
                            "deferred_rent_balance"
                        ]
                    )
                )
                if rows
                else 0.0
            ),

            "billing_frequency": frequency,
            "billing_timing": timing,
            "schedule": rows,
        }

    def preview_finance_lease_terms(
        self,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        period_count = (
            self._preview_period_count(data)
        )

        frequency = (
            data.get("billing_frequency")
            or "monthly"
        ).strip().lower()

        timing = (
            data.get("billing_timing")
            or "arrears"
        ).strip().lower()

        if timing not in {
            "arrears",
            "advance",
        }:
            raise ValueError(
                "billing_timing must be "
                "arrears or advance"
            )

        periods_per_year = (
            self._periods_per_year(
                frequency
            )
        )

        annual_rate = self._annual_rate(
            data.get("interest_rate_implicit")
            or data.get(
                "implicit_interest_rate"
            )
            or data.get("discount_rate")
        )

        periodic_rate = (
            annual_rate
            / Decimal(periods_per_year)
        )

        fair_value = self._decimal(
            data.get(
                "underlying_asset_fair_value"
            )
            or data.get("fair_value")
        )

        if fair_value <= 0:
            raise ValueError(
                "underlying_asset_fair_value "
                "must be greater than zero"
            )

        initial_direct_costs = self._decimal(
            data.get("initial_direct_costs")
        )

        manufacturer_dealer = self._bool(
            data.get(
                "manufacturer_dealer_lessor"
            )
        )

        target_net_investment = fair_value

        if not manufacturer_dealer:
            target_net_investment += (
                initial_direct_costs
            )

        guaranteed_residual = self._decimal(
            data.get(
                "guaranteed_residual_value"
            )
        )

        unguaranteed_residual = self._decimal(
            data.get(
                "unguaranteed_residual_value"
            )
        )

        total_residual = (
            guaranteed_residual
            + unguaranteed_residual
        )

        capitalised_initial_direct_costs = (
            Decimal("0")
            if manufacturer_dealer
            else initial_direct_costs
        )

        if periodic_rate == 0:
            discount_factor = Decimal("1")
        else:
            discount_factor = (
                Decimal("1") + periodic_rate
            ) ** Decimal(-period_count)

        pv_guaranteed_residual = (
            guaranteed_residual
            * discount_factor
        )

        pv_unguaranteed_residual = (
            unguaranteed_residual
            * discount_factor
        )

        pv_residual_values = (
            pv_guaranteed_residual
            + pv_unguaranteed_residual
        )

        pv_lease_payments = (
            target_net_investment
            - pv_residual_values
            - capitalised_initial_direct_costs
        )

        payment = self._solve_periodic_payment(
            target_net_investment=
                target_net_investment,
            residual_value=total_residual,
            period_count=period_count,
            periodic_rate=periodic_rate,
            timing=timing,
        )

        opening = self._money_decimal(
            target_net_investment
        )

        rows = []

        for period_no in range(
            1,
            period_count + 1,
        ):
            if timing == "advance":
                cash_payment = min(
                    payment,
                    opening,
                )

                if period_no == 1:
                    finance_income = Decimal("0")
                else:
                    finance_income = (
                        self._money_decimal(
                            opening * periodic_rate
                        )
                    )

                principal = self._money_decimal(
                    cash_payment - finance_income
                )

                closing = self._money_decimal(
                    opening
                    + finance_income
                    - cash_payment
                )

            else:
                finance_income = (
                    self._money_decimal(
                        opening * periodic_rate
                    )
                )

                principal = self._money_decimal(
                    payment - finance_income
                )

                closing = self._money_decimal(
                    opening
                    + finance_income
                    - payment
                )

            if period_no == period_count:
                expected_closing = (
                    self._money_decimal(
                        total_residual
                    )
                )

                principal = self._money_decimal(
                    opening
                    + finance_income
                    - expected_closing
                )

                payment_for_row = (
                    self._money_decimal(
                        principal
                        + finance_income
                    )
                )

                closing = expected_closing
            else:
                payment_for_row = payment

            rows.append({
                "period_no": period_no,

                "opening_net_investment":
                    float(
                        self._money_decimal(
                            opening
                        )
                    ),

                "lease_payment":
                    float(
                        self._money_decimal(
                            payment_for_row
                        )
                    ),

                "finance_income":
                    float(
                        self._money_decimal(
                            finance_income
                        )
                    ),

                "principal_reduction":
                    float(
                        self._money_decimal(
                            principal
                        )
                    ),

                "closing_net_investment":
                    float(
                        self._money_decimal(
                            closing
                        )
                    ),
            })

            opening = closing

            rows = self._apply_receivable_splits(
                rows,
                frequency=frequency,
            )

            opening_current = self._decimal(
                rows[0].get("current_portion")
                if rows
                else 0
            )

            opening_noncurrent = self._decimal(
                rows[0].get("noncurrent_portion")
                if rows
                else 0
            )

            finance_income_next_12_months = sum(
                (
                    self._decimal(
                        row.get("finance_income")
                    )
                    for row in rows[
                        :self._current_period_count(
                            frequency
                        )
                    ]
                ),
                Decimal("0"),
            )

            principal_next_12_months = sum(
                (
                    self._decimal(
                        row.get(
                            "principal_reduction"
                        )
                    )
                    for row in rows[
                        :self._current_period_count(
                            frequency
                        )
                    ]
                ),
                Decimal("0"),
            )

        gross_investment = (
            sum(
                self._decimal(
                    row["lease_payment"]
                )
                for row in rows
            )
            + total_residual
        )

        unearned_finance_income = (
            gross_investment
            - target_net_investment
        )

        return {
            "classification": "finance",
            "period_count": period_count,

            "periodic_payment": float(
                self._money_decimal(payment)
            ),

            "target_net_investment": float(
                self._money_decimal(
                    target_net_investment
                )
            ),

            "gross_investment": float(
                self._money_decimal(
                    gross_investment
                )
            ),

            "initial_net_investment": float(
                self._money_decimal(
                    target_net_investment
                )
            ),

            "pv_lease_payments": float(
                self._money_decimal(
                    pv_lease_payments
                )
            ),

            "pv_guaranteed_residual": float(
                self._money_decimal(
                    pv_guaranteed_residual
                )
            ),

            "pv_unguaranteed_residual": float(
                self._money_decimal(
                    pv_unguaranteed_residual
                )
            ),

            "pv_residual_values": float(
                self._money_decimal(
                    pv_residual_values
                )
            ),

            "capitalised_initial_direct_costs": float(
                self._money_decimal(
                    capitalised_initial_direct_costs
                )
            ),

            "manufacturer_dealer_lessor": bool(
                manufacturer_dealer
            ),

            "unearned_finance_income": float(
                self._money_decimal(
                    unearned_finance_income
                )
            ),

            "total_finance_income": round(
                sum(
                    float(
                        row["finance_income"]
                    )
                    for row in rows
                ),
                2,
            ),

            "annual_interest_rate": float(
                annual_rate
            ),

            "periodic_interest_rate": float(
                periodic_rate
            ),

            "guaranteed_residual_value":
                float(
                    self._money_decimal(
                        guaranteed_residual
                    )
                ),

            "unguaranteed_residual_value":
                float(
                    self._money_decimal(
                        unguaranteed_residual
                    )
                ),

            "current_net_investment": float(
                self._money_decimal(
                    opening_current
                )
            ),

            "noncurrent_net_investment": float(
                self._money_decimal(
                    opening_noncurrent
                )
            ),

            "current_portion": float(
                self._money_decimal(
                    opening_current
                )
            ),

            "noncurrent_portion": float(
                self._money_decimal(
                    opening_noncurrent
                )
            ),

            "finance_income_next_12_months": float(
                self._money_decimal(
                    finance_income_next_12_months
                )
            ),

            "principal_next_12_months": float(
                self._money_decimal(
                    principal_next_12_months
                )
            ),

            "schedule": rows,
        }


    def _preview_period_count(
        self,
        data: Dict[str, Any],
    ) -> int:
        months = self._positive_int(
            data.get("lease_term_months")
        )

        if months <= 0:
            raise ValueError(
                "lease_term_months must be "
                "greater than zero"
            )

        frequency = (
            data.get("billing_frequency")
            or "monthly"
        ).strip().lower()

        if frequency == "weekly":
            return max(
                round(
                    Decimal(months)
                    * Decimal("52")
                    / Decimal("12")
                ),
                1,
            )

        if frequency == "monthly":
            return months

        if frequency == "quarterly":
            return max(
                (
                    months
                    + 2
                ) // 3,
                1,
            )

        if frequency == "annually":
            return max(
                (
                    months
                    + 11
                ) // 12,
                1,
            )

        raise ValueError(
            f"Unsupported billing frequency: "
            f"{frequency}"
        )


    @classmethod
    def _solve_periodic_payment(
        cls,
        *,
        target_net_investment: Decimal,
        residual_value: Decimal,
        period_count: int,
        periodic_rate: Decimal,
        timing: str,
    ) -> Decimal:
        if period_count <= 0:
            raise ValueError(
                "period_count must be "
                "greater than zero"
            )

        if target_net_investment <= 0:
            raise ValueError(
                "target_net_investment must be "
                "greater than zero"
            )

        if periodic_rate == 0:
            amount_to_recover = (
                target_net_investment
                - residual_value
            )

            if amount_to_recover <= 0:
                raise ValueError(
                    "Residual value cannot equal or "
                    "exceed the target net investment"
                )

            return cls._money_decimal(
                amount_to_recover
                / Decimal(period_count)
            )

        discount_factor = (
            Decimal("1")
            + periodic_rate
        ) ** Decimal(-period_count)

        pv_residual = (
            residual_value
            * discount_factor
        )

        amount_to_recover = (
            target_net_investment
            - pv_residual
        )

        if amount_to_recover <= 0:
            raise ValueError(
                "The present value of residual values "
                "cannot equal or exceed the target "
                "net investment"
            )

        annuity_factor = (
            Decimal("1")
            - discount_factor
        ) / periodic_rate

        if timing == "advance":
            annuity_factor *= (
                Decimal("1")
                + periodic_rate
            )

        if annuity_factor <= 0:
            raise ValueError(
                "Unable to calculate the "
                "periodic payment"
            )

        return cls._money_decimal(
            amount_to_recover
            / annuity_factor
        )

    def build_finance_lease_schedule(
        self,
        lease: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        start=self._date_value(
            lease.get("start_date")
            or lease.get("commencement_date"),
            "start_date",
        )
        end=self._date_value(
            lease.get("end_date"),
            "end_date",
        )

        if end<start:
            raise ValueError(
                "end_date cannot be before start_date"
            )

        frequency=str(
            lease.get("billing_frequency") or "monthly"
        ).strip().lower()

        timing=str(
            lease.get("billing_timing") or "arrears"
        ).strip().lower()

        if timing not in {"advance","arrears"}:
            raise ValueError(
                "billing_timing must be advance or arrears"
            )

        delta=_frequency_delta(frequency)
        payment=self._net_lease_payment(lease)

        annual_rate=self._annual_rate(
            lease.get("interest_rate_implicit")
            or lease.get("implicit_interest_rate")
            or lease.get("discount_rate")
        )
        periodic_rate=(
            annual_rate
            / Decimal(
                self._periods_per_year(frequency)
            )
        )

        guaranteed=self._decimal(
            lease.get("guaranteed_residual_value")
        )
        unguaranteed=self._decimal(
            lease.get("unguaranteed_residual_value")
        )
        residual=guaranteed+unguaranteed
        direct_costs=self._decimal(
            lease.get("initial_direct_costs")
        )

        periods=[]
        period_start=start
        period_no=1

        while period_start<=end:
            next_start=period_start+delta
            period_end=min(
                next_start-timedelta(days=1),
                end,
            )

            periods.append({
                "period_no":period_no,
                "period_start":period_start,
                "period_end":period_end,
                "payment_date":(
                    period_start
                    if timing=="advance"
                    else period_end
                ),
            })

            period_start=next_start
            period_no+=1

        if not periods:
            raise ValueError(
                "No finance lease periods were generated"
            )

        opening=self._finance_present_value(
            payment=payment,
            period_count=len(periods),
            periodic_rate=periodic_rate,
            timing=timing,
            residual_value=residual,
        )+direct_costs

        explicit=self._decimal(
            lease.get("initial_net_investment")
        )
        if explicit>0:
            opening=explicit

        opening=self._money_decimal(opening)
        rows=[]

        for index,meta in enumerate(periods):
            last=index==len(periods)-1

            if timing=="advance":
                cash_payment=min(payment,opening)
                after_payment=self._money_decimal(
                    opening-cash_payment
                )
                finance_income=self._money_decimal(
                    after_payment*periodic_rate
                )
                closing=self._money_decimal(
                    after_payment+finance_income
                )
            else:
                cash_payment=payment
                finance_income=self._money_decimal(
                    opening*periodic_rate
                )
                closing=self._money_decimal(
                    opening+finance_income-cash_payment
                )

            principal=self._money_decimal(
                cash_payment-finance_income
            )

            if last:
                closing=self._money_decimal(residual)
                principal=self._money_decimal(
                    opening-closing
                )
                cash_payment=self._money_decimal(
                    principal+finance_income
                )

            if principal<0:
                raise ValueError(
                    f"Negative principal recovery in period "
                    f"{meta['period_no']}"
                )

            rows.append({
                "period_no":meta["period_no"],
                "period_start":meta[
                    "period_start"
                ].isoformat(),
                "period_end":meta[
                    "period_end"
                ].isoformat(),
                "payment_date":meta[
                    "payment_date"
                ].isoformat(),
                "opening_net_investment":float(
                    self._money_decimal(opening)
                ),
                "lease_payment":float(
                    self._money_decimal(cash_payment)
                ),
                "finance_income":float(
                    self._money_decimal(finance_income)
                ),
                "principal_reduction":float(
                    self._money_decimal(principal)
                ),
                "closing_net_investment":float(
                    self._money_decimal(closing)
                ),
            })

            opening=closing

        return self._apply_receivable_splits(
            rows,
            frequency=frequency,
        )

    def finance_lease_summary(
        self,
        lease: Dict[str, Any],
    ) -> Dict[str, Any]:
        schedule = self.build_finance_lease_schedule(
            lease
        )

        gross_investment = sum(
            self._decimal(row["lease_payment"])
            for row in schedule
        )

        gross_investment += self._decimal(
            lease.get("guaranteed_residual_value")
        )

        gross_investment += self._decimal(
            lease.get("unguaranteed_residual_value")
        )

        initial_net_investment = (
            self._decimal(
                schedule[0]["opening_net_investment"]
            )
            if schedule
            else Decimal("0")
        )

        current_portion = (
            self._decimal(
                schedule[0].get(
                    "current_portion"
                )
            )
            if schedule
            else Decimal("0")
        )

        noncurrent_portion = (
            self._decimal(
                schedule[0].get(
                    "noncurrent_portion"
                )
            )
            if schedule
            else Decimal("0")
        )

        unearned_finance_income = (
            gross_investment - initial_net_investment
        )

        return {
            "classification": "finance",
            "period_count": len(schedule),
            "gross_investment": float(
                self._money_decimal(gross_investment)
            ),
            "initial_net_investment": float(
                self._money_decimal(
                    initial_net_investment
                )
            ),
            "current_net_investment": float(
                self._money_decimal(
                    current_portion
                )
            ),

            "noncurrent_net_investment": float(
                self._money_decimal(
                    noncurrent_portion
                )
            ),

            "current_portion": float(
                self._money_decimal(
                    current_portion
                )
            ),

            "noncurrent_portion": float(
                self._money_decimal(
                    noncurrent_portion
                )
            ),
            "unearned_finance_income": float(
                self._money_decimal(
                    unearned_finance_income
                )
            ),
            "total_finance_income": round(
                sum(
                    float(row["finance_income"])
                    for row in schedule
                ),
                2,
            ),
            "schedule": schedule,
        }

    # =========================================================
    # OPERATING LEASE
    # =========================================================

    def build_operating_lease_schedule(
        self,
        lease: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        billing_rows = build_lessor_billing_schedule(
            lease
        )

        if not billing_rows:
            return []

        incentives = self._decimal(
            lease.get("lease_incentives")
            or lease.get("incentive_amount")
        )

        initial_direct_costs = self._decimal(
            lease.get("initial_direct_costs")
        )

        total_contractual = sum(
            self._decimal(row["amount_net"])
            for row in billing_rows
        )

        total_income = total_contractual - incentives
        period_count = len(billing_rows)

        straight_line = self._money_decimal(
            total_income / Decimal(period_count)
        )

        direct_cost_expense = self._money_decimal(
            initial_direct_costs / Decimal(period_count)
        )

        accrued_balance = Decimal("0")
        deferred_balance = Decimal("0")
        rows: List[OperatingLeasePeriod] = []

        for billing in billing_rows:
            contractual = self._decimal(
                billing["amount_net"]
            )

            difference = self._money_decimal(
                straight_line - contractual
            )

            accrued_movement = Decimal("0")
            deferred_movement = Decimal("0")

            if difference > 0:
                accrued_movement = difference
                accrued_balance += difference
            elif difference < 0:
                deferred_movement = abs(difference)
                deferred_balance += abs(difference)

            net_balance = accrued_balance - deferred_balance

            if net_balance > 0:
                accrued_balance = net_balance
                deferred_balance = Decimal("0")
            elif net_balance < 0:
                accrued_balance = Decimal("0")
                deferred_balance = abs(net_balance)
            else:
                accrued_balance = Decimal("0")
                deferred_balance = Decimal("0")

            rows.append(
                OperatingLeasePeriod(
                    period_no=int(billing["period_no"]),
                    period_start=self._date_value(
                        billing["period_start"],
                        "period_start",
                    ),
                    period_end=self._date_value(
                        billing["period_end"],
                        "period_end",
                    ),
                    contractual_income=float(
                        self._money_decimal(contractual)
                    ),
                    straight_line_income=float(straight_line),
                    initial_direct_cost_expense=float(
                        direct_cost_expense
                    ),
                    accrued_rent_movement=float(
                        self._money_decimal(accrued_movement)
                    ),
                    deferred_rent_movement=float(
                        self._money_decimal(deferred_movement)
                    ),
                    accrued_rent_balance=float(
                        self._money_decimal(accrued_balance)
                    ),
                    deferred_rent_balance=float(
                        self._money_decimal(deferred_balance)
                    ),
                )
            )

        total_recognised = sum(
            self._decimal(row.straight_line_income)
            for row in rows
        )

        rounding_difference = self._money_decimal(
            total_income - total_recognised
        )

        if rows and rounding_difference:
            last = rows[-1]

            last.straight_line_income = float(
                self._money_decimal(
                    self._decimal(
                        last.straight_line_income
                    )
                    + rounding_difference
                )
            )

        return [
            {
                **asdict(row),
                "period_start": row.period_start.isoformat(),
                "period_end": row.period_end.isoformat(),
            }
            for row in rows
        ]

    def operating_lease_summary(
        self,
        lease: Dict[str, Any],
    ) -> Dict[str, Any]:
        schedule = self.build_operating_lease_schedule(
            lease
        )

        return {
            "classification": "operating",
            "period_count": len(schedule),
            "contractual_income": round(
                sum(
                    row["contractual_income"]
                    for row in schedule
                ),
                2,
            ),

            "initial_direct_cost_expense": round(
                sum(
                    row["initial_direct_cost_expense"]
                    for row in schedule
                ),
                2,
            ),
            "straight_line_income": round(
                sum(
                    row["straight_line_income"]
                    for row in schedule
                ),
                2,
            ),
            "closing_accrued_rent": (
                schedule[-1]["accrued_rent_balance"]
                if schedule
                else 0
            ),
            "closing_deferred_rent": (
                schedule[-1]["deferred_rent_balance"]
                if schedule
                else 0
            ),
            "schedule": schedule,
        }

    # =========================================================
    # UNIFIED SCHEDULE
    # =========================================================

    def build_accounting_schedule(
        self,
        lease: Dict[str, Any],
    ) -> Dict[str, Any]:
        classification = (
            lease.get("lease_classification")
            or lease.get("classification")
            or ""
        ).strip().lower()

        if classification not in self.VALID_CLASSIFICATIONS:
            classification = self.classify_lessor_lease(
                lease
            )["classification"]

        if classification == "finance":
            return self.finance_lease_summary(lease)

        return self.operating_lease_summary(lease)

    # =========================================================
    # MODIFICATION
    # =========================================================

    def preview_modification(
        self,
        lease: Dict[str, Any],
        modification: Dict[str, Any],
    ) -> Dict[str, Any]:
        effective_date = self._date_value(
            modification.get("effective_date"),
            "effective_date",
        )

        old_classification = (
            lease.get("lease_classification")
            or "operating"
        ).strip().lower()

        updated = {
            **lease,
            **{
                key: value
                for key, value in modification.items()
                if value is not None
            },
            "start_date": effective_date,
        }

        classification_result = (
            self.classify_lessor_lease(updated)
        )

        new_classification = classification_result[
            "classification"
        ]

        separate_lease = self._bool(
            modification.get("separate_lease")
        )

        if old_classification == "finance":
            old_schedule = (
                self.build_finance_lease_schedule(
                    lease
                )
            )

            old_balance = self._finance_balance_at(
                old_schedule,
                effective_date,
            )

            new_schedule = (
                self.build_finance_lease_schedule(
                    updated
                )
            )

            new_balance = (
                self._decimal(
                    new_schedule[0][
                        "opening_net_investment"
                    ]
                )
                if new_schedule
                else Decimal("0")
            )

            gain_loss = self._money_decimal(
                old_balance - new_balance
            )

            return {
                "old_classification": old_classification,
                "new_classification": new_classification,
                "separate_lease": separate_lease,
                "effective_date": effective_date.isoformat(),
                "old_net_investment": float(
                    self._money_decimal(old_balance)
                ),
                "new_net_investment": float(
                    self._money_decimal(new_balance)
                ),
                "modification_gain_loss": float(
                    gain_loss
                ),
                "classification": classification_result,
                "schedule": new_schedule,
            }

        old_schedule = (
            self.build_operating_lease_schedule(
                lease
            )
        )

        new_schedule = (
            self.build_operating_lease_schedule(
                updated
            )
        )

        accrued, deferred = (
            self._operating_balance_at(
                old_schedule,
                effective_date,
            )
        )

        return {
            "old_classification": old_classification,
            "new_classification": new_classification,
            "separate_lease": separate_lease,
            "effective_date": effective_date.isoformat(),
            "accrued_rent_before": float(accrued),
            "deferred_rent_before": float(deferred),
            "classification": classification_result,
            "schedule": new_schedule,
        }

    # =========================================================
    # TERMINATION
    # =========================================================

    def preview_termination(
        self,
        lease: Dict[str, Any],
        termination: Dict[str, Any],
    ) -> Dict[str, Any]:
        termination_date = self._date_value(
            termination.get("termination_date"),
            "termination_date",
        )

        classification = (
            lease.get("lease_classification")
            or "operating"
        ).strip().lower()

        settlement_amount = self._decimal(
            termination.get("settlement_amount")
        )

        returned_asset_value = self._decimal(
            termination.get("returned_asset_value")
        )

        if classification == "finance":
            schedule = self.build_finance_lease_schedule(
                lease
            )

            net_investment = self._finance_balance_at(
                schedule,
                termination_date,
            )

            gain_loss = self._money_decimal(
                settlement_amount
                + returned_asset_value
                - net_investment
            )

            return {
                "classification": "finance",
                "termination_date": (
                    termination_date.isoformat()
                ),
                "net_investment_derecognised": float(
                    self._money_decimal(
                        net_investment
                    )
                ),
                "settlement_amount": float(
                    self._money_decimal(
                        settlement_amount
                    )
                ),
                "returned_asset_value": float(
                    self._money_decimal(
                        returned_asset_value
                    )
                ),
                "termination_gain_loss": float(
                    gain_loss
                ),
            }

        schedule = self.build_operating_lease_schedule(
            lease
        )

        accrued, deferred = self._operating_balance_at(
            schedule,
            termination_date,
        )

        gain_loss = self._money_decimal(
            settlement_amount
            + deferred
            - accrued
        )

        return {
            "classification": "operating",
            "termination_date": (
                termination_date.isoformat()
            ),
            "accrued_rent_settled": float(accrued),
            "deferred_rent_released": float(deferred),
            "settlement_amount": float(
                self._money_decimal(
                    settlement_amount
                )
            ),
            "termination_gain_loss": float(
                gain_loss
            ),
        }

    # =========================================================
    # ENGINE HELPERS
    # =========================================================

    @staticmethod
    def _date_value(
        value: Any,
        name: str,
    ) -> date:
        if isinstance(value, date):
            return value

        if value in (None, ""):
            raise ValueError(f"{name} is required")

        try:
            return date.fromisoformat(str(value)[:10])
        except ValueError:
            raise ValueError(
                f"{name} must be YYYY-MM-DD"
            )

    @classmethod
    def _annual_rate(
        cls,
        value: Any,
    ) -> Decimal:
        rate = cls._decimal(value)

        if rate > 1:
            rate /= Decimal("100")

        if rate < 0:
            raise ValueError(
                "discount_rate cannot be negative"
            )

        return rate

    @staticmethod
    def _periods_per_year(
        frequency: str,
    ) -> int:
        values = {
            "weekly": 52,
            "monthly": 12,
            "quarterly": 4,
            "annually": 1,
        }

        if frequency not in values:
            raise ValueError(
                f"Unsupported frequency: {frequency}"
            )

        return values[frequency]

    @staticmethod
    def _money_decimal(value) -> Decimal:
        if value is None:
            value = Decimal("0.00")
        elif not isinstance(value, Decimal):
            value = Decimal(str(value))

        return value.quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

    @classmethod
    def _finance_present_value(
        cls,
        *,
        payment: Decimal,
        period_count: int,
        periodic_rate: Decimal,
        timing: str,
        residual_value: Decimal,
    ) -> Decimal:
        if periodic_rate == 0:
            pv_payments = payment * period_count
            pv_residual = residual_value
        else:
            factor = (
                Decimal("1")
                - (
                    Decimal("1")
                    + periodic_rate
                ) ** Decimal(-period_count)
            ) / periodic_rate

            pv_payments = payment * factor

            if timing == "advance":
                pv_payments *= (
                    Decimal("1")
                    + periodic_rate
                )

            pv_residual = (
                residual_value
                / (
                    Decimal("1")
                    + periodic_rate
                ) ** Decimal(period_count)
            )

        return cls._money_decimal(
            pv_payments + pv_residual
        )

    @classmethod
    def _finance_balance_at(
        cls,
        schedule: List[Dict[str, Any]],
        as_at: date,
    ) -> Decimal:
        balance = Decimal("0")

        for row in schedule:
            period_end = cls._date_value(
                row["period_end"],
                "period_end",
            )

            if period_end <= as_at:
                balance = cls._decimal(
                    row["closing_net_investment"]
                )
            elif balance == 0:
                balance = cls._decimal(
                    row["opening_net_investment"]
                )
                break

        return cls._money_decimal(balance)

    @classmethod
    def _operating_balance_at(
        cls,
        schedule: List[Dict[str, Any]],
        as_at: date,
    ) -> tuple[Decimal, Decimal]:
        accrued = Decimal("0")
        deferred = Decimal("0")

        for row in schedule:
            period_end = cls._date_value(
                row["period_end"],
                "period_end",
            )

            if period_end <= as_at:
                accrued = cls._decimal(
                    row["accrued_rent_balance"]
                )

                deferred = cls._decimal(
                    row["deferred_rent_balance"]
                )

        return (
            cls._money_decimal(accrued),
            cls._money_decimal(deferred),
        )

lessor_lease_engine = LessorLeaseEngine()
