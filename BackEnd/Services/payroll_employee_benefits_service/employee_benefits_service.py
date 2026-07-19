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
    }

    def __init__(self, db_service):
        self.db = db_service

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

    def dashboard(self, company_id: int, reporting_date: str | None = None) -> dict:
        self.ensure_ready(company_id)
        schema = self.schema(company_id)
        reporting_date = reporting_date or date.today().isoformat()

        leave = self.db.fetch_one(f"""
            SELECT COALESCE(SUM(closing_provision),0) AS amount
            FROM {schema}.payroll_employee_leave_balances
            WHERE company_id=%s AND as_of_date=%s;
        """, (int(company_id), reporting_date)) or {}

        bonus = self.db.fetch_one(f"""
            SELECT COALESCE(SUM(total_closing_liability),0) AS amount
            FROM {schema}.payroll_bonus_accrual_runs
            WHERE company_id=%s
              AND reporting_date<=%s
              AND status IN ('calculated','approved','posted')
        """, (int(company_id), reporting_date)) or {}

        defined_benefit = self.db.fetch_one(f"""
            SELECT
              COALESCE(SUM(net_defined_benefit_liability),0) AS liability,
              COALESCE(SUM(net_defined_benefit_asset),0) AS asset,
              COALESCE(SUM(profit_or_loss_amount),0) AS expense,
              COALESCE(SUM(oci_remeasurement_amount),0) AS oci
            FROM {schema}.payroll_actuarial_valuations
            WHERE company_id=%s
              AND valuation_date<=%s
              AND status IN ('validated','approved','posted');
        """, (int(company_id), reporting_date)) or {}

        termination = self.db.fetch_one(f"""
            SELECT COALESCE(SUM(total_recognised-total_settled),0) AS amount
            FROM {schema}.payroll_termination_plans
            WHERE company_id=%s
              AND status IN ('recognised','part_settled');
        """, (int(company_id),)) or {}

        current_liability = money(leave.get("amount")) + money(bonus.get("amount")) + money(termination.get("amount"))
        noncurrent = money(defined_benefit.get("liability"))

        return {
            "reporting_date": reporting_date,
            "current_liability": current_liability,
            "noncurrent_liability": noncurrent,
            "plan_assets": money(defined_benefit.get("asset")),
            "expense": money(defined_benefit.get("expense")),
            "oci": money(defined_benefit.get("oci")),
            "leave_liability": money(leave.get("amount")),
            "bonus_liability": money(bonus.get("amount")),
            "termination_liability": money(termination.get("amount")),
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

    def leave_policy_save(self, company_id: int, body: dict, policy_id=None, user_id=None) -> dict:
        schema = self.schema(company_id)
        required = ["leave_type_id", "name", "annual_entitlement_days"]
        missing = [k for k in required if body.get(k) in (None, "")]
        if missing:
            raise ValueError("Missing required fields: " + ", ".join(missing))

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
                bool(body.get("provision_required", True)),
                body.get("daily_rate_basis") or "monthly_div_21_67",
                body.get("custom_daily_rate"),
                bool(body.get("include_fixed_allowances", False)),
                body.get("expense_account_code"),
                body.get("liability_account_code"),
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
                body.get("expense_account_code"), body.get("liability_account_code"),
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

    def bonus_run_create(self, company_id: int, body: dict, user_id=None) -> dict:
        schema=self.schema(company_id)
        required=("period_start","period_end","reporting_date")
        missing=[x for x in required if not body.get(x)]
        if missing:
            raise ValueError("Missing required fields: "+", ".join(missing))
        return self.db.fetch_one(f"""INSERT INTO {schema}.payroll_bonus_accrual_runs (company_id,run_no,period_start,period_end,reporting_date,status,created_by_user_id) VALUES (%s,'BONUS-'||%s||'-'||TO_CHAR(%s::date,'YYYYMMDD'),%s,%s,%s,'draft',%s) RETURNING *""",(int(company_id),int(company_id),body["reporting_date"],body["period_start"],body["period_end"],body["reporting_date"],user_id))

    def bonus_run_get(self, company_id: int, run_id: int) -> dict:
        schema=self.schema(company_id)
        run=self.db.fetch_one(f"SELECT * FROM {schema}.payroll_bonus_accrual_runs WHERE company_id=%s AND id=%s",(int(company_id),int(run_id)))
        if not run:
            raise ValueError("Bonus accrual run not found")
        run["lines"]=self.db.fetch_all(f"""SELECT l.*,e.employee_no,e.first_name,e.last_name,s.code AS scheme_code,s.name AS scheme_name FROM {schema}.payroll_bonus_accrual_run_lines l JOIN {schema}.payroll_employees e ON e.id=l.employee_id JOIN {schema}.payroll_bonus_schemes s ON s.id=l.scheme_id WHERE l.company_id=%s AND l.run_id=%s ORDER BY e.employee_no,s.code""",(int(company_id),int(run_id)))
        return run

    def bonus_run_calculate(self, company_id: int, run_id: int) -> dict:
        schema=self.schema(company_id)
        run=self.bonus_run_get(company_id,run_id)
        if run["status"] in ("posted","reversed"):
            raise ValueError("Posted or reversed run cannot be recalculated")
        self.db.execute_sql(f"DELETE FROM {schema}.payroll_bonus_accrual_run_lines WHERE company_id=%s AND run_id=%s",(int(company_id),int(run_id)))
        rows=self.db.fetch_all(f"""SELECT a.*,s.target_percentage AS scheme_target,s.probability_percentage AS scheme_probability,s.performance_percentage AS scheme_performance,s.expense_account_code,s.liability_account_code,COALESCE(ps.fixed_basic_amount,c.basic_salary,0) AS monthly_salary FROM {schema}.payroll_employee_bonus_assignments a JOIN {schema}.payroll_bonus_schemes s ON s.id=a.scheme_id JOIN {schema}.payroll_employees e ON e.id=a.employee_id LEFT JOIN LATERAL (SELECT fixed_basic_amount FROM {schema}.payroll_employee_pay_setups ps WHERE ps.company_id=a.company_id AND ps.employee_id=a.employee_id AND ps.is_active=TRUE AND ps.effective_from<=%s AND (ps.effective_to IS NULL OR ps.effective_to>=%s) ORDER BY ps.effective_from DESC LIMIT 1) ps ON TRUE LEFT JOIN LATERAL (SELECT basic_salary FROM {schema}.payroll_employee_contracts c WHERE c.company_id=a.company_id AND c.employee_id=a.employee_id AND c.is_active=TRUE ORDER BY c.effective_from DESC LIMIT 1) c ON TRUE WHERE a.company_id=%s AND a.is_active=TRUE AND a.effective_from<=%s AND (a.effective_to IS NULL OR a.effective_to>=%s) AND s.is_active=TRUE""",(run["period_end"],run["period_start"],int(company_id),run["period_end"],run["period_start"]))
        total=D0
        for row in rows:
            target=dec(row.get("target_percentage") if row.get("target_percentage") is not None else row.get("scheme_target"))
            probability=dec(row.get("probability_percentage") if row.get("probability_percentage") is not None else row.get("scheme_probability"))
            performance=dec(row.get("performance_percentage") if row.get("performance_percentage") is not None else row.get("scheme_performance"))
            annual_base=dec(row.get("monthly_salary"))*Decimal("12")
            closing=money(annual_base*target/100*probability/100*performance/100)
            previous=self.db.fetch_one(f"SELECT COALESCE(SUM(closing_liability),0) amount FROM {schema}.payroll_bonus_accrual_run_lines l JOIN {schema}.payroll_bonus_accrual_runs r ON r.id=l.run_id WHERE l.company_id=%s AND l.employee_id=%s AND l.scheme_id=%s AND r.reporting_date<%s AND r.status IN ('calculated','approved','posted')",(int(company_id),int(row["employee_id"]),int(row["scheme_id"]),run["reporting_date"])) or {}
            opening=money(previous.get("amount")); movement=money(closing-opening); total+=closing
            self.db.execute_sql(f"""INSERT INTO {schema}.payroll_bonus_accrual_run_lines (company_id,run_id,scheme_id,employee_id,annual_base,target_percentage,probability_percentage,performance_percentage,opening_liability,closing_liability,movement_amount,expense_account_code,liability_account_code) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",(int(company_id),int(run_id),int(row["scheme_id"]),int(row["employee_id"]),annual_base,target,probability,performance,opening,closing,movement,row.get("expense_account_code"),row.get("liability_account_code")))
        return self.db.fetch_one(f"UPDATE {schema}.payroll_bonus_accrual_runs SET status='calculated',total_closing_liability=%s,total_movement=(SELECT COALESCE(SUM(movement_amount),0) FROM {schema}.payroll_bonus_accrual_run_lines WHERE run_id=%s),calculated_at=NOW() WHERE company_id=%s AND id=%s RETURNING *",(money(total),int(run_id),int(company_id),int(run_id)))

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

    def benefit_plans_list(self, company_id: int, plan_type=None) -> list[dict]:
        schema=self.schema(company_id); params=[int(company_id)]; extra=""
        if plan_type: extra=" AND plan_type=%s"; params.append(plan_type)
        return self.db.fetch_all(f"SELECT * FROM {schema}.payroll_benefit_plans WHERE company_id=%s{extra} ORDER BY is_active DESC,code",tuple(params))

    def benefit_plan_save(self, company_id: int, body: dict, plan_id=None, user_id=None) -> dict:
        schema=self.schema(company_id)
        for key in ("code","name","plan_type"):
            if not body.get(key): raise ValueError(f"{key} is required")
        values=(body["code"],body["name"],body["plan_type"],body.get("expense_account_code"),body.get("liability_account_code"),body.get("asset_account_code"),body.get("oci_account_code"),bool(body.get("is_active",True)))
        if plan_id:
            out=self.db.fetch_one(f"UPDATE {schema}.payroll_benefit_plans SET code=%s,name=%s,plan_type=%s,expense_account_code=%s,liability_account_code=%s,asset_account_code=%s,oci_account_code=%s,is_active=%s,updated_at=NOW() WHERE company_id=%s AND id=%s RETURNING *",values+(int(company_id),int(plan_id)))
        else:
            out=self.db.fetch_one(f"INSERT INTO {schema}.payroll_benefit_plans (company_id,code,name,plan_type,expense_account_code,liability_account_code,asset_account_code,oci_account_code,is_active) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",(int(company_id),)+values)
        if not out: raise ValueError("Benefit plan not found")
        return out

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

    def movement_report(self, company_id: int, date_from=None, date_to=None, benefit_class=None) -> dict:
        schema=self.schema(company_id); date_from=date_from or "1900-01-01"; date_to=date_to or date.today().isoformat(); items=[]
        if not benefit_class or benefit_class=="leave":
            rows=self.db.fetch_all(f"SELECT reporting_date AS movement_date,run_no AS reference,'leave' AS benefit_class,total_movement AS amount,status FROM {schema}.payroll_leave_accrual_runs WHERE company_id=%s AND reporting_date BETWEEN %s AND %s",(int(company_id),date_from,date_to)); items.extend(rows)
        if not benefit_class or benefit_class=="bonus":
            rows=self.db.fetch_all(f"SELECT reporting_date AS movement_date,run_no AS reference,'bonus' AS benefit_class,total_movement AS amount,status FROM {schema}.payroll_bonus_accrual_runs WHERE company_id=%s AND reporting_date BETWEEN %s AND %s",(int(company_id),date_from,date_to)); items.extend(rows)
        if not benefit_class or benefit_class=="defined_benefit":
            rows=self.db.fetch_all(f"SELECT valuation_date AS movement_date,'IAS19-VAL-'||id AS reference,'defined_benefit' AS benefit_class,(profit_or_loss_amount+oci_remeasurement_amount) AS amount,status FROM {schema}.payroll_actuarial_valuations WHERE company_id=%s AND valuation_date BETWEEN %s AND %s",(int(company_id),date_from,date_to)); items.extend(rows)
        items.sort(key=lambda x:(str(x.get("movement_date")),str(x.get("reference"))),reverse=True)
        return {"date_from":date_from,"date_to":date_to,"benefit_class":benefit_class,"items":items,"total":money(sum((dec(x.get("amount")) for x in items),D0))}

    # ---------------- Bonus accrual ----------------

    def bonus_schemes_list(self, company_id: int) -> list[dict]:
        schema = self.schema(company_id)
        return self.db.fetch_all(f"""
            SELECT * FROM {schema}.payroll_bonus_schemes
            WHERE company_id=%s
            ORDER BY is_active DESC, code;
        """, (int(company_id),))

    def bonus_scheme_save(self, company_id: int, body: dict, scheme_id=None, user_id=None) -> dict:
        schema = self.schema(company_id)
        required = ["code", "name", "scheme_type"]
        missing = [k for k in required if not body.get(k)]
        if missing:
            raise ValueError("Missing required fields: " + ", ".join(missing))

        if scheme_id:
            out = self.db.fetch_one(f"""
                UPDATE {schema}.payroll_bonus_schemes
                SET code=%s,name=%s,scheme_type=%s,measurement_basis=%s,
                    target_percentage=%s,probability_percentage=%s,
                    performance_percentage=%s,required_service_months=%s,
                    payment_due_date=%s,is_short_term=%s,
                    expense_account_code=%s,liability_account_code=%s,
                    is_active=%s,updated_at=NOW()
                WHERE company_id=%s AND id=%s RETURNING *;
            """, (
                body["code"], body["name"], body["scheme_type"],
                body.get("measurement_basis") or "basic_salary",
                body.get("target_percentage") or 0,
                body.get("probability_percentage") or 100,
                body.get("performance_percentage") or 100,
                body.get("required_service_months") or 12,
                body.get("payment_due_date"),
                bool(body.get("is_short_term", True)),
                body.get("expense_account_code"), body.get("liability_account_code"),
                bool(body.get("is_active", True)),
                int(company_id), int(scheme_id),
            ))
        else:
            out = self.db.fetch_one(f"""
                INSERT INTO {schema}.payroll_bonus_schemes (
                    company_id,code,name,scheme_type,measurement_basis,
                    target_percentage,probability_percentage,performance_percentage,
                    required_service_months,payment_due_date,is_short_term,
                    expense_account_code,liability_account_code,is_active
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *;
            """, (
                int(company_id), body["code"], body["name"], body["scheme_type"],
                body.get("measurement_basis") or "basic_salary",
                body.get("target_percentage") or 0,
                body.get("probability_percentage") or 100,
                body.get("performance_percentage") or 100,
                body.get("required_service_months") or 12,
                body.get("payment_due_date"),
                bool(body.get("is_short_term", True)),
                body.get("expense_account_code"), body.get("liability_account_code"),
                bool(body.get("is_active", True)),
            ))
        if not out:
            raise ValueError("Bonus scheme not found")
        self._audit(company_id, user_id, "save_bonus_scheme",
                    "payroll_bonus_scheme", out["id"], out, "Saved bonus scheme")
        return out

    # ---------------- Actuarial valuation import / posting ----------------

    def actuarial_valuations_list(self, company_id: int, plan_id=None) -> list[dict]:
        schema = self.schema(company_id)
        params = [int(company_id)]
        where = "WHERE v.company_id=%s"
        if plan_id:
            where += " AND v.plan_id=%s"
            params.append(int(plan_id))
        return self.db.fetch_all(f"""
            SELECT v.*, p.code AS plan_code, p.name AS plan_name
            FROM {schema}.payroll_actuarial_valuations v
            JOIN {schema}.payroll_benefit_plans p ON p.id=v.plan_id
            {where}
            ORDER BY v.valuation_date DESC, v.id DESC;
        """, tuple(params))

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

    def disclosure(self, company_id: int, reporting_date: str) -> dict:
        schema = self.schema(company_id)
        dash = self.dashboard(company_id, reporting_date)
        leave = self.db.fetch_one(f"""
            SELECT COALESCE(SUM(opening_provision),0) AS opening,
                   COALESCE(SUM(provision_movement),0) AS movement,
                   COALESCE(SUM(closing_provision),0) AS closing
            FROM {schema}.payroll_employee_leave_balances
            WHERE company_id=%s AND as_of_date=%s;
        """, (int(company_id), reporting_date)) or {}
        bonus = self.db.fetch_one(f"""
            SELECT COALESCE(SUM(total_closing_liability-total_movement),0) AS opening,
                   COALESCE(SUM(total_movement),0) AS movement,
                   COALESCE(SUM(total_closing_liability),0) AS closing
            FROM {schema}.payroll_bonus_accrual_runs
            WHERE company_id=%s AND reporting_date<=%s
              AND status IN ('calculated','approved','posted');
        """, (int(company_id), reporting_date)) or {}
        valuations = [v for v in self.actuarial_valuations_list(company_id)
                      if str(v.get("valuation_date")) <= reporting_date]
        latest = {}
        for valuation in valuations:
            latest.setdefault(str(valuation.get("plan_id")), valuation)
        return {
            "reporting_date": reporting_date,
            "dashboard": dash,
            "leave_reconciliation": {k: money(leave.get(k)) for k in ("opening","movement","closing")},
            "bonus_reconciliation": {k: money(bonus.get(k)) for k in ("opening","movement","closing")},
            "defined_benefit_valuations": list(latest.values()),
            "defined_benefit_totals": {
                "dbo": money(sum((dec(v.get("closing_dbo")) for v in latest.values()), D0)),
                "plan_assets": money(sum((dec(v.get("closing_plan_assets")) for v in latest.values()), D0)),
                "net_liability": money(sum((dec(v.get("net_defined_benefit_liability")) for v in latest.values()), D0)),
                "net_asset": money(sum((dec(v.get("net_defined_benefit_asset")) for v in latest.values()), D0)),
                "profit_or_loss": money(sum((dec(v.get("profit_or_loss_amount")) for v in latest.values()), D0)),
                "oci": money(sum((dec(v.get("oci_remeasurement_amount")) for v in latest.values()), D0)),
            },
            "significant_assumptions": self.db.fetch_all(f"""
                SELECT a.*,p.code AS plan_code,p.name AS plan_name,v.valuation_date
                FROM {schema}.payroll_actuarial_assumptions a
                JOIN {schema}.payroll_actuarial_valuations v ON v.id=a.valuation_id
                JOIN {schema}.payroll_benefit_plans p ON p.id=v.plan_id
                WHERE a.company_id=%s AND v.valuation_date<=%s
                ORDER BY v.valuation_date DESC,p.code,a.assumption_key;
            """, (int(company_id), reporting_date)),
            "note": "Defined-benefit measurements are based on imported or approved actuarial valuation data retained by the entity.",
        }

    def diagnostics(self, company_id: int) -> dict:
        schema = self.schema(company_id)
        checks = []

        policies = self.leave_policies_list(company_id)
        checks.append({
            "key": "leave_policy_accounts",
            "ok": all(p.get("expense_account_code") and p.get("liability_account_code")
                      for p in policies if p.get("provision_required")),
            "message": "All provision-bearing leave policies require expense and liability accounts.",
        })

        plans = self.db.fetch_all(f"""
            SELECT * FROM {schema}.payroll_benefit_plans WHERE company_id=%s;
        """, (int(company_id),))
        checks.append({
            "key": "defined_benefit_accounts",
            "ok": all(
                p.get("liability_account_code") and p.get("oci_account_code")
                for p in plans if p.get("plan_type") == "defined_benefit"
            ),
            "message": "Defined-benefit plans require liability and OCI accounts.",
        })

        unreconciled = self.db.fetch_one(f"""
            SELECT COUNT(*)::int AS count
            FROM {schema}.payroll_leave_accrual_runs
            WHERE company_id=%s AND status='calculated' AND total_movement<>0;
        """, (int(company_id),)) or {}
        checks.append({
            "key": "unposted_leave_runs",
            "ok": int(unreconciled.get("count") or 0) == 0,
            "message": f"{int(unreconciled.get('count') or 0)} calculated leave run(s) remain unposted.",
        })

        return {
            "ok": all(c["ok"] for c in checks),
            "checks": checks,
        }