from flask import Blueprint, request, jsonify, g

from BackEnd.Services.control_auth import require_control_auth


control_system_health_bp = Blueprint(
    "control_system_health",
    __name__,
    url_prefix="/api/control/system/health",
)


@control_system_health_bp.get("")
@require_control_auth
def get_system_health():
    return jsonify(
        g.control_service.get_system_health()
    )


@control_system_health_bp.get("/checks")
@require_control_auth
def get_system_health_checks():
    return jsonify({
        "checks": g.control_service.get_system_checks(
            active_only=False
        )
    })


@control_system_health_bp.get("/runs")
@require_control_auth
def get_system_health_runs():
    check_id = request.args.get(
        "check_id",
        type=int,
    )

    limit = request.args.get(
        "limit",
        50,
        type=int,
    )

    return jsonify({
        "runs": g.control_service.get_system_check_runs(
            check_id=check_id,
            limit=limit,
        )
    })


@control_system_health_bp.post("/run")
@require_control_auth
def run_system_health():
    data = request.get_json(silent=True) or {}

    check_code = data.get("check_code")

    result = g.control_service.run_system_health_checks(
        check_code=check_code,
        force=True,
        agent_id=g.control_user["id"],
    )

    g.control_service.audit(
        action="system_health.manual_run",
        entity_type="system_health",
        description=(
            "Control administrator manually ran "
            "system health checks."
        ),
        metadata={
            "check_code": check_code,
            "result_status": result.get("status"),
        },
        request=request,
        control_user_id=g.control_user["id"],
    )

    return jsonify(result)