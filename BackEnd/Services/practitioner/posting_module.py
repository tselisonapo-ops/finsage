from flask import Blueprint, request, current_app, make_response
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.credit_policy import _can_view_engagements
from BackEnd.Services.practitioner.practitioner_engagements import _json_err, _json_ok

practitioner_dashboard_bp = Blueprint("practitioner_dashboard", __name__)


def _parse_engagement_id():
    raw = (request.args.get("engagementId") or "").strip()
    if not raw:
        raise ValueError("engagementId is required")
    try:
        val = int(raw)
    except Exception:
        raise ValueError("engagementId must be a valid integer")
    if val <= 0:
        raise ValueError("engagementId must be greater than zero")
    return val


def _parse_optional_int_arg(name: str):
    raw = (request.args.get(name) or "").strip()
    if raw == "":
        return None
    try:
        val = int(raw)
    except Exception:
        raise ValueError(f"{name} must be a valid integer")
    if val <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return val


def _parse_module_name():
    val = (request.args.get("module") or "").strip().lower()
    allowed = {
        "journal_entries",
        "accounts_receivable",
        "accounts_payable",
        "leases",
        "ppe",
    }
    if not val:
        raise ValueError("module is required")
    if val not in allowed:
        raise ValueError("Invalid module")
    return val

def _parse_limit(default: int = 100, max_limit: int = 500) -> int:
    raw = int(request.args.get("limit", default))
    return max(1, min(raw, max_limit))


def _parse_offset(default: int = 0) -> int:
    raw = int(request.args.get("offset", default))
    return max(0, raw)

@practitioner_dashboard_bp.route(
    "/api/companies/<int:cid>/practitioner-dashboard/posting-modules/summary",
    methods=["GET", "OPTIONS"],
)
@require_auth
def get_practitioner_posting_module_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view posting module summaries.", 403)

        engagement_id = _parse_engagement_id()
        module_name = _parse_module_name()

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_practitioner_posting_module_summary(
                cur,
                company_id,
                engagement_id=engagement_id,
                module_name=module_name,
            )

        return _json_ok({"row": row})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("get_practitioner_posting_module_summary_route failed")
        return _json_err(str(e), 500)


@practitioner_dashboard_bp.route(
    "/api/companies/<int:cid>/practitioner-dashboard/posting-modules/activity",
    methods=["GET", "OPTIONS"],
)
@require_auth
def list_practitioner_posting_module_activity_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
            engagement_id=int(engagement_id),
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view posting module activity.", 403)

        engagement_id = _parse_engagement_id()
        module_name = _parse_module_name()

        status = (request.args.get("status") or "").strip().lower()
        event_type = (request.args.get("eventType") or "").strip().lower()
        prepared_by_user_id = _parse_optional_int_arg("preparedByUserId")
        reviewer_user_id = _parse_optional_int_arg("reviewerUserId")
        date_from = (request.args.get("dateFrom") or "").strip()
        date_to = (request.args.get("dateTo") or "").strip()
        q = (request.args.get("q") or "").strip()
        mine_only = str(request.args.get("mineOnly") or "").strip().lower() in ("1", "true", "yes", "y", "on")
        limit = _parse_limit(default=100)
        offset = _parse_offset()
        current_user_id = payload.get("user_id")

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_practitioner_posting_module_activity(
                cur,
                company_id,
                engagement_id=engagement_id,
                module_name=module_name,
                status=status,
                event_type=event_type,
                prepared_by_user_id=prepared_by_user_id,
                reviewer_user_id=reviewer_user_id,
                date_from=date_from or None,
                date_to=date_to or None,
                mine_only=mine_only,
                current_user_id=current_user_id,
                q=q,
                limit=limit,
                offset=offset,
            )

            total = db_service.count_practitioner_posting_module_activity(
                cur,
                company_id,
                engagement_id=engagement_id,
                module_name=module_name,
                status=status,
                event_type=event_type,
                prepared_by_user_id=prepared_by_user_id,
                reviewer_user_id=reviewer_user_id,
                date_from=date_from or None,
                date_to=date_to or None,
                mine_only=mine_only,
                current_user_id=current_user_id,
                q=q,
            )

        return _json_ok({
            "rows": rows,
            "total": total.get("total_rows", 0) if isinstance(total, dict) else 0,
            "limit": limit,
            "offset": offset,
        })

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("list_practitioner_posting_module_activity_route failed")
        return _json_err(str(e), 500)


@practitioner_dashboard_bp.route(
    "/api/companies/<int:cid>/practitioner-dashboard/posting-modules/filter-options",
    methods=["GET", "OPTIONS"],
)
@require_auth
def list_practitioner_posting_module_filter_options_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
            engagement_id=int(engagement_id),
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view posting module filters.", 403)

        engagement_id = _parse_engagement_id()
        module_name = _parse_module_name()

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.list_practitioner_posting_module_filter_options(
                cur,
                company_id,
                engagement_id=engagement_id,
                module_name=module_name,
            )

        return _json_ok({"row": row})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("list_practitioner_posting_module_filter_options_route failed")
        return _json_err(str(e), 500)