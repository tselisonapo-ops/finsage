from flask import Blueprint,jsonify,request,g,current_app
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.ops_auth import require_ops_access,require_ops_permission

ops_bp=Blueprint(
    "ops",
    __name__,
    url_prefix="/api/companies/<int:company_id>/ops",
)

def _uid():
    user=getattr(g,"current_user",{}) or {}
    return int(user.get("id") or user.get("user_id") or 0)

def _audit_meta():
    forwarded=request.headers.get("X-Forwarded-For")
    ip=(forwarded.split(",")[0].strip() if forwarded else request.remote_addr)
    return {
        "ip_address":ip,
        "user_agent":request.headers.get("User-Agent"),
    }

# ============================================================
# SESSION / BOOTSTRAP
# ============================================================

@ops_bp.get("/session")
@require_auth
@require_ops_access
def ops_session(company_id):
    ctx=db_service.get_ops_session_context(company_id,_uid())
    if not ctx:
        return jsonify({"error":"FinFlow session unavailable"}),404
    return jsonify(ctx),200

@ops_bp.get("/setup")
@require_auth
@require_ops_permission("setup.view")
def ops_setup(company_id):
    schema=db_service.company_schema(company_id)

    return jsonify({
        "settings":db_service.get_ops_settings(company_id),
        "departments":db_service.list_company_departments(company_id),
        "positions":db_service.list_company_positions(company_id),
        "branches":db_service.fetch_all(
            """
            SELECT id,name,code,country,address,manager_user_id
            FROM public.company_branches
            WHERE company_id=%s AND is_active=TRUE
            ORDER BY name;
            """,
            (int(company_id),),
        ) or [],
        "team":db_service.list_ops_team(company_id),
        "roles":db_service.list_ops_roles(company_id),
        "request_types":db_service.fetch_all(
            f"""
            SELECT id,code,name,description,requires_budget
            FROM {schema}.ops_request_types
            WHERE company_id=%s AND is_active=TRUE
            ORDER BY sort_order,name;
            """,
            (int(company_id),),
        ) or [],
    }),200

# ============================================================
# SETTINGS
# ============================================================

@ops_bp.get("/settings")
@require_auth
@require_ops_permission("setup.view")
def get_settings(company_id):
    return jsonify(db_service.get_ops_settings(company_id)),200

@ops_bp.patch("/settings")
@require_auth
@require_ops_permission("setup.manage")
def update_settings(company_id):
    payload=request.get_json(silent=True) or {}
    before=db_service.get_ops_settings(company_id)
    row=db_service.update_ops_settings(company_id,payload)

    db_service.append_ops_event(
        company_id,
        event_type="settings.updated",
        module="setup",
        entity_type="ops_settings",
        entity_id=row.get("id"),
        action="update",
        actor_user_id=_uid(),
        before_json=before,
        after_json=row,
        **_audit_meta(),
    )

    return jsonify(row),200

# ============================================================
# DEPARTMENTS
# ============================================================

@ops_bp.get("/departments")
@require_auth
@require_ops_permission("departments.view")
def departments(company_id):
    return jsonify({
        "rows":db_service.list_company_departments(company_id)
    }),200

@ops_bp.post("/departments")
@require_auth
@require_ops_permission("departments.manage")
def create_department(company_id):
    payload=request.get_json(silent=True) or {}

    try:
        row=db_service.create_company_department(
            company_id,
            payload,
            actor_user_id=_uid(),
        )
    except ValueError as e:
        return jsonify({"error":str(e)}),400

    db_service.append_ops_event(
        company_id,
        event_type="department.created",
        module="organisation",
        entity_type="department",
        entity_id=row.get("id"),
        entity_ref=row.get("name"),
        action="create",
        actor_user_id=_uid(),
        after_json=row,
        **_audit_meta(),
    )

    return jsonify(row),201

@ops_bp.patch("/departments/<int:department_id>")
@require_auth
@require_ops_permission("departments.manage")
def update_department(company_id,department_id):
    before=db_service.fetch_one(
        """
        SELECT *
        FROM public.company_departments
        WHERE company_id=%s AND id=%s;
        """,
        (int(company_id),int(department_id)),
    )

    if not before:
        return jsonify({"error":"Department not found"}),404

    row=db_service.update_company_department(
        company_id,
        department_id,
        request.get_json(silent=True) or {},
    )

    db_service.append_ops_event(
        company_id,
        event_type="department.updated",
        module="organisation",
        entity_type="department",
        entity_id=department_id,
        entity_ref=row.get("name"),
        action="update",
        actor_user_id=_uid(),
        before_json=before,
        after_json=row,
        **_audit_meta(),
    )

    return jsonify(row),200

# ============================================================
# POSITIONS
# ============================================================

@ops_bp.get("/positions")
@require_auth
@require_ops_permission("positions.view")
def positions(company_id):
    return jsonify({
        "rows":db_service.list_company_positions(company_id)
    }),200

@ops_bp.post("/positions")
@require_auth
@require_ops_permission("positions.manage")
def create_position(company_id):
    try:
        row=db_service.create_company_position(
            company_id,
            request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )
    except ValueError as e:
        return jsonify({"error":str(e)}),400

    db_service.append_ops_event(
        company_id,
        event_type="position.created",
        module="organisation",
        entity_type="position",
        entity_id=row.get("id"),
        entity_ref=row.get("title"),
        action="create",
        actor_user_id=_uid(),
        after_json=row,
        **_audit_meta(),
    )

    return jsonify(row),201

# ============================================================
# TEAM / ROLES
# ============================================================

@ops_bp.get("/team")
@require_auth
@require_ops_permission("team.view")
def team(company_id):
    return jsonify({"rows":db_service.list_ops_team(company_id)}),200

@ops_bp.get("/roles")
@require_auth
@require_ops_permission("roles.view")
def roles(company_id):
    return jsonify({"rows":db_service.list_ops_roles(company_id)}),200

@ops_bp.patch("/users/<int:user_id>/access")
@require_auth
@require_ops_permission("team.manage")
def update_user_access(company_id,user_id):
    payload=request.get_json(silent=True) or {}

    try:
        row=db_service.set_ops_user_access(
            company_id,
            user_id,
            payload,
            actor_user_id=_uid(),
        )
    except ValueError as e:
        return jsonify({"error":str(e)}),400

    return jsonify(row),200

# ============================================================
# AUDIT
# ============================================================

@ops_bp.get("/audit")
@require_auth
@require_ops_permission("audit.view")
def audit(company_id):
    schema=db_service.company_schema(company_id)

    try:
        limit=min(max(int(request.args.get("limit",100)),1),500)
    except Exception:
        limit=100

    rows=db_service.fetch_all(
        f"""
        SELECT *
        FROM {schema}.ops_events
        ORDER BY created_at DESC,id DESC
        LIMIT %s;
        """,
        (limit,),
    ) or []

    return jsonify({"rows":rows}),200

@ops_bp.get("/request-types")
@require_auth
@require_ops_access
def request_types(company_id):
    schema=db_service.company_schema(company_id)

    rows=db_service.fetch_all(
        f"""
        SELECT *
        FROM {schema}.ops_request_types
        WHERE company_id=%s
          AND is_active=TRUE
        ORDER BY sort_order,name;
        """,
        (int(company_id),),
    ) or []

    return jsonify({"rows":rows}),200

@ops_bp.get("/requests")
@require_auth
@require_ops_permission("requests.view_own")
def requests(company_id):
    rows=db_service.list_ops_requests(
        company_id,
        user_id=_uid(),
        status=request.args.get("status") or None,
        limit=request.args.get("limit") or 100,
    )

    return jsonify({"rows":rows}),200


@ops_bp.post("/requests")
@require_auth
@require_ops_permission("requests.create")
def create_request(company_id):
    try:
        row=db_service.create_ops_request(
            company_id,
            request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )
        return jsonify(row),201
    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.get("/requests/<int:request_id>")
@require_auth
@require_ops_access
def get_request(company_id,request_id):
    row=db_service.get_ops_request(
        company_id,
        request_id,
    )

    if not row:
        return jsonify({"error":"Request not found"}),404

    return jsonify(row),200

@ops_bp.post("/requests/<int:request_id>/submit")
@require_auth
@require_ops_permission("requests.submit")
def submit_request(company_id,request_id):
    try:
        row=db_service.submit_ops_request(
            company_id,
            request_id,
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except PermissionError as e:
        return jsonify({"error":str(e)}),403

    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.get("/approvals")
@require_auth
@require_ops_permission("approvals.view")
def approvals(company_id):
    rows=db_service.list_ops_approval_tasks(
        company_id,
        _uid(),
        status=request.args.get("status","pending"),
    )

    return jsonify({"rows":rows}),200

@ops_bp.post("/approvals/<int:task_id>/decision")
@require_auth
@require_ops_permission("approvals.decide")
def approval_decision(company_id,task_id):
    body=request.get_json(silent=True) or {}

    try:
        row=db_service.decide_ops_approval(
            company_id,
            task_id,
            actor_user_id=_uid(),
            decision=body.get("decision"),
            comment=body.get("comment"),
        )

        return jsonify(row),200

    except PermissionError as e:
        return jsonify({"error":str(e)}),403

    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.post("/requests/<int:request_id>/budget-check")
@require_auth
@require_ops_permission("budget.check")
def request_budget_check(company_id,request_id):
    try:
        row=db_service.check_ops_request_budget(
            company_id,
            request_id,
            actor_user_id=_uid(),
        )
        return jsonify(row),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.get("/requests/<int:request_id>/budget-check")
@require_auth
@require_ops_access
def get_request_budget_check(company_id,request_id):
    schema=db_service.company_schema(company_id)

    row=db_service.fetch_one(
        f"""
        SELECT *
        FROM {schema}.ops_budget_checks
        WHERE request_id=%s
        ORDER BY checked_at DESC,id DESC
        LIMIT 1;
        """,
        (int(request_id),),
    )

    return jsonify(row or {}),200


@ops_bp.get("/budget-rules")
@require_auth
@require_ops_permission("budget.view")
def budget_rules(company_id):
    schema=db_service.company_schema(company_id)

    rows=db_service.fetch_all(
        f"""
        SELECT
            r.*,
            rt.name AS request_type_name,
            d.name AS department_name,
            b.name AS branch_name
        FROM {schema}.ops_budget_rules r
        LEFT JOIN {schema}.ops_request_types rt ON rt.id=r.request_type_id
        LEFT JOIN public.company_departments d ON d.id=r.department_id
        LEFT JOIN public.company_branches b ON b.id=r.branch_id
        WHERE r.company_id=%s
        ORDER BY r.priority,r.name;
        """,
        (int(company_id),),
    ) or []

    return jsonify({"rows":rows}),200


@ops_bp.post("/budget-rules")
@require_auth
@require_ops_permission("budget.rules.manage")
def create_budget_rule(company_id):
    schema=db_service.company_schema(company_id)
    body=request.get_json(silent=True) or {}
    name=(body.get("name") or "").strip()

    if not name:
        return jsonify({"error":"Rule name is required."}),400

    row=db_service.fetch_one(
        f"""
        INSERT INTO {schema}.ops_budget_rules(
            company_id,name,request_type_id,account_code,
            department_id,branch_id,project_id,cost_center_id,
            require_budget_check,control_mode,budget_basis,
            tolerance_amount,tolerance_percent,
            require_finance_review,finance_role_code,
            priority,created_by_user_id
        )
        VALUES(
            %s,%s,%s,%s,%s,%s,%s,%s,
            %s,%s,%s,%s,%s,%s,%s,%s,%s
        )
        RETURNING *;
        """,
        (
            int(company_id),
            name,
            body.get("request_type_id"),
            (body.get("account_code") or "").strip() or None,
            body.get("department_id"),
            body.get("branch_id"),
            body.get("project_id"),
            body.get("cost_center_id"),
            bool(body.get("require_budget_check",True)),
            body.get("control_mode") or "warn",
            body.get("budget_basis") or "ytd",
            float(body.get("tolerance_amount") or 0),
            float(body.get("tolerance_percent") or 0),
            bool(body.get("require_finance_review")),
            body.get("finance_role_code") or "FINANCE_REVIEWER",
            int(body.get("priority") or 100),
            _uid(),
        ),
    )

    return jsonify(row),201

@ops_bp.get("/requests/<int:request_id>/document")
@require_auth
@require_ops_permission("documents.view")
def request_document(company_id,request_id):
    try:
        payload=db_service.build_ops_requisition_payload(company_id,request_id)
        return jsonify(payload),200
    except ValueError as e:
        return jsonify({"error":str(e)}),404


@ops_bp.post("/requests/<int:request_id>/document/snapshot")
@require_auth
@require_ops_permission("documents.generate")
def snapshot_request_document(company_id,request_id):
    try:
        row=db_service.snapshot_ops_requisition(
            company_id,
            request_id,
            actor_user_id=_uid(),
        )
        return jsonify(row),201
    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.get("/finance/accounts")
@require_auth
@require_ops_access
def ops_finance_accounts(company_id):
    schema=db_service.company_schema(company_id)

    rows=db_service.fetch_all(
        f"""
        SELECT id,code,name,section,category,subcategory
        FROM {schema}.coa
        WHERE company_id=%s
          AND posting=TRUE
        ORDER BY code;
        """,
        (int(company_id),),
    ) or []

    return jsonify({"rows":rows}),200