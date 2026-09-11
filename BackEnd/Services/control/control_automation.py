from flask import Blueprint, request, jsonify, g

from BackEnd.Services.control_auth import require_control_auth


control_automation_bp = Blueprint(
    "control_automation",
    __name__,
    url_prefix="/api/control/automation",
)


@control_automation_bp.get("")
@require_control_auth
def get_automation_status():
    jobs = g.control_service.db.fetch_all(
        """
        SELECT
            id,
            job_code,
            name,
            description,
            interval_minutes,
            is_active,
            last_run_at,
            next_run_at,
            created_at,
            updated_at
        FROM control.automation_jobs
        ORDER BY id
        """
    )

    return jsonify({
        "jobs": jobs,
    })


@control_automation_bp.get("/runs")
@require_control_auth
def get_automation_runs():
    limit = request.args.get("limit", 50, type=int)
    limit = max(1, min(limit, 200))

    runs = g.control_service.db.fetch_all(
        """
        SELECT
            ar.id,
            ar.job_id,
            aj.job_code,
            aj.name AS job_name,
            ar.status,
            ar.started_at,
            ar.completed_at,
            ar.duration_ms,
            ar.result_data,
            ar.error_message
        FROM control.automation_runs ar
        LEFT JOIN control.automation_jobs aj
            ON aj.id = ar.job_id
        ORDER BY ar.started_at DESC
        LIMIT %s
        """,
        (limit,)
    )

    return jsonify({
        "runs": runs,
    })


@control_automation_bp.post("/run")
@require_control_auth
def run_automation():
    data = request.get_json(silent=True) or {}

    job_code = data.get("job_code")

    result = g.control_service.automation_service.run(
        job_code=job_code,
    )

    return jsonify(result)