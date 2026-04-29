from flask import Blueprint, current_app, jsonify, request

from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.reporting.balance_sheet_templates import get_balance_sheet_v3_exact
from BackEnd.Services.reporting.export_helpers import export_csv
from BackEnd.Services.reporting.gl_reports import build_general_ledger_report
from BackEnd.Services.reporting.cashbook_reports import build_cashbook_report
from BackEnd.Services.reporting.report_response import build_report_response
from BackEnd.Services.reporting.tb_reports import build_trial_balance_report
from BackEnd.Services.reporting.vat_reports import build_vat_report
from BackEnd.Services.period_core import resolve_company_period
from BackEnd.Services.utils.view_token import create_report_export_token, verify_report_export_token
from BackEnd.Services.reporting.journal_reports import build_journal_register, export_xlsx
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

from BackEnd.Services.reporting.revenue_reports import (
    build_revenue_contracts_report,
    build_revenue_events_report,
    build_revenue_obligations_report,
    build_revenue_progress_report,
    build_revenue_run_entries_report,
    build_revenue_runs_report,
)

report_bp = Blueprint("report_bp", __name__)


# =========================================================
# Helpers
# =========================================================

def _get_db():
    db = (
        current_app.config.get("db_service")
        or current_app.config.get("DB_SERVICE")
        or current_app.extensions.get("db_service")
        or current_app.extensions.get("DB_SERVICE")
    )

    if db is not None:
        return db

    raise RuntimeError(
        "db_service not found. Set app.config['DB_SERVICE'] or app.config['db_service']."
    )

def _revenue_report_payload(report_key, company_id, rows, columns, totals, date_from=None, date_to=None, filters=None, meta=None):
    return build_report_response(
        report_key,
        company_id,
        date_from,
        date_to,
        rows,
        columns,
        totals=totals,
        filters=filters or {},
        extra_meta=meta or {},
    )

def _deny_report_access(company_id: int):
    payload = request.jwt_payload or {}
    return _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=_get_db(),
    )

def _export_statement_payload(payload, statement_key):
    fmt = (request.args.get("format") or "xlsx").lower().strip()

    if fmt == "pdf":
        if not callable(export_statement_pdf):
            raise RuntimeError(
                f"export_statement_pdf is not callable. Got: {type(export_statement_pdf)}"
            )
        return export_statement_pdf(payload, filename=f"{statement_key}.pdf")

    if not callable(export_statement_xlsx):
        raise RuntimeError(
            f"export_statement_xlsx is not callable. Got: {type(export_statement_xlsx)}"
        )

    return export_statement_xlsx(payload, filename=f"{statement_key}.xlsx")

def _deny_report_export_access(company_id: int, expected_report_key: str):
    """
    Export routes are opened directly by the browser, so Authorization headers
    are not reliable. Export access is granted only by a short-lived token.

    Do NOT decorate export routes with @require_auth.
    Use /api/companies/<id>/reports/export-token first, then open export URL with ?t=<token>.
    """
    token = (request.args.get("t") or "").strip()

    if not token:
        return jsonify({"ok": False, "error": "Missing export token"}), 401

    verified = verify_report_export_token(token)
    if not verified:
        return jsonify({"ok": False, "error": "Invalid or expired export token"}), 401

    if int(verified.get("company_id") or 0) != int(company_id):
        return jsonify({"ok": False, "error": "Token company mismatch"}), 403

    if str(verified.get("report_key") or "") != str(expected_report_key):
        return jsonify({"ok": False, "error": "Token report mismatch"}), 403

    return None


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
    date_from, as_of_date, meta = resolve_company_period(
        db,
        company_id,
        request,
        mode="as_of",
    )
    return db, date_from, as_of_date, meta

def _statement_common_args():
    return {
        "template": request.args.get("template", "ifrs"),
        "basis": request.args.get("basis", "external"),
        "compare": request.args.get("compare", "none"),
    }

def _export_statement_payload(payload, base_filename: str):
    fmt = (request.args.get("format") or "xlsx").strip().lower()

    if fmt == "xlsx":
        return export_statement_xlsx(payload, filename=f"{base_filename}.xlsx")
    if fmt == "pdf":
        return export_statement_pdf(payload, filename=f"{base_filename}.pdf")

    return jsonify({"ok": False, "error": "Unsupported export format. Use xlsx or pdf."}), 400


# =========================================================
# Export Token Access Point
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/export-token", methods=["POST"])
@require_auth
def create_reports_export_token(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    payload = request.get_json(silent=True) or {}
    report_key = str(payload.get("report_key") or "").strip()

    if not report_key:
        return jsonify({"ok": False, "error": "report_key is required"}), 400

    jwt_payload = request.jwt_payload or {}
    user_id = jwt_payload.get("user_id") or jwt_payload.get("sub") or jwt_payload.get("id")

    if not user_id:
        return jsonify({"ok": False, "error": "Missing user context"}), 401

    token = create_report_export_token(
        company_id=int(company_id),
        report_key=report_key,
        user_id=int(user_id),
        ttl_seconds=120,
    )

    return jsonify({"ok": True, "token": token}), 200


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
        rows, columns, totals = build_trial_balance_report(db, company_id, date_from=date_from, date_to=date_to)
        payload = build_report_response("trial_balance", company_id, date_from, date_to, rows, columns, totals=totals, filters={"preset": request.args.get("preset")}, extra_meta=meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_trial_balance failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/trial-balance/export", methods=["GET"])
def export_trial_balance(company_id):
    deny = _deny_report_export_access(company_id, "trial_balance")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        rows, columns, totals = build_trial_balance_report(db, company_id, date_from=date_from, date_to=date_to)
        payload = build_report_response("trial_balance", company_id, date_from, date_to, rows, columns, totals=totals, filters={"preset": request.args.get("preset")}, extra_meta=meta)
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
        if account_code.lower() in {"all", "all accounts", "*"}:
            account_code = ""

        q = (request.args.get("q") or "").strip()

        rows, columns, totals = build_general_ledger_report(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
            account_code=account_code or None,
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
def export_general_ledger(company_id):
    current_app.logger.warning(
        "GL EXPORT START company_id=%s args=%s",
        company_id,
        dict(request.args),
    )

    deny = _deny_report_export_access(company_id, "general_ledger")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)

        current_app.logger.warning(
            "GL EXPORT RANGE company_id=%s date_from=%s date_to=%s meta=%s",
            company_id,
            date_from,
            date_to,
            meta,
        )

        account_code = (
            request.args.get("account_code")
            or request.args.get("account")
            or request.args.get("gl_account")
            or ""
        ).strip()

        if account_code.lower() in {"all", "all accounts", "*"}:
            account_code = ""

        q = (
            request.args.get("q")
            or request.args.get("search")
            or ""
        ).strip()

        rows, columns, totals = build_general_ledger_report(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
            account_code=account_code or None,
            q=q,
        )

        rows = rows or []
        columns = columns or []
        totals = totals or {}

        current_app.logger.warning(
            "GL EXPORT BUILT company_id=%s rows=%s columns=%s totals_keys=%s",
            company_id,
            len(rows),
            len(columns),
            list(totals.keys()) if isinstance(totals, dict) else type(totals).__name__,
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

        try:
            return export_xlsx(payload, filename="general_ledger.xlsx")
        except Exception:
            current_app.logger.exception("GL EXPORT CSV BUILD FAILED")
            return jsonify({
                "ok": False,
                "error": "General ledger data loaded, but CSV export failed.",
            }), 400

    except Exception as e:
        current_app.logger.exception("export_general_ledger failed")
        return jsonify({
            "ok": False,
            "error": str(e),
            "args": dict(request.args),
        }), 400
# =========================================================
# Journal Register
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/reports/journal-register", methods=["GET"])
@require_auth
def run_journal_register(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        q = (request.args.get("q") or "").strip()

        rows, columns = build_journal_register(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
            q=q or None,
        )

        totals = {
            "debit_total": sum(float(r.get("debit_total") or 0) for r in rows),
            "credit_total": sum(float(r.get("credit_total") or 0) for r in rows),
            "row_count": len(rows),
        }

        payload = build_report_response(
            "journal_register",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={"preset": request.args.get("preset"), "q": q},
            extra_meta=meta,
        )

        return jsonify(payload)

    except Exception as e:
        current_app.logger.exception("run_journal_register failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/journal-register/export", methods=["GET"])
def export_journal_register(company_id):
    deny = _deny_report_export_access(company_id, "journal_register")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        q = (request.args.get("q") or "").strip()

        rows, columns = build_journal_register(
            db,
            company_id,
            date_from=date_from,
            date_to=date_to,
            q=q or None,
        )

        totals = {
            "debit_total": sum(float(r.get("debit_total") or 0) for r in rows),
            "credit_total": sum(float(r.get("credit_total") or 0) for r in rows),
            "row_count": len(rows),
        }

        payload = build_report_response(
            "journal_register",
            company_id,
            date_from,
            date_to,
            rows,
            columns,
            totals=totals,
            filters={"preset": request.args.get("preset"), "q": q},
            extra_meta=meta,
        )

        return export_xlsx(payload, filename="journal_register.xlsx")

    except Exception as e:
        current_app.logger.exception("export_journal_register failed")
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
        rows, columns, totals, extra_meta = build_vat_report(db, company_id, date_from=date_from, date_to=date_to)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("vat_report", company_id, date_from, date_to, rows, columns, totals=totals, filters={"preset": request.args.get("preset")}, extra_meta=merged_meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_vat_report failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/vat/export", methods=["GET"])
def export_vat_report(company_id):
    deny = _deny_report_export_access(company_id, "vat_report")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        rows, columns, totals, extra_meta = build_vat_report(db, company_id, date_from=date_from, date_to=date_to)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("vat_report", company_id, date_from, date_to, rows, columns, totals=totals, filters={"preset": request.args.get("preset")}, extra_meta=merged_meta)
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
        rows, columns, totals = build_cashbook_report(db, company_id, date_from=date_from, date_to=date_to, q=q)
        payload = build_report_response("cashbook", company_id, date_from, date_to, rows, columns, totals=totals, filters={"preset": request.args.get("preset"), "q": q}, extra_meta=meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_cashbook failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/cashbook/export", methods=["GET"])
def export_cashbook(company_id):
    deny = _deny_report_export_access(company_id, "cashbook")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        q = (request.args.get("q") or "").strip()
        rows, columns, totals = build_cashbook_report(db, company_id, date_from=date_from, date_to=date_to, q=q)
        payload = build_report_response("cashbook", company_id, date_from, date_to, rows, columns, totals=totals, filters={"preset": request.args.get("preset"), "q": q}, extra_meta=meta)
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
        rows, columns, totals = build_lease_register_report(db, company_id, q=q)
        payload = build_report_response("lease_register", company_id, None, None, rows, columns, totals=totals, filters={"q": q})
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_lease_register failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-register/export", methods=["GET"])
def export_lease_register(company_id):
    deny = _deny_report_export_access(company_id, "lease_register")
    if deny:
        return deny

    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()
        rows, columns, totals = build_lease_register_report(db, company_id, q=q)
        payload = build_report_response("lease_register", company_id, None, None, rows, columns, totals=totals, filters={"q": q})
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
        rows, columns, totals, extra_meta = build_lease_schedule_report(db, company_id, lease_id=lease_id, date_from=date_from, date_to=date_to, include_inactive=include_inactive)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("lease_schedule", company_id, date_from, date_to, rows, columns, totals=totals, filters={"lease_id": lease_id, "include_inactive": include_inactive, "preset": request.args.get("preset")}, extra_meta=merged_meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_lease_schedule failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-schedule/export", methods=["GET"])
def export_lease_schedule(company_id):
    deny = _deny_report_export_access(company_id, "lease_schedule")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        lease_id = int(request.args.get("lease_id") or 0)
        include_inactive = str(request.args.get("include_inactive") or "").strip().lower() in {"1", "true", "yes", "y"}
        rows, columns, totals, extra_meta = build_lease_schedule_report(db, company_id, lease_id=lease_id, date_from=date_from, date_to=date_to, include_inactive=include_inactive)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("lease_schedule", company_id, date_from, date_to, rows, columns, totals=totals, filters={"lease_id": lease_id, "include_inactive": include_inactive, "preset": request.args.get("preset")}, extra_meta=merged_meta)
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
        rows, columns, totals = build_lease_payments_report(db, company_id, lease_id=lease_id, date_from=date_from, date_to=date_to, q=q)
        payload = build_report_response("lease_payments", company_id, date_from, date_to, rows, columns, totals=totals, filters={"lease_id": lease_id, "q": q, "preset": request.args.get("preset")}, extra_meta=meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_lease_payments failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-payments/export", methods=["GET"])
def export_lease_payments(company_id):
    deny = _deny_report_export_access(company_id, "lease_payments")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        lease_id_raw = (request.args.get("lease_id") or "").strip()
        lease_id = int(lease_id_raw) if lease_id_raw else None
        q = (request.args.get("q") or "").strip()
        rows, columns, totals = build_lease_payments_report(db, company_id, lease_id=lease_id, date_from=date_from, date_to=date_to, q=q)
        payload = build_report_response("lease_payments", company_id, date_from, date_to, rows, columns, totals=totals, filters={"lease_id": lease_id, "q": q, "preset": request.args.get("preset")}, extra_meta=meta)
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
        rows, columns, totals = build_lease_monthly_due_report(db, company_id, as_of_date=as_of_date, q=q)
        payload = build_report_response("lease_monthly_due", company_id, None, as_of_date, rows, columns, totals=totals, filters={"q": q, "preset": request.args.get("preset")}, extra_meta=meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_lease_monthly_due failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lease-monthly-due/export", methods=["GET"])
def export_lease_monthly_due(company_id):
    deny = _deny_report_export_access(company_id, "lease_monthly_due")
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        q = (request.args.get("q") or "").strip()
        rows, columns, totals = build_lease_monthly_due_report(db, company_id, as_of_date=as_of_date, q=q)
        payload = build_report_response("lease_monthly_due", company_id, None, as_of_date, rows, columns, totals=totals, filters={"q": q, "preset": request.args.get("preset")}, extra_meta=meta)
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
        rows, columns, totals = build_loan_register_report(db, company_id, q=q, status=status or None)
        payload = build_report_response("loan_register", company_id, None, None, rows, columns, totals=totals, filters={"q": q, "status": status})
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_loan_register failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-register/export", methods=["GET"])
def export_loan_register(company_id):
    deny = _deny_report_export_access(company_id, "loan_register")
    if deny:
        return deny

    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()
        rows, columns, totals = build_loan_register_report(db, company_id, q=q, status=status or None)
        payload = build_report_response("loan_register", company_id, None, None, rows, columns, totals=totals, filters={"q": q, "status": status})
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
        rows, columns, totals, extra_meta = build_loan_schedule_report(db, company_id, loan_id=loan_id, date_from=date_from, date_to=date_to, schedule_version=schedule_version)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("loan_schedule", company_id, date_from, date_to, rows, columns, totals=totals, filters={"loan_id": loan_id, "schedule_version": schedule_version, "preset": request.args.get("preset")}, extra_meta=merged_meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_loan_schedule failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-schedule/export", methods=["GET"])
def export_loan_schedule(company_id):
    deny = _deny_report_export_access(company_id, "loan_schedule")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        loan_id = int(request.args.get("loan_id") or 0)
        schedule_version_raw = (request.args.get("schedule_version") or "").strip()
        schedule_version = int(schedule_version_raw) if schedule_version_raw else None
        rows, columns, totals, extra_meta = build_loan_schedule_report(db, company_id, loan_id=loan_id, date_from=date_from, date_to=date_to, schedule_version=schedule_version)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("loan_schedule", company_id, date_from, date_to, rows, columns, totals=totals, filters={"loan_id": loan_id, "schedule_version": schedule_version, "preset": request.args.get("preset")}, extra_meta=merged_meta)
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
        rows, columns, totals = build_loan_payments_report(db, company_id, loan_id=loan_id, date_from=date_from, date_to=date_to, q=q, status=status or None)
        payload = build_report_response("loan_payments", company_id, date_from, date_to, rows, columns, totals=totals, filters={"loan_id": loan_id, "q": q, "status": status, "preset": request.args.get("preset")}, extra_meta=meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_loan_payments failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-payments/export", methods=["GET"])
def export_loan_payments(company_id):
    deny = _deny_report_export_access(company_id, "loan_payments")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        loan_id_raw = (request.args.get("loan_id") or "").strip()
        loan_id = int(loan_id_raw) if loan_id_raw else None
        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()
        rows, columns, totals = build_loan_payments_report(db, company_id, loan_id=loan_id, date_from=date_from, date_to=date_to, q=q, status=status or None)
        payload = build_report_response("loan_payments", company_id, date_from, date_to, rows, columns, totals=totals, filters={"loan_id": loan_id, "q": q, "status": status, "preset": request.args.get("preset")}, extra_meta=meta)
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
        rows, columns, totals = build_loan_journals_report(db, company_id, loan_id=loan_id)
        payload = build_report_response("loan_journals", company_id, None, None, rows, columns, totals=totals, filters={"loan_id": loan_id})
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_loan_journals failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/loan-journals/export", methods=["GET"])
def export_loan_journals(company_id):
    deny = _deny_report_export_access(company_id, "loan_journals")
    if deny:
        return deny

    try:
        db = _get_db()
        loan_id = int(request.args.get("loan_id") or 0)
        rows, columns, totals = build_loan_journals_report(db, company_id, loan_id=loan_id)
        payload = build_report_response("loan_journals", company_id, None, None, rows, columns, totals=totals, filters={"loan_id": loan_id})
        return export_csv(payload, filename=f"loan_journals_{loan_id}.csv")
    except Exception as e:
        current_app.logger.exception("export_loan_journals failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# =========================================================
# Statement Exports
# =========================================================

@report_bp.route("/api/companies/<int:company_id>/statements/balance-sheet/export", methods=["GET"])
def export_balance_sheet(company_id):
    deny = _deny_report_export_access(company_id, "balance_sheet")
    if deny:
        return deny

    try:
        db = _get_db()
        date_from, as_of, meta = resolve_company_period(db, company_id, request, mode="as_of")

        args = _statement_common_args()

        payload = get_balance_sheet_v3_exact(
            db=db,
            company_id=company_id,
            as_of=as_of,
            compare=args["compare"],
            view=request.args.get("view") or args["basis"],
            basis=args["basis"],
            include_net_profit_line=str(
                request.args.get("include_net_profit_line", "true")
            ).lower() in {"1", "true", "yes"},
            ctx=meta.get("ctx") if isinstance(meta, dict) else None,
        )

        payload.setdefault("meta", {})
        payload["meta"].update(meta or {})
        payload["meta"]["period"] = {"from": date_from.isoformat() if date_from else None, "to": as_of.isoformat()}

        return _export_statement_payload(payload, "balance_sheet")

    except Exception as e:
        current_app.logger.exception("export_balance_sheet failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/statements/income-statement/export", methods=["GET"])
def export_income_statement(company_id):
    deny = _deny_report_export_access(company_id, "income_statement")
    if deny:
        return deny

    try:
        db = _get_db()
        date_from, date_to, meta = resolve_company_period(db, company_id, request, mode="range")

        args = _statement_common_args()

        payload = db.get_income_statement_v2(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            template=args["template"],
            basis=args["basis"],
            compare=args["compare"],
            cols_mode=int(request.args.get("cols_mode") or request.args.get("cols") or 1),
            detail=request.args.get("detail", "summary"),
            prior_from=request.args.get("prior_from") or None,
            prior_to=request.args.get("prior_to") or None,
        )

        payload.setdefault("meta", {})
        payload["meta"].update(meta or {})

        return _export_statement_payload(payload, "income_statement")

    except Exception as e:
        current_app.logger.exception("export_income_statement failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/statements/cash-flow/export", methods=["GET"])
def export_cash_flow(company_id):
    deny = _deny_report_export_access(company_id, "cash_flow")
    if deny:
        return deny

    try:
        db = _get_db()
        date_from, date_to, meta = resolve_company_period(db, company_id, request, mode="range")

        args = _statement_common_args()

        payload = db.get_cashflow_full_v2(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            template=args["template"],
            basis=args["basis"],
            compare=args["compare"],
            method=request.args.get("method", "direct"),
            cols_mode=int(request.args.get("cols_mode") or request.args.get("cols") or 1),
            preview_columns=int(request.args.get("preview_columns") or request.args.get("cols_mode") or 1),
            prior_from=request.args.get("prior_from") or None,
            prior_to=request.args.get("prior_to") or None,
        )

        payload.setdefault("meta", {})
        payload["meta"].update(meta or {})

        return _export_statement_payload(payload, "cash_flow")

    except Exception as e:
        current_app.logger.exception("export_cash_flow failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/statements/socie/export", methods=["GET"])
def export_socie(company_id):
    deny = _deny_report_export_access(company_id, "socie")
    if deny:
        return deny

    try:
        db = _get_db()
        date_from, date_to, meta = resolve_company_period(db, company_id, request, mode="range")

        args = _statement_common_args()

        payload = db.get_socie_v1(
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
            template=args["template"],
            basis=args["basis"],
            compare=args["compare"],
            cols_mode=int(request.args.get("cols_mode") or request.args.get("cols") or 1),
            prior_from=request.args.get("prior_from") or None,
            prior_to=request.args.get("prior_to") or None,
        )

        payload.setdefault("meta", {})
        payload["meta"].update(meta or {})

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
        rows, columns, totals, extra_meta = build_ar_control_reconciliation_report(db, company_id, as_at=as_of_date)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("ar_control_reconciliation", company_id, None, as_of_date, rows, columns, totals=totals, filters={"preset": request.args.get("preset")}, extra_meta=merged_meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_ar_control_reconciliation failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/ar-control-reconciliation/export", methods=["GET"])
def export_ar_control_reconciliation(company_id):
    deny = _deny_report_export_access(company_id, "ar_control_reconciliation")
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        rows, columns, totals, extra_meta = build_ar_control_reconciliation_report(db, company_id, as_at=as_of_date)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("ar_control_reconciliation", company_id, None, as_of_date, rows, columns, totals=totals, filters={"preset": request.args.get("preset")}, extra_meta=merged_meta)
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
        rows, columns, totals, extra_meta = build_ap_control_reconciliation_report(db, company_id, as_at=as_of_date)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("ap_control_reconciliation", company_id, None, as_of_date, rows, columns, totals=totals, filters={"preset": request.args.get("preset")}, extra_meta=merged_meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_ap_control_reconciliation failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/ap-control-reconciliation/export", methods=["GET"])
def export_ap_control_reconciliation(company_id):
    deny = _deny_report_export_access(company_id, "ap_control_reconciliation")
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        rows, columns, totals, extra_meta = build_ap_control_reconciliation_report(db, company_id, as_at=as_of_date)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("ap_control_reconciliation", company_id, None, as_of_date, rows, columns, totals=totals, filters={"preset": request.args.get("preset")}, extra_meta=merged_meta)
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
        rows, columns, totals, extra_meta = build_customer_statement_report(db, company_id, customer_id=customer_id, date_from=date_from, date_to=date_to)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("customer_statement", company_id, date_from, date_to, rows, columns, totals=totals, filters={"customer_id": customer_id, "preset": request.args.get("preset")}, extra_meta=merged_meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_customer_statement failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/customer-statement/export", methods=["GET"])
def export_customer_statement(company_id):
    deny = _deny_report_export_access(company_id, "customer_statement")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        customer_id = int(request.args.get("customer_id") or 0)
        rows, columns, totals, extra_meta = build_customer_statement_report(db, company_id, customer_id=customer_id, date_from=date_from, date_to=date_to)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("customer_statement", company_id, date_from, date_to, rows, columns, totals=totals, filters={"customer_id": customer_id, "preset": request.args.get("preset")}, extra_meta=merged_meta)
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
        rows, columns, totals, extra_meta = build_vendor_statement_report(db, company_id, vendor_id=vendor_id, date_from=date_from, date_to=date_to)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("vendor_statement", company_id, date_from, date_to, rows, columns, totals=totals, filters={"vendor_id": vendor_id, "preset": request.args.get("preset")}, extra_meta=merged_meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_vendor_statement failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/vendor-statement/export", methods=["GET"])
def export_vendor_statement(company_id):
    deny = _deny_report_export_access(company_id, "vendor_statement")
    if deny:
        return deny

    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        vendor_id = int(request.args.get("vendor_id") or 0)
        rows, columns, totals, extra_meta = build_vendor_statement_report(db, company_id, vendor_id=vendor_id, date_from=date_from, date_to=date_to)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("vendor_statement", company_id, date_from, date_to, rows, columns, totals=totals, filters={"vendor_id": vendor_id, "preset": request.args.get("preset")}, extra_meta=merged_meta)
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
        rows, columns, totals, extra_meta = build_ar_aging_report(db, company_id, as_at=as_of_date, customer_id=customer_id)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("ar_aging", company_id, None, as_of_date, rows, columns, totals=totals, filters={"customer_id": customer_id, "preset": request.args.get("preset")}, extra_meta=merged_meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_ar_aging failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/ar-aging/export", methods=["GET"])
def export_ar_aging(company_id):
    deny = _deny_report_export_access(company_id, "ar_aging")
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        customer_id_raw = (request.args.get("customer_id") or "").strip()
        customer_id = int(customer_id_raw) if customer_id_raw else None
        rows, columns, totals, extra_meta = build_ar_aging_report(db, company_id, as_at=as_of_date, customer_id=customer_id)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("ar_aging", company_id, None, as_of_date, rows, columns, totals=totals, filters={"customer_id": customer_id, "preset": request.args.get("preset")}, extra_meta=merged_meta)
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
        rows, columns, totals, extra_meta = build_ap_aging_report(db, company_id, as_at=as_of_date, vendor_id=vendor_id)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("ap_aging", company_id, None, as_of_date, rows, columns, totals=totals, filters={"vendor_id": vendor_id, "preset": request.args.get("preset")}, extra_meta=merged_meta)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_ap_aging failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/ap-aging/export", methods=["GET"])
def export_ap_aging(company_id):
    deny = _deny_report_export_access(company_id, "ap_aging")
    if deny:
        return deny

    try:
        db, as_of_date, meta = _resolve_as_of(company_id)
        vendor_id_raw = (request.args.get("vendor_id") or "").strip()
        vendor_id = int(vendor_id_raw) if vendor_id_raw else None
        rows, columns, totals, extra_meta = build_ap_aging_report(db, company_id, as_at=as_of_date, vendor_id=vendor_id)
        merged_meta = {}
        merged_meta.update(meta or {})
        merged_meta.update(extra_meta or {})
        payload = build_report_response("ap_aging", company_id, None, as_of_date, rows, columns, totals=totals, filters={"vendor_id": vendor_id, "preset": request.args.get("preset")}, extra_meta=merged_meta)
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
        rows, columns, totals = build_lessors_list_report(db, company_id, q=q)
        payload = build_report_response("lessors_list", company_id, None, None, rows, columns, totals=totals, filters={"q": q})
        return jsonify(payload)
    except Exception as e:
        current_app.logger.exception("run_lessors_list failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/lessors-list/export", methods=["GET"])
def export_lessors_list(company_id):
    deny = _deny_report_export_access(company_id, "lessors_list")
    if deny:
        return deny

    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()
        rows, columns, totals = build_lessors_list_report(db, company_id, q=q)
        payload = build_report_response("lessors_list", company_id, None, None, rows, columns, totals=totals, filters={"q": q})
        return export_csv(payload, filename="lessors_list.csv")
    except Exception as e:
        current_app.logger.exception("export_lessors_list failed")
        return jsonify({"ok": False, "error": str(e)}), 400

# =========================================================
# Revenue Reports
# =========================================================




@report_bp.route("/api/companies/<int:company_id>/reports/revenue-contracts", methods=["GET"])
@require_auth
def run_revenue_contracts(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny
    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()
        limit = int(request.args.get("limit") or 500)
        rows, columns, totals = build_revenue_contracts_report(db, company_id, q=q, status=status, limit=limit)
        return jsonify(_revenue_report_payload("revenue_contracts", company_id, rows, columns, totals, filters={"q": q, "status": status}))
    except Exception as e:
        current_app.logger.exception("run_revenue_contracts failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-contracts/export", methods=["GET"])
def export_revenue_contracts(company_id):
    deny = _deny_report_export_access(company_id, "revenue_contracts")
    if deny:
        return deny
    try:
        db = _get_db()
        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()
        limit = int(request.args.get("limit") or 500)
        rows, columns, totals = build_revenue_contracts_report(db, company_id, q=q, status=status, limit=limit)
        payload = _revenue_report_payload("revenue_contracts", company_id, rows, columns, totals, filters={"q": q, "status": status})
        return export_csv(payload, filename="revenue_contracts.csv")
    except Exception as e:
        current_app.logger.exception("export_revenue_contracts failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-obligations", methods=["GET"])
@require_auth
def run_revenue_obligations(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny
    try:
        db = _get_db()
        contract_id = request.args.get("contract_id") or None
        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()
        rows, columns, totals = build_revenue_obligations_report(db, company_id, contract_id=contract_id, q=q, status=status)
        return jsonify(_revenue_report_payload("revenue_obligations", company_id, rows, columns, totals, filters={"contract_id": contract_id, "q": q, "status": status}))
    except Exception as e:
        current_app.logger.exception("run_revenue_obligations failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-obligations/export", methods=["GET"])
def export_revenue_obligations(company_id):
    deny = _deny_report_export_access(company_id, "revenue_obligations")
    if deny:
        return deny
    try:
        db = _get_db()
        contract_id = request.args.get("contract_id") or None
        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()
        rows, columns, totals = build_revenue_obligations_report(db, company_id, contract_id=contract_id, q=q, status=status)
        payload = _revenue_report_payload("revenue_obligations", company_id, rows, columns, totals, filters={"contract_id": contract_id, "q": q, "status": status})
        return export_csv(payload, filename="revenue_obligations.csv")
    except Exception as e:
        current_app.logger.exception("export_revenue_obligations failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-billing-events", methods=["GET"])
@require_auth
def run_revenue_billing_events(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny
    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        contract_id = request.args.get("contract_id") or None
        q = (request.args.get("q") or "").strip()
        rows, columns, totals = build_revenue_events_report(db, company_id, event_kind="billing", contract_id=contract_id, date_from=date_from, date_to=date_to, q=q)
        return jsonify(_revenue_report_payload("revenue_billing_events", company_id, rows, columns, totals, date_from, date_to, {"contract_id": contract_id, "q": q}, meta))
    except Exception as e:
        current_app.logger.exception("run_revenue_billing_events failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-billing-events/export", methods=["GET"])
def export_revenue_billing_events(company_id):
    deny = _deny_report_export_access(company_id, "revenue_billing_events")
    if deny:
        return deny
    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        contract_id = request.args.get("contract_id") or None
        q = (request.args.get("q") or "").strip()
        rows, columns, totals = build_revenue_events_report(db, company_id, event_kind="billing", contract_id=contract_id, date_from=date_from, date_to=date_to, q=q)
        payload = _revenue_report_payload("revenue_billing_events", company_id, rows, columns, totals, date_from, date_to, {"contract_id": contract_id, "q": q}, meta)
        return export_csv(payload, filename="revenue_billing_events.csv")
    except Exception as e:
        current_app.logger.exception("export_revenue_billing_events failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-cash-events", methods=["GET"])
@require_auth
def run_revenue_cash_events(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny
    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        contract_id = request.args.get("contract_id") or None
        q = (request.args.get("q") or "").strip()
        rows, columns, totals = build_revenue_events_report(db, company_id, event_kind="cash", contract_id=contract_id, date_from=date_from, date_to=date_to, q=q)
        return jsonify(_revenue_report_payload("revenue_cash_events", company_id, rows, columns, totals, date_from, date_to, {"contract_id": contract_id, "q": q}, meta))
    except Exception as e:
        current_app.logger.exception("run_revenue_cash_events failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-cash-events/export", methods=["GET"])
def export_revenue_cash_events(company_id):
    deny = _deny_report_export_access(company_id, "revenue_cash_events")
    if deny:
        return deny
    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        contract_id = request.args.get("contract_id") or None
        q = (request.args.get("q") or "").strip()
        rows, columns, totals = build_revenue_events_report(db, company_id, event_kind="cash", contract_id=contract_id, date_from=date_from, date_to=date_to, q=q)
        payload = _revenue_report_payload("revenue_cash_events", company_id, rows, columns, totals, date_from, date_to, {"contract_id": contract_id, "q": q}, meta)
        return export_csv(payload, filename="revenue_cash_events.csv")
    except Exception as e:
        current_app.logger.exception("export_revenue_cash_events failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-progress", methods=["GET"])
@require_auth
def run_revenue_progress(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny
    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        contract_id = request.args.get("contract_id") or None
        obligation_id = request.args.get("obligation_id") or None
        rows, columns, totals = build_revenue_progress_report(db, company_id, contract_id=contract_id, obligation_id=obligation_id, date_from=date_from, date_to=date_to)
        return jsonify(_revenue_report_payload("revenue_progress", company_id, rows, columns, totals, date_from, date_to, {"contract_id": contract_id, "obligation_id": obligation_id}, meta))
    except Exception as e:
        current_app.logger.exception("run_revenue_progress failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-progress/export", methods=["GET"])
def export_revenue_progress(company_id):
    deny = _deny_report_export_access(company_id, "revenue_progress")
    if deny:
        return deny
    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        contract_id = request.args.get("contract_id") or None
        obligation_id = request.args.get("obligation_id") or None
        rows, columns, totals = build_revenue_progress_report(db, company_id, contract_id=contract_id, obligation_id=obligation_id, date_from=date_from, date_to=date_to)
        payload = _revenue_report_payload("revenue_progress", company_id, rows, columns, totals, date_from, date_to, {"contract_id": contract_id, "obligation_id": obligation_id}, meta)
        return export_csv(payload, filename="revenue_progress.csv")
    except Exception as e:
        current_app.logger.exception("export_revenue_progress failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-recognition-runs", methods=["GET"])
@require_auth
def run_revenue_recognition_runs(company_id):
    deny = _deny_report_access(company_id)
    if deny:
        return deny
    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        contract_id = request.args.get("contract_id") or None
        status = (request.args.get("status") or "").strip()
        rows, columns, totals = build_revenue_runs_report(db, company_id, contract_id=contract_id, date_from=date_from, date_to=date_to, status=status)
        return jsonify(_revenue_report_payload("revenue_recognition_runs", company_id, rows, columns, totals, date_from, date_to, {"contract_id": contract_id, "status": status}, meta))
    except Exception as e:
        current_app.logger.exception("run_revenue_recognition_runs failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-recognition-runs/export", methods=["GET"])
def export_revenue_recognition_runs(company_id):
    deny = _deny_report_export_access(company_id, "revenue_recognition_runs")
    if deny:
        return deny
    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        contract_id = request.args.get("contract_id") or None
        status = (request.args.get("status") or "").strip()
        rows, columns, totals = build_revenue_runs_report(db, company_id, contract_id=contract_id, date_from=date_from, date_to=date_to, status=status)
        payload = _revenue_report_payload("revenue_recognition_runs", company_id, rows, columns, totals, date_from, date_to, {"contract_id": contract_id, "status": status}, meta)
        return export_csv(payload, filename="revenue_recognition_runs.csv")
    except Exception as e:
        current_app.logger.exception("export_revenue_recognition_runs failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@report_bp.route("/api/companies/<int:company_id>/reports/revenue-recognition-entries/export", methods=["GET"])
def export_revenue_recognition_entries(company_id):
    deny = _deny_report_export_access(company_id, "revenue_recognition_entries")
    if deny:
        return deny
    try:
        db, date_from, date_to, meta = _resolve_range(company_id)
        run_id = request.args.get("run_id") or None
        contract_id = request.args.get("contract_id") or None
        rows, columns, totals = build_revenue_run_entries_report(db, company_id, run_id=run_id, contract_id=contract_id, date_from=date_from, date_to=date_to)
        payload = _revenue_report_payload("revenue_recognition_entries", company_id, rows, columns, totals, date_from, date_to, {"run_id": run_id, "contract_id": contract_id}, meta)
        return export_csv(payload, filename="revenue_recognition_entries.csv")
    except Exception as e:
        current_app.logger.exception("export_revenue_recognition_entries failed")
        return jsonify({"ok": False, "error": str(e)}), 400