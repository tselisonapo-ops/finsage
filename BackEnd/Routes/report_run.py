from flask import Blueprint, current_app, jsonify, request

# 🔐 Use the same import path you already use elsewhere in your app
# for require_auth and _deny_if_wrong_company.
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company

from BackEnd.Services.reporting.export_helpers import export_csv
from BackEnd.Services.reporting.gl_reports import build_general_ledger_report
from BackEnd.Services.reporting.cashbook_reports import build_cashbook_report
from BackEnd.Services.reporting.report_response import build_report_response
from BackEnd.Services.reporting.tb_reports import build_trial_balance_report
from BackEnd.Services.reporting.vat_reports import build_vat_report
from BackEnd.Services.period_core import resolve_company_period
from BackEnd.Services.reporting.lease_reports import (
    build_lease_monthly_due_report,
    build_lease_payments_report,
    build_lease_register_report,
    build_lease_schedule_report,
)
from BackEnd.Services.reporting.loan_reports import (
    build_loan_journals_report,
    build_loan_payments_report,
    build_loan_register_report,
    build_loan_schedule_report,
)
from BackEnd.Services.reporting.statement_exporters import (
    export_statement_pdf,
    export_statement_xlsx,
)
from BackEnd.Services.reporting.control_reports import (
    build_ap_aging_report,
    build_ap_control_reconciliation_report,
    build_ar_aging_report,
    build_ar_control_reconciliation_report,
    build_customer_statement_report,
    build_lessors_list_report,
    build_vendor_statement_report,
)

report_bp = Blueprint("report_bp", __name__)


def _get_db():
    db = current_app.config.get("db_service")
    if db is not None:
        return db

    db = current_app.extensions.get("db_service")
    if db is not None:
        return db

    raise RuntimeError(
        "db_service not found. Put your DatabaseService instance into "
        "current_app.config['db_service'] or current_app.extensions['db_service']."
    )


def _deny_report_access(company_id: int):
    payload = request.jwt_payload or {}
    return _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=_get_db(),
    )


def _resolve_range(company_id: int):
    db = _get_db()
    date_from, date_to, meta = resolve_company_period(
        db,
        company_id,
        request,
        mode="range",
    )
    return db, date_from, date_to, meta


def _resolve_as_of(company_id: int):
    db = _get_db()
    _date_from, as_of_date, meta = resolve_company_period(
        db,
        company_id,
        request,
        mode="as_of",
    )
    return db, as_of_date, meta


def _export_statement_payload(payload, base_filename: str):
    fmt = (request.args.get("format") or "xlsx").strip().lower()

    if fmt == "xlsx":
        return export_statement_xlsx(payload, filename=f"{base_filename}.xlsx")
    if fmt == "pdf":
        return export_statement_pdf(payload, filename=f"{base_filename}.pdf")

    return jsonify({"ok": False, "error": "Unsupported export format. Use xlsx or pdf."}), 400


# =========================================================
# Trial Balance
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/trial-balance", methods=["GET"])
@require_auth
def run_trial_balance(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)

        rows, columns, totals = build_trial_balance_report(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
        )

        payload = build_report_response(
            "trial_balance",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={"preset": request.args.get("preset")},
            extra_meta=meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_trial_balance failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/trial-balance/export", methods=["GET"])
@require_auth
def export_trial_balance(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)

        rows, columns, totals = build_trial_balance_report(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
        )

        payload = build_report_response(
            "trial_balance",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={"preset": request.args.get("preset")},
            extra_meta=meta,
        )
        return export_csv(payload, filename="trial_balance.csv")
    except Exception as e:
        current_app.logger.exception("export_trial_balance failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# =========================================================
# General Ledger
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/general-ledger", methods=["GET"])
@require_auth
def run_general_ledger(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        account_code = (request.args.get("account_code") or "").strip()
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_general_ledger_report(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
            account_code=account_code,
            q=q,
        )

        payload = build_report_response(
            "general_ledger",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "preset": request.args.get("preset"),
                "account_code": account_code,
                "q": q,
            },
            extra_meta=meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_general_ledger failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/general-ledger/export", methods=["GET"])
@require_auth
def export_general_ledger(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        account_code = (request.args.get("account_code") or "").strip()
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_general_ledger_report(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
            account_code=account_code,
            q=q,
        )

        payload = build_report_response(
            "general_ledger",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "preset": request.args.get("preset"),
                "account_code": account_code,
                "q": q,
            },
            extra_meta=meta,
        )
        return export_csv(payload, filename="general_ledger.csv")
    except Exception as e:
        current_app.logger.exception("export_general_ledger failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# =========================================================
# VAT
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/vat", methods=["GET"])
@require_auth
def run_vat_report(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)

        rows, columns, totals, extra_meta = build_vat_report(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "vat_report",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={"preset": request.args.get("preset")},
            extra_meta=merged_meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_vat_report failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/vat/export", methods=["GET"])
@require_auth
def export_vat_report(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)

        rows, columns, totals, extra_meta = build_vat_report(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "vat_report",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={"preset": request.args.get("preset")},
            extra_meta=merged_meta,
        )
        return export_csv(payload, filename="vat_report.csv")
    except Exception as e:
        current_app.logger.exception("export_vat_report failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# =========================================================
# Cashbook
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/cashbook", methods=["GET"])
@require_auth
def run_cashbook(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_cashbook_report(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
            q=q,
        )

        payload = build_report_response(
            "cashbook",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "preset": request.args.get("preset"),
                "q": q,
            },
            extra_meta=meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_cashbook failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/cashbook/export", methods=["GET"])
@require_auth
def export_cashbook(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_cashbook_report(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
            q=q,
        )

        payload = build_report_response(
            "cashbook",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "preset": request.args.get("preset"),
                "q": q,
            },
            extra_meta=meta,
        )
        return export_csv(payload, filename="cashbook.csv")
    except Exception as e:
        current_app.logger.exception("export_cashbook failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# =========================================================
# Lease Reports
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/lease-register", methods=["GET"])
@require_auth
def run_lease_register(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_lease_register_report(
            db,
            company_id,
            q=q,
        )

        payload = build_report_response(
            "lease_register",
            company_id,
            None,
            None,
            rows,
            columns,
            totals=totals,
            filters={"q": q},
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_lease_register failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-register/export", methods=["GET"])
@require_auth
def export_lease_register(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_lease_register_report(
            db,
            company_id,
            q=q,
        )

        payload = build_report_response(
            "lease_register",
            company_id,
            None,
            None,
            rows,
            columns,
            totals=totals,
            filters={"q": q},
        )
        return export_csv(payload, filename="lease_register.csv")
    except Exception as e:
        current_app.logger.exception("export_lease_register failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-schedule", methods=["GET"])
@require_auth
def run_lease_schedule(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        lease_id = int(request.args.get("lease_id") or 0)
        include_inactive = str(request.args.get("include_inactive") or "").strip().lower() in {"1", "true", "yes", "y"}

        rows, columns, totals, extra_meta = build_lease_schedule_report(
            db,
            company_id,
            lease_id=lease_id,
            date_from=date_from,
            date_to=date_to,
            include_inactive=include_inactive,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "lease_schedule",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "lease_id": lease_id,
                "include_inactive": include_inactive,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_lease_schedule failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-schedule/export", methods=["GET"])
@require_auth
def export_lease_schedule(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        lease_id = int(request.args.get("lease_id") or 0)
        include_inactive = str(request.args.get("include_inactive") or "").strip().lower() in {"1", "true", "yes", "y"}

        rows, columns, totals, extra_meta = build_lease_schedule_report(
            db,
            company_id,
            lease_id=lease_id,
            date_from=date_from,
            date_to=date_to,
            include_inactive=include_inactive,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "lease_schedule",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "lease_id": lease_id,
                "include_inactive": include_inactive,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return export_csv(payload, filename=f"lease_schedule_{lease_id}.csv")
    except Exception as e:
        current_app.logger.exception("export_lease_schedule failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-payments", methods=["GET"])
@require_auth
def run_lease_payments(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        lease_id_raw = (request.args.get("lease_id") or "").strip()
        lease_id = int(lease_id_raw) if lease_id_raw else None
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_lease_payments_report(
            db,
            company_id,
            lease_id=lease_id,
            date_from=date_from,
            date_to=date_to,
            q=q,
        )

        payload = build_report_response(
            "lease_payments",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "lease_id": lease_id,
                "q": q,
                "preset": request.args.get("preset"),
            },
            extra_meta=meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_lease_payments failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-payments/export", methods=["GET"])
@require_auth
def export_lease_payments(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        lease_id_raw = (request.args.get("lease_id") or "").strip()
        lease_id = int(lease_id_raw) if lease_id_raw else None
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_lease_payments_report(
            db,
            company_id,
            lease_id=lease_id,
            date_from=date_from,
            date_to=date_to,
            q=q,
        )

        payload = build_report_response(
            "lease_payments",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "lease_id": lease_id,
                "q": q,
                "preset": request.args.get("preset"),
            },
            extra_meta=meta,
        )
        return export_csv(payload, filename="lease_payments.csv")
    except Exception as e:
        current_app.logger.exception("export_lease_payments failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-monthly-due", methods=["GET"])
@require_auth
def run_lease_monthly_due(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_lease_monthly_due_report(
            db,
            company_id,
            as_of_date=as_of_date,
            q=q,
        )

        payload = build_report_response(
            "lease_monthly_due",
            company_id,
            None,
            as_of_date,
            rows,
            columns,
            totals=totals,
            filters={
                "q": q,
                "preset": request.args.get("preset"),
            },
            extra_meta=meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_lease_monthly_due failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-monthly-due/export", methods=["GET"])
@require_auth
def export_lease_monthly_due(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_lease_monthly_due_report(
            db,
            company_id,
            as_of_date=as_of_date,
            q=q,
        )

        payload = build_report_response(
            "lease_monthly_due",
            company_id,
            None,
            as_of_date,
            rows,
            columns,
            totals=totals,
            filters={
                "q": q,
                "preset": request.args.get("preset"),
            },
            extra_meta=meta,
        )
        return export_csv(payload, filename="lease_monthly_due.csv")
    except Exception as e:
        current_app.logger.exception("export_lease_monthly_due failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# =========================================================
# Loan Reports
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/loan-register", methods=["GET"])
@require_auth
def run_loan_register(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()

        rows, columns, totals = build_loan_register_report(
            db,
            company_id,
            q=q,
            status=status or None,
        )

        payload = build_report_response(
            "loan_register",
            company_id,
            None,
            None,
            rows,
            columns,
            totals=totals,
            filters={"q": q, "status": status},
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_loan_register failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-register/export", methods=["GET"])
@require_auth
def export_loan_register(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()

        rows, columns, totals = build_loan_register_report(
            db,
            company_id,
            q=q,
            status=status or None,
        )

        payload = build_report_response(
            "loan_register",
            company_id,
            None,
            None,
            rows,
            columns,
            totals=totals,
            filters={"q": q, "status": status},
        )
        return export_csv(payload, filename="loan_register.csv")
    except Exception as e:
        current_app.logger.exception("export_loan_register failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-schedule", methods=["GET"])
@require_auth
def run_loan_schedule(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        loan_id = int(request.args.get("loan_id") or 0)
        schedule_version_raw = (request.args.get("schedule_version") or "").strip()
        schedule_version = int(schedule_version_raw) if schedule_version_raw else None

        rows, columns, totals, extra_meta = build_loan_schedule_report(
            db,
            company_id,
            loan_id=loan_id,
            date_from=date_from,
            date_to=date_to,
            schedule_version=schedule_version,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "loan_schedule",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "loan_id": loan_id,
                "schedule_version": schedule_version,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_loan_schedule failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-schedule/export", methods=["GET"])
@require_auth
def export_loan_schedule(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        loan_id = int(request.args.get("loan_id") or 0)
        schedule_version_raw = (request.args.get("schedule_version") or "").strip()
        schedule_version = int(schedule_version_raw) if schedule_version_raw else None

        rows, columns, totals, extra_meta = build_loan_schedule_report(
            db,
            company_id,
            loan_id=loan_id,
            date_from=date_from,
            date_to=date_to,
            schedule_version=schedule_version,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "loan_schedule",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "loan_id": loan_id,
                "schedule_version": schedule_version,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return export_csv(payload, filename=f"loan_schedule_{loan_id}.csv")
    except Exception as e:
        current_app.logger.exception("export_loan_schedule failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-payments", methods=["GET"])
@require_auth
def run_loan_payments(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        loan_id_raw = (request.args.get("loan_id") or "").strip()
        loan_id = int(loan_id_raw) if loan_id_raw else None
        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()

        rows, columns, totals = build_loan_payments_report(
            db,
            company_id,
            loan_id=loan_id,
            date_from=date_from,
            date_to=date_to,
            q=q,
            status=status or None,
        )

        payload = build_report_response(
            "loan_payments",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "loan_id": loan_id,
                "q": q,
                "status": status,
                "preset": request.args.get("preset"),
            },
            extra_meta=meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_loan_payments failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-payments/export", methods=["GET"])
@require_auth
def export_loan_payments(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        loan_id_raw = (request.args.get("loan_id") or "").strip()
        loan_id = int(loan_id_raw) if loan_id_raw else None
        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()

        rows, columns, totals = build_loan_payments_report(
            db,
            company_id,
            loan_id=loan_id,
            date_from=date_from,
            date_to=date_to,
            q=q,
            status=status or None,
        )

        payload = build_report_response(
            "loan_payments",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "loan_id": loan_id,
                "q": q,
                "status": status,
                "preset": request.args.get("preset"),
            },
            extra_meta=meta,
        )
        return export_csv(payload, filename="loan_payments.csv")
    except Exception as e:
        current_app.logger.exception("export_loan_payments failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-journals", methods=["GET"])
@require_auth
def run_loan_journals(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        loan_id = int(request.args.get("loan_id") or 0)

        rows, columns, totals = build_loan_journals_report(
            db,
            company_id,
            loan_id=loan_id,
        )

        payload = build_report_response(
            "loan_journals",
            company_id,
            None,
            None,
            rows,
            columns,
            totals=totals,
            filters={"loan_id": loan_id},
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_loan_journals failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-journals/export", methods=["GET"])
@require_auth
def export_loan_journals(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        loan_id = int(request.args.get("loan_id") or 0)

        rows, columns, totals = build_loan_journals_report(
            db,
            company_id,
            loan_id=loan_id,
        )

        payload = build_report_response(
            "loan_journals",
            company_id,
            None,
            None,
            rows,
            columns,
            totals=totals,
            filters={"loan_id": loan_id},
        )
        return export_csv(payload, filename=f"loan_journals_{loan_id}.csv")
    except Exception as e:
        current_app.logger.exception("export_loan_journals failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# =========================================================
# Statement Exports
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/statements/balance-sheet/export", methods=["GET"])
@require_auth
def export_balance_sheet(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        _from, as_of, _meta = resolve_company_period(db, company_id, request, mode="as_of")

        payload = db.get_balance_sheet_report(
            company_id=company_id,
            as_of=as_of,
            request_args=request.args,
        )

        return _export_statement_payload(payload, "balance_sheet")
    except Exception as e:
        current_app.logger.exception("export_balance_sheet failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/statements/income-statement/export", methods=["GET"])
@require_auth
def export_income_statement(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        date_from, date_to, _meta = resolve_company_period(db, company_id, request, mode="range")

        payload = db.get_income_statement_report(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            request_args=request.args,
        )

        return _export_statement_payload(payload, "income_statement")
    except Exception as e:
        current_app.logger.exception("export_income_statement failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/statements/cash-flow/export", methods=["GET"])
@require_auth
def export_cash_flow(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        date_from, date_to, _meta = resolve_company_period(db, company_id, request, mode="range")

        payload = db.get_cash_flow_report(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            request_args=request.args,
        )

        return _export_statement_payload(payload, "cash_flow")
    except Exception as e:
        current_app.logger.exception("export_cash_flow failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/statements/socie/export", methods=["GET"])
@require_auth
def export_socie(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        date_from, date_to, _meta = resolve_company_period(db, company_id, request, mode="range")

        payload = db.get_socie_report(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            request_args=request.args,
        )

        return _export_statement_payload(payload, "socie")
    except Exception as e:
        current_app.logger.exception("export_socie failed")
        return jsonify({"ok": False, "error": str(e)}), 400
    
# =========================================================
# AR / AP Controls
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/ar-control-reconciliation", methods=["GET"])
@require_auth
def run_ar_control_reconciliation(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)

        rows, columns, totals, extra_meta = build_ar_control_reconciliation_report(
            db,
            company_id,
            as_at=as_of_date,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "ar_control_reconciliation",
            company_id,
            None,
            as_of_date,
            rows,
            columns,
            totals=totals,
            filters={"preset": request.args.get("preset")},
            extra_meta=merged_meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_ar_control_reconciliation failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/ar-control-reconciliation/export", methods=["GET"])
@require_auth
def export_ar_control_reconciliation(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)

        rows, columns, totals, extra_meta = build_ar_control_reconciliation_report(
            db,
            company_id,
            as_at=as_of_date,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "ar_control_reconciliation",
            company_id,
            None,
            as_of_date,
            rows,
            columns,
            totals=totals,
            filters={"preset": request.args.get("preset")},
            extra_meta=merged_meta,
        )
        return export_csv(payload, filename="ar_control_reconciliation.csv")
    except Exception as e:
        current_app.logger.exception("export_ar_control_reconciliation failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/ap-control-reconciliation", methods=["GET"])
@require_auth
def run_ap_control_reconciliation(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)

        rows, columns, totals, extra_meta = build_ap_control_reconciliation_report(
            db,
            company_id,
            as_at=as_of_date,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "ap_control_reconciliation",
            company_id,
            None,
            as_of_date,
            rows,
            columns,
            totals=totals,
            filters={"preset": request.args.get("preset")},
            extra_meta=merged_meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_ap_control_reconciliation failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/ap-control-reconciliation/export", methods=["GET"])
@require_auth
def export_ap_control_reconciliation(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)

        rows, columns, totals, extra_meta = build_ap_control_reconciliation_report(
            db,
            company_id,
            as_at=as_of_date,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "ap_control_reconciliation",
            company_id,
            None,
            as_of_date,
            rows,
            columns,
            totals=totals,
            filters={"preset": request.args.get("preset")},
            extra_meta=merged_meta,
        )
        return export_csv(payload, filename="ap_control_reconciliation.csv")
    except Exception as e:
        current_app.logger.exception("export_ap_control_reconciliation failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# =========================================================
# Customer / Vendor Statements
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/customer-statement", methods=["GET"])
@require_auth
def run_customer_statement(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        customer_id = int(request.args.get("customer_id") or 0)

        rows, columns, totals, extra_meta = build_customer_statement_report(
            db,
            company_id,
            customer_id=customer_id,
            date_from=date_from,
            date_to=date_to,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "customer_statement",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "customer_id": customer_id,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_customer_statement failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/customer-statement/export", methods=["GET"])
@require_auth
def export_customer_statement(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        customer_id = int(request.args.get("customer_id") or 0)

        rows, columns, totals, extra_meta = build_customer_statement_report(
            db,
            company_id,
            customer_id=customer_id,
            date_from=date_from,
            date_to=date_to,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "customer_statement",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "customer_id": customer_id,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return export_csv(payload, filename=f"customer_statement_{customer_id}.csv")
    except Exception as e:
        current_app.logger.exception("export_customer_statement failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/vendor-statement", methods=["GET"])
@require_auth
def run_vendor_statement(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        vendor_id = int(request.args.get("vendor_id") or 0)

        rows, columns, totals, extra_meta = build_vendor_statement_report(
            db,
            company_id,
            vendor_id=vendor_id,
            date_from=date_from,
            date_to=date_to,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "vendor_statement",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "vendor_id": vendor_id,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_vendor_statement failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/vendor-statement/export", methods=["GET"])
@require_auth
def export_vendor_statement(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        vendor_id = int(request.args.get("vendor_id") or 0)

        rows, columns, totals, extra_meta = build_vendor_statement_report(
            db,
            company_id,
            vendor_id=vendor_id,
            date_from=date_from,
            date_to=date_to,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "vendor_statement",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={
                "vendor_id": vendor_id,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return export_csv(payload, filename=f"vendor_statement_{vendor_id}.csv")
    except Exception as e:
        current_app.logger.exception("export_vendor_statement failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# =========================================================
# AR / AP Aging
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/ar-aging", methods=["GET"])
@require_auth
def run_ar_aging(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        customer_id_raw = (request.args.get("customer_id") or "").strip()
        customer_id = int(customer_id_raw) if customer_id_raw else None

        rows, columns, totals, extra_meta = build_ar_aging_report(
            db,
            company_id,
            as_at=as_of_date,
            customer_id=customer_id,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "ar_aging",
            company_id,
            None,
            as_of_date,
            rows,
            columns,
            totals=totals,
            filters={
                "customer_id": customer_id,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_ar_aging failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/ar-aging/export", methods=["GET"])
@require_auth
def export_ar_aging(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        customer_id_raw = (request.args.get("customer_id") or "").strip()
        customer_id = int(customer_id_raw) if customer_id_raw else None

        rows, columns, totals, extra_meta = build_ar_aging_report(
            db,
            company_id,
            as_at=as_of_date,
            customer_id=customer_id,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "ar_aging",
            company_id,
            None,
            as_of_date,
            rows,
            columns,
            totals=totals,
            filters={
                "customer_id": customer_id,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return export_csv(payload, filename="ar_aging.csv")
    except Exception as e:
        current_app.logger.exception("export_ar_aging failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/ap-aging", methods=["GET"])
@require_auth
def run_ap_aging(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        vendor_id_raw = (request.args.get("vendor_id") or "").strip()
        vendor_id = int(vendor_id_raw) if vendor_id_raw else None

        rows, columns, totals, extra_meta = build_ap_aging_report(
            db,
            company_id,
            as_at=as_of_date,
            vendor_id=vendor_id,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "ap_aging",
            company_id,
            None,
            as_of_date,
            rows,
            columns,
            totals=totals,
            filters={
                "vendor_id": vendor_id,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_ap_aging failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/ap-aging/export", methods=["GET"])
@require_auth
def export_ap_aging(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        vendor_id_raw = (request.args.get("vendor_id") or "").strip()
        vendor_id = int(vendor_id_raw) if vendor_id_raw else None

        rows, columns, totals, extra_meta = build_ap_aging_report(
            db,
            company_id,
            as_at=as_of_date,
            vendor_id=vendor_id,
        )

        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})

        payload = build_report_response(
            "ap_aging",
            company_id,
            None,
            as_of_date,
            rows,
            columns,
            totals=totals,
            filters={
                "vendor_id": vendor_id,
                "preset": request.args.get("preset"),
            },
            extra_meta=merged_meta,
        )
        return export_csv(payload, filename="ap_aging.csv")
    except Exception as e:
        current_app.logger.exception("export_ap_aging failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# =========================================================
# Lessors List
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/lessors-list", methods=["GET"])
@require_auth
def run_lessors_list(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_lessors_list_report(
            db,
            company_id,
            q=q,
        )

        payload = build_report_response(
            "lessors_list",
            company_id,
            None,
            None,
            rows,
            columns,
            totals=totals,
            filters={"q": q},
        )
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_lessors_list failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lessors-list/export", methods=["GET"])
@require_auth
def export_lessors_list(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_lessors_list_report(
            db,
            company_id,
            q=q,
        )

        payload = build_report_response(
            "lessors_list",
            company_id,
            None,
            None,
            rows,
            columns,
            totals=totals,
            filters={"q": q},
        )
        return export_csv(payload, filename="lessors_list.csv")
    except Exception as e:
        current_app.logger.exception("export_lessors_list failed")
        return jsonify({"ok": False, "error": str(e)}), 400