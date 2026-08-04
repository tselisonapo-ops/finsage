from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


D0 = Decimal("0")
Q2 = Decimal("0.01")
Q4 = Decimal("0.0001")


def dec(value: Any) -> Decimal:
    if value in (None, ""):
        return D0
    return Decimal(str(value))


def money(value: Any) -> Decimal:
    return dec(value).quantize(Q2, rounding=ROUND_HALF_UP)


def rate(value: Any) -> Decimal:
    return dec(value).quantize(Q4, rounding=ROUND_HALF_UP)


class PayrollEmployeeBenefitsService:
    """
    IAS 19 accounting service layered over the existing FinSage db_service.

    The service deliberately accepts imported actuarial valuation outputs.
    It does not claim to replace a qualified actuary for defined-benefit plans.
    """

    JOURNAL_SOURCES = {
        "leave": "payroll_leave_accrual",
        "leave_reversal": "payroll_leave_accrual_reversal",
        "bonus": "payroll_bonus_accrual",
        "bonus_reversal": "payroll_bonus_accrual_reversal",
        "defined_benefit": "payroll_defined_benefit",
        "defined_benefit_reversal": "payroll_defined_benefit_reversal",
        "long_term": "payroll_long_term_benefit",
        "long_term_reversal": "payroll_long_term_benefit_reversal",
        "termination": "payroll_termination_benefit",
        "termination_reversal": "payroll_termination_benefit_reversal",
        "defined_contribution":"payroll_defined_contribution",
        "defined_contribution_reversal":"payroll_defined_contribution_reversal",
    }

    CODE_PREFIXES={
        "bonus_scheme":"BON",
        "benefit_plan":"BPL",
        "long_term_scheme":"LTB",
        "termination_plan":"TRM",
    }


    def __init__(self, db_service):
        self.db = db_service

    BONUS_BASES={
        "basic_salary",
        "gross_salary",
        "pensionable_salary",
        "taxable_salary",
    }

    def _next_code(self,company_id:int,entity:str,table:str,column:str)->str:
        schema=self.schema(company_id)
        prefix=self.CODE_PREFIXES[entity]

        row=self.db.fetch_one(f"""
            SELECT COALESCE(MAX(
                NULLIF(
                    REGEXP_REPLACE({column},'[^0-9]','','g'),
                    ''
                )::BIGINT
            ),0)+1 AS sequence_no
            FROM {schema}.{table}
            WHERE company_id=%s
              AND {column} LIKE %s;
        """,(int(company_id),f"{prefix}-%"))

        return f"{prefix}-{int(row.get('sequence_no') or 1):05d}"
    
    def _posting_account(
        self,
        company_id:int,
        value,
        *,
        required=False,
        label="Account",
        allowed_sections=None,
    )->str|None:
        code=str(value or "").strip() or None

        if not code:
            if required:
                raise ValueError(f"{label} is required")
            return None

        schema=self.schema(company_id)

        row=self.db.fetch_one(f"""
            SELECT
                code,
                name,
                section,
                category,
                role,
                posting
            FROM {schema}.coa
            WHERE company_id=%s
            AND code=%s
            LIMIT 1;
        """,(int(company_id),code))

        if not row:
            raise ValueError(f"{label} does not exist: {code}")

        if not row.get("posting"):
            raise ValueError(f"{label} must be a posting account")

        if allowed_sections:
            section=str(row.get("section") or "").strip().lower()
            allowed={str(x).strip().lower() for x in allowed_sections}

            if section not in allowed:
                raise ValueError(
                    f"{label} must be selected from: "
                    +", ".join(sorted(allowed_sections))
                )

        return row["code"]

    def _account_by_roles(
        self,
        company_id:int,
        *roles:str,
        required=False,
        label="Account",
    )->str|None:
        schema=self.schema(company_id)
        roles=[str(x).strip() for x in roles if str(x).strip()]

        if not roles:
            if required:
                raise ValueError(f"No roles configured for {label}")
            return None

        row=self.db.fetch_one(f"""
            SELECT code,name,role
            FROM {schema}.coa
            WHERE company_id=%s
            AND posting=TRUE
            AND role=ANY(%s)
            ORDER BY ARRAY_POSITION(%s::TEXT[],role),code
            LIMIT 1;
        """,(int(company_id),roles,roles))

        if not row and required:
            raise ValueError(
                f"No posting account is assigned for {label}. "
                f"Expected role: {', '.join(roles)}"
            )

        return row["code"] if row else None

    def _mapped_posting_account(
        self,
        company_id:int,
        value,
        *roles:str,
        required=False,
        label="Account",
    )->str|None:
        code=str(value or "").strip()

        if code:
            return self._posting_account(
                company_id,
                code,
                required=required,
                label=label,
            )

        return self._account_by_roles(
            company_id,
            *roles,
            required=required,
            label=label,
        )

    def _selected_or_mapped_account(
        self,
        company_id:int,
        value,
        *roles:str,
        required=False,
        label="Account",
        allowed_sections=None,
    )->str|None:
        code=str(value or "").strip()

        if code:
            return self._posting_account(
                company_id,
                code,
                required=True,
                label=label,
                allowed_sections=allowed_sections,
            )

        return self._account_by_roles(
            company_id,
            *roles,
            required=required,
            label=label,
        )

    def schema(self, company_id: int) -> str:
        return self.db.company_schema(int(company_id))

    def ensure_ready(self, company_id: int) -> None:
        self.db.ensure_company_payroll(int(company_id))

    def _audit(
        self,
        company_id: int,
        user_id: int | None,
        action: str,
        entity_type: str,
        entity_id: Any,
        after_json: dict,
        message: str,
    ) -> None:
        if not user_id:
            return
        try:
            self.db.audit_log(
                int(company_id),
                actor_user_id=int(user_id),
                module="payroll",
                action=action,
                severity="info",
                entity_type=entity_type,
                entity_id=str(entity_id) if entity_id is not None else None,
                entity_ref=str(entity_id) if entity_id is not None else None,
                before_json={},
                after_json=after_json,
                message=message,
                source="api",
            )
        except Exception:
            pass

    # ---------------- Settings / dashboard ----------------

    def settings_get(self, company_id: int) -> dict:
        self.ensure_ready(company_id)
        schema = self.schema(company_id)
        row = self.db.fetch_one(f"""
            SELECT *
            FROM {schema}.payroll_employee_benefit_settings
            WHERE company_id=%s
            LIMIT 1;
        """, (int(company_id),))
        if row:
            return row

        company = self.db.fetch_one("""
            SELECT currency
            FROM public.companies
            WHERE id=%s
        """, (int(company_id),)) or {}

        return self.db.fetch_one(f"""
            INSERT INTO {schema}.payroll_employee_benefit_settings (
                company_id, reporting_currency
            )
            VALUES (%s,%s)
            RETURNING *;
        """, (int(company_id), company.get("currency") or "USD"))

    def settings_upsert(self, company_id: int, body: dict, user_id=None) -> dict:
        current = self.settings_get(company_id)
        schema = self.schema(company_id)
        out = self.db.fetch_one(f"""
            UPDATE {schema}.payroll_employee_benefit_settings
            SET reporting_currency=%s,
                default_daily_rate_basis=%s,
                working_days_per_year=%s,
                approval_required=%s,
                leave_accrual_enabled=%s,
                bonus_accrual_enabled=%s,
                defined_contribution_enabled=%s,
                defined_benefit_enabled=%s,
                long_term_benefit_enabled=%s,
                termination_benefit_enabled=%s,
                updated_at=NOW()
            WHERE company_id=%s
            RETURNING *;
        """, (
            body.get("reporting_currency") or current.get("reporting_currency"),
            body.get("default_daily_rate_basis") or current.get("default_daily_rate_basis"),
            body.get("working_days_per_year") or current.get("working_days_per_year") or 260,
            bool(body.get("approval_required", current.get("approval_required", False))),
            bool(body.get("leave_accrual_enabled", current.get("leave_accrual_enabled", True))),
            bool(body.get("bonus_accrual_enabled", current.get("bonus_accrual_enabled", True))),
            bool(body.get("defined_contribution_enabled", current.get("defined_contribution_enabled", True))),
            bool(body.get("defined_benefit_enabled", current.get("defined_benefit_enabled", False))),
            bool(body.get("long_term_benefit_enabled", current.get("long_term_benefit_enabled", True))),
            bool(body.get("termination_benefit_enabled", current.get("termination_benefit_enabled", True))),
            int(company_id),
        ))
        self._audit(company_id, user_id, "update_ias19_settings",
                    "payroll_employee_benefit_settings", out["id"], out,
                    "Updated IAS 19 employee-benefit settings")
        return out

    def dashboard(self,company_id:int,reporting_date:str|None=None)->dict:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        reporting_date=reporting_date or date.today().isoformat()

        leave=self.db.fetch_one(f"""
            SELECT COALESCE(SUM(closing_provision),0) AS liability
            FROM {schema}.payroll_employee_leave_balances
            WHERE company_id=%s AND as_of_date=(
                SELECT MAX(as_of_date)
                FROM {schema}.payroll_employee_leave_balances
                WHERE company_id=%s AND as_of_date<=%s
            );
        """,(int(company_id),int(company_id),reporting_date)) or {}

        def latest_run(table):
            return self.db.fetch_one(f"""
                SELECT * FROM {schema}.{table}
                WHERE company_id=%s AND reporting_date<=%s
                  AND status IN('calculated','approved','posted')
                ORDER BY reporting_date DESC,id DESC LIMIT 1;
            """,(int(company_id),reporting_date)) or {}

        bonus=latest_run("payroll_bonus_accrual_runs")
        long_term=latest_run("payroll_long_term_benefit_runs")

        dc=self.db.fetch_one(f"""
            SELECT COALESCE(SUM(total_payable),0) AS payable,
                   COALESCE(SUM(total_employer_contribution),0) AS expense
            FROM {schema}.payroll_defined_contribution_runs
            WHERE company_id=%s AND reporting_date<=%s
              AND status IN('calculated','approved','posted');
        """,(int(company_id),reporting_date)) or {}

        valuations=self.db.fetch_all(f"""
            SELECT DISTINCT ON(plan_id) *
            FROM {schema}.payroll_actuarial_valuations
            WHERE company_id=%s AND valuation_date<=%s
              AND status IN('validated','approved','posted')
            ORDER BY plan_id,valuation_date DESC,id DESC;
        """,(int(company_id),reporting_date))

        dbo=sum((dec(x.get("closing_dbo")) for x in valuations),D0)
        assets=sum((dec(x.get("closing_plan_assets")) for x in valuations),D0)
        db_liability=sum(
            (dec(x.get("net_defined_benefit_liability"))
             for x in valuations),D0
        )
        db_asset=sum(
            (dec(x.get("net_defined_benefit_asset"))
             for x in valuations),D0
        )
        expense=sum(
            (dec(x.get("profit_or_loss_amount")) for x in valuations),D0
        )
        oci=sum(
            (dec(x.get("oci_remeasurement_amount")) for x in valuations),D0
        )

        termination=self.db.fetch_one(f"""
            SELECT COALESCE(SUM(
                GREATEST(total_recognised-total_settled,0)
            ),0) AS liability
            FROM {schema}.payroll_termination_plans
            WHERE company_id=%s
              AND recognition_date<=%s
              AND status IN('recognised','part_settled');
        """,(int(company_id),reporting_date)) or {}

        coverage=self.db.fetch_one(f"""
            SELECT
                COUNT(DISTINCT m.employee_id)
                    FILTER(WHERE m.is_active=TRUE) AS covered,
                COUNT(DISTINCT e.id)
                    FILTER(WHERE e.employment_status='active') AS active
            FROM {schema}.payroll_employees e
            LEFT JOIN {schema}.payroll_benefit_plan_members m
              ON m.company_id=e.company_id
             AND m.employee_id=e.id
             AND m.effective_from<=%s
             AND(m.effective_to IS NULL OR m.effective_to>=%s)
            WHERE e.company_id=%s;
        """,(reporting_date,reporting_date,int(company_id))) or {}

        unposted=self.db.fetch_one(f"""
            SELECT
              (SELECT COUNT(*) FROM {schema}.payroll_leave_accrual_runs
               WHERE company_id=%s AND status IN('calculated','approved'))+
              (SELECT COUNT(*) FROM {schema}.payroll_bonus_accrual_runs
               WHERE company_id=%s AND status IN('calculated','approved'))+
              (SELECT COUNT(*) FROM {schema}.payroll_defined_contribution_runs
               WHERE company_id=%s AND status IN('calculated','approved'))+
              (SELECT COUNT(*) FROM {schema}.payroll_long_term_benefit_runs
               WHERE company_id=%s AND status IN('calculated','approved'))+
              (SELECT COUNT(*) FROM {schema}.payroll_actuarial_valuations
               WHERE company_id=%s AND status IN('validated','approved'))
              AS count;
        """,(
            int(company_id),int(company_id),int(company_id),
            int(company_id),int(company_id),
        )) or {}

        next_valuation=self.db.fetch_one(f"""
            SELECT p.id,p.code,p.name,
                   MAX(v.valuation_date) AS last_valuation_date,
                   (MAX(v.valuation_date)+INTERVAL '1 year')::date
                       AS next_valuation_date
            FROM {schema}.payroll_benefit_plans p
            LEFT JOIN {schema}.payroll_actuarial_valuations v
              ON v.company_id=p.company_id AND v.plan_id=p.id
            WHERE p.company_id=%s
              AND p.plan_type='defined_benefit'
              AND p.is_active=TRUE
            GROUP BY p.id
            ORDER BY next_valuation_date NULLS FIRST
            LIMIT 1;
        """,(int(company_id),)) or {}

        leave_liability=money(leave.get("liability"))
        bonus_liability=money(bonus.get("total_closing_liability"))
        dc_payable=money(dc.get("payable"))
        termination_liability=money(termination.get("liability"))
        long_term_liability=money(
            long_term.get("total_closing_liability")
        )

        current=money(
            leave_liability+bonus_liability+
            dc_payable+termination_liability
        )

        noncurrent=money(
            long_term_liability+money(db_liability)
        )

        active=int(coverage.get("active") or 0)
        covered=int(coverage.get("covered") or 0)

        return {
            "reporting_date":reporting_date,
            "current_liability":current,
            "noncurrent_liability":noncurrent,
            "plan_assets":money(assets),
            "expense":money(
                dec(bonus.get("total_movement"))+
                dec(dc.get("expense"))+
                dec(long_term.get("total_movement"))+
                expense
            ),
            "oci":money(oci),
            "leave_liability":leave_liability,
            "bonus_liability":bonus_liability,
            "defined_contribution_payable":dc_payable,
            "defined_benefit_liability":money(db_liability),
            "defined_benefit_asset":money(db_asset),
            "long_term_liability":long_term_liability,
            "termination_liability":termination_liability,
            "defined_benefit_obligation":money(dbo),
            "funding_ratio":rate(
                assets/dbo*Decimal("100") if dbo else D0
            ),
            "active_employees":active,
            "employees_covered":covered,
            "coverage_percentage":rate(
                Decimal(covered)/Decimal(active)*Decimal("100")
                if active else D0
            ),
            "unposted_items":int(unposted.get("count") or 0),
            "next_valuation":next_valuation,
        }
    # ---------------- Leave policies / balances ----------------

    def leave_policies_list(self, company_id: int) -> list[dict]:
        schema = self.schema(company_id)
        return self.db.fetch_all(f"""
            SELECT p.*, lt.code AS leave_code, lt.name AS leave_type_name
            FROM {schema}.payroll_leave_policies p
            JOIN {schema}.payroll_leave_types lt
              ON lt.id=p.leave_type_id
            WHERE p.company_id=%s
            ORDER BY p.is_active DESC, p.name;
        """, (int(company_id),))

    def leave_types_list(self,company_id:int)->list[dict]:
        self.ensure_ready(company_id)
        schema=self.schema(company_id)

        return self.db.fetch_all(f"""
            SELECT
                id,
                company_id,
                code,
                name,
                paid,
                accrues,
                annual_entitlement_days,
                is_active
            FROM {schema}.payroll_leave_types
            WHERE company_id=%s
            AND is_active=TRUE
            ORDER BY name;
        """,(int(company_id),))

    def leave_policy_save(self, company_id: int, body: dict, policy_id=None, user_id=None) -> dict:
        schema = self.schema(company_id)
        required = ["leave_type_id", "name", "annual_entitlement_days"]
        missing = [k for k in required if body.get(k) in (None, "")]
        if missing:
            raise ValueError("Missing required fields: " + ", ".join(missing))

        provision_required=bool(body.get("provision_required",True))

        expense_account=self._mapped_posting_account(
            company_id,
            body.get("expense_account_code"),
            "payroll_leave_expense",
            required=provision_required,
            label="Leave expense account",
        )

        liability_account=self._mapped_posting_account(
            company_id,
            body.get("liability_account_code"),
            "payroll_leave_provision",
            required=provision_required,
            label="Leave liability account",
        )

        if policy_id:
            out = self.db.fetch_one(f"""
                UPDATE {schema}.payroll_leave_policies
                SET leave_type_id=%s, name=%s, annual_entitlement_days=%s,
                    accrual_method=%s, monthly_accrual_days=%s,
                    maximum_balance_days=%s, maximum_carry_forward_days=%s,
                    carry_forward_expiry_months=%s, vesting=%s,
                    cash_settleable=%s, forfeitable=%s, provision_required=%s,
                    daily_rate_basis=%s, custom_daily_rate=%s,
                    include_fixed_allowances=%s, expense_account_code=%s,
                    liability_account_code=%s, is_active=%s, updated_at=NOW()
                WHERE company_id=%s AND id=%s
                RETURNING *;
            """, (
                int(body["leave_type_id"]), body["name"], body["annual_entitlement_days"],
                body.get("accrual_method") or "straight_line",
                body.get("monthly_accrual_days"),
                body.get("maximum_balance_days"),
                body.get("maximum_carry_forward_days"),
                body.get("carry_forward_expiry_months"),
                bool(body.get("vesting", False)),
                bool(body.get("cash_settleable", False)),
                bool(body.get("forfeitable", True)),
                provision_required,
                body.get("daily_rate_basis") or "monthly_div_21_67",
                body.get("custom_daily_rate"),
                bool(body.get("include_fixed_allowances", False)),
                expense_account,
                liability_account,
                bool(body.get("is_active", True)),
                int(company_id), int(policy_id),
            ))
        else:
            out = self.db.fetch_one(f"""
                INSERT INTO {schema}.payroll_leave_policies (
                    company_id, leave_type_id, name, annual_entitlement_days,
                    accrual_method, monthly_accrual_days, maximum_balance_days,
                    maximum_carry_forward_days, carry_forward_expiry_months,
                    vesting, cash_settleable, forfeitable, provision_required,
                    daily_rate_basis, custom_daily_rate, include_fixed_allowances,
                    expense_account_code, liability_account_code, is_active
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (company_id, leave_type_id)
                DO UPDATE SET
                    name=EXCLUDED.name,
                    annual_entitlement_days=EXCLUDED.annual_entitlement_days,
                    accrual_method=EXCLUDED.accrual_method,
                    monthly_accrual_days=EXCLUDED.monthly_accrual_days,
                    maximum_balance_days=EXCLUDED.maximum_balance_days,
                    maximum_carry_forward_days=EXCLUDED.maximum_carry_forward_days,
                    carry_forward_expiry_months=EXCLUDED.carry_forward_expiry_months,
                    vesting=EXCLUDED.vesting,
                    cash_settleable=EXCLUDED.cash_settleable,
                    forfeitable=EXCLUDED.forfeitable,
                    provision_required=EXCLUDED.provision_required,
                    daily_rate_basis=EXCLUDED.daily_rate_basis,
                    custom_daily_rate=EXCLUDED.custom_daily_rate,
                    include_fixed_allowances=EXCLUDED.include_fixed_allowances,
                    expense_account_code=EXCLUDED.expense_account_code,
                    liability_account_code=EXCLUDED.liability_account_code,
                    is_active=EXCLUDED.is_active,
                    updated_at=NOW()
                RETURNING *;
            """, (
                int(company_id), int(body["leave_type_id"]), body["name"],
                body["annual_entitlement_days"], body.get("accrual_method") or "straight_line",
                body.get("monthly_accrual_days"), body.get("maximum_balance_days"),
                body.get("maximum_carry_forward_days"), body.get("carry_forward_expiry_months"),
                bool(body.get("vesting", False)), bool(body.get("cash_settleable", False)),
                bool(body.get("forfeitable", True)), bool(body.get("provision_required", True)),
                body.get("daily_rate_basis") or "monthly_div_21_67",
                body.get("custom_daily_rate"), bool(body.get("include_fixed_allowances", False)),
                expense_account,
                liability_account,
                bool(body.get("is_active", True)),
            ))
        if not out:
            raise ValueError("Leave policy not found")
        self._audit(company_id, user_id, "save_leave_policy",
                    "payroll_leave_policy", out["id"], out, "Saved leave policy")
        return out

    def _daily_rate(self, monthly_salary: Decimal, policy: dict, settings: dict) -> Decimal:
        basis = policy.get("daily_rate_basis") or settings.get("default_daily_rate_basis")
        if basis == "custom":
            return rate(policy.get("custom_daily_rate"))
        if basis == "annual_div_260":
            days = dec(settings.get("working_days_per_year") or 260)
            return rate((monthly_salary * Decimal("12")) / days if days else D0)
        if basis == "monthly_div_working_days":
            days = dec(settings.get("working_days_per_year") or 260) / Decimal("12")
            return rate(monthly_salary / days if days else D0)
        return rate(monthly_salary / Decimal("21.67"))

    def leave_accrual_run_create(self, company_id: int, body: dict, user_id=None) -> dict:
        schema = self.schema(company_id)
        required = ["period_start", "period_end", "reporting_date"]
        missing = [k for k in required if not body.get(k)]
        if missing:
            raise ValueError("Missing required fields: " + ", ".join(missing))
        out = self.db.fetch_one(f"""
            INSERT INTO {schema}.payroll_leave_accrual_runs (
                company_id, run_no, period_start, period_end, reporting_date,
                status, created_by_user_id
            )
            VALUES (
                %s,
                'LEAVE-' || %s || '-' || TO_CHAR(%s::date,'YYYYMMDD'),
                %s,%s,%s,'draft',%s
            )
            ON CONFLICT (company_id, reporting_date)
            DO UPDATE SET period_start=EXCLUDED.period_start,
                          period_end=EXCLUDED.period_end
            RETURNING *;
        """, (
            int(company_id), int(company_id), body["reporting_date"],
            body["period_start"], body["period_end"], body["reporting_date"], user_id,
        ))
        return out

    def leave_accrual_calculate(self, company_id: int, run_id: int) -> dict:
        schema = self.schema(company_id)
        run = self.db.fetch_one(f"""
            SELECT * FROM {schema}.payroll_leave_accrual_runs
            WHERE company_id=%s AND id=%s;
        """, (int(company_id), int(run_id)))
        if not run:
            raise ValueError("Leave accrual run not found")
        if run["status"] in ("posted", "reversed"):
            raise ValueError("Posted or reversed leave run cannot be recalculated")

        settings = self.settings_get(company_id)
        policies = self.leave_policies_list(company_id)

        self.db.execute_sql(f"""
            DELETE FROM {schema}.payroll_leave_accrual_run_lines
            WHERE company_id=%s AND run_id=%s;
        """, (int(company_id), int(run_id)))

        employees = self.db.fetch_all(f"""
            SELECT e.id, e.employee_no, e.first_name, e.last_name,
                   COALESCE(ps.fixed_basic_amount, c.basic_salary,0) AS monthly_salary
            FROM {schema}.payroll_employees e
            LEFT JOIN LATERAL (
              SELECT fixed_basic_amount
              FROM {schema}.payroll_employee_pay_setups ps
              WHERE ps.company_id=e.company_id
                AND ps.employee_id=e.id
                AND ps.is_active=TRUE
                AND ps.effective_from<=%s
                AND (ps.effective_to IS NULL OR ps.effective_to>=%s)
              ORDER BY ps.effective_from DESC LIMIT 1
            ) ps ON TRUE
            LEFT JOIN LATERAL (
              SELECT basic_salary
              FROM {schema}.payroll_employee_contracts c
              WHERE c.company_id=e.company_id
                AND c.employee_id=e.id
                AND c.is_active=TRUE
              ORDER BY c.effective_from DESC LIMIT 1
            ) c ON TRUE
            WHERE e.company_id=%s
              AND e.employment_status='active'
              AND e.start_date<=%s
              AND (e.termination_date IS NULL OR e.termination_date>=%s);
        """, (
            run["period_end"], run["period_start"], int(company_id),
            run["period_end"], run["period_start"],
        ))

        total_opening = D0
        total_closing = D0

        period_start = run["period_start"]
        period_end = run["period_end"]
        period_days = Decimal(str((period_end - period_start).days + 1))
        year_days = Decimal("366" if period_end.year % 4 == 0 else "365")

        for emp in employees:
            monthly_salary = dec(emp.get("monthly_salary"))
            for policy in policies:
                if not policy.get("is_active") or not policy.get("provision_required"):
                    continue

                previous = self.db.fetch_one(f"""
                    SELECT closing_days, closing_provision
                    FROM {schema}.payroll_employee_leave_balances
                    WHERE company_id=%s AND employee_id=%s AND leave_type_id=%s
                      AND as_of_date<%s
                    ORDER BY as_of_date DESC LIMIT 1;
                """, (
                    int(company_id), int(emp["id"]), int(policy["leave_type_id"]),
                    run["reporting_date"],
                )) or {}

                opening_days = dec(previous.get("closing_days"))
                opening_provision = dec(previous.get("closing_provision"))

                if policy.get("accrual_method") == "monthly_fixed":
                    accrued_days = dec(policy.get("monthly_accrual_days"))
                elif policy.get("accrual_method") == "manual":
                    accrued_days = D0
                else:
                    accrued_days = dec(policy.get("annual_entitlement_days")) * period_days / year_days

                movements = self.db.fetch_one(f"""
                    SELECT
                      COALESCE(SUM(CASE WHEN movement_type='taken' THEN ABS(days) ELSE 0 END),0) AS taken,
                      COALESCE(SUM(CASE WHEN movement_type IN ('forfeited','expiry') THEN ABS(days) ELSE 0 END),0) AS forfeited,
                      COALESCE(SUM(CASE WHEN movement_type='adjustment' THEN days ELSE 0 END),0) AS adjusted,
                      COALESCE(SUM(CASE WHEN movement_type IN ('cash_settlement','termination_settlement') THEN ABS(days) ELSE 0 END),0) AS settled
                    FROM {schema}.payroll_employee_leave_movements
                    WHERE company_id=%s AND employee_id=%s AND leave_type_id=%s
                      AND movement_date BETWEEN %s AND %s;
                """, (
                    int(company_id), int(emp["id"]), int(policy["leave_type_id"]),
                    period_start, period_end,
                )) or {}

                taken = dec(movements.get("taken"))
                forfeited = dec(movements.get("forfeited"))
                adjusted = dec(movements.get("adjusted"))
                settled = dec(movements.get("settled"))

                closing_days = opening_days + accrued_days + adjusted - taken - forfeited - settled
                if closing_days < 0:
                    closing_days = D0

                cap = policy.get("maximum_balance_days")
                if cap not in (None, ""):
                    closing_days = min(closing_days, dec(cap))

                daily_rate = self._daily_rate(monthly_salary, policy, settings)
                closing_provision = money(closing_days * daily_rate)
                movement = money(closing_provision - opening_provision)

                self.db.execute_sql(f"""
                    INSERT INTO {schema}.payroll_leave_accrual_run_lines (
                        company_id, run_id, employee_id, leave_type_id,
                        opening_days, accrued_days, taken_days, forfeited_days,
                        closing_days, daily_rate, opening_provision,
                        closing_provision, movement_amount,
                        expense_account_code, liability_account_code, metadata
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb);
                """, (
                    int(company_id), int(run_id), int(emp["id"]), int(policy["leave_type_id"]),
                    opening_days, accrued_days, taken, forfeited, closing_days, daily_rate,
                    opening_provision, closing_provision, movement,
                    policy.get("expense_account_code"), policy.get("liability_account_code"),
                    '{"employee_no":"%s"}' % str(emp.get("employee_no") or "").replace('"', ''),
                ))

                self.db.execute_sql(f"""
                    INSERT INTO {schema}.payroll_employee_leave_balances (
                        company_id, employee_id, leave_type_id, as_of_date,
                        opening_days, accrued_days, taken_days, forfeited_days,
                        adjusted_days, settled_days, closing_days, daily_rate,
                        opening_provision, closing_provision, provision_movement
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (company_id, employee_id, leave_type_id, as_of_date)
                    DO UPDATE SET
                        opening_days=EXCLUDED.opening_days,
                        accrued_days=EXCLUDED.accrued_days,
                        taken_days=EXCLUDED.taken_days,
                        forfeited_days=EXCLUDED.forfeited_days,
                        adjusted_days=EXCLUDED.adjusted_days,
                        settled_days=EXCLUDED.settled_days,
                        closing_days=EXCLUDED.closing_days,
                        daily_rate=EXCLUDED.daily_rate,
                        opening_provision=EXCLUDED.opening_provision,
                        closing_provision=EXCLUDED.closing_provision,
                        provision_movement=EXCLUDED.provision_movement,
                        updated_at=NOW();
                """, (
                    int(company_id), int(emp["id"]), int(policy["leave_type_id"]), run["reporting_date"],
                    opening_days, accrued_days, taken, forfeited, adjusted, settled,
                    closing_days, daily_rate, opening_provision, closing_provision, movement,
                ))
                total_opening += opening_provision
                total_closing += closing_provision

        return self.db.fetch_one(f"""
            UPDATE {schema}.payroll_leave_accrual_runs
            SET status='calculated',
                total_opening_provision=%s,
                total_closing_provision=%s,
                total_movement=%s
            WHERE company_id=%s AND id=%s
            RETURNING *;
        """, (
            money(total_opening), money(total_closing),
            money(total_closing-total_opening), int(company_id), int(run_id),
        ))

    def leave_accrual_get(self, company_id: int, run_id: int) -> dict:
        schema = self.schema(company_id)
        run = self.db.fetch_one(f"""
            SELECT * FROM {schema}.payroll_leave_accrual_runs
            WHERE company_id=%s AND id=%s;
        """, (int(company_id), int(run_id)))
        if not run:
            raise ValueError("Leave accrual run not found")
        run["lines"] = self.db.fetch_all(f"""
            SELECT l.*, e.employee_no, e.first_name, e.last_name, lt.name AS leave_type_name
            FROM {schema}.payroll_leave_accrual_run_lines l
            JOIN {schema}.payroll_employees e ON e.id=l.employee_id
            JOIN {schema}.payroll_leave_types lt ON lt.id=l.leave_type_id
            WHERE l.company_id=%s AND l.run_id=%s
            ORDER BY e.employee_no, lt.name;
        """, (int(company_id), int(run_id)))
        return run

    def _account_names(self, company_id: int, codes: list[str]) -> dict:
        schema = self.schema(company_id)
        valid = [c for c in codes if c]
        if not valid:
            return {}
        rows = self.db.fetch_all(f"""
            SELECT code, name FROM {schema}.coa WHERE code=ANY(%s);
        """, (valid,))
        return {r["code"]: r["name"] for r in rows}

    def leave_journal_preview(self, company_id: int, run_id: int) -> dict:
        run = self.leave_accrual_get(company_id, run_id)
        grouped = {}
        missing = []
        for ln in run["lines"]:
            expense = ln.get("expense_account_code")
            liability = ln.get("liability_account_code")
            if not expense:
                missing.append("Leave expense account")
            if not liability:
                missing.append("Leave liability account")
            if not expense or not liability:
                continue
            key = (expense, liability)
            grouped[key] = grouped.get(key, D0) + dec(ln.get("movement_amount"))

        names = self._account_names(
            company_id,
            list({code for pair in grouped for code in pair})
        )
        lines = []
        for (expense, liability), movement in grouped.items():
            amount = money(abs(movement))
            if not amount:
                continue
            if movement > 0:
                lines.extend([
                    {"account_code": expense, "account_name": names.get(expense, expense),
                     "description": "IAS 19 leave accrual", "debit": amount, "credit": D0},
                    {"account_code": liability, "account_name": names.get(liability, liability),
                     "description": "IAS 19 accrued leave liability", "debit": D0, "credit": amount},
                ])
            else:
                lines.extend([
                    {"account_code": liability, "account_name": names.get(liability, liability),
                     "description": "IAS 19 leave liability release", "debit": amount, "credit": D0},
                    {"account_code": expense, "account_name": names.get(expense, expense),
                     "description": "IAS 19 leave expense release", "debit": D0, "credit": amount},
                ])

        debits = money(sum((dec(x["debit"]) for x in lines), D0))
        credits = money(sum((dec(x["credit"]) for x in lines), D0))
        invalid = [c for c in {x["account_code"] for x in lines} if c not in names]
        return {
            "run": run,
            "lines": lines,
            "debits": debits,
            "credits": credits,
            "difference": money(debits-credits),
            "missing_mappings": sorted(set(missing)),
            "invalid_accounts": invalid,
            "ready_to_post": bool(lines) and not missing and not invalid and debits == credits,
        }

    def leave_post(self, company_id: int, run_id: int, user_id=None) -> dict:
        schema = self.schema(company_id)
        preview = self.leave_journal_preview(company_id, run_id)
        run = preview["run"]
        if run["status"] == "posted":
            raise ValueError("Leave accrual run already posted")
        if run["status"] not in ("calculated", "approved"):
            raise ValueError("Leave accrual run must be calculated before posting")
        if not preview["ready_to_post"]:
            raise ValueError("Leave accrual journal is not ready to post")

        journal_id = self.db.post_journal(company_id, {
            "date": str(run["reporting_date"]),
            "ref": run["run_no"],
            "description": f"IAS 19 leave accrual {run['run_no']}",
            "source": self.JOURNAL_SOURCES["leave"],
            "source_id": int(run_id),
            "currency": self.settings_get(company_id).get("reporting_currency") or "USD",
            "gross_amount": preview["debits"],
            "net_amount": preview["debits"],
            "vat_amount": 0,
            "lines": [
                {
                    "account_code": x["account_code"],
                    "description": x["description"],
                    "debit": x["debit"],
                    "credit": x["credit"],
                }
                for x in preview["lines"]
            ],
            "created_by_user_id": user_id,
            "prepared_by_user_id": user_id,
            "module_name": "payroll",
        })
        out = self.db.fetch_one(f"""
            UPDATE {schema}.payroll_leave_accrual_runs
            SET status='posted', posted_journal_id=%s, posted_at=NOW()
            WHERE company_id=%s AND id=%s
            RETURNING *;
        """, (int(journal_id), int(company_id), int(run_id)))
        self._audit(company_id, user_id, "post_leave_accrual",
                    "payroll_leave_accrual_run", run_id, out,
                    "Posted IAS 19 leave accrual")
        return {"run": out, "journal_id": int(journal_id), "journal_preview": preview}

    def leave_balances_list(self, company_id: int, employee_id=None, leave_type_id=None, as_of_date=None) -> list[dict]:
        schema = self.schema(company_id)
        where = ["b.company_id=%s"]
        params: list[Any] = [int(company_id)]
        if employee_id:
            where.append("b.employee_id=%s")
            params.append(int(employee_id))
        if leave_type_id:
            where.append("b.leave_type_id=%s")
            params.append(int(leave_type_id))
        if as_of_date:
            where.append("b.as_of_date<=%s")
            params.append(as_of_date)
        return self.db.fetch_all(f"""
            SELECT DISTINCT ON (b.employee_id,b.leave_type_id)
                b.*,e.employee_no,e.first_name,e.last_name,lt.name AS leave_type_name
            FROM {schema}.payroll_employee_leave_balances b
            JOIN {schema}.payroll_employees e ON e.id=b.employee_id
            JOIN {schema}.payroll_leave_types lt ON lt.id=b.leave_type_id
            WHERE {' AND '.join(where)}
            ORDER BY b.employee_id,b.leave_type_id,b.as_of_date DESC,b.id DESC;
        """, tuple(params))

    def leave_balance_adjust(self, company_id: int, employee_id: int, leave_type_id: int, body: dict, user_id=None) -> dict:
        schema = self.schema(company_id)
        movement_date = body.get("movement_date") or date.today().isoformat()
        days = dec(body.get("days"))
        if not days:
            raise ValueError("days cannot be zero")
        out = self.db.fetch_one(f"""
            INSERT INTO {schema}.payroll_employee_leave_movements
                (company_id,employee_id,leave_type_id,movement_date,movement_type,days,reference,notes,created_by_user_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *;
        """, (int(company_id),int(employee_id),int(leave_type_id),movement_date,
              body.get("movement_type") or "adjustment",days,body.get("reference"),
              body.get("notes"),user_id))
        self._audit(company_id,user_id,"adjust_leave_balance","payroll_leave_movement",out["id"],out,"Adjusted employee leave balance")
        return out

    def _reverse_posted_run(self, company_id: int, table: str, run_id: int, source_key: str, user_id=None) -> dict:
        schema = self.schema(company_id)
        run = self.db.fetch_one(f"SELECT * FROM {schema}.{table} WHERE company_id=%s AND id=%s",(int(company_id),int(run_id)))
        if not run:
            raise ValueError("Run not found")
        if run.get("status") != "posted":
            raise ValueError("Only posted runs can be reversed")
        journal_id = run.get("posted_journal_id")
        if not journal_id:
            raise ValueError("Posted journal is missing")
        journal = self.db.fetch_one(f"SELECT * FROM {schema}.journals WHERE id=%s",(int(journal_id),))
        lines = self.db.fetch_all(f"SELECT * FROM {schema}.journal_lines WHERE journal_id=%s ORDER BY id",(int(journal_id),))
        reverse_id = self.db.post_journal(company_id,{
            "date":str(body_date := date.today()),"ref":f"REV-{run.get('run_no') or run_id}",
            "description":f"Reversal of {run.get('run_no') or run_id}","source":self.JOURNAL_SOURCES[source_key],
            "source_id":int(run_id),"currency":journal.get("currency") or self.settings_get(company_id).get("reporting_currency") or "USD",
            "gross_amount":sum((dec(x.get("credit")) for x in lines),D0),"net_amount":sum((dec(x.get("credit")) for x in lines),D0),"vat_amount":0,
            "lines":[{"account_code":x.get("account_code"),"description":f"Reversal: {x.get('description') or ''}","debit":x.get("credit") or 0,"credit":x.get("debit") or 0} for x in lines],
            "created_by_user_id":user_id,"prepared_by_user_id":user_id,"module_name":"payroll",
        })
        out = self.db.fetch_one(f"UPDATE {schema}.{table} SET status='reversed',reversal_journal_id=%s,reversed_at=NOW() WHERE company_id=%s AND id=%s RETURNING *",(int(reverse_id),int(company_id),int(run_id)))
        return {"run":out,"reversal_journal_id":int(reverse_id),"reversal_date":str(body_date)}

    def leave_reverse(self, company_id: int, run_id: int, user_id=None) -> dict:
        return self._reverse_posted_run(company_id,"payroll_leave_accrual_runs",run_id,"leave_reversal",user_id)

    def bonus_assignments_list(self, company_id: int, scheme_id=None) -> list[dict]:
        schema = self.schema(company_id)
        params: list[Any] = [int(company_id)]
        extra = ""
        if scheme_id:
            extra = " AND a.scheme_id=%s"
            params.append(int(scheme_id))
        return self.db.fetch_all(f"""
            SELECT a.*,s.code AS scheme_code,s.name AS scheme_name,e.employee_no,e.first_name,e.last_name
            FROM {schema}.payroll_employee_bonus_assignments a
            JOIN {schema}.payroll_bonus_schemes s ON s.id=a.scheme_id
            JOIN {schema}.payroll_employees e ON e.id=a.employee_id
            WHERE a.company_id=%s{extra} ORDER BY a.is_active DESC,e.employee_no;
        """,tuple(params))

    def bonus_assignment_save(self, company_id: int, body: dict, assignment_id=None, user_id=None) -> dict:
        schema = self.schema(company_id)
        for key in ("scheme_id","employee_id","effective_from"):
            if not body.get(key):
                raise ValueError(f"{key} is required")
        values=(int(body["scheme_id"]),int(body["employee_id"]),body["effective_from"],body.get("effective_to"),
                body.get("target_percentage"),body.get("probability_percentage"),body.get("performance_percentage"),bool(body.get("is_active",True)))
        if assignment_id:
            out=self.db.fetch_one(f"""UPDATE {schema}.payroll_employee_bonus_assignments SET scheme_id=%s,employee_id=%s,effective_from=%s,effective_to=%s,target_percentage=%s,probability_percentage=%s,performance_percentage=%s,is_active=%s,updated_at=NOW() WHERE company_id=%s AND id=%s RETURNING *""",values+(int(company_id),int(assignment_id)))
        else:
            out=self.db.fetch_one(f"""INSERT INTO {schema}.payroll_employee_bonus_assignments (company_id,scheme_id,employee_id,effective_from,effective_to,target_percentage,probability_percentage,performance_percentage,is_active) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",(int(company_id),)+values)
        if not out:
            raise ValueError("Bonus assignment not found")
        return out

    def bonus_runs_list(self, company_id: int) -> list[dict]:
        schema=self.schema(company_id)
        return self.db.fetch_all(f"SELECT * FROM {schema}.payroll_bonus_accrual_runs WHERE company_id=%s ORDER BY reporting_date DESC,id DESC",(int(company_id),))

    def bonus_run_create(self,company_id:int,body:dict,user_id=None)->dict:
        schema=self.schema(company_id)
        required=("period_start","period_end","reporting_date")
        missing=[x for x in required if not body.get(x)]

        if missing:
            raise ValueError(
                "Missing required fields: "+", ".join(missing)
            )

        start=body["period_start"]
        end=body["period_end"]
        reporting=body["reporting_date"]

        if str(end)<str(start):
            raise ValueError(
                "Period end cannot precede period start"
            )

        if str(reporting)<str(start) or str(reporting)>str(end):
            raise ValueError(
                "Reporting date must fall within the bonus period"
            )

        return self.db.fetch_one(f"""
            INSERT INTO {schema}.payroll_bonus_accrual_runs(
                company_id,
                run_no,
                period_start,
                period_end,
                reporting_date,
                status,
                created_by_user_id
            )
            VALUES(
                %s,
                'BONUS-'||%s||'-'||TO_CHAR(%s::date,'YYYYMMDD'),
                %s,%s,%s,
                'draft',
                %s
            )
            RETURNING *;
        """,(
            int(company_id),
            int(company_id),
            reporting,
            start,
            end,
            reporting,
            user_id,
        ))

    def bonus_run_get(self, company_id: int, run_id: int) -> dict:
        schema=self.schema(company_id)
        run=self.db.fetch_one(f"SELECT * FROM {schema}.payroll_bonus_accrual_runs WHERE company_id=%s AND id=%s",(int(company_id),int(run_id)))
        if not run:
            raise ValueError("Bonus accrual run not found")
        run["lines"]=self.db.fetch_all(f"""SELECT l.*,e.employee_no,e.first_name,e.last_name,s.code AS scheme_code,s.name AS scheme_name FROM {schema}.payroll_bonus_accrual_run_lines l JOIN {schema}.payroll_employees e ON e.id=l.employee_id JOIN {schema}.payroll_bonus_schemes s ON s.id=l.scheme_id WHERE l.company_id=%s AND l.run_id=%s ORDER BY e.employee_no,s.code""",(int(company_id),int(run_id)))
        return run

    def _employee_payroll_remuneration(
        self,
        company_id:int,
        employee_id:int,
        period_start,
        period_end,
    )->dict:
        schema=self.schema(company_id)

        row=self.db.fetch_one(f"""
            SELECT
                COALESCE(SUM(
                    CASE
                        WHEN rl.line_type='earning'
                        AND(
                            UPPER(COALESCE(rl.code,''))='BASIC'
                            OR rl.earning_type_id=
                                ps.basic_earning_type_id
                        )
                        THEN rl.amount
                        ELSE 0
                    END
                ),0) AS basic_salary,

                COALESCE(SUM(
                    CASE
                        WHEN rl.line_type='earning'
                        THEN rl.amount
                        ELSE 0
                    END
                ),0) AS gross_salary,

                COALESCE(SUM(
                    CASE
                        WHEN rl.line_type='earning'
                        AND rl.pensionable=TRUE
                        THEN rl.amount
                        ELSE 0
                    END
                ),0) AS pensionable_salary,

                COALESCE(SUM(
                    CASE
                        WHEN rl.line_type='earning'
                        AND rl.taxable=TRUE
                        THEN rl.amount
                        ELSE 0
                    END
                ),0) AS taxable_salary

            FROM {schema}.payroll_runs r

            JOIN {schema}.payroll_run_lines rl
            ON rl.company_id=r.company_id
            AND rl.payroll_run_id=r.id
            AND rl.employee_id=%s

            LEFT JOIN LATERAL(
                SELECT basic_earning_type_id
                FROM {schema}.payroll_employee_pay_setups ps0
                WHERE ps0.company_id=r.company_id
                AND ps0.employee_id=rl.employee_id
                AND ps0.is_active=TRUE
                AND ps0.effective_from<=r.period_end
                AND(
                    ps0.effective_to IS NULL
                    OR ps0.effective_to>=r.period_start
                )
                ORDER BY ps0.effective_from DESC,ps0.id DESC
                LIMIT 1
            ) ps ON TRUE

            WHERE r.company_id=%s
            AND r.period_start>=%s
            AND r.period_end<=%s
            AND r.status IN(
                'calculated',
                'approved',
                'posted'
            )
            AND COALESCE(rl.source_type,'')
                <> 'bonus_scheme';
        """,(
            int(employee_id),
            int(company_id),
            period_start,
            period_end,
        )) or {}

        return{
            "basic_salary":money(row.get("basic_salary")),
            "gross_salary":money(row.get("gross_salary")),
            "pensionable_salary":money(
                row.get("pensionable_salary")
            ),
            "taxable_salary":money(
                row.get("taxable_salary")
            ),
        }
        
    def bonus_run_calculate(
        self,
        company_id:int,
        run_id:int,
    )->dict:
        schema=self.schema(company_id)
        run=self.bonus_run_get(company_id,run_id)

        if not run:
            raise ValueError("Bonus accrual run not found")

        if run["status"] in("posted","reversed"):
            raise ValueError(
                "Posted or reversed run cannot be recalculated"
            )

        self.db.execute_sql(f"""
            DELETE FROM {schema}.payroll_bonus_accrual_run_lines
            WHERE company_id=%s
            AND run_id=%s;
        """,(
            int(company_id),
            int(run_id),
        ))

        rows=self.db.fetch_all(f"""
            SELECT
                a.*,
                e.employee_no,
                e.first_name,
                e.last_name,

                s.name AS scheme_name,
                s.measurement_basis,

                s.target_percentage
                    AS scheme_target,

                s.probability_percentage
                    AS scheme_probability,

                s.performance_percentage
                    AS scheme_performance,

                s.expense_account_code,
                s.liability_account_code

            FROM {schema}.payroll_employee_bonus_assignments a

            JOIN {schema}.payroll_bonus_schemes s
            ON s.id=a.scheme_id
            AND s.company_id=a.company_id

            JOIN {schema}.payroll_employees e
            ON e.id=a.employee_id
            AND e.company_id=a.company_id

            WHERE a.company_id=%s
            AND a.is_active=TRUE
            AND s.is_active=TRUE
            AND e.employment_status='active'

            AND a.effective_from<=%s
            AND(
                a.effective_to IS NULL
                OR a.effective_to>=%s
            );
        """,(
            int(company_id),
            run["period_end"],
            run["period_start"],
        ))

        if not rows:
            raise ValueError(
                "No active bonus assignments overlap the selected "
                "bonus accrual period."
            )

        total_expected=D0
        total_opening=D0
        total_closing=D0
        total_movement=D0

        missing_payroll=[]

        for row in rows:
            basis=str(
                row.get("measurement_basis")
                or "basic_salary"
            ).strip()

            if basis not in self.BONUS_BASES:
                raise ValueError(
                    f"Unsupported bonus measurement basis: {basis}"
                )

            target=dec(
                row.get("target_percentage")
                if row.get("target_percentage") is not None
                else row.get("scheme_target")
            )

            probability=dec(
                row.get("probability_percentage")
                if row.get("probability_percentage") is not None
                else row.get("scheme_probability")
            )

            performance=dec(
                row.get("performance_percentage")
                if row.get("performance_percentage") is not None
                else row.get("scheme_performance")
            )

            remuneration=self._employee_payroll_remuneration(
                company_id,
                int(row["employee_id"]),
                run["period_start"],
                run["period_end"],
            )

            eligible=money(remuneration.get(basis))

            if eligible<=D0:
                employee_name=" ".join(
                    str(x or "").strip()
                    for x in(
                        row.get("employee_no"),
                        row.get("first_name"),
                        row.get("last_name"),
                    )
                    if str(x or "").strip()
                )

                missing_payroll.append(
                    f"{employee_name or row['employee_id']} "
                    f"({basis.replace('_',' ')})"
                )
                continue

            expected=money(
                eligible
                *target/Decimal("100")
                *probability/Decimal("100")
                *performance/Decimal("100")
            )

            previous=self.db.fetch_one(f"""
                SELECT l.closing_liability AS amount
                FROM {schema}.payroll_bonus_accrual_run_lines l

                JOIN {schema}.payroll_bonus_accrual_runs r
                ON r.id=l.run_id
                AND r.company_id=l.company_id

                WHERE l.company_id=%s
                AND l.employee_id=%s
                AND l.scheme_id=%s
                AND r.reporting_date<%s
                AND r.status IN(
                    'calculated',
                    'approved',
                    'posted'
                )

                ORDER BY r.reporting_date DESC,r.id DESC
                LIMIT 1;
            """,(
                int(company_id),
                int(row["employee_id"]),
                int(row["scheme_id"]),
                run["reporting_date"],
            )) or {}

            opening=money(previous.get("amount"))
            closing=expected
            movement=money(closing-opening)

            self.db.execute_sql(f"""
                INSERT INTO
                    {schema}.payroll_bonus_accrual_run_lines(
                        company_id,
                        run_id,
                        scheme_id,
                        employee_id,

                        eligible_remuneration,
                        target_percentage,
                        probability_percentage,
                        performance_percentage,
                        service_completion_percentage,

                        expected_bonus,
                        opening_liability,
                        closing_liability,
                        movement_amount,

                        expense_account_code,
                        liability_account_code
                    )
                VALUES(
                    %s,%s,%s,%s,
                    %s,%s,%s,%s,%s,
                    %s,%s,%s,%s,
                    %s,%s
                );
            """,(
                int(company_id),
                int(run_id),
                int(row["scheme_id"]),
                int(row["employee_id"]),

                eligible,
                target,
                probability,
                performance,
                Decimal("100"),

                expected,
                opening,
                closing,
                movement,

                row.get("expense_account_code"),
                row.get("liability_account_code"),
            ))

            total_expected+=expected
            total_opening+=opening
            total_closing+=closing
            total_movement+=movement

        if missing_payroll:
            raise ValueError(
                "No eligible payroll remuneration was found for: "
                +", ".join(missing_payroll)
                +". Calculate payroll for the selected period first."
            )

        out=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_bonus_accrual_runs
            SET
                status='calculated',
                calculated_at=NOW(),
                total_expected_bonus=%s,
                total_opening_liability=%s,
                total_closing_liability=%s,
                total_movement=%s
            WHERE company_id=%s
            AND id=%s
            RETURNING *;
        """,(
            money(total_expected),
            money(total_opening),
            money(total_closing),
            money(total_movement),
            int(company_id),
            int(run_id),
        ))

        if not out:
            raise ValueError("Bonus accrual run not found")

        return self.bonus_run_get(company_id,run_id)

    def _movement_preview(self, company_id: int, run: dict, lines: list[dict], label: str) -> dict:
        grouped={}; missing=[]
        for line in lines:
            expense=line.get("expense_account_code"); liability=line.get("liability_account_code")
            if not expense: missing.append(f"{label} expense account")
            if not liability: missing.append(f"{label} liability account")
            if expense and liability:
                key=(expense,liability); grouped[key]=grouped.get(key,D0)+dec(line.get("movement_amount"))
        names=self._account_names(company_id,list({x for pair in grouped for x in pair})); out=[]
        for (expense,liability),movement in grouped.items():
            amount=money(abs(movement))
            if not amount: continue
            if movement>0:
                out += [{"account_code":expense,"account_name":names.get(expense,expense),"description":f"IAS 19 {label} expense","debit":amount,"credit":D0},{"account_code":liability,"account_name":names.get(liability,liability),"description":f"IAS 19 {label} liability","debit":D0,"credit":amount}]
            else:
                out += [{"account_code":liability,"account_name":names.get(liability,liability),"description":f"IAS 19 {label} release","debit":amount,"credit":D0},{"account_code":expense,"account_name":names.get(expense,expense),"description":f"IAS 19 {label} release","debit":D0,"credit":amount}]
        debits=money(sum((dec(x["debit"]) for x in out),D0)); credits=money(sum((dec(x["credit"]) for x in out),D0)); invalid=[c for c in {x["account_code"] for x in out} if c not in names]
        return {"run":run,"lines":out,"debits":debits,"credits":credits,"difference":money(debits-credits),"missing_mappings":sorted(set(missing)),"invalid_accounts":invalid,"ready_to_post":bool(out) and not missing and not invalid and debits==credits}

    def bonus_journal_preview(self, company_id: int, run_id: int) -> dict:
        run=self.bonus_run_get(company_id,run_id)
        return self._movement_preview(company_id,run,run["lines"],"bonus accrual")

    def bonus_post(self, company_id: int, run_id: int, user_id=None) -> dict:
        schema=self.schema(company_id); preview=self.bonus_journal_preview(company_id,run_id); run=preview["run"]
        if run["status"] not in ("calculated","approved"): raise ValueError("Bonus run must be calculated before posting")
        if not preview["ready_to_post"]: raise ValueError("Bonus journal is not ready to post")
        journal_id=self.db.post_journal(company_id,{"date":str(run["reporting_date"]),"ref":run["run_no"],"description":f"IAS 19 bonus accrual {run['run_no']}","source":self.JOURNAL_SOURCES["bonus"],"source_id":int(run_id),"currency":self.settings_get(company_id).get("reporting_currency") or "USD","gross_amount":preview["debits"],"net_amount":preview["debits"],"vat_amount":0,"lines":[{"account_code":x["account_code"],"description":x["description"],"debit":x["debit"],"credit":x["credit"]} for x in preview["lines"]],"created_by_user_id":user_id,"prepared_by_user_id":user_id,"module_name":"payroll"})
        out=self.db.fetch_one(f"UPDATE {schema}.payroll_bonus_accrual_runs SET status='posted',posted_journal_id=%s,posted_at=NOW() WHERE company_id=%s AND id=%s RETURNING *",(int(journal_id),int(company_id),int(run_id)))
        return {"run":out,"journal_id":int(journal_id),"journal_preview":preview}

    def bonus_reverse(self, company_id: int, run_id: int, user_id=None) -> dict:
        return self._reverse_posted_run(company_id,"payroll_bonus_accrual_runs",run_id,"bonus_reversal",user_id)

    # ---------------- Benefit plans / memberships ----------------

    PLAN_TYPES={
        "defined_contribution","defined_benefit",
        "medical_post_employment","other_post_employment",
    }

    def _plan_get(self,company_id:int,plan_id:int)->dict:
        schema=self.schema(company_id)
        row=self.db.fetch_one(f"""
            SELECT p.*,
                   COUNT(m.id) FILTER(WHERE m.is_active=TRUE)::INT AS active_members,
                   COUNT(m.id)::INT AS total_members
            FROM {schema}.payroll_benefit_plans p
            LEFT JOIN {schema}.payroll_benefit_plan_members m
              ON m.company_id=p.company_id AND m.plan_id=p.id
            WHERE p.company_id=%s AND p.id=%s
            GROUP BY p.id;
        """,(int(company_id),int(plan_id)))
        if not row: raise ValueError("Benefit plan not found")
        return row

    def benefit_plans_list(self,company_id:int,plan_type=None)->list[dict]:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        params=[int(company_id)]; extra=""
        if plan_type:
            if plan_type not in self.PLAN_TYPES: raise ValueError("Invalid benefit plan type")
            extra=" AND p.plan_type=%s"; params.append(plan_type)
        return self.db.fetch_all(f"""
            SELECT p.*,
                   COUNT(m.id) FILTER(WHERE m.is_active=TRUE)::INT AS active_members,
                   COUNT(m.id)::INT AS total_members
            FROM {schema}.payroll_benefit_plans p
            LEFT JOIN {schema}.payroll_benefit_plan_members m
              ON m.company_id=p.company_id AND m.plan_id=p.id
            WHERE p.company_id=%s{extra}
            GROUP BY p.id
            ORDER BY p.is_active DESC,p.code;
        """,tuple(params))

    def benefit_plan_save(
        self,
        company_id:int,
        body:dict,
        plan_id=None,
        user_id=None,
    )->dict:
        self.ensure_ready(company_id)
        schema=self.schema(company_id)

        name=str(body.get("name") or "").strip()
        plan_type=str(body.get("plan_type") or "").strip()

        if not name or not plan_type:
            raise ValueError("Name and plan type are required")

        if plan_type not in self.PLAN_TYPES:
            raise ValueError("Invalid benefit plan type")

        calculation_source=str(
            body.get("calculation_source") or "payroll_actual"
        ).strip()

        if calculation_source not in(
            "payroll_actual",
            "setup_estimate",
            "percentage",
        ):
            raise ValueError("Invalid contribution source")

        employee_deduction_type_id=(
            int(body["employee_deduction_type_id"])
            if body.get("employee_deduction_type_id")
            else None
        )

        employer_contribution_type_id=(
            int(body["employer_contribution_type_id"])
            if body.get("employer_contribution_type_id")
            else None
        )

        if plan_type=="defined_contribution":
            if not employee_deduction_type_id:
                raise ValueError(
                    "Employee contribution deduction is required"
                )

            if not employer_contribution_type_id:
                raise ValueError(
                    "Employer contribution item is required"
                )
    
        if plan_id:
            current=self._plan_get(company_id,plan_id)
            code=current["code"]
        else:
            code=self._next_code(
                company_id,
                "benefit_plan",
                "payroll_benefit_plans",
                "code",
            )

        if plan_type=="defined_contribution":
            expense=self._mapped_posting_account(
                company_id,
                body.get("expense_account_code"),
                "payroll_defined_contribution_expense",
                "payroll_employer_contribution_expense",
                required=True,
                label="Defined-contribution expense account",
            )

            payable=self._mapped_posting_account(
                company_id,
                body.get("payable_account_code"),
                "payroll_defined_contribution_payable",
                "payroll_pension_payable",
                required=True,
                label="Defined-contribution payable account",
            )

            liability=asset=oci=None

        elif plan_type=="defined_benefit":
            expense=self._mapped_posting_account(
                company_id,
                body.get("expense_account_code"),
                "payroll_defined_benefit_expense",
                required=True,
                label="Defined-benefit expense account",
            )

            liability=self._mapped_posting_account(
                company_id,
                body.get("liability_account_code"),
                "payroll_defined_benefit_liability",
                required=True,
                label="Defined-benefit liability account",
            )

            asset=self._mapped_posting_account(
                company_id,
                body.get("asset_account_code"),
                "payroll_defined_benefit_asset",
                required=bool(body.get("funded",False)),
                label="Defined-benefit plan asset account",
            )

            oci=self._mapped_posting_account(
                company_id,
                body.get("oci_account_code"),
                "payroll_defined_benefit_oci",
                required=True,
                label="Defined-benefit OCI account",
            )

            payable=None

        else:
            expense=self._mapped_posting_account(
                company_id,
                body.get("expense_account_code"),
                "payroll_defined_benefit_expense",
                required=False,
                label="Post-employment benefit expense account",
            )

            liability=self._mapped_posting_account(
                company_id,
                body.get("liability_account_code"),
                "payroll_defined_benefit_liability",
                required=False,
                label="Post-employment benefit liability account",
            )

            asset=self._mapped_posting_account(
                company_id,
                body.get("asset_account_code"),
                "payroll_defined_benefit_asset",
                required=False,
                label="Post-employment benefit asset account",
            )

            oci=self._mapped_posting_account(
                company_id,
                body.get("oci_account_code"),
                "payroll_defined_benefit_oci",
                required=False,
                label="Post-employment benefit OCI account",
            )

            payable=None
        start=body.get("effective_from")
        end=body.get("effective_to")

        if start and end and str(end)<str(start):
            raise ValueError(
                "Effective-to date cannot precede effective-from date"
            )

        values=(
            code,
            name,
            plan_type,
            body.get("provider_name"),
            body.get("registration_number"),
            bool(body.get("funded",False)),
            rate(body.get("employee_contribution_percentage")),
            rate(body.get("employer_contribution_percentage")),
            expense,
            payable,
            liability,
            asset,
            oci,
            start,
            end,
            calculation_source,
            employee_deduction_type_id,
            employer_contribution_type_id,
            bool(body.get("is_active",True)),
        )

        if plan_id:
            out=self.db.fetch_one(f"""
                UPDATE {schema}.payroll_benefit_plans SET
                    code=%s,
                    name=%s,
                    plan_type=%s,
                    provider_name=%s,
                    registration_number=%s,
                    funded=%s,
                    employee_contribution_percentage=%s,
                    employer_contribution_percentage=%s,
                    expense_account_code=%s,
                    payable_account_code=%s,
                    liability_account_code=%s,
                    asset_account_code=%s,
                    oci_account_code=%s,
                    effective_from=%s,
                    effective_to=%s,
                    calculation_source=%s,
                    employee_deduction_type_id=%s,
                    employer_contribution_type_id=%s,
                    is_active=%s,
                    updated_at=NOW()
                WHERE company_id=%s AND id=%s
                RETURNING *;
            """,values+(int(company_id),int(plan_id)))
        else:
            out=self.db.fetch_one(f"""
                INSERT INTO {schema}.payroll_benefit_plans(
                    company_id,code,name,plan_type,
                    provider_name,registration_number,funded,
                    employee_contribution_percentage,
                    employer_contribution_percentage,
                    expense_account_code,payable_account_code,
                    liability_account_code,asset_account_code,
                    oci_account_code,effective_from,
                    effective_to,
                    calculation_source=%s,
                    employee_deduction_type_id=%s,
                    employer_contribution_type_id=%s,
                    is_active
                ) VALUES(
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s 
                )
                RETURNING *;
            """,(int(company_id),)+values)

        if not out:
            raise ValueError("Benefit plan not found")

        self._audit(
            company_id,user_id,
            "save_benefit_plan",
            "payroll_benefit_plan",
            out["id"],out,
            "Saved employee-benefit plan",
        )

        return self._plan_get(company_id,out["id"])
    
    def plan_members_list(self,company_id:int,plan_id:int)->list[dict]:
        self._plan_get(company_id,plan_id); schema=self.schema(company_id)
        return self.db.fetch_all(f"""
            SELECT m.*,e.employee_no,e.first_name,e.last_name,
                   CONCAT_WS(' ',e.first_name,e.last_name) AS employee_name,
                   COALESCE(m.employee_percentage,p.employee_contribution_percentage,0)
                       AS effective_employee_percentage,
                   COALESCE(m.employer_percentage,p.employer_contribution_percentage,0)
                       AS effective_employer_percentage
            FROM {schema}.payroll_benefit_plan_members m
            JOIN {schema}.payroll_benefit_plans p
              ON p.id=m.plan_id AND p.company_id=m.company_id
            JOIN {schema}.payroll_employees e
              ON e.id=m.employee_id AND e.company_id=m.company_id
            WHERE m.company_id=%s AND m.plan_id=%s
            ORDER BY m.is_active DESC,e.last_name,e.first_name,m.effective_from DESC;
        """,(int(company_id),int(plan_id)))

    def plan_member_save(self,company_id:int,plan_id:int,body:dict,member_id=None,user_id=None)->dict:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        plan=self._plan_get(company_id,plan_id)
        employee_id=int(body.get("employee_id") or 0)
        effective_from=body.get("effective_from")
        effective_to=body.get("effective_to")
        if not employee_id or not effective_from: raise ValueError("Employee and effective-from date are required")
        if effective_to and str(effective_to)<str(effective_from): raise ValueError("Effective-to date cannot precede effective-from date")

        employee=self.db.fetch_one(f"""
            SELECT id FROM {schema}.payroll_employees
            WHERE company_id=%s AND id=%s;
        """,(int(company_id),employee_id))
        if not employee: raise ValueError("Employee not found")

        ep=body.get("employee_percentage")
        rp=body.get("employer_percentage")
        pp=body.get("pensionable_percentage",100)
        for label,value in (
            ("Employee percentage",ep),("Employer percentage",rp),
            ("Pensionable percentage",pp),
        ):
            if value not in (None,"") and not D0<=dec(value)<=Decimal("100"):
                raise ValueError(f"{label} must be between 0 and 100")

        values=(
            employee_id,body.get("membership_number"),
            rate(ep) if ep not in (None,"") else None,
            rate(rp) if rp not in (None,"") else None,
            rate(pp),effective_from,effective_to,
            bool(body.get("is_active",True)),body.get("notes"),
        )

        if member_id:
            out=self.db.fetch_one(f"""
                UPDATE {schema}.payroll_benefit_plan_members SET
                    employee_id=%s,membership_number=%s,
                    employee_percentage=%s,employer_percentage=%s,
                    pensionable_percentage=%s,effective_from=%s,effective_to=%s,
                    is_active=%s,notes=%s,updated_at=NOW()
                WHERE company_id=%s AND plan_id=%s AND id=%s RETURNING *;
            """,values+(int(company_id),int(plan_id),int(member_id)))
        else:
            out=self.db.fetch_one(f"""
                INSERT INTO {schema}.payroll_benefit_plan_members(
                    company_id,plan_id,employee_id,membership_number,
                    employee_percentage,employer_percentage,
                    pensionable_percentage,effective_from,effective_to,
                    is_active,notes
                ) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *;
            """,(int(company_id),int(plan_id))+values)

        if not out: raise ValueError("Plan member not found")
        self._audit(company_id,user_id,"save_benefit_plan_member",
                    "payroll_benefit_plan_member",out["id"],out,
                    f"Saved membership for plan {plan['code']}")
        return next(
            x for x in self.plan_members_list(company_id,plan_id)
            if int(x["id"])==int(out["id"])
        )

    def benefit_plan_workspace(self,company_id:int,plan_id:int)->dict:
        return {
            "plan":self._plan_get(company_id,plan_id),
            "members":self.plan_members_list(company_id,plan_id),
        }

    # ---------------- Defined-contribution runs ----------------

    def dc_runs_list(self,company_id:int)->list[dict]:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        return self.db.fetch_all(f"""
            SELECT r.*,COUNT(l.id)::INT AS line_count
            FROM {schema}.payroll_defined_contribution_runs r
            LEFT JOIN {schema}.payroll_defined_contribution_run_lines l
              ON l.company_id=r.company_id AND l.run_id=r.id
            WHERE r.company_id=%s
            GROUP BY r.id
            ORDER BY r.reporting_date DESC,r.id DESC;
        """,(int(company_id),))

    def dc_run_create(
        self,
        company_id:int,
        body:dict,
        user_id=None,
    )->dict:
        self.ensure_ready(company_id)
        schema=self.schema(company_id)

        required=(
            "plan_id",
            "period_start",
            "period_end",
            "reporting_date",
        )
        missing=[x for x in required if not body.get(x)]

        if missing:
            raise ValueError(
                "Missing required fields: "+", ".join(missing)
            )

        plan_id=int(body["plan_id"])
        start=body["period_start"]
        end=body["period_end"]
        reporting=body["reporting_date"]

        if str(end)<str(start):
            raise ValueError(
                "Period end cannot precede period start"
            )

        if str(reporting)<str(start) or str(reporting)>str(end):
            raise ValueError(
                "Reporting date must fall within the contribution period"
            )

        plan=self.db.fetch_one(f"""
            SELECT id,name,plan_type,is_active
            FROM {schema}.payroll_benefit_plans
            WHERE company_id=%s AND id=%s
            LIMIT 1;
        """,(int(company_id),plan_id))

        if not plan:
            raise ValueError("Benefit plan not found")

        if plan["plan_type"]!="defined_contribution":
            raise ValueError(
                "Selected plan is not a defined-contribution plan"
            )

        if not plan.get("is_active"):
            raise ValueError("Selected benefit plan is inactive")

        out=self.db.fetch_one(f"""
            INSERT INTO
                {schema}.payroll_defined_contribution_runs(
                    company_id,
                    plan_id,
                    run_no,
                    period_start,
                    period_end,
                    reporting_date,
                    status,
                    created_by_user_id
                )
            VALUES(
                %s,%s,
                'DC-'||TO_CHAR(%s::date,'YYYYMMDD'),
                %s,%s,%s,
                'draft',
                %s
            )
            ON CONFLICT(company_id,reporting_date)
            DO UPDATE SET
                plan_id=EXCLUDED.plan_id,
                period_start=EXCLUDED.period_start,
                period_end=EXCLUDED.period_end
            WHERE
                {schema}.payroll_defined_contribution_runs.status='draft'
            RETURNING *;
        """,(
            int(company_id),
            plan_id,
            reporting,
            start,
            end,
            reporting,
            user_id,
        ))

        if not out:
            raise ValueError(
                "A non-draft defined-contribution run already exists "
                "for this reporting date"
            )

        self._audit(
            company_id,user_id,
            "create_defined_contribution_run",
            "payroll_defined_contribution_run",
            out["id"],out,
            "Created defined-contribution run",
        )

        return out

    def dc_run_get(self,company_id:int,run_id:int)->dict:
        schema=self.schema(company_id)
        run=self.db.fetch_one(f"""
            SELECT * FROM {schema}.payroll_defined_contribution_runs
            WHERE company_id=%s AND id=%s;
        """,(int(company_id),int(run_id)))
        if not run: raise ValueError("Defined-contribution run not found")

        lines=self.db.fetch_all(f"""
            SELECT l.*,p.code AS plan_code,p.name AS plan_name,
                   e.employee_no,e.first_name,e.last_name,
                   CONCAT_WS(' ',e.first_name,e.last_name) AS employee_name
            FROM {schema}.payroll_defined_contribution_run_lines l
            JOIN {schema}.payroll_benefit_plans p ON p.id=l.plan_id
            JOIN {schema}.payroll_employees e ON e.id=l.employee_id
            WHERE l.company_id=%s AND l.run_id=%s
            ORDER BY p.code,e.employee_no;
        """,(int(company_id),int(run_id)))
        return {"run":run,"lines":lines}

    def _dc_payroll_lines(
        self,
        company_id:int,
        run:dict,
    )->list[dict]:
        schema=self.schema(company_id)

        return self.db.fetch_all(f"""
            SELECT
                p.id AS plan_id,
                p.code AS plan_code,
                p.name AS plan_name,
                p.expense_account_code,
                p.payable_account_code,

                e.id AS employee_id,
                e.employee_no,
                e.first_name,
                e.last_name,

                MIN(pr.id) AS payroll_run_id,

                COALESCE(SUM(
                    CASE
                        WHEN rl.line_type='earning'
                        AND rl.pensionable=TRUE
                        THEN rl.amount
                        ELSE 0
                    END
                ),0) AS pensionable_remuneration,

                COALESCE(SUM(
                    CASE
                        WHEN rl.line_type='deduction'
                        AND rl.deduction_type_id=
                            p.employee_deduction_type_id
                        THEN rl.amount
                        ELSE 0
                    END
                ),0) AS employee_contribution,

                COALESCE(SUM(
                    CASE
                        WHEN rl.line_type='employer_contribution'
                        AND rl.contribution_type_id=
                            p.employer_contribution_type_id
                        THEN rl.amount
                        ELSE 0
                    END
                ),0) AS employer_contribution

            FROM {schema}.payroll_benefit_plans p

            JOIN {schema}.payroll_benefit_plan_members m
            ON m.company_id=p.company_id
            AND m.plan_id=p.id
            AND m.is_active=TRUE

            JOIN {schema}.payroll_employees e
            ON e.company_id=m.company_id
            AND e.id=m.employee_id

            JOIN {schema}.payroll_runs pr
            ON pr.company_id=p.company_id
            AND pr.period_start>=%s
            AND pr.period_end<=%s
            AND pr.status IN(
                'calculated',
                'approved',
                'posted'
            )

            JOIN {schema}.payroll_run_lines rl
            ON rl.company_id=pr.company_id
            AND rl.payroll_run_id=pr.id
            AND rl.employee_id=e.id

            WHERE p.company_id=%s
            AND p.id=%s
            AND p.plan_type='defined_contribution'
            AND p.is_active=TRUE
            AND e.employment_status='active'
            AND m.effective_from<=pr.period_end
            AND(
                m.effective_to IS NULL
                OR m.effective_to>=pr.period_start
            )

            GROUP BY
                p.id,
                p.code,
                p.name,
                p.expense_account_code,
                p.payable_account_code,
                e.id,
                e.employee_no,
                e.first_name,
                e.last_name

            ORDER BY e.employee_no;
        """,(
            run["period_start"],
            run["period_end"],
            int(company_id),
            int(run["plan_id"]),
        ))

    def dc_run_calculate(
        self,
        company_id:int,
        run_id:int,
    )->dict:
        schema=self.schema(company_id)
        data=self.dc_run_get(company_id,run_id)
        run=data["run"]

        if run["status"] in("posted","reversed"):
            raise ValueError(
                "Posted or reversed run cannot be recalculated"
            )

        self.db.execute_sql(f"""
            DELETE FROM
                {schema}.payroll_defined_contribution_run_lines
            WHERE company_id=%s
            AND run_id=%s;
        """,(int(company_id),int(run_id)))

        rows=self._dc_payroll_lines(company_id,run)

        if not rows:
            raise ValueError(
                "No calculated payroll lines were found for the "
                "selected plan and period. Calculate payroll first "
                "or use an estimate contribution source."
            )

        pensionable=employee_total=employer_total=D0
        linked_payroll_ids=set()

        for row in rows:
            employee=money(row.get("employee_contribution"))
            employer=money(row.get("employer_contribution"))
            remuneration=money(
                row.get("pensionable_remuneration")
            )
            total=money(employee+employer)

            if not total:
                continue

            payroll_run_id=row.get("payroll_run_id")
            if payroll_run_id:
                linked_payroll_ids.add(int(payroll_run_id))

            self.db.execute_sql(f"""
                INSERT INTO
                    {schema}.payroll_defined_contribution_run_lines(
                        company_id,
                        run_id,
                        plan_id,
                        member_id,
                        employee_id,
                        pensionable_remuneration,
                        employee_percentage,
                        employer_percentage,
                        employee_contribution,
                        employer_contribution,
                        total_contribution,
                        expense_account_code,
                        payable_account_code
                    )
                SELECT
                    %s,%s,%s,
                    m.id,
                    %s,
                    %s,
                    0,
                    0,
                    %s,%s,%s,
                    %s,%s
                FROM {schema}.payroll_benefit_plan_members m
                WHERE m.company_id=%s
                AND m.plan_id=%s
                AND m.employee_id=%s
                LIMIT 1;
            """,(
                int(company_id),
                int(run_id),
                int(row["plan_id"]),
                int(row["employee_id"]),
                remuneration,
                employee,
                employer,
                total,
                row.get("expense_account_code"),
                row.get("payable_account_code"),
                int(company_id),
                int(row["plan_id"]),
                int(row["employee_id"]),
            ))

            pensionable+=remuneration
            employee_total+=employee
            employer_total+=employer

        if not employee_total and not employer_total:
            raise ValueError(
                "Payroll was found, but it contains no contribution "
                "lines mapped to the selected benefit plan."
            )

        payroll_run_id=(
            next(iter(linked_payroll_ids))
            if len(linked_payroll_ids)==1
            else None
        )

        out=self.db.fetch_one(f"""
            UPDATE
                {schema}.payroll_defined_contribution_runs
            SET
                payroll_run_id=%s,
                total_pensionable_remuneration=%s,
                total_employee_contribution=%s,
                total_employer_contribution=%s,
                total_payable=%s,
                status='calculated'
            WHERE company_id=%s
            AND id=%s
            RETURNING *;
        """,(
            payroll_run_id,
            money(pensionable),
            money(employee_total),
            money(employer_total),
            money(employee_total+employer_total),
            int(company_id),
            int(run_id),
        ))

        return self.dc_run_get(company_id,out["id"])

    def dc_journal_preview(self,company_id:int,run_id:int)->dict:
        schema=self.schema(company_id)
        data=self.dc_run_get(company_id,run_id); run=data["run"]
        if run["status"]=="draft":
            raise ValueError("Calculate the run before previewing the journal")

        rows=self.db.fetch_all(f"""
            SELECT plan_id,expense_account_code,payable_account_code,
                   SUM(employee_contribution) AS employee_amount,
                   SUM(employer_contribution) AS employer_amount,
                   SUM(total_contribution) AS total_amount
            FROM {schema}.payroll_defined_contribution_run_lines
            WHERE company_id=%s AND run_id=%s
            GROUP BY plan_id,expense_account_code,payable_account_code
            ORDER BY plan_id;
        """,(int(company_id),int(run_id)))

        lines=[]
        for x in rows:
            employer=money(x.get("employer_amount"))
            total=money(x.get("total_amount"))
            if employer:
                lines.append({
                    "account_code":x["expense_account_code"],
                    "description":"Employer defined-contribution expense",
                    "debit":employer,"credit":D0,
                })
            if total:
                lines.append({
                    "account_code":x["payable_account_code"],
                    "description":"Defined-contribution payable",
                    "debit":D0,"credit":total,
                })

        employee=money(run.get("total_employee_contribution"))
        debit=sum((money(x["debit"]) for x in lines),D0)
        credit=sum((money(x["credit"]) for x in lines),D0)

        return {
            "run_id":int(run_id),"date":run["reporting_date"],
            "reference":run["run_no"],
            "employee_contribution":employee,
            "employer_contribution":money(run.get("total_employer_contribution")),
            "payable":money(run.get("total_payable")),
            "payroll_employee_deduction_required":employee,
            "lines":lines,"debit":money(debit),"credit":money(credit),
            "balanced_after_payroll_deduction":money(debit+employee)==money(credit),
        }

    def dc_run_post(self,company_id:int,run_id:int,user_id=None)->dict:
        schema=self.schema(company_id)
        data=self.dc_run_get(company_id,run_id)
        run=data["run"]

        if run["status"]=="posted": return data

        payroll_run_id=run.get("payroll_run_id")
        if not payroll_run_id:
            raise ValueError(
                "This contribution run is not linked to a payroll run"
            )

        payroll=self.db.fetch_one(f"""
            SELECT * FROM {schema}.payroll_runs
            WHERE company_id=%s AND id=%s;
        """,(int(company_id),int(payroll_run_id)))

        if not payroll:
            raise ValueError("Linked payroll run not found")
        if payroll["status"]!="posted":
            raise ValueError(
                "Post the linked payroll run before completing "
                "the defined-contribution run"
            )

        out=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_defined_contribution_runs
            SET status='posted',
                posted_journal_id=%s,
                posted_at=COALESCE(posted_at,NOW())
            WHERE company_id=%s AND id=%s
            RETURNING *;
        """,(
            payroll.get("posted_journal_id"),
            int(company_id),int(run_id),
        ))

        return {
            "run":out,
            "journal_id":payroll.get("posted_journal_id"),
            "posted_through_payroll":True,
        }
    
    def dc_run_reverse(self,company_id:int,run_id:int,user_id=None)->dict:
        schema=self.schema(company_id)
        data=self.dc_run_get(company_id,run_id)
        run=data["run"]

        if not run.get("payroll_run_id"):
            raise ValueError("Contribution run is not linked to payroll")

        payroll=self.db.fetch_one(f"""
            SELECT status FROM {schema}.payroll_runs
            WHERE company_id=%s AND id=%s;
        """,(int(company_id),int(run["payroll_run_id"])))

        if payroll and payroll["status"]!="reversed":
            raise ValueError(
                "Reverse the linked payroll run first"
            )

        out=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_defined_contribution_runs
            SET status='reversed',reversed_at=NOW()
            WHERE company_id=%s AND id=%s
            RETURNING *;
        """,(int(company_id),int(run_id)))

        return {"run":out,"reversed_through_payroll":True}
    
    def actuarial_valuation_get(self, company_id: int, valuation_id: int) -> dict:
        schema=self.schema(company_id)
        row=self.db.fetch_one(f"SELECT v.*,p.code AS plan_code,p.name AS plan_name,p.expense_account_code,p.liability_account_code,p.asset_account_code,p.oci_account_code FROM {schema}.payroll_actuarial_valuations v JOIN {schema}.payroll_benefit_plans p ON p.id=v.plan_id WHERE v.company_id=%s AND v.id=%s",(int(company_id),int(valuation_id)))
        if not row: raise ValueError("Actuarial valuation not found")
        row["assumptions"]=self.db.fetch_all(f"SELECT * FROM {schema}.payroll_actuarial_assumptions WHERE company_id=%s AND valuation_id=%s ORDER BY assumption_key",(int(company_id),int(valuation_id)))
        return row

    def actuarial_assumptions_save(self, company_id: int, valuation_id: int, body: dict) -> list[dict]:
        schema=self.schema(company_id); items=body.get("items") or []
        for item in items:
            if not item.get("assumption_key"): continue
            self.db.execute_sql(f"""INSERT INTO {schema}.payroll_actuarial_assumptions (company_id,valuation_id,assumption_key,numeric_value,text_value,unit) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (company_id,valuation_id,assumption_key) DO UPDATE SET numeric_value=EXCLUDED.numeric_value,text_value=EXCLUDED.text_value,unit=EXCLUDED.unit,updated_at=NOW()""",(int(company_id),int(valuation_id),item["assumption_key"],item.get("numeric_value"),item.get("text_value"),item.get("unit")))
        return self.db.fetch_all(f"SELECT * FROM {schema}.payroll_actuarial_assumptions WHERE company_id=%s AND valuation_id=%s ORDER BY assumption_key",(int(company_id),int(valuation_id)))

    def actuarial_reconciliation(self, company_id: int, valuation_id: int) -> dict:
        v=self.actuarial_valuation_get(company_id,valuation_id)
        dbo={"opening":money(v.get("opening_dbo")),"current_service_cost":money(v.get("current_service_cost")),"past_service_cost":money(v.get("past_service_cost")),"interest_cost":money(v.get("interest_cost")),"benefits_paid":money(v.get("benefits_paid")),"actuarial_gain_loss":money(v.get("actuarial_gain_loss_dbo")),"closing":money(v.get("closing_dbo"))}
        assets={"opening":money(v.get("opening_plan_assets")),"interest_income":money(v.get("interest_income_plan_assets")),"employer_contributions":money(v.get("employer_contributions")),"benefits_paid":money(v.get("benefits_paid_from_plan")),"return_excluding_interest":money(v.get("return_plan_assets_ex_interest")),"closing":money(v.get("closing_plan_assets"))}
        return {"valuation":v,"dbo":dbo,"plan_assets":assets,"profit_or_loss":money(v.get("profit_or_loss_amount")),"oci":money(v.get("oci_remeasurement_amount")),"net_liability":money(v.get("net_defined_benefit_liability")),"net_asset":money(v.get("net_defined_benefit_asset"))}

    def actuarial_journal_preview(self, company_id: int, valuation_id: int) -> dict:
        v=self.actuarial_valuation_get(company_id,valuation_id); names=self._account_names(company_id,[v.get("expense_account_code"),v.get("liability_account_code"),v.get("asset_account_code"),v.get("oci_account_code")]); lines=[]; missing=[]
        expense=money(v.get("profit_or_loss_amount")); oci=money(v.get("oci_remeasurement_amount")); liability=money(v.get("net_defined_benefit_liability")); asset=money(v.get("net_defined_benefit_asset"))
        for key,label in (("expense_account_code","Defined-benefit expense"),("liability_account_code","Defined-benefit liability")):
            if not v.get(key): missing.append(label+" account")
        if expense and v.get("expense_account_code"):
            lines.append({"account_code":v["expense_account_code"],"account_name":names.get(v["expense_account_code"],v["expense_account_code"]),"description":"IAS 19 defined-benefit expense","debit":expense if expense>0 else D0,"credit":abs(expense) if expense<0 else D0})
        if oci:
            if not v.get("oci_account_code"): missing.append("OCI remeasurement account")
            else: lines.append({"account_code":v["oci_account_code"],"account_name":names.get(v["oci_account_code"],v["oci_account_code"]),"description":"IAS 19 OCI remeasurement","debit":oci if oci>0 else D0,"credit":abs(oci) if oci<0 else D0})
        debit_total=sum((dec(x["debit"]) for x in lines),D0); credit_total=sum((dec(x["credit"]) for x in lines),D0); net=money(debit_total-credit_total)
        balance_code=v.get("liability_account_code") if net>=0 else v.get("asset_account_code")
        if net and not balance_code: missing.append("Defined-benefit balance account")
        if net and balance_code:
            lines.append({"account_code":balance_code,"account_name":names.get(balance_code,balance_code),"description":"IAS 19 net defined-benefit position","debit":D0 if net>0 else abs(net),"credit":net if net>0 else D0})
        debits=money(sum((dec(x["debit"]) for x in lines),D0)); credits=money(sum((dec(x["credit"]) for x in lines),D0)); invalid=[c for c in {x["account_code"] for x in lines} if c not in names]
        return {"valuation":v,"lines":lines,"debits":debits,"credits":credits,"difference":money(debits-credits),"missing_mappings":sorted(set(missing)),"invalid_accounts":invalid,"ready_to_post":bool(lines) and not missing and not invalid and debits==credits}

    def actuarial_post(self, company_id: int, valuation_id: int, user_id=None) -> dict:
        schema=self.schema(company_id); preview=self.actuarial_journal_preview(company_id,valuation_id); v=preview["valuation"]
        if v.get("status") == "posted": raise ValueError("Valuation already posted")
        if not preview["ready_to_post"]: raise ValueError("Actuarial journal is not ready to post")
        journal_id=self.db.post_journal(company_id,{"date":str(v["valuation_date"]),"ref":f"IAS19-VAL-{valuation_id}","description":f"IAS 19 actuarial valuation {v.get('plan_name') or valuation_id}","source":self.JOURNAL_SOURCES["defined_benefit"],"source_id":int(valuation_id),"currency":self.settings_get(company_id).get("reporting_currency") or "USD","gross_amount":preview["debits"],"net_amount":preview["debits"],"vat_amount":0,"lines":[{"account_code":x["account_code"],"description":x["description"],"debit":x["debit"],"credit":x["credit"]} for x in preview["lines"]],"created_by_user_id":user_id,"prepared_by_user_id":user_id,"module_name":"payroll"})
        out=self.db.fetch_one(f"UPDATE {schema}.payroll_actuarial_valuations SET status='posted',posted_journal_id=%s,posted_at=NOW() WHERE company_id=%s AND id=%s RETURNING *",(int(journal_id),int(company_id),int(valuation_id)))
        return {"valuation":out,"journal_id":int(journal_id),"journal_preview":preview}

    def actuarial_reverse(self, company_id: int, valuation_id: int, user_id=None) -> dict:
        schema=self.schema(company_id); v=self.actuarial_valuation_get(company_id,valuation_id)
        if v.get("status") != "posted": raise ValueError("Only posted valuations can be reversed")
        journal_id=v.get("posted_journal_id"); journal=self.db.fetch_one(f"SELECT * FROM {schema}.journals WHERE id=%s",(int(journal_id),)); lines=self.db.fetch_all(f"SELECT * FROM {schema}.journal_lines WHERE journal_id=%s ORDER BY id",(int(journal_id),))
        reverse_id=self.db.post_journal(company_id,{"date":date.today().isoformat(),"ref":f"REV-IAS19-VAL-{valuation_id}","description":f"Reversal of IAS 19 valuation {valuation_id}","source":self.JOURNAL_SOURCES["defined_benefit_reversal"],"source_id":int(valuation_id),"currency":journal.get("currency") or "USD","gross_amount":sum((dec(x.get("credit")) for x in lines),D0),"net_amount":sum((dec(x.get("credit")) for x in lines),D0),"vat_amount":0,"lines":[{"account_code":x.get("account_code"),"description":f"Reversal: {x.get('description') or ''}","debit":x.get("credit") or 0,"credit":x.get("debit") or 0} for x in lines],"created_by_user_id":user_id,"prepared_by_user_id":user_id,"module_name":"payroll"})
        out=self.db.fetch_one(f"UPDATE {schema}.payroll_actuarial_valuations SET status='reversed',reversal_journal_id=%s,reversed_at=NOW() WHERE company_id=%s AND id=%s RETURNING *",(int(reverse_id),int(company_id),int(valuation_id)))
        return {"valuation":out,"reversal_journal_id":int(reverse_id)}

    # ---------------- Reporting / disclosures ----------------

    def movement_report(self,company_id:int,date_from=None,date_to=None,benefit_class=None)->dict:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        date_from=date_from or "1900-01-01"
        date_to=date_to or date.today().isoformat()
        valid={"leave","bonus","defined_contribution","defined_benefit","long_term","termination"}
        if benefit_class and benefit_class not in valid:
            raise ValueError("Invalid benefit class")

        queries={
            "leave":f"""
                SELECT reporting_date AS movement_date,run_no AS reference,
                       'leave' AS benefit_class,total_opening_provision AS opening_amount,
                       total_closing_provision AS closing_amount,total_movement AS amount,
                       0::NUMERIC AS oci_amount,status,posted_journal_id,reversal_journal_id
                FROM {schema}.payroll_leave_accrual_runs
                WHERE company_id=%s AND reporting_date BETWEEN %s AND %s
            """,
            "bonus":f"""
                SELECT reporting_date AS movement_date,run_no AS reference,
                       'bonus' AS benefit_class,total_opening_liability AS opening_amount,
                       total_closing_liability AS closing_amount,total_movement AS amount,
                       0::NUMERIC AS oci_amount,status,posted_journal_id,reversal_journal_id
                FROM {schema}.payroll_bonus_accrual_runs
                WHERE company_id=%s AND reporting_date BETWEEN %s AND %s
            """,
            "defined_contribution":f"""
                SELECT reporting_date AS movement_date,run_no AS reference,
                       'defined_contribution' AS benefit_class,
                       0::NUMERIC AS opening_amount,total_payable AS closing_amount,
                       total_employer_contribution AS amount,0::NUMERIC AS oci_amount,
                       status,posted_journal_id,reversal_journal_id
                FROM {schema}.payroll_defined_contribution_runs
                WHERE company_id=%s AND reporting_date BETWEEN %s AND %s
            """,
            "defined_benefit":f"""
                SELECT valuation_date AS movement_date,
                       'IAS19-VAL-'||id AS reference,
                       'defined_benefit' AS benefit_class,
                       opening_dbo-opening_plan_assets AS opening_amount,
                       net_defined_benefit_liability-net_defined_benefit_asset AS closing_amount,
                       profit_or_loss_amount AS amount,
                       oci_remeasurement_amount AS oci_amount,status,
                       posted_journal_id,reversal_journal_id
                FROM {schema}.payroll_actuarial_valuations
                WHERE company_id=%s AND valuation_date BETWEEN %s AND %s
            """,
            "long_term":f"""
                SELECT reporting_date AS movement_date,run_no AS reference,
                       'long_term' AS benefit_class,
                       total_opening_liability AS opening_amount,
                       total_closing_liability AS closing_amount,
                       total_movement AS amount,0::NUMERIC AS oci_amount,
                       status,posted_journal_id,reversal_journal_id
                FROM {schema}.payroll_long_term_benefit_runs
                WHERE company_id=%s AND reporting_date BETWEEN %s AND %s
            """,
            "termination":f"""
                SELECT recognition_date AS movement_date,plan_no AS reference,
                       'termination' AS benefit_class,
                       0::NUMERIC AS opening_amount,
                       GREATEST(total_recognised-total_settled,0) AS closing_amount,
                       total_recognised AS amount,0::NUMERIC AS oci_amount,
                       status,posted_journal_id,reversal_journal_id
                FROM {schema}.payroll_termination_plans
                WHERE company_id=%s
                  AND recognition_date BETWEEN %s AND %s
            """,
        }

        items=[]
        for key,sql in queries.items():
            if not benefit_class or benefit_class==key:
                items.extend(self.db.fetch_all(sql,(int(company_id),date_from,date_to)))

        items.sort(key=lambda x:(str(x.get("movement_date") or ""),str(x.get("reference") or "")))
        return {
            "date_from":date_from,"date_to":date_to,
            "benefit_class":benefit_class,
            "items":items,
            "summary":{
                "movement":money(sum((dec(x.get("amount")) for x in items),D0)),
                "oci":money(sum((dec(x.get("oci_amount")) for x in items),D0)),
                "closing":money(sum((dec(x.get("closing_amount")) for x in items),D0)),
                "count":len(items),
            },
        }
    # ---------------- Bonus accrual ----------------

    def bonus_schemes_list(self, company_id: int) -> list[dict]:
        schema = self.schema(company_id)
        return self.db.fetch_all(f"""
            SELECT * FROM {schema}.payroll_bonus_schemes
            WHERE company_id=%s
            ORDER BY is_active DESC, code;
        """, (int(company_id),))

    def bonus_scheme_save(
        self,
        company_id:int,
        body:dict,
        scheme_id=None,
        user_id=None,
    )->dict:
        self.ensure_ready(company_id)
        schema=self.schema(company_id)

        name=str(body.get("name") or "").strip()
        scheme_type=str(
            body.get("scheme_type") or "performance_bonus"
        ).strip()

        if not name:
            raise ValueError("Bonus scheme name is required")

        if scheme_id:
            current=self.db.fetch_one(f"""
                SELECT *
                FROM {schema}.payroll_bonus_schemes
                WHERE company_id=%s AND id=%s;
            """,(int(company_id),int(scheme_id)))

            if not current:
                raise ValueError("Bonus scheme not found")

            code=current["code"]
        else:
            code=self._next_code(
                company_id,
                "bonus_scheme",
                "payroll_bonus_schemes",
                "code",
            )

        expense_account=self._mapped_posting_account(
            company_id,
            body.get("expense_account_code"),
            "payroll_bonus_expense",
            required=True,
            label="Bonus expense account",
        )

        liability_account=self._mapped_posting_account(
            company_id,
            body.get("liability_account_code"),
            "payroll_bonus_payable",
            required=True,
            label="Bonus liability account",
        )

        values=(
            code,
            name,
            scheme_type,
            body.get("measurement_basis") or "basic_salary",
            rate(body.get("target_percentage")),
            rate(
                body.get("probability_percentage")
                if body.get("probability_percentage") not in(None,"")
                else 100
            ),
            rate(
                body.get("performance_percentage")
                if body.get("performance_percentage") not in(None,"")
                else 100
            ),
            int(
                body.get("required_service_months")
                if body.get("required_service_months") not in(None,"")
                else 12
            ),
            body.get("payment_due_date"),
            bool(body.get("is_short_term",True)),
            expense_account,
            liability_account,
            bool(body.get("is_active",True)),
        )

        if scheme_id:
            out=self.db.fetch_one(f"""
                UPDATE {schema}.payroll_bonus_schemes SET
                    code=%s,
                    name=%s,
                    scheme_type=%s,
                    measurement_basis=%s,
                    target_percentage=%s,
                    probability_percentage=%s,
                    performance_percentage=%s,
                    required_service_months=%s,
                    payment_due_date=%s,
                    is_short_term=%s,
                    expense_account_code=%s,
                    liability_account_code=%s,
                    is_active=%s,
                    updated_at=NOW()
                WHERE company_id=%s AND id=%s
                RETURNING *;
            """,values+(int(company_id),int(scheme_id)))
        else:
            out=self.db.fetch_one(f"""
                INSERT INTO {schema}.payroll_bonus_schemes(
                    company_id,
                    code,
                    name,
                    scheme_type,
                    measurement_basis,
                    target_percentage,
                    probability_percentage,
                    performance_percentage,
                    required_service_months,
                    payment_due_date,
                    is_short_term,
                    expense_account_code,
                    liability_account_code,
                    is_active
                ) VALUES(
                    %s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s
                )
                RETURNING *;
            """,(int(company_id),)+values)

        if not out:
            raise ValueError("Bonus scheme not found")

        self._audit(
            company_id,
            user_id,
            "save_bonus_scheme",
            "payroll_bonus_scheme",
            out["id"],
            out,
            "Saved bonus scheme",
        )

        return out
    # ---------------- Actuarial valuation import / posting ----------------

    def actuarial_valuations_list(
        self,
        company_id:int,
        plan_id=None,
    )->list[dict]:
        self.ensure_ready(company_id)
        schema=self.schema(company_id)

        params=[int(company_id)]
        where="WHERE v.company_id=%s"

        if plan_id:
            where+=" AND v.plan_id=%s"
            params.append(int(plan_id))

        return self.db.fetch_all(f"""
            SELECT
                v.*,
                p.code AS plan_code,
                p.name AS plan_name
            FROM {schema}.payroll_actuarial_valuations v
            JOIN {schema}.payroll_benefit_plans p
            ON p.id=v.plan_id
            AND p.company_id=v.company_id
            {where}
            ORDER BY
                v.valuation_date DESC,
                v.id DESC;
        """,tuple(params))

    def actuarial_valuation_save(self, company_id: int, body: dict, valuation_id=None, user_id=None) -> dict:
        schema = self.schema(company_id)
        required = ["plan_id", "valuation_date"]
        missing = [k for k in required if not body.get(k)]
        if missing:
            raise ValueError("Missing required fields: " + ", ".join(missing))

        numeric_fields = [
            "opening_dbo","current_service_cost","past_service_cost","interest_cost",
            "benefits_paid","settlements","curtailments","actuarial_gain_loss_obligation",
            "closing_dbo","opening_plan_assets","interest_income_plan_assets",
            "employer_contributions","employee_contributions",
            "return_on_assets_excluding_interest","closing_plan_assets",
            "asset_ceiling","effect_of_asset_ceiling",
            "net_defined_benefit_liability","net_defined_benefit_asset",
            "profit_or_loss_amount","oci_remeasurement_amount",
        ]

        values = {k: money(body.get(k)) for k in numeric_fields}

        # Reconciliation validations.
        expected_closing_dbo = money(
            values["opening_dbo"] + values["current_service_cost"] +
            values["past_service_cost"] + values["interest_cost"] -
            values["benefits_paid"] - values["settlements"] -
            values["curtailments"] + values["actuarial_gain_loss_obligation"]
        )
        expected_closing_assets = money(
            values["opening_plan_assets"] +
            values["interest_income_plan_assets"] +
            values["employer_contributions"] +
            values["employee_contributions"] -
            values["benefits_paid"] +
            values["return_on_assets_excluding_interest"]
        )
        if abs(expected_closing_dbo - values["closing_dbo"]) > Decimal("1.00"):
            raise ValueError(
                f"Defined-benefit obligation does not reconcile. Expected {expected_closing_dbo}."
            )
        if abs(expected_closing_assets - values["closing_plan_assets"]) > Decimal("1.00"):
            raise ValueError(
                f"Plan assets do not reconcile. Expected {expected_closing_assets}."
            )

        columns = ", ".join(numeric_fields)
        placeholders = ", ".join(["%s"] * len(numeric_fields))
        if valuation_id:
            sets = ", ".join(f"{k}=%s" for k in numeric_fields)
            out = self.db.fetch_one(f"""
                UPDATE {schema}.payroll_actuarial_valuations
                SET plan_id=%s,valuation_date=%s,{sets},
                    actuary_name=%s,actuary_reference=%s,
                    source_filename=%s,source_hash=%s,status=%s,updated_at=NOW()
                WHERE company_id=%s AND id=%s
                RETURNING *;
            """, (
                int(body["plan_id"]), body["valuation_date"],
                *[values[k] for k in numeric_fields],
                body.get("actuary_name"), body.get("actuary_reference"),
                body.get("source_filename"), body.get("source_hash"),
                body.get("status") or "validated",
                int(company_id), int(valuation_id),
            ))
        else:
            out = self.db.fetch_one(f"""
                INSERT INTO {schema}.payroll_actuarial_valuations (
                    company_id,plan_id,valuation_date,{columns},
                    actuary_name,actuary_reference,source_filename,source_hash,
                    status,created_by_user_id
                )
                VALUES (%s,%s,%s,{placeholders},%s,%s,%s,%s,%s,%s)
                RETURNING *;
            """, (
                int(company_id), int(body["plan_id"]), body["valuation_date"],
                *[values[k] for k in numeric_fields],
                body.get("actuary_name"), body.get("actuary_reference"),
                body.get("source_filename"), body.get("source_hash"),
                body.get("status") or "validated", user_id,
            ))
        self._audit(company_id, user_id, "save_actuarial_valuation",
                    "payroll_actuarial_valuation", out["id"], out,
                    "Saved IAS 19 actuarial valuation")
        return out

    def actuarial_valuation_get(self,company_id:int,valuation_id:int)->dict:
        schema=self.schema(company_id)
        row=self.db.fetch_one(f"""
            SELECT v.*,p.code AS plan_code,p.name AS plan_name,
                   p.expense_account_code,p.liability_account_code,
                   p.asset_account_code,p.oci_account_code
            FROM {schema}.payroll_actuarial_valuations v
            JOIN {schema}.payroll_benefit_plans p
              ON p.id=v.plan_id AND p.company_id=v.company_id
            WHERE v.company_id=%s AND v.id=%s;
        """,(int(company_id),int(valuation_id)))
        if not row: raise ValueError("Actuarial valuation not found")
        row["assumptions"]=self.actuarial_assumptions_list(company_id,valuation_id)
        row["reconciliation"]=self.actuarial_reconciliation(company_id,valuation_id)
        return row

    def actuarial_assumptions_list(self,company_id:int,valuation_id:int)->list[dict]:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        return self.db.fetch_all(f"""
            SELECT * FROM {schema}.payroll_actuarial_assumptions
            WHERE company_id=%s AND valuation_id=%s
            ORDER BY assumption_key;
        """,(int(company_id),int(valuation_id)))

    def actuarial_assumptions_save(self,company_id:int,valuation_id:int,body:dict,user_id=None)->list[dict]:
        self.actuarial_valuation_get(company_id,valuation_id)
        schema=self.schema(company_id)
        items=body.get("items") if isinstance(body.get("items"),list) else [body]

        for x in items:
            key=str(x.get("assumption_key") or "").strip().lower()
            if not key: raise ValueError("Assumption key is required")

            self.db.execute_sql(f"""
                INSERT INTO {schema}.payroll_actuarial_assumptions(
                    company_id,valuation_id,assumption_key,
                    assumption_label,numeric_value,text_value,
                    unit,source_reference
                ) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(company_id,valuation_id,assumption_key)
                DO UPDATE SET
                    assumption_label=EXCLUDED.assumption_label,
                    numeric_value=EXCLUDED.numeric_value,
                    text_value=EXCLUDED.text_value,
                    unit=EXCLUDED.unit,
                    source_reference=EXCLUDED.source_reference,
                    updated_at=NOW();
            """,(
                int(company_id),int(valuation_id),key,
                x.get("assumption_label") or key.replace("_"," ").title(),
                x.get("numeric_value"),x.get("text_value"),
                x.get("unit"),x.get("source_reference"),
            ))

        out=self.actuarial_assumptions_list(company_id,valuation_id)
        self._audit(company_id,user_id,"save_actuarial_assumptions",
                    "payroll_actuarial_valuation",valuation_id,
                    {"items":out},"Saved actuarial assumptions")
        return out

    def actuarial_reconciliation(self,company_id:int,valuation_id:int)->dict:
        v=self.actuarial_valuation_get_raw(company_id,valuation_id)

        expected_dbo=money(
            dec(v.get("opening_dbo"))+
            dec(v.get("current_service_cost"))+
            dec(v.get("past_service_cost"))+
            dec(v.get("interest_cost"))-
            dec(v.get("benefits_paid"))-
            dec(v.get("settlements"))-
            dec(v.get("curtailments"))+
            dec(v.get("actuarial_gain_loss_obligation"))
        )

        expected_assets=money(
            dec(v.get("opening_plan_assets"))+
            dec(v.get("interest_income_plan_assets"))+
            dec(v.get("employer_contributions"))+
            dec(v.get("employee_contributions"))-
            dec(v.get("benefits_paid"))+
            dec(v.get("return_on_assets_excluding_interest"))
        )

        dbo_difference=money(dec(v.get("closing_dbo"))-expected_dbo)
        asset_difference=money(dec(v.get("closing_plan_assets"))-expected_assets)

        gross_net=money(
            dec(v.get("closing_dbo"))-
            dec(v.get("closing_plan_assets"))+
            dec(v.get("effect_of_asset_ceiling"))
        )

        recorded_net=money(
            dec(v.get("net_defined_benefit_liability"))-
            dec(v.get("net_defined_benefit_asset"))
        )

        return {
            "opening_dbo":money(v.get("opening_dbo")),
            "expected_closing_dbo":expected_dbo,
            "reported_closing_dbo":money(v.get("closing_dbo")),
            "dbo_difference":dbo_difference,
            "opening_plan_assets":money(v.get("opening_plan_assets")),
            "expected_closing_plan_assets":expected_assets,
            "reported_closing_plan_assets":money(v.get("closing_plan_assets")),
            "plan_asset_difference":asset_difference,
            "calculated_net_position":gross_net,
            "recorded_net_position":recorded_net,
            "net_position_difference":money(recorded_net-gross_net),
            "reconciled":abs(dbo_difference)<=Decimal("1.00")
                and abs(asset_difference)<=Decimal("1.00")
                and abs(recorded_net-gross_net)<=Decimal("1.00"),
        }

    def actuarial_valuation_get_raw(self,company_id:int,valuation_id:int)->dict:
        schema=self.schema(company_id)
        row=self.db.fetch_one(f"""
            SELECT * FROM {schema}.payroll_actuarial_valuations
            WHERE company_id=%s AND id=%s;
        """,(int(company_id),int(valuation_id)))
        if not row: raise ValueError("Actuarial valuation not found")
        return row

    def actuarial_validate(self,company_id:int,valuation_id:int,user_id=None)->dict:
        schema=self.schema(company_id)
        v=self.actuarial_valuation_get_raw(company_id,valuation_id)
        if v["status"] in("posted","reversed"):
            raise ValueError("Posted or reversed valuation cannot be validated")

        rec=self.actuarial_reconciliation(company_id,valuation_id)
        if not rec["reconciled"]:
            raise ValueError("Actuarial valuation reconciliation contains differences")

        out=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_actuarial_valuations
            SET status='validated'
            WHERE company_id=%s AND id=%s RETURNING *;
        """,(int(company_id),int(valuation_id)))

        self._audit(company_id,user_id,"validate_actuarial_valuation",
                    "payroll_actuarial_valuation",valuation_id,out,
                    "Validated actuarial valuation")
        return out

    def actuarial_approve(self,company_id:int,valuation_id:int,user_id=None)->dict:
        schema=self.schema(company_id)
        v=self.actuarial_valuation_get_raw(company_id,valuation_id)
        if v["status"] not in("validated","approved"):
            raise ValueError("Validate the valuation before approval")

        out=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_actuarial_valuations
            SET status='approved',approved_by_user_id=%s,approved_at=NOW()
            WHERE company_id=%s AND id=%s RETURNING *;
        """,(user_id,int(company_id),int(valuation_id)))

        self._audit(company_id,user_id,"approve_actuarial_valuation",
                    "payroll_actuarial_valuation",valuation_id,out,
                    "Approved actuarial valuation")
        return out

    # ---------------- Other long-term benefits ----------------

    LONG_TERM_TYPES={
        "long_service_award","long_term_disability","sabbatical_leave",
        "deferred_bonus","jubilee_award","other",
    }

    def long_term_schemes_list(self,company_id:int)->list[dict]:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        return self.db.fetch_all(f"""
            SELECT s.*,
                   COUNT(a.id) FILTER(WHERE a.is_active=TRUE)::INT AS active_assignments
            FROM {schema}.payroll_long_term_benefit_schemes s
            LEFT JOIN {schema}.payroll_long_term_benefit_assignments a
              ON a.company_id=s.company_id AND a.scheme_id=s.id
            WHERE s.company_id=%s
            GROUP BY s.id
            ORDER BY s.is_active DESC,s.code;
        """,(int(company_id),))

    def long_term_scheme_get(self,company_id:int,scheme_id:int)->dict:
        schema=self.schema(company_id)
        row=self.db.fetch_one(f"""
            SELECT * FROM {schema}.payroll_long_term_benefit_schemes
            WHERE company_id=%s AND id=%s;
        """,(int(company_id),int(scheme_id)))
        if not row: raise ValueError("Long-term benefit scheme not found")
        row["assignments"]=self.long_term_assignments_list(company_id,scheme_id)
        return row

    def long_term_scheme_save(
        self,
        company_id:int,
        body:dict,
        scheme_id=None,
        user_id=None,
    )->dict:
        self.ensure_ready(company_id)
        schema=self.schema(company_id)

        name=str(body.get("name") or "").strip()
        scheme_type=str(body.get("scheme_type") or "").strip()
        basis=str(
            body.get("calculation_basis") or "fixed_amount"
        ).strip()

        if not name or not scheme_type:
            raise ValueError("Name and scheme type are required")

        if scheme_type not in self.LONG_TERM_TYPES:
            raise ValueError("Invalid long-term benefit scheme type")

        if basis not in(
            "fixed_amount",
            "salary_multiple",
            "percentage_of_salary",
            "manual",
        ):
            raise ValueError("Invalid calculation basis")

        if scheme_id:
            current=self.long_term_scheme_get(
                company_id,
                scheme_id,
            )
            code=current["code"]
        else:
            code=self._next_code(
                company_id,
                "long_term_scheme",
                "payroll_long_term_benefit_schemes",
                "code",
            )

        expense=self._mapped_posting_account(
            company_id,
            body.get("expense_account_code"),
            "payroll_long_term_benefit_expense",
            required=True,
            label="Long-term benefit expense account",
        )

        liability=self._mapped_posting_account(
            company_id,
            body.get("liability_account_code"),
            "payroll_long_term_benefit_liability",
            required=True,
            label="Long-term benefit liability account",
        )

        start=body.get("effective_from") or None
        end=body.get("effective_to") or None
        notes=str(body.get("notes") or "").strip() or None

        if start and end and str(end)<str(start):
            raise ValueError(
                "Effective-to date cannot precede effective-from date"
            )

        values=(
            code,
            name,
            scheme_type,
            basis,
            money(body.get("benefit_amount")),
            rate(body.get("salary_multiple")),
            rate(body.get("service_years_required")),
            rate(body.get("probability_percentage",100)),
            rate(body.get("discount_rate_percentage")),
            rate(body.get("salary_growth_percentage")),
            rate(body.get("expected_payment_years")),
            expense,
            liability,
            start,
            end,
            notes,
            bool(body.get("is_active",True)),
        )

        if scheme_id:
            out=self.db.fetch_one(f"""
                UPDATE {schema}.payroll_long_term_benefit_schemes SET
                    code=%s,name=%s,scheme_type=%s,
                    calculation_basis=%s,benefit_amount=%s,
                    salary_multiple=%s,service_years_required=%s,
                    probability_percentage=%s,
                    discount_rate_percentage=%s,
                    salary_growth_percentage=%s,
                    expected_payment_years=%s,
                    expense_account_code=%s,
                    liability_account_code=%s,
                    effective_from=%s,effective_to=%s,
                    notes=%s,is_active=%s,updated_at=NOW()
                WHERE company_id=%s AND id=%s
                RETURNING *;
            """,values+(int(company_id),int(scheme_id)))
        else:
            out=self.db.fetch_one(f"""
                INSERT INTO {schema}.payroll_long_term_benefit_schemes(
                    company_id,code,name,scheme_type,
                    calculation_basis,benefit_amount,
                    salary_multiple,service_years_required,
                    probability_percentage,
                    discount_rate_percentage,
                    salary_growth_percentage,
                    expected_payment_years,
                    expense_account_code,
                    liability_account_code,
                    effective_from,effective_to,
                    notes,is_active
                ) VALUES(
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,%s
                )
                RETURNING *;
            """,(int(company_id),)+values)

        if not out:
            raise ValueError(
                "Long-term benefit scheme not found"
            )

        self._audit(
            company_id,user_id,
            "save_long_term_scheme",
            "payroll_long_term_benefit_scheme",
            out["id"],out,
            "Saved other long-term benefit scheme",
        )

        return out
    
    def long_term_assignments_list(self,company_id:int,scheme_id=None)->list[dict]:
        schema=self.schema(company_id); params=[int(company_id)]; extra=""
        if scheme_id:
            extra=" AND a.scheme_id=%s"; params.append(int(scheme_id))

        return self.db.fetch_all(f"""
            SELECT a.*,s.code AS scheme_code,s.name AS scheme_name,
                   e.employee_no,e.first_name,e.last_name,
                   CONCAT_WS(' ',e.first_name,e.last_name) AS employee_name
            FROM {schema}.payroll_long_term_benefit_assignments a
            JOIN {schema}.payroll_long_term_benefit_schemes s
              ON s.id=a.scheme_id AND s.company_id=a.company_id
            JOIN {schema}.payroll_employees e
              ON e.id=a.employee_id AND e.company_id=a.company_id
            WHERE a.company_id=%s{extra}
            ORDER BY a.is_active DESC,e.last_name,e.first_name;
        """,tuple(params))

    def long_term_assignment_save(
        self,
        company_id:int,
        body:dict,
        assignment_id=None,
        user_id=None,
    )->dict:
        self.ensure_ready(company_id)
        schema=self.schema(company_id)

        for key in("scheme_id","employee_id"):
            if not body.get(key):
                raise ValueError(f"{key} is required")

        scheme_id=int(body["scheme_id"])
        employee_id=int(body["employee_id"])

        scheme=self.db.fetch_one(f"""
            SELECT id,name,service_years_required
            FROM {schema}.payroll_long_term_benefit_schemes
            WHERE company_id=%s AND id=%s
            LIMIT 1;
        """,(int(company_id),scheme_id))

        if not scheme:
            raise ValueError("Long-term benefit scheme not found")

        employee=self.db.fetch_one(f"""
            SELECT
                e.id,
                e.employee_no,
                e.first_name,
                e.last_name,
                MIN(c.effective_from)::date AS employment_start_date
            FROM {schema}.payroll_employees e
            LEFT JOIN {schema}.payroll_employee_contracts c
            ON c.company_id=e.company_id
            AND c.employee_id=e.id
            WHERE e.company_id=%s
            AND e.id=%s
            GROUP BY
                e.id,e.employee_no,e.first_name,e.last_name;
        """,(int(company_id),employee_id))

        if not employee:
            raise ValueError("Employee not found")

        employment_start=employee.get("employment_start_date")
        start=body.get("effective_from") or employment_start
        end=body.get("effective_to") or None
        expected_payment=body.get("expected_payment_date") or None
        notes=str(body.get("notes") or "").strip() or None

        if not start:
            raise ValueError(
                "Employee employment date or assignment effective date is required"
            )

        service_years=body.get("service_years_override")
        if service_years in(None,""):
            service_years=scheme.get("service_years_required") or 0

        service_years=int(float(service_years or 0))

        if not expected_payment and employment_start and service_years>0:
            anniversary=self.db.fetch_one("""
                SELECT (
                    %s::date+make_interval(years=>%s)
                )::date AS anniversary;
            """,(employment_start,service_years))

            expected_payment=anniversary["anniversary"]

        if end and str(end)<str(start):
            raise ValueError(
                "Effective-to date cannot precede effective-from date"
            )

        values=(
            scheme_id,
            employee_id,
            body.get("benefit_amount_override") or None,
            body.get("service_years_override") or None,
            body.get("probability_percentage") or None,
            expected_payment,
            start,
            end,
            bool(body.get("is_active",True)),
            notes,
        )

        if assignment_id:
            out=self.db.fetch_one(f"""
                UPDATE {schema}.payroll_long_term_benefit_assignments SET
                    scheme_id=%s,
                    employee_id=%s,
                    benefit_amount_override=%s,
                    service_years_override=%s,
                    probability_percentage=%s,
                    expected_payment_date=%s,
                    effective_from=%s,
                    effective_to=%s,
                    is_active=%s,
                    notes=%s,
                    updated_at=NOW()
                WHERE company_id=%s AND id=%s
                RETURNING *;
            """,values+(int(company_id),int(assignment_id)))
        else:
            out=self.db.fetch_one(f"""
                INSERT INTO {schema}.payroll_long_term_benefit_assignments(
                    company_id,scheme_id,employee_id,
                    benefit_amount_override,
                    service_years_override,
                    probability_percentage,
                    expected_payment_date,
                    effective_from,effective_to,
                    is_active,notes
                ) VALUES(
                    %s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s
                )
                RETURNING *;
            """,(int(company_id),)+values)

        if not out:
            raise ValueError("Long-term benefit assignment not found")

        self._audit(
            company_id,user_id,
            "save_long_term_assignment",
            "payroll_long_term_benefit_assignment",
            out["id"],out,
            "Saved employee long-term benefit assignment",
        )

        return out
    def long_term_runs_list(self,company_id:int)->list[dict]:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        return self.db.fetch_all(f"""
            SELECT r.*,COUNT(l.id)::INT AS line_count
            FROM {schema}.payroll_long_term_benefit_runs r
            LEFT JOIN {schema}.payroll_long_term_benefit_run_lines l
              ON l.company_id=r.company_id AND l.run_id=r.id
            WHERE r.company_id=%s
            GROUP BY r.id
            ORDER BY r.reporting_date DESC,r.id DESC;
        """,(int(company_id),))

    def long_term_run_create(self,company_id:int,body:dict,user_id=None)->dict:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        required=("period_start","period_end","reporting_date")
        missing=[x for x in required if not body.get(x)]
        if missing: raise ValueError("Missing required fields: "+", ".join(missing))

        out=self.db.fetch_one(f"""
            INSERT INTO {schema}.payroll_long_term_benefit_runs(
                company_id,run_no,period_start,period_end,
                reporting_date,status,created_by_user_id
            ) VALUES(
                %s,'LT-'||TO_CHAR(%s::date,'YYYYMMDD'),
                %s,%s,%s,'draft',%s
            )
            ON CONFLICT(company_id,reporting_date) DO UPDATE SET
                period_start=EXCLUDED.period_start,
                period_end=EXCLUDED.period_end
            WHERE {schema}.payroll_long_term_benefit_runs.status='draft'
            RETURNING *;
        """,(
            int(company_id),body["reporting_date"],body["period_start"],
            body["period_end"],body["reporting_date"],user_id,
        ))

        if not out:
            raise ValueError("A non-draft long-term run already exists for this date")
        return out

    def long_term_run_get(self,company_id:int,run_id:int)->dict:
        schema=self.schema(company_id)
        run=self.db.fetch_one(f"""
            SELECT * FROM {schema}.payroll_long_term_benefit_runs
            WHERE company_id=%s AND id=%s;
        """,(int(company_id),int(run_id)))
        if not run: raise ValueError("Long-term benefit run not found")

        run["lines"]=self.db.fetch_all(f"""
            SELECT l.*,s.code AS scheme_code,s.name AS scheme_name,
                   e.employee_no,e.first_name,e.last_name,
                   CONCAT_WS(' ',e.first_name,e.last_name) AS employee_name
            FROM {schema}.payroll_long_term_benefit_run_lines l
            JOIN {schema}.payroll_long_term_benefit_schemes s
              ON s.id=l.scheme_id
            JOIN {schema}.payroll_employees e
              ON e.id=l.employee_id
            WHERE l.company_id=%s AND l.run_id=%s
            ORDER BY s.code,e.employee_no;
        """,(int(company_id),int(run_id)))
        return run

    def _long_term_target(self,scheme:dict,assignment:dict,salary:Decimal)->Decimal:
        override=assignment.get("benefit_amount_override")
        if override not in(None,""): return money(override)

        basis=scheme.get("calculation_basis") or "fixed_amount"
        if basis=="salary_multiple":
            return money(salary*dec(scheme.get("salary_multiple")))
        if basis=="percentage_of_salary":
            return money(
                salary*Decimal("12")*
                dec(scheme.get("benefit_amount"))/Decimal("100")
            )
        return money(scheme.get("benefit_amount"))

    def long_term_run_calculate(self,company_id:int,run_id:int)->dict:
        schema=self.schema(company_id)
        run=self.long_term_run_get(company_id,run_id)
        if run["status"] in("posted","reversed"):
            raise ValueError("Posted or reversed run cannot be recalculated")

        self.db.execute_sql(f"""
            DELETE FROM {schema}.payroll_long_term_benefit_run_lines
            WHERE company_id=%s AND run_id=%s;
        """,(int(company_id),int(run_id)))

        items=self.db.fetch_all(f"""
            SELECT s.*,a.id AS assignment_id,s.id AS scheme_id,
                a.employee_id,a.benefit_amount_override,
                a.service_years_override,
                a.probability_percentage AS assignment_probability,
                a.expected_payment_date,
                a.effective_from AS assignment_effective_from,
                   e.id AS employee_id,e.start_date,
                   COALESCE(ps.fixed_basic_amount,c.basic_salary,0) AS monthly_salary
            FROM {schema}.payroll_long_term_benefit_assignments a
            JOIN {schema}.payroll_long_term_benefit_schemes s
              ON s.id=a.scheme_id AND s.company_id=a.company_id
            JOIN {schema}.payroll_employees e
              ON e.id=a.employee_id AND e.company_id=a.company_id
            LEFT JOIN LATERAL(
                SELECT fixed_basic_amount
                FROM {schema}.payroll_employee_pay_setups ps
                WHERE ps.company_id=e.company_id
                  AND ps.employee_id=e.id AND ps.is_active=TRUE
                  AND ps.effective_from<=%s
                  AND(ps.effective_to IS NULL OR ps.effective_to>=%s)
                ORDER BY ps.effective_from DESC LIMIT 1
            ) ps ON TRUE
            LEFT JOIN LATERAL(
                SELECT basic_salary
                FROM {schema}.payroll_employee_contracts c
                WHERE c.company_id=e.company_id
                  AND c.employee_id=e.id AND c.is_active=TRUE
                  AND c.effective_from<=%s
                  AND(c.effective_to IS NULL OR c.effective_to>=%s)
                ORDER BY c.effective_from DESC LIMIT 1
            ) c ON TRUE
            WHERE a.company_id=%s
              AND a.is_active=TRUE AND s.is_active=TRUE
              AND e.employment_status='active'
              AND a.effective_from<=%s
              AND(a.effective_to IS NULL OR a.effective_to>=%s)
              AND(s.effective_from IS NULL OR s.effective_from<=%s)
              AND(s.effective_to IS NULL OR s.effective_to>=%s);
        """,(
            run["period_end"],run["period_start"],
            run["period_end"],run["period_start"],
            int(company_id),run["period_end"],run["period_start"],
            run["period_end"],run["period_start"],
        ))

        totals={k:D0 for k in(
            "opening","service","interest","remeasurement","paid","closing"
        )}

        for x in items:
            salary=money(x.get("monthly_salary"))
            start=x["start_date"]
            completed=rate(
                Decimal(str(max((run["reporting_date"]-start).days,0)))/
                Decimal("365.25")
            )
            required=rate(
                x.get("service_years_override")
                if x.get("service_years_override") not in(None,"")
                else x.get("service_years_required")
            )
            vesting=Decimal("100") if required<=0 else min(
                Decimal("100"),rate(completed/required*Decimal("100"))
            )
            probability=rate(
                x.get("probability_percentage")
                if x.get("probability_percentage") not in(None,"")
                else x.get("probability_percentage")
            )
            probability=probability or Decimal("100")
            benefit=self._long_term_target(x,x,salary)

            if x.get("expected_payment_date"):
                days=max((x["expected_payment_date"]-run["reporting_date"]).days,0)
                years=rate(Decimal(str(days))/Decimal("365.25"))
            else:
                years=rate(x.get("expected_payment_years"))

            discount=dec(x.get("discount_rate_percentage"))/Decimal("100")
            factor=Decimal(str((1+float(discount))**float(years))) if years>0 else Decimal("1")
            measured=money(
                benefit*(vesting/Decimal("100"))*
                (probability/Decimal("100"))/factor
            )

            previous=self.db.fetch_one(f"""
                SELECT closing_liability
                FROM {schema}.payroll_long_term_benefit_run_lines l
                JOIN {schema}.payroll_long_term_benefit_runs r
                  ON r.id=l.run_id
                WHERE l.company_id=%s
                  AND l.scheme_id=%s AND l.employee_id=%s
                  AND r.reporting_date<%s
                  AND r.status IN('calculated','approved','posted')
                ORDER BY r.reporting_date DESC LIMIT 1;
            """,(
                int(company_id),int(x["scheme_id"]),
                int(x["employee_id"]),run["reporting_date"],
            )) or {}

            opening=money(previous.get("closing_liability"))
            interest=money(opening*discount)
            service=money(max(measured-opening-interest,D0))
            remeasurement=money(measured-opening-interest-service)
            paid=D0
            closing=money(opening+service+interest+remeasurement-paid)
            movement=money(closing-opening)

            if movement and(
                not x.get("expense_account_code") or
                not x.get("liability_account_code")
            ):
                raise ValueError(
                    f"Missing accounts for long-term scheme {x['code']}"
                )

            self.db.execute_sql(f"""
                INSERT INTO {schema}.payroll_long_term_benefit_run_lines(
                    company_id,run_id,scheme_id,assignment_id,employee_id,
                    monthly_salary,completed_service_years,
                    required_service_years,vesting_percentage,
                    probability_percentage,undiscounted_benefit,
                    discount_rate_percentage,years_to_payment,
                    opening_liability,current_service_cost,interest_cost,
                    remeasurement_amount,benefits_paid,closing_liability,
                    movement_amount,expense_account_code,
                    liability_account_code,metadata
                ) VALUES(
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb
                );
            """,(
                int(company_id),int(run_id),int(x["scheme_id"]),
                int(x["assignment_id"]),int(x["employee_id"]),salary,
                completed,required,vesting,probability,benefit,
                rate(x.get("discount_rate_percentage")),years,
                opening,service,interest,remeasurement,paid,closing,
                movement,x.get("expense_account_code"),
                x.get("liability_account_code"),
                '{"measurement":"projected_probability_discounted"}',
            ))

            totals["opening"]+=opening
            totals["service"]+=service
            totals["interest"]+=interest
            totals["remeasurement"]+=remeasurement
            totals["paid"]+=paid
            totals["closing"]+=closing

        out=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_long_term_benefit_runs SET
                status='calculated',
                total_opening_liability=%s,
                total_current_service_cost=%s,
                total_interest_cost=%s,
                total_remeasurement=%s,
                total_benefits_paid=%s,
                total_closing_liability=%s,
                total_movement=%s
            WHERE company_id=%s AND id=%s RETURNING *;
        """,(
            money(totals["opening"]),money(totals["service"]),
            money(totals["interest"]),money(totals["remeasurement"]),
            money(totals["paid"]),money(totals["closing"]),
            money(totals["closing"]-totals["opening"]),
            int(company_id),int(run_id),
        ))
        return self.long_term_run_get(company_id,out["id"])

    def long_term_journal_preview(self,company_id:int,run_id:int)->dict:
        run=self.long_term_run_get(company_id,run_id)
        return self._movement_preview(
            company_id,run,run["lines"],"other long-term benefit"
        )

    def long_term_post(self,company_id:int,run_id:int,user_id=None)->dict:
        schema=self.schema(company_id)
        preview=self.long_term_journal_preview(company_id,run_id)
        run=preview["run"]

        if run["status"] not in("calculated","approved"):
            raise ValueError("Calculate the long-term run before posting")
        if not preview["ready_to_post"]:
            raise ValueError("Long-term benefit journal is not ready to post")

        journal_id=self.db.post_journal(company_id,{
            "date":str(run["reporting_date"]),
            "ref":run["run_no"],
            "description":f"IAS 19 other long-term benefits {run['run_no']}",
            "source":self.JOURNAL_SOURCES["long_term"],
            "source_id":int(run_id),
            "currency":self.settings_get(company_id).get("reporting_currency") or "USD",
            "gross_amount":preview["debits"],
            "net_amount":preview["debits"],
            "vat_amount":0,
            "lines":[{
                "account_code":x["account_code"],
                "description":x["description"],
                "debit":x["debit"],"credit":x["credit"],
            } for x in preview["lines"]],
            "created_by_user_id":user_id,
            "prepared_by_user_id":user_id,
            "module_name":"payroll",
        })

        out=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_long_term_benefit_runs
            SET status='posted',posted_journal_id=%s,posted_at=NOW()
            WHERE company_id=%s AND id=%s RETURNING *;
        """,(int(journal_id),int(company_id),int(run_id)))

        return {"run":out,"journal_id":int(journal_id),"journal_preview":preview}

    def long_term_reverse(self,company_id:int,run_id:int,user_id=None)->dict:
        return self._reverse_posted_run(
            company_id,"payroll_long_term_benefit_runs",
            run_id,"long_term_reversal",user_id
        )

    # ---------------- Termination benefits ----------------

    TERMINATION_TYPES={
        "involuntary_termination","voluntary_retrenchment",
        "restructuring","early_retirement",
        "mutual_separation","other",
    }

    def termination_plans_list(self,company_id:int)->list[dict]:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        return self.db.fetch_all(f"""
            SELECT p.*,
                   COUNT(e.id)::INT AS employee_count,
                   COALESCE(SUM(e.measured_amount),0) AS measured_total,
                   COALESCE(SUM(e.settled_amount),0) AS employee_settled_total,
                   GREATEST(p.total_recognised-p.total_settled,0) AS outstanding_liability
            FROM {schema}.payroll_termination_plans p
            LEFT JOIN {schema}.payroll_termination_plan_employees e
              ON e.company_id=p.company_id AND e.plan_id=p.id
            WHERE p.company_id=%s
            GROUP BY p.id
            ORDER BY
                CASE p.status
                    WHEN 'draft' THEN 1
                    WHEN 'measured' THEN 2
                    WHEN 'recognised' THEN 3
                    WHEN 'part_settled' THEN 4
                    WHEN 'settled' THEN 5
                    ELSE 6
                END,
                p.created_at DESC;
        """,(int(company_id),))

    def termination_plan_get(self,company_id:int,plan_id:int)->dict:
        schema=self.schema(company_id)
        plan=self.db.fetch_one(f"""
            SELECT *,
                   GREATEST(total_recognised-total_settled,0)
                       AS outstanding_liability
            FROM {schema}.payroll_termination_plans
            WHERE company_id=%s AND id=%s;
        """,(int(company_id),int(plan_id)))
        if not plan: raise ValueError("Termination plan not found")

        employees=self.db.fetch_all(f"""
            SELECT x.*,e.employee_no,e.first_name,e.last_name,
                   CONCAT_WS(' ',e.first_name,e.last_name) AS employee_name,
                   GREATEST(x.measured_amount-x.settled_amount,0)
                       AS outstanding_amount
            FROM {schema}.payroll_termination_plan_employees x
            JOIN {schema}.payroll_employees e
              ON e.id=x.employee_id AND e.company_id=x.company_id
            WHERE x.company_id=%s AND x.plan_id=%s
            ORDER BY e.employee_no;
        """,(int(company_id),int(plan_id)))

        return {"plan":plan,"employees":employees}

    def termination_plan_save(
        self,
        company_id:int,
        body:dict,
        plan_id=None,
        user_id=None,
    )->dict:
        self.ensure_ready(company_id)
        schema=self.schema(company_id)

        name=str(body.get("name") or "").strip()
        plan_type=str(
            body.get("plan_type") or
            "involuntary_termination"
        ).strip()

        if not name:
            raise ValueError("Plan name is required")

        if plan_type not in self.TERMINATION_TYPES:
            raise ValueError("Invalid termination plan type")

        if plan_id:
            current=self.termination_plan_get(
                company_id,
                plan_id,
            )["plan"]

            if current["status"] in(
                "recognised",
                "part_settled",
                "settled",
                "reversed",
            ):
                raise ValueError(
                    "Recognised, settled or reversed plans "
                    "cannot be edited"
                )

            plan_no=current["plan_no"]
        else:
            plan_no=self._next_code(
                company_id,
                "termination_plan",
                "payroll_termination_plans",
                "plan_no",
            )

        expense=self._mapped_posting_account(
            company_id,
            body.get("expense_account_code"),
            "payroll_termination_benefit_expense",
            required=True,
            label="Termination expense account",
        )

        liability=self._mapped_posting_account(
            company_id,
            body.get("liability_account_code"),
            "payroll_termination_benefit_liability",
            required=True,
            label="Termination liability account",
        )

        cash=self._mapped_posting_account(
            company_id,
            body.get("cash_account_code"),
            "cash_bank",
            "cash",
            required=False,
            label="Settlement cash account",
        )

        values=(
            plan_no,
            name,
            plan_type,
            body.get("description"),
            body.get("communication_date"),
            body.get("withdrawal_offer_expiry_date"),
            body.get("restructuring_recognition_date"),
            body.get("recognition_date"),
            body.get("expected_settlement_date"),
            bool(body.get("cannot_withdraw_offer",False)),
            expense,
            liability,
            cash,
        )

        if plan_id:
            out=self.db.fetch_one(f"""
                UPDATE {schema}.payroll_termination_plans SET
                    plan_no=%s,name=%s,plan_type=%s,
                    description=%s,communication_date=%s,
                    withdrawal_offer_expiry_date=%s,
                    restructuring_recognition_date=%s,
                    recognition_date=%s,
                    expected_settlement_date=%s,
                    cannot_withdraw_offer=%s,
                    expense_account_code=%s,
                    liability_account_code=%s,
                    cash_account_code=%s,
                    updated_at=NOW()
                WHERE company_id=%s AND id=%s
                RETURNING *;
            """,values+(int(company_id),int(plan_id)))
        else:
            out=self.db.fetch_one(f"""
                INSERT INTO {schema}.payroll_termination_plans(
                    company_id,plan_no,name,plan_type,
                    description,communication_date,
                    withdrawal_offer_expiry_date,
                    restructuring_recognition_date,
                    recognition_date,
                    expected_settlement_date,
                    cannot_withdraw_offer,
                    expense_account_code,
                    liability_account_code,
                    cash_account_code,
                    status,created_by_user_id
                ) VALUES(
                    %s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,'draft',%s
                )
                RETURNING *;
            """,(int(company_id),)+values+(user_id,))

        if not out:
            raise ValueError("Termination plan not found")

        self._audit(
            company_id,user_id,
            "save_termination_plan",
            "payroll_termination_plan",
            out["id"],out,
            "Saved termination benefit plan",
        )

        return out

    def termination_employee_save(self,company_id:int,plan_id:int,body:dict,employee_line_id=None,user_id=None)->dict:
        schema=self.schema(company_id)
        plan=self.termination_plan_get(company_id,plan_id)["plan"]
        if plan["status"] in("recognised","part_settled","settled","reversed"):
            raise ValueError("Employees cannot be changed after recognition")

        employee_id=int(body.get("employee_id") or 0)
        if not employee_id: raise ValueError("Employee is required")

        employee=self.db.fetch_one(f"""
            SELECT e.*,
                   COALESCE(ps.fixed_basic_amount,c.basic_salary,0)
                       AS monthly_salary
            FROM {schema}.payroll_employees e
            LEFT JOIN LATERAL(
                SELECT fixed_basic_amount
                FROM {schema}.payroll_employee_pay_setups ps
                WHERE ps.company_id=e.company_id
                  AND ps.employee_id=e.id
                  AND ps.is_active=TRUE
                ORDER BY ps.effective_from DESC
                LIMIT 1
            ) ps ON TRUE
            LEFT JOIN LATERAL(
                SELECT basic_salary
                FROM {schema}.payroll_employee_contracts c
                WHERE c.company_id=e.company_id
                  AND c.employee_id=e.id
                  AND c.is_active=TRUE
                ORDER BY c.effective_from DESC
                LIMIT 1
            ) c ON TRUE
            WHERE e.company_id=%s AND e.id=%s;
        """,(int(company_id),employee_id))
        if not employee: raise ValueError("Employee not found")

        recognition_date=(
            plan.get("recognition_date") or
            plan.get("communication_date") or
            date.today()
        )

        start=employee.get("start_date")
        service_years=rate(
            body.get("service_years")
            if body.get("service_years") not in(None,"")
            else Decimal(str(max((recognition_date-start).days,0)))/
                 Decimal("365.25")
        )

        monthly_salary=money(
            body.get("monthly_salary")
            if body.get("monthly_salary") not in(None,"")
            else employee.get("monthly_salary")
        )

        values=(
            employee_id,service_years,monthly_salary,
            rate(body.get("severance_weeks_per_year")),
            body.get("termination_date"),
            money(body.get("notice_pay")),
            money(body.get("leave_settlement")),
            money(body.get("bonus_settlement")),
            money(body.get("statutory_amount")),
            money(body.get("other_benefits")),
            money(body.get("manual_adjustment")),
            body.get("notes"),
        )

        if employee_line_id:
            out=self.db.fetch_one(f"""
                UPDATE {schema}.payroll_termination_plan_employees SET
                    employee_id=%s,service_years=%s,monthly_salary=%s,
                    severance_weeks_per_year=%s,termination_date=%s,
                    notice_pay=%s,leave_settlement=%s,bonus_settlement=%s,
                    statutory_amount=%s,other_benefits=%s,
                    manual_adjustment=%s,notes=%s,updated_at=NOW()
                WHERE company_id=%s AND plan_id=%s AND id=%s
                RETURNING *;
            """,values+(
                int(company_id),int(plan_id),int(employee_line_id)
            ))
        else:
            out=self.db.fetch_one(f"""
                INSERT INTO {schema}.payroll_termination_plan_employees(
                    company_id,plan_id,employee_id,service_years,
                    monthly_salary,severance_weeks_per_year,
                    termination_date,notice_pay,leave_settlement,
                    bonus_settlement,statutory_amount,other_benefits,
                    manual_adjustment,notes
                ) VALUES(
                    %s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s
                ) RETURNING *;
            """,(int(company_id),int(plan_id))+values)

        if not out: raise ValueError("Termination-plan employee not found")
        return out

    def termination_recognition_date(self,plan:dict):
        dates=[
            plan.get("withdrawal_offer_expiry_date"),
            plan.get("restructuring_recognition_date"),
        ]
        dates=[x for x in dates if x]

        if plan.get("cannot_withdraw_offer"):
            dates.append(
                plan.get("communication_date") or
                plan.get("recognition_date")
            )

        if not dates:
            raise ValueError(
                "Set the date the offer cannot be withdrawn, "
                "the offer-expiry date or restructuring-recognition date"
            )

        return min(dates)

    def termination_calculate(self,company_id:int,plan_id:int)->dict:
        schema=self.schema(company_id)
        data=self.termination_plan_get(company_id,plan_id)
        plan=data["plan"]

        if plan["status"] in("recognised","part_settled","settled","reversed"):
            raise ValueError("Recognised or settled plan cannot be recalculated")
        if not data["employees"]:
            raise ValueError("Add employees before calculating the plan")

        recognition_date=self.termination_recognition_date(plan)
        total=D0

        for x in data["employees"]:
            weekly=money(dec(x.get("monthly_salary"))*Decimal("12")/Decimal("52"))
            severance=money(
                weekly*
                dec(x.get("severance_weeks_per_year"))*
                dec(x.get("service_years"))
            )

            measured=money(
                severance+
                dec(x.get("notice_pay"))+
                dec(x.get("leave_settlement"))+
                dec(x.get("bonus_settlement"))+
                dec(x.get("statutory_amount"))+
                dec(x.get("other_benefits"))+
                dec(x.get("manual_adjustment"))
            )

            if measured<D0:
                raise ValueError(
                    f"Measured termination amount cannot be negative for "
                    f"{x['employee_no']}"
                )

            self.db.execute_sql(f"""
                UPDATE {schema}.payroll_termination_plan_employees SET
                    weekly_salary=%s,severance_amount=%s,
                    measured_amount=%s,updated_at=NOW()
                WHERE company_id=%s AND plan_id=%s AND id=%s;
            """,(
                weekly,severance,measured,int(company_id),
                int(plan_id),int(x["id"]),
            ))
            total+=measured

        out=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_termination_plans SET
                recognition_date=%s,total_recognised=%s,
                status='measured',updated_at=NOW()
            WHERE company_id=%s AND id=%s
            RETURNING *;
        """,(
            recognition_date,money(total),
            int(company_id),int(plan_id),
        ))

        return self.termination_plan_get(company_id,out["id"])

    def termination_journal_preview(self,company_id:int,plan_id:int)->dict:
        schema=self.schema(company_id)
        data=self.termination_plan_get(company_id,plan_id)
        plan=data["plan"]
        amount=money(plan.get("total_recognised"))

        if plan["status"]=="draft":
            raise ValueError("Calculate the termination plan first")
        if amount<=D0:
            raise ValueError("Termination benefit amount is zero")

        expense=plan.get("expense_account_code")
        liability=plan.get("liability_account_code")
        missing=[]

        if not expense: missing.append("expense_account_code")
        if not liability: missing.append("liability_account_code")

        codes=[x for x in(expense,liability) if x]
        accounts=self.db.fetch_all(f"""
            SELECT code,name,posting
            FROM {schema}.coa
            WHERE code=ANY(%s);
        """,(codes,)) if codes else []

        names={x["code"]:x.get("name") or x["code"] for x in accounts}
        invalid=[
            code for code in codes
            if code not in names or not next(
                (x.get("posting") for x in accounts if x["code"]==code),
                False
            )
        ]

        lines=[
            {
                "account_code":expense,
                "account_name":names.get(expense,expense),
                "description":f"Termination benefits — {plan['plan_no']}",
                "debit":amount,"credit":D0,
            },
            {
                "account_code":liability,
                "account_name":names.get(liability,liability),
                "description":f"Termination-benefit liability — {plan['plan_no']}",
                "debit":D0,"credit":amount,
            },
        ] if not missing else []

        return {
            "plan":plan,
            "employees":data["employees"],
            "recognition_date":plan.get("recognition_date"),
            "lines":lines,
            "debits":amount,
            "credits":amount,
            "difference":D0,
            "missing_mappings":missing,
            "invalid_accounts":invalid,
            "ready_to_post":bool(lines) and not missing and not invalid,
        }

    def termination_recognise(self,company_id:int,plan_id:int,user_id=None)->dict:
        schema=self.schema(company_id)
        preview=self.termination_journal_preview(company_id,plan_id)
        plan=preview["plan"]

        if plan["status"]=="recognised":
            return self.termination_plan_get(company_id,plan_id)
        if plan["status"]!="measured":
            raise ValueError("Only measured plans can be recognised")
        if not preview["ready_to_post"]:
            raise ValueError("Termination journal is not ready to post")

        journal_id=self.db.post_journal(company_id,{
            "date":str(plan["recognition_date"]),
            "ref":plan["plan_no"],
            "description":f"IAS 19 termination benefits {plan['plan_no']}",
            "source":self.JOURNAL_SOURCES["termination"],
            "source_id":int(plan_id),
            "currency":self.settings_get(company_id).get(
                "reporting_currency"
            ) or "USD",
            "gross_amount":preview["debits"],
            "net_amount":preview["debits"],
            "vat_amount":0,
            "lines":[{
                "account_code":x["account_code"],
                "description":x["description"],
                "debit":x["debit"],
                "credit":x["credit"],
            } for x in preview["lines"]],
            "created_by_user_id":user_id,
            "prepared_by_user_id":user_id,
            "module_name":"payroll",
        })

        out=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_termination_plans SET
                status='recognised',posted_journal_id=%s,
                recognised_at=NOW(),updated_at=NOW()
            WHERE company_id=%s AND id=%s
            RETURNING *;
        """,(int(journal_id),int(company_id),int(plan_id)))

        self._audit(
            company_id,user_id,"recognise_termination_benefits",
            "payroll_termination_plan",plan_id,out,
            "Recognised termination benefit obligation"
        )

        return {"plan":out,"journal_id":int(journal_id),"journal_preview":preview}

    def termination_settlement_preview(self,company_id:int,plan_id:int,body:dict)->dict:
        data=self.termination_plan_get(company_id,plan_id)
        plan=data["plan"]

        if plan["status"] not in("recognised","part_settled"):
            raise ValueError("Only recognised plans can be settled")

        employee_line_id=int(body.get("employee_line_id") or 0)
        amount=money(body.get("amount"))
        payment_date=body.get("payment_date") or date.today().isoformat()

        if amount<=D0: raise ValueError("Settlement amount must be positive")

        employee_line=None
        if employee_line_id:
            employee_line=next(
                (
                    x for x in data["employees"]
                    if int(x["id"])==employee_line_id
                ),
                None
            )
            if not employee_line:
                raise ValueError("Termination employee line not found")

            outstanding=money(employee_line.get("outstanding_amount"))
            if amount>outstanding:
                raise ValueError(
                    f"Settlement exceeds employee outstanding amount of {outstanding}"
                )
        else:
            outstanding=money(plan.get("outstanding_liability"))
            if amount>outstanding:
                raise ValueError(
                    f"Settlement exceeds plan outstanding liability of {outstanding}"
                )

        liability=plan.get("liability_account_code")
        cash=body.get("cash_account_code") or plan.get("cash_account_code")

        if not liability or not cash:
            raise ValueError("Liability and cash account codes are required")

        return {
            "plan":plan,
            "employee_line":employee_line,
            "amount":amount,
            "payment_date":payment_date,
            "payment_reference":body.get("payment_reference"),
            "lines":[
                {
                    "account_code":liability,
                    "description":f"Settlement of {plan['plan_no']}",
                    "debit":amount,"credit":D0,
                },
                {
                    "account_code":cash,
                    "description":f"Payment of {plan['plan_no']}",
                    "debit":D0,"credit":amount,
                },
            ],
        }

    def termination_settle(self,company_id:int,plan_id:int,body:dict,user_id=None)->dict:
        schema=self.schema(company_id)
        preview=self.termination_settlement_preview(company_id,plan_id,body)
        plan=preview["plan"]
        amount=preview["amount"]

        journal_id=self.db.post_journal(company_id,{
            "date":str(preview["payment_date"]),
            "ref":preview.get("payment_reference") or f"SET-{plan['plan_no']}",
            "description":f"Termination-benefit settlement {plan['plan_no']}",
            "source":"payroll_termination_benefit_settlement",
            "source_id":int(plan_id),
            "currency":self.settings_get(company_id).get(
                "reporting_currency"
            ) or "USD",
            "gross_amount":amount,"net_amount":amount,"vat_amount":0,
            "lines":preview["lines"],
            "created_by_user_id":user_id,
            "prepared_by_user_id":user_id,
            "module_name":"payroll",
        })

        line=preview.get("employee_line")
        if line:
            self.db.execute_sql(f"""
                UPDATE {schema}.payroll_termination_plan_employees SET
                    settled_amount=settled_amount+%s,
                    payment_date=%s,payment_reference=%s,
                    updated_at=NOW()
                WHERE company_id=%s AND plan_id=%s AND id=%s;
            """,(
                amount,preview["payment_date"],
                preview.get("payment_reference"),
                int(company_id),int(plan_id),int(line["id"]),
            ))

        updated=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_termination_plans SET
                total_settled=total_settled+%s,
                settlement_journal_id=%s,
                status=CASE
                    WHEN total_settled+%s>=total_recognised
                        THEN 'settled'
                    ELSE 'part_settled'
                END,
                settled_at=CASE
                    WHEN total_settled+%s>=total_recognised
                        THEN NOW()
                    ELSE settled_at
                END,
                updated_at=NOW()
            WHERE company_id=%s AND id=%s
            RETURNING *;
        """,(
            amount,int(journal_id),amount,amount,
            int(company_id),int(plan_id),
        ))

        self._audit(
            company_id,user_id,"settle_termination_benefits",
            "payroll_termination_plan",plan_id,updated,
            "Settled termination benefit obligation"
        )

        return {
            "plan":updated,
            "settlement_journal_id":int(journal_id),
            "settlement_amount":amount,
        }

    def termination_reverse(self,company_id:int,plan_id:int,user_id=None)->dict:
        schema=self.schema(company_id)
        data=self.termination_plan_get(company_id,plan_id)
        plan=data["plan"]

        if plan["status"]!="recognised":
            raise ValueError(
                "Only an recognised plan with no settlements can be reversed"
            )
        if money(plan.get("total_settled"))>D0:
            raise ValueError(
                "Reverse settlement journals before reversing recognition"
            )

        journal_id=plan.get("posted_journal_id")
        if not journal_id:
            raise ValueError("Recognition journal is missing")

        journal=self.db.fetch_one(
            f"SELECT * FROM {schema}.journals WHERE id=%s",
            (int(journal_id),)
        )
        lines=self.db.fetch_all(
            f"""
            SELECT * FROM {schema}.journal_lines
            WHERE journal_id=%s ORDER BY id
            """,
            (int(journal_id),)
        )

        reverse_id=self.db.post_journal(company_id,{
            "date":date.today().isoformat(),
            "ref":f"REV-{plan['plan_no']}",
            "description":f"Reversal of {plan['plan_no']}",
            "source":self.JOURNAL_SOURCES["termination_reversal"],
            "source_id":int(plan_id),
            "currency":journal.get("currency") or "USD",
            "gross_amount":sum(
                (dec(x.get("credit")) for x in lines),D0
            ),
            "net_amount":sum(
                (dec(x.get("credit")) for x in lines),D0
            ),
            "vat_amount":0,
            "lines":[{
                "account_code":x.get("account_code"),
                "description":f"Reversal: {x.get('description') or ''}",
                "debit":x.get("credit") or 0,
                "credit":x.get("debit") or 0,
            } for x in lines],
            "created_by_user_id":user_id,
            "prepared_by_user_id":user_id,
            "module_name":"payroll",
        })

        out=self.db.fetch_one(f"""
            UPDATE {schema}.payroll_termination_plans SET
                status='reversed',reversal_journal_id=%s,
                reversed_at=NOW(),updated_at=NOW()
            WHERE company_id=%s AND id=%s
            RETURNING *;
        """,(int(reverse_id),int(company_id),int(plan_id)))

        return {
            "plan":out,
            "reversal_journal_id":int(reverse_id),
        }
    
    def disclosure(self,company_id:int,reporting_date:str,date_from=None,date_to=None)->dict:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        if not reporting_date: raise ValueError("reporting_date is required")
        date_to=date_to or reporting_date
        date_from=date_from or f"{str(date_to)[:4]}-01-01"

        def latest(table,date_col,extra=""):
            return self.db.fetch_one(f"""
                SELECT * FROM {schema}.{table}
                WHERE company_id=%s AND {date_col}<=%s {extra}
                ORDER BY {date_col} DESC,id DESC LIMIT 1;
            """,(int(company_id),reporting_date)) or {}

        leave=latest(
            "payroll_leave_accrual_runs","reporting_date",
            "AND status IN('calculated','approved','posted')"
        )
        bonus=latest(
            "payroll_bonus_accrual_runs","reporting_date",
            "AND status IN('calculated','approved','posted')"
        )
        long_term=latest(
            "payroll_long_term_benefit_runs","reporting_date",
            "AND status IN('calculated','approved','posted')"
        )

        dc=self.db.fetch_one(f"""
            SELECT COALESCE(SUM(total_employee_contribution),0) AS employee,
                   COALESCE(SUM(total_employer_contribution),0) AS employer,
                   COALESCE(SUM(total_payable),0) AS payable
            FROM {schema}.payroll_defined_contribution_runs
            WHERE company_id=%s AND reporting_date BETWEEN %s AND %s
              AND status IN('calculated','approved','posted');
        """,(int(company_id),date_from,date_to)) or {}

        valuations=self.db.fetch_all(f"""
            SELECT DISTINCT ON(v.plan_id)
                   v.*,p.code AS plan_code,p.name AS plan_name,
                   p.provider_name,p.funded
            FROM {schema}.payroll_actuarial_valuations v
            JOIN {schema}.payroll_benefit_plans p
              ON p.id=v.plan_id AND p.company_id=v.company_id
            WHERE v.company_id=%s AND v.valuation_date<=%s
              AND v.status IN('validated','approved','posted')
            ORDER BY v.plan_id,v.valuation_date DESC,v.id DESC;
        """,(int(company_id),reporting_date))

        termination=self.db.fetch_one(f"""
            SELECT COALESCE(SUM(total_recognised),0) AS recognised,
                   COALESCE(SUM(total_settled),0) AS settled,
                   COALESCE(SUM(GREATEST(total_recognised-total_settled,0)),0)
                       AS liability
            FROM {schema}.payroll_termination_plans
            WHERE company_id=%s
              AND recognition_date<=%s
              AND status IN('recognised','part_settled','settled');
        """,(int(company_id),reporting_date)) or {}

        assumptions=self.db.fetch_all(f"""
            SELECT DISTINCT ON(a.valuation_id,a.assumption_key)
                   a.*,p.code AS plan_code,p.name AS plan_name,v.valuation_date
            FROM {schema}.payroll_actuarial_assumptions a
            JOIN {schema}.payroll_actuarial_valuations v
              ON v.id=a.valuation_id AND v.company_id=a.company_id
            JOIN {schema}.payroll_benefit_plans p
              ON p.id=v.plan_id AND p.company_id=v.company_id
            WHERE a.company_id=%s AND v.valuation_date<=%s
            ORDER BY a.valuation_id,a.assumption_key,v.valuation_date DESC;
        """,(int(company_id),reporting_date))

        dbo_open=sum((dec(v.get("opening_dbo")) for v in valuations),D0)
        dbo_close=sum((dec(v.get("closing_dbo")) for v in valuations),D0)
        assets_open=sum((dec(v.get("opening_plan_assets")) for v in valuations),D0)
        assets_close=sum((dec(v.get("closing_plan_assets")) for v in valuations),D0)

        db_expense=sum((dec(v.get("profit_or_loss_amount")) for v in valuations),D0)
        db_oci=sum((dec(v.get("oci_remeasurement_amount")) for v in valuations),D0)
        db_liability=sum((dec(v.get("net_defined_benefit_liability")) for v in valuations),D0)
        db_asset=sum((dec(v.get("net_defined_benefit_asset")) for v in valuations),D0)

        leave_close=money(leave.get("total_closing_provision"))
        bonus_close=money(bonus.get("total_closing_liability"))
        long_close=money(long_term.get("total_closing_liability"))
        termination_close=money(termination.get("liability"))

        return {
            "standard":"IAS 19",
            "reporting_date":reporting_date,
            "date_from":date_from,
            "date_to":date_to,
            "currency":self.settings_get(company_id).get("reporting_currency"),
            "statement_of_financial_position":{
                "current_employee_benefit_liabilities":{
                    "leave":leave_close,
                    "bonus":bonus_close,
                    "defined_contribution_payable":money(dc.get("payable")),
                    "termination":termination_close,
                    "total":money(
                        leave_close+bonus_close+
                        money(dc.get("payable"))+termination_close
                    ),
                },
                "noncurrent_employee_benefits":{
                    "other_long_term":long_close,
                    "defined_benefit_liability":money(db_liability),
                    "defined_benefit_asset":money(db_asset),
                    "net_liability":money(long_close+db_liability-db_asset),
                },
            },
            "profit_or_loss":{
                "leave_expense":money(leave.get("total_movement")),
                "bonus_expense":money(bonus.get("total_movement")),
                "defined_contribution_expense":money(dc.get("employer")),
                "defined_benefit_expense":money(db_expense),
                "other_long_term_expense":money(long_term.get("total_movement")),
                "termination_expense":money(termination.get("recognised")),
                "total":money(
                    dec(leave.get("total_movement"))+
                    dec(bonus.get("total_movement"))+
                    dec(dc.get("employer"))+
                    db_expense+
                    dec(long_term.get("total_movement"))+
                    dec(termination.get("recognised"))
                ),
            },
            "other_comprehensive_income":{
                "defined_benefit_remeasurement":money(db_oci),
            },
            "leave":{
                "opening":money(leave.get("total_opening_provision")),
                "expense":money(leave.get("total_movement")),
                "closing":leave_close,
            },
            "bonus":{
                "opening":money(bonus.get("total_opening_liability")),
                "expense":money(bonus.get("total_movement")),
                "closing":bonus_close,
            },
            "defined_contribution":{
                "employee_contributions":money(dc.get("employee")),
                "employer_contributions":money(dc.get("employer")),
                "closing_payable":money(dc.get("payable")),
            },
            "defined_benefit":{
                "obligation":{
                    "opening":money(dbo_open),
                    "current_service_cost":money(sum((dec(v.get("current_service_cost")) for v in valuations),D0)),
                    "past_service_cost":money(sum((dec(v.get("past_service_cost")) for v in valuations),D0)),
                    "interest_cost":money(sum((dec(v.get("interest_cost")) for v in valuations),D0)),
                    "benefits_paid":money(sum((dec(v.get("benefits_paid")) for v in valuations),D0)),
                    "actuarial_gain_loss":money(sum((dec(v.get("actuarial_gain_loss_obligation")) for v in valuations),D0)),
                    "closing":money(dbo_close),
                },
                "plan_assets":{
                    "opening":money(assets_open),
                    "interest_income":money(sum((dec(v.get("interest_income_plan_assets")) for v in valuations),D0)),
                    "employer_contributions":money(sum((dec(v.get("employer_contributions")) for v in valuations),D0)),
                    "employee_contributions":money(sum((dec(v.get("employee_contributions")) for v in valuations),D0)),
                    "return_excluding_interest":money(sum((dec(v.get("return_on_assets_excluding_interest")) for v in valuations),D0)),
                    "benefits_paid":money(sum((dec(v.get("benefits_paid")) for v in valuations),D0)),
                    "closing":money(assets_close),
                },
                "net_liability":money(db_liability),
                "net_asset":money(db_asset),
                "profit_or_loss":money(db_expense),
                "oci":money(db_oci),
                "plans":valuations,
                "significant_assumptions":assumptions,
            },
            "other_long_term":{
                "opening":money(long_term.get("total_opening_liability")),
                "service_cost":money(long_term.get("total_current_service_cost")),
                "interest_cost":money(long_term.get("total_interest_cost")),
                "remeasurement":money(long_term.get("total_remeasurement")),
                "benefits_paid":money(long_term.get("total_benefits_paid")),
                "closing":long_close,
            },
            "termination":{
                "recognised":money(termination.get("recognised")),
                "settled":money(termination.get("settled")),
                "closing_liability":termination_close,
            },
            "accounting_policy":{
                "short_term":"Short-term employee benefits are recognised as employees render service. Accumulating compensated absences and bonuses are recognised when a present obligation exists and the amount can be estimated reliably.",
                "defined_contribution":"Defined-contribution plan expenses are recognised when employees render service. Unpaid contributions are presented as liabilities.",
                "defined_benefit":"Defined-benefit obligations are measured using actuarial valuation outputs. Service cost and net interest are recognised in profit or loss, while remeasurements are recognised in other comprehensive income.",
                "other_long_term":"Other long-term employee benefits are measured using discounted probability-weighted amounts, with service cost, interest and remeasurements recognised in profit or loss.",
                "termination":"Termination benefits are recognised when the entity can no longer withdraw the offer or when related restructuring costs are recognised, whichever occurs earlier.",
            },
            "note":"Defined-benefit measurements are based on actuarial valuation information retained by the entity.",
        }

    def employee_benefit_role_mappings(self,company_id:int)->dict:
        self.ensure_ready(company_id)

        return{
            "leave_expense":self._account_by_roles(
                company_id,"payroll_leave_expense"
            ),
            "leave_liability":self._account_by_roles(
                company_id,"payroll_leave_provision"
            ),
            "bonus_expense":self._account_by_roles(
                company_id,"payroll_bonus_expense"
            ),
            "bonus_liability":self._account_by_roles(
                company_id,"payroll_bonus_payable"
            ),
            "defined_contribution_expense":self._account_by_roles(
                company_id,
                "payroll_defined_contribution_expense",
                "payroll_employer_contribution_expense",
            ),
            "defined_contribution_payable":self._account_by_roles(
                company_id,
                "payroll_defined_contribution_payable",
                "payroll_pension_payable",
            ),
            "defined_benefit_expense":self._account_by_roles(
                company_id,"payroll_defined_benefit_expense"
            ),
            "defined_benefit_liability":self._account_by_roles(
                company_id,"payroll_defined_benefit_liability"
            ),
            "defined_benefit_asset":self._account_by_roles(
                company_id,"payroll_defined_benefit_asset"
            ),
            "defined_benefit_oci":self._account_by_roles(
                company_id,"payroll_defined_benefit_oci"
            ),
            "long_term_expense":self._account_by_roles(
                company_id,"payroll_long_term_benefit_expense"
            ),
            "long_term_liability":self._account_by_roles(
                company_id,"payroll_long_term_benefit_liability"
            ),
            "termination_expense":self._account_by_roles(
                company_id,"payroll_termination_benefit_expense"
            ),
            "termination_liability":self._account_by_roles(
                company_id,"payroll_termination_benefit_liability"
            ),
            "settlement_cash":self._account_by_roles(
                company_id,"cash_bank","cash"
            ),
        }

    def employee_benefit_journals(
        self,
        company_id:int,
        source_type=None,
        date_from=None,
        date_to=None,
    )->list[dict]:
        self.ensure_ready(company_id)
        schema=self.schema(company_id)

        sources=list(self.JOURNAL_SOURCES.values())+[
            "payroll_termination_benefit_settlement",
            "payroll_run",
        ]

        params=[int(company_id),sources]
        where=[
            "j.company_id=%s",
            "j.source=ANY(%s)",
        ]

        if source_type:
            where.append("j.source=%s")
            params.append(source_type)

        if date_from:
            where.append("j.date>=%s")
            params.append(date_from)

        if date_to:
            where.append("j.date<=%s")
            params.append(date_to)

        return self.db.fetch_all(f"""
            SELECT
                j.id,
                j.date,
                j.ref,
                j.description,
                j.source,
                j.source_id,
                j.currency,
                j.gross_amount,
                j.net_amount,
                j.vat_amount,
                j.is_reversal,
                j.reversal_of_journal_id,
                j.reversed_by_journal_id,
                j.created_at,
                CASE
                    WHEN j.is_reversal=TRUE
                    OR j.reversal_of_journal_id IS NOT NULL
                        THEN 'reversal'
                    WHEN j.reversed_by_journal_id IS NOT NULL
                        THEN 'reversed'
                    ELSE 'posted'
                END AS status,
                COALESCE(SUM(l.debit),0) AS debits,
                COALESCE(SUM(l.credit),0) AS credits,
                COUNT(l.id)::INT AS line_count
            FROM {schema}.journal j
            LEFT JOIN {schema}.journal_lines l
            ON l.journal_id=j.id
            WHERE {' AND '.join(where)}
            GROUP BY
                j.id,
                j.date,
                j.ref,
                j.description,
                j.source,
                j.source_id,
                j.currency,
                j.gross_amount,
                j.net_amount,
                j.vat_amount,
                j.is_reversal,
                j.reversal_of_journal_id,
                j.reversed_by_journal_id,
                j.created_at
            ORDER BY j.date DESC,j.id DESC;
        """,tuple(params))

    def employee_benefit_journal_get(
        self,
        company_id:int,
        journal_id:int,
    )->dict:
        self.ensure_ready(company_id)
        schema=self.schema(company_id)

        journal=self.db.fetch_one(f"""
            SELECT
                j.*,
                CASE
                    WHEN j.is_reversal=TRUE
                    OR j.reversal_of_journal_id IS NOT NULL
                        THEN 'reversal'
                    WHEN j.reversed_by_journal_id IS NOT NULL
                        THEN 'reversed'
                    ELSE 'posted'
                END AS status
            FROM {schema}.journal j
            WHERE j.company_id=%s
            AND j.id=%s;
        """,(int(company_id),int(journal_id)))

        if not journal:
            raise ValueError("Employee-benefit journal not found")

        allowed=set(self.JOURNAL_SOURCES.values())|{
            "payroll_termination_benefit_settlement",
            "payroll_run",
        }

        if journal.get("source") not in allowed:
            raise ValueError(
                "Journal does not belong to payroll or employee benefits"
            )

        lines=self.db.fetch_all(f"""
            SELECT
                l.id,
                l.company_id,
                l.journal_id,
                l.line_no,
                l.account_code,
                c.name AS account_name,
                l.description,
                l.debit,
                l.credit,
                l.source,
                l.source_id,
                l.created_at
            FROM {schema}.journal_lines l
            LEFT JOIN {schema}.coa c
            ON c.code=l.account_code
            WHERE l.company_id=%s
            AND l.journal_id=%s
            ORDER BY l.line_no,l.id;
        """,(int(company_id),int(journal_id)))

        return {
            "journal":journal,
            "lines":lines,
        }

    def diagnostics(self,company_id:int)->dict:
        self.ensure_ready(company_id); schema=self.schema(company_id)
        checks=[]

        def add(key,ok,message,count=0):
            checks.append({
                "key":key,"ok":bool(ok),
                "message":message,"count":int(count or 0),
            })

        leave=self.leave_policies_list(company_id)
        bad_leave=[
            x for x in leave
            if x.get("provision_required") and(
                not x.get("expense_account_code") or
                not x.get("liability_account_code")
            )
        ]
        add(
            "leave_policy_accounts",not bad_leave,
            f"{len(bad_leave)} provision-bearing leave policy/policies have missing accounts.",
            len(bad_leave)
        )

        bonus=self.db.fetch_all(f"""
            SELECT * FROM {schema}.payroll_bonus_schemes
            WHERE company_id=%s AND is_active=TRUE;
        """,(int(company_id),))
        bad_bonus=[
            x for x in bonus
            if not x.get("expense_account_code") or
               not x.get("liability_account_code")
        ]
        add(
            "bonus_scheme_accounts",not bad_bonus,
            f"{len(bad_bonus)} active bonus scheme(s) have missing accounts.",
            len(bad_bonus)
        )

        plans=self.db.fetch_all(f"""
            SELECT * FROM {schema}.payroll_benefit_plans
            WHERE company_id=%s AND is_active=TRUE;
        """,(int(company_id),))

        bad_dc=[
            x for x in plans
            if x.get("plan_type")=="defined_contribution" and(
                not x.get("expense_account_code") or
                not x.get("payable_account_code")
            )
        ]
        add(
            "defined_contribution_accounts",not bad_dc,
            f"{len(bad_dc)} defined-contribution plan(s) have missing accounts.",
            len(bad_dc)
        )

        bad_db=[
            x for x in plans
            if x.get("plan_type")=="defined_benefit" and(
                not x.get("expense_account_code") or
                not x.get("liability_account_code") or
                not x.get("asset_account_code") or
                not x.get("oci_account_code")
            )
        ]
        add(
            "defined_benefit_accounts",not bad_db,
            f"{len(bad_db)} defined-benefit plan(s) have incomplete GL mappings.",
            len(bad_db)
        )

        bad_lt=self.db.fetch_one(f"""
            SELECT COUNT(*)::INT AS count
            FROM {schema}.payroll_long_term_benefit_schemes
            WHERE company_id=%s AND is_active=TRUE
              AND(expense_account_code IS NULL OR liability_account_code IS NULL);
        """,(int(company_id),)) or {}
        add(
            "long_term_accounts",not int(bad_lt.get("count") or 0),
            f"{int(bad_lt.get('count') or 0)} long-term scheme(s) have missing accounts.",
            bad_lt.get("count")
        )

        bad_term=self.db.fetch_one(f"""
            SELECT COUNT(*)::INT AS count
            FROM {schema}.payroll_termination_plans
            WHERE company_id=%s AND status<>'reversed'
              AND(expense_account_code IS NULL OR liability_account_code IS NULL);
        """,(int(company_id),)) or {}
        add(
            "termination_accounts",not int(bad_term.get("count") or 0),
            f"{int(bad_term.get('count') or 0)} termination plan(s) have missing accounts.",
            bad_term.get("count")
        )

        pending=[]
        for table,label in(
            ("payroll_leave_accrual_runs","leave"),
            ("payroll_bonus_accrual_runs","bonus"),
            ("payroll_defined_contribution_runs","defined contribution"),
            ("payroll_long_term_benefit_runs","long-term"),
        ):
            row=self.db.fetch_one(f"""
                SELECT COUNT(*)::INT AS count
                FROM {schema}.{table}
                WHERE company_id=%s AND status IN('calculated','approved');
            """,(int(company_id),)) or {}
            pending.append((label,int(row.get("count") or 0)))

        pending_count=sum(x[1] for x in pending)
        add(
            "unposted_measurements",pending_count==0,
            f"{pending_count} calculated or approved employee-benefit run(s) remain unposted.",
            pending_count
        )

        unvalidated=self.db.fetch_one(f"""
            SELECT COUNT(*)::INT AS count
            FROM {schema}.payroll_actuarial_valuations
            WHERE company_id=%s AND status='draft';
        """,(int(company_id),)) or {}
        add(
            "draft_actuarial_valuations",
            int(unvalidated.get("count") or 0)==0,
            f"{int(unvalidated.get('count') or 0)} actuarial valuation(s) remain in draft.",
            unvalidated.get("count")
        )

        duplicate_members=self.db.fetch_one(f"""
            SELECT COUNT(*)::INT AS count FROM(
                SELECT plan_id,employee_id
                FROM {schema}.payroll_benefit_plan_members
                WHERE company_id=%s AND is_active=TRUE
                GROUP BY plan_id,employee_id
                HAVING COUNT(*)>1
            ) x;
        """,(int(company_id),)) or {}

        add(
            "duplicate_active_plan_memberships",
            int(duplicate_members.get("count") or 0)==0,
            f"{int(duplicate_members.get('count') or 0)} duplicate active plan membership(s).",
            duplicate_members.get("count"),
        )

        orphan_lines=self.db.fetch_one(f"""
            SELECT COUNT(*)::INT AS count
            FROM {schema}.payroll_run_lines l
            WHERE l.company_id=%s
              AND l.source_type='defined_contribution_plan'
              AND NOT EXISTS(
                  SELECT 1
                  FROM {schema}.payroll_benefit_plan_members m
                  WHERE m.company_id=l.company_id
                    AND m.id=l.source_id
              );
        """,(int(company_id),)) or {}

        add(
            "orphan_contribution_lines",
            int(orphan_lines.get("count") or 0)==0,
            f"{int(orphan_lines.get('count') or 0)} payroll contribution line(s) have no membership.",
            orphan_lines.get("count"),
        )

        unlinked_dc=self.db.fetch_one(f"""
            SELECT COUNT(*)::INT AS count
            FROM {schema}.payroll_defined_contribution_runs
            WHERE company_id=%s
              AND payroll_run_id IS NULL
              AND status IN('calculated','approved','posted');
        """,(int(company_id),)) or {}

        add(
            "unlinked_defined_contribution_runs",
            int(unlinked_dc.get("count") or 0)==0,
            f"{int(unlinked_dc.get('count') or 0)} contribution run(s) are not linked to payroll.",
            unlinked_dc.get("count"),
        )

        return {
            "ok":all(x["ok"] for x in checks),
            "checks":checks,
            "summary":{
                "passed":sum(1 for x in checks if x["ok"]),
                "failed":sum(1 for x in checks if not x["ok"]),
                "total":len(checks),
            },
        }