# FinSage Control — Dashboard Routes
from flask import Blueprint, jsonify, g, request, current_app

from BackEnd.Services.control_auth import require_control_auth

dashboard_bp = Blueprint('control_dashboard', __name__, url_prefix='/api/control')


@dashboard_bp.route('/dashboard', methods=['GET'])
@require_control_auth
def get_dashboard():
    """Return aggregated dashboard statistics."""
    stats = g.control_service.get_dashboard_stats()
    return jsonify(stats)

@dashboard_bp.get("/system/errors")
@require_control_auth
def get_system_errors():
    try:
        limit = request.args.get("limit", 50, type=int)

        errors = g.control_service.get_system_errors(
            limit=limit,
            unresolved_only=True,
        )

        return jsonify({
            "ok": True,
            "errors": errors or [],
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to load Control system errors"
        )

        return jsonify({
            "ok": False,
            "error": "Unable to load system errors",
        }), 500


@dashboard_bp.get("/system/errors/<int:event_id>")
@require_control_auth
def get_system_error(event_id):
    try:
        error = g.control_service.get_system_error(event_id)

        if not error:
            return jsonify({
                "ok": False,
                "error": "System error not found",
            }), 404

        return jsonify({
            "ok": True,
            "error": error,
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to load Control system error %s",
            event_id,
        )

        return jsonify({
            "ok": False,
            "error": "Unable to load system error",
        }), 500


@dashboard_bp.get("/system/errors/<int:event_id>/occurrences")
@require_control_auth
def get_system_error_occurrences(event_id):
    try:
        limit = request.args.get("limit", 100, type=int)

        error = g.control_service.get_system_error(event_id)

        if not error:
            return jsonify({
                "ok": False,
                "error": "System error not found",
            }), 404

        occurrences = g.control_service.get_system_error_occurrences(
            event_id,
            limit=limit,
        )

        return jsonify({
            "ok": True,
            "event": error,
            "occurrences": occurrences or [],
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to load occurrences for system error %s",
            event_id,
        )

        return jsonify({
            "ok": False,
            "error": "Unable to load system error occurrences",
        }), 500


@dashboard_bp.patch("/system/errors/<int:event_id>/resolve")
@require_control_auth
def resolve_system_error(event_id):
    try:
        error = g.control_service.get_system_error(event_id)

        if not error:
            return jsonify({
                "ok": False,
                "error": "System error not found",
            }), 404

        resolved = g.control_service.resolve_system_error(event_id)

        return jsonify({
            "ok": True,
            "error": resolved,
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to resolve Control system error %s",
            event_id,
        )

        return jsonify({
            "ok": False,
            "error": "Unable to resolve system error",
        }), 500


@dashboard_bp.patch("/system/errors/<int:event_id>/reopen")
@require_control_auth
def reopen_system_error(event_id):
    try:
        error = g.control_service.get_system_error(event_id)

        if not error:
            return jsonify({
                "ok": False,
                "error": "System error not found",
            }), 404

        reopened = g.control_service.reopen_system_error(event_id)

        return jsonify({
            "ok": True,
            "error": reopened,
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to reopen Control system error %s",
            event_id,
        )

        return jsonify({
            "ok": False,
            "error": "Unable to reopen system error",
        }), 500

# ============================================================
# 1. POST /system/errors/<id>/open
# ============================================================
@dashboard_bp.post("/system/errors/<int:event_id>/open")
@require_control_auth
def open_system_error(event_id):
    """
    Mark a system alert as OPENED by the current Control user.

    Triggers:
      - audit_log entry  (system_error.opened)
      - auto-creates a ticket if none is linked yet
      - kicks the ticket_automation job once
      - returns the event + linked_ticket summary

    The frontend should call this exactly ONCE per visit to the
    SystemErrorDetail page (use a ref-guard so React StrictMode's
    double-invoke does not double-fire it).
    """
    try:
        agent = g.control_agent
        result = g.control_service.open_system_error(
            event_id,
            agent_id=agent["id"],
            request=request,
        )

        if not result:
            return jsonify({
                "ok": False,
                "error": "System error not found",
            }), 404

        return jsonify({
            "ok": True,
            "error": result,
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to open Control system error %s",
            event_id,
        )

        return jsonify({
            "ok": False,
            "error": "Unable to open system error",
        }), 500


# ============================================================
# 2. GET /system/alerts — the new persistent alerts screen
# ============================================================
@dashboard_bp.get("/system/alerts")
@require_control_auth
def list_system_alerts():
    """
    Paginated, filterable list of ALL system events.

    Query params:
      status      = open | resolved
      severity    = p1_critical | p2_high | p3_medium | p4_low
      has_ticket  = true | false   (omit for "either")
      search      = free text (event_code, message, exception_type, company)
      page        = 1..N (default 1)
      per_page    = 1..100 (default 20)

    Returns:
      {
        alerts: [...],
        total, page, per_page,
        summary: { total, open_count, critical_count, high_count,
                   without_ticket, total_occurrences }
      }
    """
    try:
        status = (request.args.get("status") or "").strip() or None
        severity = (request.args.get("severity") or "").strip() or None
        has_ticket_raw = (request.args.get("has_ticket") or "").strip().lower()
        search = (request.args.get("search") or "").strip()
        page = request.args.get("page", 1, type=int)
        per_page = request.args.get("per_page", 20, type=int)

        has_ticket = None
        if has_ticket_raw in ("true", "1", "yes"):
            has_ticket = True
        elif has_ticket_raw in ("false", "0", "no"):
            has_ticket = False

        result = g.control_service.get_system_alerts(
            status=status,
            severity=severity,
            has_ticket=has_ticket,
            search=search,
            page=page,
            per_page=per_page,
        )

        return jsonify(result), 200

    except Exception:
        current_app.logger.exception(
            "Failed to list Control system alerts"
        )

        return jsonify({
            "alerts": [],
            "total": 0,
            "page": 1,
            "per_page": 20,
            "summary": {
                "total": 0,
                "open_count": 0,
                "critical_count": 0,
                "high_count": 0,
                "without_ticket": 0,
                "total_occurrences": 0,
            },
            "error": "Unable to load system alerts",
        }), 500


# ============================================================
# 3. GET /system/alerts/unread-count — for the nav badge
# ============================================================
# Lightweight endpoint the new "System Alerts" nav item polls
# every 15s to render a red badge with the open count.
@dashboard_bp.get("/system/alerts/unread-count")
@require_control_auth
def get_alerts_unread_count():
    """Return the count of OPEN system events for the nav badge."""
    try:
        row = g.control_service.db.fetch_one(
            """
            SELECT
                COUNT(*) AS open_count,
                COALESCE(SUM(occurrence_count), 0) AS occurrences,
                COUNT(*) FILTER (WHERE severity = 'p1_critical') AS critical
            FROM control.system_events
            WHERE status = 'open'
            """
        )

        return jsonify({
            "open_count": int(row["open_count"] or 0) if row else 0,
            "occurrences": int(row["occurrences"] or 0) if row else 0,
            "critical": int(row["critical"] or 0) if row else 0,
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to load Control alerts unread count"
        )

        return jsonify({
            "open_count": 0,
            "occurrences": 0,
            "critical": 0,
        }), 500


# ============================================================
# 4. GET /system/errors/<id>/ticket — fetch the linked-ticket
#    summary (used by the alert-detail page's progress panel).
# ============================================================
@dashboard_bp.get("/system/errors/<int:event_id>/ticket")
@require_control_auth
def get_linked_ticket_for_event(event_id):
    """
    Return the linked-ticket summary for an event, or null if no
    ticket is yet linked. Cheap alternative to loading the full
    ticket detail page.
    """
    try:
        event = g.control_service.get_system_error(event_id)

        if not event:
            return jsonify({
                "ok": False,
                "error": "System error not found",
            }), 404

        ticket_id = event.get("ticket_id")

        if not ticket_id:
            return jsonify({
                "ok": True,
                "ticket": None,
            }), 200

        summary = g.control_service.get_linked_ticket_summary(ticket_id)

        return jsonify({
            "ok": True,
            "ticket": summary,
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to load linked ticket for system error %s",
            event_id,
        )

        return jsonify({
            "ok": False,
            "error": "Unable to load linked ticket",
        }), 500
