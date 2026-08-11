from pathlib import Path

from flask import Blueprint,current_app,jsonify,request,send_file,g
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
        return jsonify({"error":"FinSage Nexus session unavailable"}),404
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
        "governance":db_service.get_ops_governance_config(company_id),
    }),200

# ============================================================
# FINANCE REVIEW
# ============================================================

@ops_bp.get("/finance/metadata")
@require_auth
@require_ops_permission("finance.review.view")
def finance_metadata(company_id):
    return jsonify(
        db_service.get_ops_finance_metadata(company_id)
    ),200


@ops_bp.get("/requests/<int:request_id>/finance-review")
@require_auth
@require_ops_permission("finance.review.view")
def finance_review(company_id,request_id):
    task_id=request.args.get("approval_task_id")

    try:
        row=db_service.get_ops_finance_review(
            company_id,
            request_id,
            approval_task_id=int(task_id) if task_id else None,
        )
        return jsonify(row),200
    except ValueError as e:
        return jsonify({"error":str(e)}),404


@ops_bp.patch("/requests/<int:request_id>/finance-review")
@require_auth
@require_ops_permission("finance.review.edit")
def save_finance_review(company_id,request_id):
    body=request.get_json(silent=True) or {}
    task_id=body.get("approval_task_id")

    if not task_id:
        return jsonify({
            "error":"approval_task_id is required."
        }),400

    try:
        row=db_service.save_ops_finance_review(
            company_id,
            request_id,
            body,
            actor_user_id=_uid(),
            approval_task_id=int(task_id),
        )
        return jsonify(row),200

    except PermissionError as e:
        return jsonify({"error":str(e)}),403

    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.get("/cost-centres")
@require_auth
@require_ops_permission("cost_centres.view")
def cost_centres(company_id):
    return jsonify({
        "rows":db_service.list_company_cost_centres(company_id)
    }),200


@ops_bp.post("/cost-centres")
@require_auth
@require_ops_permission("cost_centres.manage")
def create_cost_centre(company_id):
    try:
        row=db_service.create_company_cost_centre(
            company_id,
            request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )
        return jsonify(row),201

    except ValueError as e:
        return jsonify({"error":str(e)}),400
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
# GOVERNANCE
# ============================================================

@ops_bp.get("/governance")
@require_auth
@require_ops_permission("governance.view")
def governance(company_id):
    return jsonify(
        db_service.get_ops_governance_config(company_id)
    ),200


@ops_bp.put("/governance")
@require_auth
@require_ops_permission("governance.manage")
def save_governance(company_id):
    try:
        row=db_service.save_ops_governance_config(
            company_id,
            request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )
        return jsonify(row),200

    except ValueError as e:
        return jsonify({"error":str(e)}),400
    
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

@ops_bp.patch("/positions/<int:position_id>")
@require_auth
@require_ops_permission("positions.manage")
def update_position(company_id,position_id):
    try:
        row=db_service.update_company_position(
            company_id,
            position_id,
            request.get_json(silent=True) or {},
        )
        return jsonify(row),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400
    
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

@ops_bp.patch("/requests/<int:request_id>")
@require_auth
@require_ops_permission("requests.update_own")
def update_request(company_id,request_id):
    try:
        row=db_service.update_ops_request(
            company_id,
            request_id,
            request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )
        return jsonify(row),200

    except PermissionError as e:
        return jsonify({"error":str(e)}),403

    except ValueError as e:
        return jsonify({"error":str(e)}),400

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
        SELECT bc.*
        FROM {schema}.ops_budget_checks bc
        JOIN {schema}.ops_requests r
          ON r.id=bc.request_id
        WHERE bc.request_id=%s
          AND bc.request_revision_no=r.revision_no
        ORDER BY bc.checked_at DESC,bc.id DESC
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

# ============================================================
# REQUEST DOCUMENTS
# ============================================================

@ops_bp.get("/requests/<int:request_id>/documents")
@require_auth
@require_ops_permission("documents.view")
def request_documents(company_id,request_id):
    return jsonify({
        "rows":db_service.list_ops_request_documents(
            company_id,
            request_id,
        )
    }),200


@ops_bp.post("/requests/<int:request_id>/documents/export")
@require_auth
@require_ops_permission("documents.export")
def export_request_document(company_id,request_id):
    body=request.get_json(silent=True) or {}
    format=(body.get("format") or "").strip().lower()

    try:
        row=db_service.generate_ops_requisition_document(
            company_id,
            request_id,
            actor_user_id=_uid(),
            format=format,
            app_root=current_app.root_path,
        )

        return jsonify(row),201

    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.get("/documents/<int:document_id>/download")
@require_auth
@require_ops_permission("documents.download")
def download_ops_document(company_id,document_id):
    schema=db_service.company_schema(company_id)

    row=db_service.fetch_one(
        f"""
        SELECT *
        FROM {schema}.ops_documents
        WHERE company_id=%s
          AND id=%s
          AND storage_path IS NOT NULL
        LIMIT 1;
        """,
        (
            int(company_id),
            int(document_id),
        ),
    )

    if not row:
        return jsonify({
            "error":"Document not found."
        }),404

    path=(
        Path(current_app.root_path)
        /row["storage_path"]
    ).resolve()

    root=Path(
        current_app.root_path
    ).resolve()

    try:
        path.relative_to(root)
    except ValueError:
        return jsonify({
            "error":"Invalid document path."
        }),400

    if not path.exists():
        return jsonify({
            "error":"Document file is missing."
        }),404

    return send_file(
        path,
        mimetype=row.get("mime_type"),
        as_attachment=True,
        download_name=row.get("file_name")
        or path.name,
    )

@ops_bp.get("/requests/<int:request_id>/audit")
@require_auth
@require_ops_access
def request_audit(company_id,request_id):
    return jsonify({
        "rows":db_service.get_ops_request_audit_trail(
            company_id,
            request_id,
        )
    }),200

@ops_bp.get("/procurement")
@require_auth
@require_ops_permission("procurement.view")
def procurement_cases(company_id):
    status=(request.args.get("status") or "").strip() or None

    return jsonify({
        "rows":db_service.list_ops_procurement_cases(
            company_id,
            status=status,
        )
    }),200

@ops_bp.get("/procurement/policies")
@require_auth
@require_ops_permission("procurement.policy.view")
def procurement_policies(company_id):
    return jsonify({
        "rows":db_service.list_ops_procurement_policies(
            company_id
        )
    }),200


@ops_bp.post("/procurement/policies")
@require_auth
@require_ops_permission("procurement.policy.manage")
def create_procurement_policy(company_id):
    try:
        row=db_service.create_ops_procurement_policy(
            company_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),201

    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.patch("/procurement/policies/<int:policy_id>")
@require_auth
@require_ops_permission("procurement.policy.manage")
def update_procurement_policy(company_id,policy_id):
    try:
        row=db_service.update_ops_procurement_policy(
            company_id,
            policy_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.patch(
    "/procurement/policies/<int:policy_id>/rules/<int:rule_id>"
)
@require_auth
@require_ops_permission("procurement.policy.manage")
def update_procurement_policy_rule(
    company_id,
    policy_id,
    rule_id,
):
    try:
        row=db_service.update_ops_procurement_policy_rule(
            company_id,
            policy_id,
            rule_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({"error":str(e)}),400
    
@ops_bp.post("/procurement/policies/<int:policy_id>/rules")
@require_auth
@require_ops_permission("procurement.policy.manage")
def create_procurement_policy_rule(company_id,policy_id):
    try:
        row=db_service.create_ops_procurement_policy_rule(
            company_id,
            policy_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),201

    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.get("/procurement/vendors")
@require_auth
@require_ops_permission("procurement.vendor.view")
def procurement_vendors(company_id):
    preferred=request.args.get("preferred")

    if preferred is None:
        preferred_value=None
    else:
        preferred_value=preferred.lower() in {
            "1","true","yes"
        }

    return jsonify({
        "rows":db_service.list_ops_procurement_vendors(
            company_id,
            search=(
                request.args.get("search")
                or ""
            ).strip() or None,

            procurement_status=(
                request.args.get(
                    "procurement_status"
                )
                or ""
            ).strip() or None,

            qualification_status=(
                request.args.get(
                    "qualification_status"
                )
                or ""
            ).strip() or None,

            preferred=preferred_value,
        )
    }),200

@ops_bp.get("/procurement/vendors/<int:vendor_id>")
@require_auth
@require_ops_permission("procurement.vendor.view")
def procurement_vendor(company_id,vendor_id):
    try:
        return jsonify(
            db_service.get_ops_procurement_vendor(
                company_id,
                vendor_id,
            )
        ),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),404

@ops_bp.post(
    "/procurement/vendors/<int:vendor_id>/contacts"
)
@require_auth
@require_ops_permission("procurement.vendor.manage")
def create_procurement_vendor_contact(
    company_id,
    vendor_id,
):
    try:
        row=db_service.create_ops_vendor_contact(
            company_id,
            vendor_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),201

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.patch(
    "/procurement/vendors/<int:vendor_id>/contacts/<int:contact_id>"
)
@require_auth
@require_ops_permission("procurement.vendor.manage")
def update_procurement_vendor_contact(
    company_id,
    vendor_id,
    contact_id,
):
    try:
        row=db_service.update_ops_vendor_contact(
            company_id,
            vendor_id,
            contact_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400
    
@ops_bp.patch("/procurement/vendors/<int:vendor_id>")
@require_auth
@require_ops_permission("procurement.vendor.manage")
def update_procurement_vendor(company_id,vendor_id):
    try:
        row=db_service.save_ops_vendor_profile(
            company_id,
            vendor_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.get("/procurement/settings")
@require_auth
@require_ops_permission("procurement.settings.view")
def procurement_settings(company_id):
    try:
        return jsonify(
            db_service.get_ops_procurement_settings(
                company_id
            )
        ),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),404


@ops_bp.patch("/procurement/settings")
@require_auth
@require_ops_permission("procurement.settings.manage")
def update_procurement_settings(company_id):
    try:
        row=db_service.save_ops_procurement_settings(
            company_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post("/procurement/settings/test-email")
@require_auth
@require_ops_permission("procurement.email.test")
def test_procurement_email(company_id):
    body=request.get_json(silent=True) or {}

    try:
        row=db_service.test_ops_procurement_email(
            company_id,
            recipient_email=body.get(
                "recipient_email"
            ),
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400
@ops_bp.post("/procurement/<int:case_id>/sourcing")
@require_auth
@require_ops_permission("sourcing.create")
def create_sourcing_event(company_id,case_id):
    try:
        row=db_service.create_ops_sourcing_event(
            company_id,
            case_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),201

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.get("/sourcing/<int:event_id>")
@require_auth
@require_ops_permission("sourcing.view")
def sourcing_event(company_id,event_id):
    try:
        return jsonify(
            db_service.get_ops_sourcing_event(
                company_id,
                event_id,
            )
        ),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),404


@ops_bp.patch("/sourcing/<int:event_id>")
@require_auth
@require_ops_permission("sourcing.edit")
def update_sourcing_event(company_id,event_id):
    try:
        row=db_service.update_ops_sourcing_event(
            company_id,
            event_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.patch(
    "/sourcing/<int:event_id>/items/<int:item_id>"
)
@require_auth
@require_ops_permission("sourcing.edit")
def update_sourcing_item(
    company_id,
    event_id,
    item_id,
):
    try:
        row=db_service.update_ops_sourcing_item(
            company_id,
            event_id,
            item_id,
            payload=request.get_json(silent=True) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.get("/sourcing/<int:event_id>/eligible-vendors")
@require_auth
@require_ops_permission("sourcing.vendor.manage")
def eligible_sourcing_vendors(
    company_id,
    event_id,
):
    return jsonify({
        "rows":
            db_service.list_ops_eligible_sourcing_vendors(
                company_id,
                event_id,
            )
    }),200


@ops_bp.post(
    "/sourcing/<int:event_id>/vendors/<int:vendor_id>"
)
@require_auth
@require_ops_permission("sourcing.vendor.manage")
def add_sourcing_vendor(
    company_id,
    event_id,
    vendor_id,
):
    try:
        row=db_service.add_ops_sourcing_vendor(
            company_id,
            event_id,
            vendor_id,
            actor_user_id=_uid(),
        )

        return jsonify(row),201

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.delete(
    "/sourcing/<int:event_id>/vendors/<int:vendor_id>"
)
@require_auth
@require_ops_permission("sourcing.vendor.manage")
def remove_sourcing_vendor(
    company_id,
    event_id,
    vendor_id,
):
    try:
        return jsonify(
            db_service.remove_ops_sourcing_vendor(
                company_id,
                event_id,
                vendor_id,
            )
        ),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post("/sourcing/<int:event_id>/issue")
@require_auth
@require_ops_permission("sourcing.issue")
def issue_sourcing_rfq(company_id,event_id):
    try:
        row=db_service.issue_ops_rfq(
            company_id,
            event_id,
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.get("/procurement/<int:case_id>")
@require_auth
@require_ops_permission("procurement.view")
def procurement_case(company_id,case_id):
    try:
        return jsonify(
            db_service.get_ops_procurement_case(
                company_id,
                case_id,
            )
        ),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),404