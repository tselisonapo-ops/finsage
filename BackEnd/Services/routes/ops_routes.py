from pathlib import Path
from werkzeug.utils import secure_filename
import uuid
import hashlib

from flask import Blueprint,current_app,jsonify,request,send_file,g
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.ops_auth import require_ops_access,require_ops_permission, require_vendor_portal_auth

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


@ops_bp.post(
    "/vendor-portal/quotes/<int:quote_id>/documents"
)
@require_vendor_portal_auth
def vendor_portal_upload_quote_document(
    company_id,
    quote_id,
):
    user=g.vendor_portal_user
    schema=db_service.company_schema(
        company_id
    )

    file=request.files.get("file")

    if not file or not file.filename:
        return jsonify({
            "error":"Document file is required."
        }),400

    quote=db_service.fetch_one(
        f"""
        SELECT *
        FROM {schema}.ops_vendor_quotes
        WHERE company_id=%s
        AND id=%s
        AND vendor_id=%s
        AND status='draft'
        LIMIT 1;
        """,
        (
            company_id,
            quote_id,
            user["vendor_id"],
        ),
    )

    if not quote:
        return jsonify({
            "error":"Draft quotation not found."
        }),404

    filename=secure_filename(
        file.filename
    )

    ext=Path(
        filename
    ).suffix.lower()

    allowed={
        ".pdf",
        ".png",
        ".jpg",
        ".jpeg",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
    }

    if ext not in allowed:
        return jsonify({
            "error":"Unsupported document type."
        }),400

    root=Path(current_app.root_path)

    directory=(
        root
        /"static"
        /"generated"
        /"ops"
        /f"company_{company_id}"
        /"vendor-quotes"
        /str(quote_id)
    )

    directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    stored_name=(
        f"{uuid.uuid4().hex}_{filename}"
    )

    path=directory/stored_name

    file.save(str(path))

    data=path.read_bytes()

    relative=str(
        path.relative_to(root)
    ).replace("\\","/")

    row=db_service.fetch_one(
        f"""
        INSERT INTO {schema}.ops_vendor_quote_documents(
            company_id,
            quote_id,
            document_type,
            file_name,
            storage_path,
            mime_type,
            file_size,
            checksum_sha256,
            uploaded_by_portal_user_id
        )
        VALUES(
            %s,%s,%s,%s,%s,
            %s,%s,%s,%s
        )
        RETURNING *;
        """,
        (
            company_id,
            quote_id,
            (
                request.form.get(
                    "document_type"
                )
                or "quotation"
            ),
            filename,
            relative,
            file.mimetype,
            len(data),
            hashlib.sha256(
                data
            ).hexdigest(),
            user["id"],
        ),
    )

    return jsonify(row),201

@ops_bp.get(
    "/vendor-portal/invite/<token>"
)
def vendor_portal_invite(
    company_id,
    token,
):
    try:
        row=db_service.get_ops_vendor_portal_invite(
            company_id,
            token,
        )


        return jsonify(row),200


    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post(
    "/vendor-portal/invite/<token>/accept"
)
def vendor_portal_accept_invite(
    company_id,
    token,
):
    try:
        row=db_service.accept_ops_vendor_portal_invite(
            company_id,
            token=token,
            payload=request.get_json(
                silent=True
            ) or {},
        )


        return jsonify(row),200


    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post(
    "/vendor-portal/signin"
)
def vendor_portal_signin(
    company_id,
):
    body=request.get_json(
        silent=True
    ) or {}


    try:
        row=db_service.signin_ops_vendor_portal(
            company_id,
            email=body.get("email"),
            password=body.get("password"),
        )


        return jsonify(row),200


    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),401

@ops_bp.get(
    "/vendor-portal/session"
)
@require_vendor_portal_auth
def vendor_portal_session(
    company_id,
):
    user=g.vendor_portal_user


    company=db_service.fetch_one(
        """
        SELECT
            id,
            name,
            logo_url,
            company_email,
            company_phone,
            currency
        FROM public.companies
        WHERE id=%s;
        """,
        (company_id,),
    )


    vendor=db_service.fetch_one(
        f"""
        SELECT
            id,
            name,
            email,
            phone,
            registration_no,
            tax_number,
            vat_number
        FROM {db_service.company_schema(company_id)}.vendors
        WHERE id=%s;
        """,
        (user["vendor_id"],),
    )


    return jsonify({
        "user":{
            "id":user["id"],
            "email":user["email"],
            "first_name":user["first_name"],
            "last_name":user["last_name"],
        },
        "vendor":vendor,
        "company":company,
    }),200

@ops_bp.get(
    "/vendor-portal/rfqs"
)
@require_vendor_portal_auth
def vendor_portal_rfqs(
    company_id,
):
    user=g.vendor_portal_user


    return jsonify({
        "rows":
            db_service.list_ops_vendor_portal_rfqs(
                company_id,
                vendor_id=user["vendor_id"],
            )
    }),200


@ops_bp.get(
    "/vendor-portal/rfqs/<int:event_id>"
)
@require_vendor_portal_auth
def vendor_portal_rfq(
    company_id,
    event_id,
):
    user=g.vendor_portal_user


    try:
        return jsonify(
            db_service.get_ops_vendor_portal_rfq(
                company_id,
                event_id,
                vendor_id=user["vendor_id"],
            )
        ),200


    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),404

@ops_bp.patch(
    "/vendor-portal/quotes/<int:quote_id>"
)
@require_vendor_portal_auth
def vendor_portal_save_quote(
    company_id,
    quote_id,
):
    user=g.vendor_portal_user


    try:
        row=db_service.save_ops_vendor_quote(
            company_id,
            quote_id,
            vendor_id=user["vendor_id"],
            portal_user_id=user["id"],
            payload=request.get_json(
                silent=True
            ) or {},
        )


        return jsonify(row),200


    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post(
    "/vendor-portal/quotes/<int:quote_id>/submit"
)
@require_vendor_portal_auth
def vendor_portal_submit_quote(
    company_id,
    quote_id,
):
    user=g.vendor_portal_user


    try:
        row=db_service.submit_ops_vendor_quote(
            company_id,
            quote_id,
            vendor_id=user["vendor_id"],
            portal_user_id=user["id"],
        )


        return jsonify(row),200


    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.patch("/vendor-portal/profile")
@require_vendor_portal_auth
def vendor_portal_update_profile(company_id):
    user=g.vendor_portal_user

    try:
        row=db_service.update_ops_vendor_portal_profile(
            company_id,
            int(user["id"]),
            payload=request.get_json(
                silent=True
            ) or {},
        )

        return jsonify({
            "ok":True,
            "message":"Profile updated.",
            "user":row,
        }),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.get(
    "/companies/sourcing-events/<int:event_id>/comparison"
)
@require_auth
def api_ops_quote_comparison(
    company_id,
    event_id,
):
    try:
        return jsonify(
            db_service.get_ops_quote_comparison(
                company_id,
                event_id,
            )
        ),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post(
    "/companies/sourcing-events/<int:event_id>/evaluation/start"
)
@require_auth
def api_ops_start_evaluation(
    company_id,
    event_id,
):
    user=g.current_user

    try:
        row=db_service.start_ops_sourcing_evaluation(
            company_id,
            event_id,
            actor_user_id=int(user["id"]),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post(
    "/companies/sourcing-events/<int:event_id>/evaluation/calculate"
)
@require_auth
def api_ops_calculate_evaluation(
    company_id,
    event_id,
):
    try:
        return jsonify(
            db_service.calculate_ops_evaluation_results(
                company_id,
                event_id,
            )
        ),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.put(
    "/companies/sourcing-events/<int:event_id>/evaluation/scores"
)
@require_auth
def api_ops_save_evaluation_score(
    company_id,
    event_id,
):
    user=g.current_user
    body=request.get_json(
        silent=True
    ) or {}

    try:
        row=db_service.save_ops_evaluation_score(
            company_id,
            event_id,
            quote_id=int(
                body["quote_id"]
            ),
            criterion_id=int(
                body["criterion_id"]
            ),
            evaluator_user_id=int(
                user["id"]
            ),
            payload=body,
        )

        return jsonify(row),200

    except (
        KeyError,
        TypeError,
        ValueError
    ) as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post(
    "/companies/sourcing-events/<int:event_id>/evaluation/declaration"
)
@require_auth
def api_ops_evaluation_declaration(
    company_id,
    event_id,
):
    user=g.current_user
    body=request.get_json(
        silent=True
    ) or {}

    try:
        row=db_service.declare_ops_sourcing_conflict(
            company_id,
            event_id,
            evaluator_user_id=int(
                user["id"]
            ),
            has_conflict=bool(
                body.get("has_conflict")
            ),
            declaration_text=
                body.get(
                    "declaration_text"
                ),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.post(
    "/companies/sourcing-events/<int:event_id>/recommend"
)
@require_auth
def api_ops_recommend_vendor(
    company_id,
    event_id,
):
    user=g.current_user
    body=request.get_json(
        silent=True
    ) or {}

    try:
        row=db_service.recommend_ops_vendor(
            company_id,
            event_id,
            quote_id=int(
                body["quote_id"]
            ),
            actor_user_id=int(
                user["id"]
            ),
            reason=body.get(
                "reason"
            ),
        )

        return jsonify(row),200

    except (
        KeyError,
        TypeError,
        ValueError
    ) as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.post("/sourcing-events/<int:event_id>/award")
@require_auth
@require_ops_permission("award.create")
def create_vendor_award(company_id,event_id):
    body=request.get_json(
        silent=True
    ) or {}

    try:
        row=db_service.create_ops_award_request(
            company_id,
            event_id,
            actor_user_id=_uid(),
            deviation_reason=body.get(
                "deviation_reason"
            ),
        )

        return jsonify(row),201

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.get("/awards/<int:award_id>")
@require_auth
@require_ops_permission("award.view")
def get_vendor_award(company_id,award_id):
    try:
        return jsonify(
            db_service.get_ops_award(
                company_id,
                award_id,
            )
        ),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),404


@ops_bp.post("/awards/<int:award_id>/submit")
@require_auth
@require_ops_permission("award.submit")
def submit_vendor_award(company_id,award_id):
    body=request.get_json(
        silent=True
    ) or {}

    try:
        row=db_service.submit_ops_award(
            company_id,
            award_id,
            actor_user_id=_uid(),
            award_reason=body.get(
                "award_reason"
            ),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.get("/award-approvals")
@require_auth
@require_ops_permission("award.approve")
def award_approval_inbox(company_id):
    return jsonify({
        "rows":
            db_service.list_ops_award_approvals(
                company_id,
                user_id=_uid(),
            )
    }),200


@ops_bp.post("/award-approvals/<int:task_id>/decision")
@require_auth
@require_ops_permission("award.approve")
def decide_vendor_award(company_id,task_id):
    body=request.get_json(
        silent=True
    ) or {}

    try:
        row=db_service.decide_ops_award_approval(
            company_id,
            task_id,
            actor_user_id=_uid(),
            decision=body.get("decision"),
            comment=body.get("comment"),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.post("/awards/<int:award_id>/purchase-order")
@require_auth
@require_ops_permission("po.create")
def create_purchase_order(company_id,award_id):
    try:
        row=db_service.create_ops_purchase_order(
            company_id,
            award_id,
            actor_user_id=_uid(),
        )

        return jsonify(row),201

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.get("/purchase-orders/<int:po_id>")
@require_auth
@require_ops_permission("po.view")
def get_purchase_order(company_id,po_id):
    try:
        row=db_service.get_ops_purchase_order(
            company_id,
            po_id,
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),404


@ops_bp.patch("/purchase-orders/<int:po_id>")
@require_auth
@require_ops_permission("po.edit")
def update_purchase_order(company_id,po_id):
    try:
        row=db_service.update_ops_purchase_order(
            company_id,
            po_id,
            payload=request.get_json(
                silent=True
            ) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post("/purchase-orders/<int:po_id>/issue")
@require_auth
@require_ops_permission("po.issue")
def issue_purchase_order(company_id,po_id):
    try:
        row=db_service.issue_ops_purchase_order(
            company_id,
            po_id,
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post("/purchase-orders/<int:po_id>/send")
@require_auth
@require_ops_permission("po.issue")
def send_purchase_order(company_id,po_id):
    try:
        row=db_service.send_ops_purchase_order(
            company_id,
            po_id,
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post("/purchase-orders/<int:po_id>/cancel")
@require_auth
@require_ops_permission("po.cancel")
def cancel_purchase_order(company_id,po_id):
    body=request.get_json(
        silent=True
    ) or {}

    try:
        row=db_service.cancel_ops_purchase_order(
            company_id,
            po_id,
            actor_user_id=_uid(),
            reason=body.get("reason"),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.get("/vendor-portal/purchase-orders")
@require_vendor_portal_auth
def vendor_portal_purchase_orders(company_id):
    user=g.vendor_portal_user

    return jsonify({
        "rows":
            db_service.list_ops_vendor_portal_purchase_orders(
                company_id,
                vendor_id=user["vendor_id"],
            )
    }),200


@ops_bp.get("/vendor-portal/purchase-orders/<int:po_id>")
@require_vendor_portal_auth
def vendor_portal_purchase_order(company_id,po_id):
    user=g.vendor_portal_user

    try:
        row=db_service.get_ops_vendor_portal_purchase_order(
            company_id,
            po_id,
            vendor_id=user["vendor_id"],
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),404


@ops_bp.post("/vendor-portal/purchase-orders/<int:po_id>/acknowledge")
@require_vendor_portal_auth
def vendor_portal_acknowledge_purchase_order(
    company_id,
    po_id,
):
    user=g.vendor_portal_user
    body=request.get_json(
        silent=True
    ) or {}

    try:
        row=db_service.acknowledge_ops_purchase_order(
            company_id,
            po_id,
            vendor_id=user["vendor_id"],
            portal_user_id=user["id"],
            decision=body.get("decision"),
            comment=body.get("comment"),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.post("/purchase-orders/<int:po_id>/receipts")
@require_auth
@require_ops_permission("receipt.create")
def create_receipt(company_id,po_id):
    try:
        row=db_service.create_ops_receipt(
            company_id,
            po_id,
            actor_user_id=_uid(),
        )

        return jsonify(row),201

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.get("/receipts/<int:receipt_id>")
@require_auth
@require_ops_permission("receipt.view")
def get_receipt(company_id,receipt_id):
    try:
        return jsonify(
            db_service.get_ops_receipt(
                company_id,
                receipt_id,
            )
        ),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),404


@ops_bp.patch("/receipts/<int:receipt_id>")
@require_auth
@require_ops_permission("receipt.create")
def update_receipt(company_id,receipt_id):
    try:
        row=db_service.update_ops_receipt(
            company_id,
            receipt_id,
            payload=request.get_json(
                silent=True
            ) or {},
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.put("/receipts/<int:receipt_id>/service-confirmation")
@require_auth
@require_ops_permission("receipt.create")
def save_service_confirmation(company_id,receipt_id):
    try:
        row=db_service.save_ops_service_confirmation(
            company_id,
            receipt_id,
            actor_user_id=_uid(),
            payload=request.get_json(
                silent=True
            ) or {},
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.put("/receipts/<int:receipt_id>/asset-lines/<int:po_line_id>")
@require_auth
@require_ops_permission("receipt.create")
def save_asset_receipt(
    company_id,
    receipt_id,
    po_line_id,
):
    try:
        row=db_service.save_ops_asset_receipt(
            company_id,
            receipt_id,
            purchase_order_line_id=
                po_line_id,
            payload=request.get_json(
                silent=True
            ) or {},
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.put("/receipts/<int:receipt_id>/lease")
@require_auth
@require_ops_permission("receipt.create")
def save_lease_receipt(company_id,receipt_id):
    try:
        row=db_service.save_ops_lease_receipt(
            company_id,
            receipt_id,
            payload=request.get_json(
                silent=True
            ) or {},
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.post("/receipts/<int:receipt_id>/submit")
@require_auth
@require_ops_permission("receipt.create")
def submit_receipt(company_id,receipt_id):
    try:
        row=db_service.submit_ops_receipt(
            company_id,
            receipt_id,
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post("/receipts/<int:receipt_id>/verify")
@require_auth
@require_ops_permission("receipt.verify")
def verify_receipt(company_id,receipt_id):
    body=request.get_json(
        silent=True
    ) or {}

    try:
        row=db_service.verify_ops_receipt(
            company_id,
            receipt_id,
            actor_user_id=_uid(),
            comment=body.get(
                "comment"
            ),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400


@ops_bp.post("/receipts/<int:receipt_id>/reject")
@require_auth
@require_ops_permission("receipt.reject")
def reject_receipt(company_id,receipt_id):
    body=request.get_json(
        silent=True
    ) or {}

    try:
        row=db_service.reject_ops_receipt(
            company_id,
            receipt_id,
            actor_user_id=_uid(),
            reason=body.get(
                "reason"
            ),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({
            "error":str(e)
        }),400

@ops_bp.get("/accounts-payable/invoices")
@require_auth
@require_ops_permission("invoice.view")
def ap_invoices(company_id):
    return jsonify({
        "rows":db_service.list_ops_ap_invoices(company_id,status=request.args.get("status"))
    }),200


@ops_bp.post("/purchase-orders/<int:po_id>/invoices")
@require_auth
@require_ops_permission("invoice.create")
def create_vendor_invoice(company_id,po_id):
    try:
        row=db_service.create_ops_vendor_invoice(
            company_id,po_id,actor_user_id=_uid(),
            payload=request.get_json(silent=True) or {},
        )
        return jsonify(row),201
    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.get("/invoices/<int:invoice_id>")
@require_auth
@require_ops_permission("invoice.view")
def get_vendor_invoice(company_id,invoice_id):
    try:
        return jsonify(db_service.get_ops_vendor_invoice(company_id,invoice_id)),200
    except ValueError as e:
        return jsonify({"error":str(e)}),404


@ops_bp.post("/invoices/<int:invoice_id>/submit")
@require_auth
@require_ops_permission("invoice.create")
def submit_vendor_invoice(company_id,invoice_id):
    try:
        return jsonify(db_service.submit_ops_vendor_invoice(
            company_id,invoice_id,actor_user_id=_uid()
        )),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.post("/invoices/<int:invoice_id>/match")
@require_auth
@require_ops_permission("invoice.match")
def match_vendor_invoice(company_id,invoice_id):
    try:
        return jsonify(db_service.match_ops_vendor_invoice(
            company_id,invoice_id,actor_user_id=_uid()
        )),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.patch("/invoices/<int:invoice_id>/review")
@require_auth
@require_ops_permission("invoice.review")
def review_vendor_invoice(company_id,invoice_id):
    try:
        return jsonify(db_service.review_ops_vendor_invoice(
            company_id,invoice_id,actor_user_id=_uid(),
            payload=request.get_json(silent=True) or {},
        )),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.post("/invoice-exceptions/<int:exception_id>/resolve")
@require_auth
@require_ops_permission("invoice.review")
def resolve_invoice_exception(company_id,exception_id):
    body=request.get_json(silent=True) or {}
    try:
        return jsonify(db_service.resolve_ops_invoice_exception(
            company_id,exception_id,actor_user_id=_uid(),
            resolution_comment=body.get("comment"),
            waive=bool(body.get("waive")),
        )),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.post("/invoices/<int:invoice_id>/accept")
@require_auth
@require_ops_permission("invoice.accept")
def accept_vendor_invoice(company_id,invoice_id):
    try:
        return jsonify(db_service.accept_ops_vendor_invoice(
            company_id,invoice_id,actor_user_id=_uid()
        )),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.post("/invoices/<int:invoice_id>/reject")
@require_auth
@require_ops_permission("invoice.reject")
def reject_vendor_invoice(company_id,invoice_id):
    body=request.get_json(silent=True) or {}
    try:
        return jsonify(db_service.reject_ops_vendor_invoice(
            company_id,invoice_id,actor_user_id=_uid(),reason=body.get("reason")
        )),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.post("/vendor-portal/purchase-orders/<int:po_id>/invoices")
@require_vendor_portal_auth
def vendor_portal_create_invoice(company_id,po_id):
    user=g.vendor_portal_user
    try:
        row=db_service.create_ops_vendor_invoice(
            company_id,po_id,
            portal_user_id=user["id"],
            vendor_id=user["vendor_id"],
            payload=request.get_json(silent=True) or {},
        )
        return jsonify(row),201
    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.get("/vendor-portal/invoices")
@require_vendor_portal_auth
def vendor_portal_invoices(company_id):
    user=g.vendor_portal_user
    schema=db_service.company_schema(company_id)

    rows=db_service.fetch_all(
        f"""SELECT i.*,po.po_no
            FROM {schema}.ops_vendor_invoices i
            LEFT JOIN {schema}.ops_purchase_orders po ON po.id=i.purchase_order_id
            WHERE i.company_id=%s AND i.vendor_id=%s
            ORDER BY i.invoice_date DESC,i.id DESC;""",
        (company_id,user["vendor_id"]),
    ) or []

    return jsonify({"rows":rows}),200


@ops_bp.get("/vendor-portal/invoices/<int:invoice_id>")
@require_vendor_portal_auth
def vendor_portal_invoice(company_id,invoice_id):
    user=g.vendor_portal_user
    data=db_service.get_ops_vendor_invoice(company_id,invoice_id)

    if int(data["invoice"]["vendor_id"])!=int(user["vendor_id"]):
        return jsonify({"error":"Invoice not found."}),404

    return jsonify(data),200


@ops_bp.post("/vendor-portal/invoices/<int:invoice_id>/submit")
@require_vendor_portal_auth
def vendor_portal_submit_invoice(company_id,invoice_id):
    user=g.vendor_portal_user

    try:
        data=db_service.get_ops_vendor_invoice(company_id,invoice_id)
        if int(data["invoice"]["vendor_id"])!=int(user["vendor_id"]):
            return jsonify({"error":"Invoice not found."}),404

        return jsonify(db_service.submit_ops_vendor_invoice(
            company_id,invoice_id,portal_user_id=user["id"]
        )),200

    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.get("/finance/context")
@require_auth
@require_ops_permission("finance.view")
def finance_context(company_id):
    return jsonify(
        db_service.get_ops_finance_navigation(company_id,user_id=_uid())
    ),200


@ops_bp.get("/finance/overview")
@require_auth
@require_ops_permission("finance.view")
def finance_overview(company_id):
    return jsonify(
        db_service.get_ops_finance_overview(company_id,user_id=_uid())
    ),200


@ops_bp.get("/finance/my-work")
@require_auth
@require_ops_permission("finance.work.view")
def finance_my_work(company_id):
    return jsonify({
        "rows":db_service.list_ops_finance_work_items(company_id,user_id=_uid())
    }),200

@ops_bp.get("/finance/payables/summary")
@require_auth
@require_ops_permission("finance.view")
def finance_payables_summary(company_id):
    return jsonify(db_service.get_ops_ap_summary(company_id)),200


@ops_bp.get("/finance/payables/<string:queue>")
@require_auth
@require_ops_permission("invoice.view")
def finance_payables_queue(company_id,queue):
    try:
        return jsonify({"rows":db_service.list_ops_ap_queue(company_id,queue=queue)}),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.put("/invoices/<int:invoice_id>/coding")
@require_auth
@require_ops_permission("ap.coding.manage")
def save_invoice_coding(company_id,invoice_id):
    body=request.get_json(silent=True) or {}

    try:
        row=db_service.save_ops_invoice_line_coding(
            company_id,invoice_id,
            lines=body.get("lines") or [],
            actor_user_id=_uid(),
        )
        return jsonify(row),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.get("/invoices/<int:invoice_id>/accounting-handoff")
@require_auth
@require_ops_permission("ap.handoff")
def preview_invoice_accounting_handoff(company_id,invoice_id):
    try:
        payload=db_service.build_ops_invoice_ap_payload(
            company_id,
            invoice_id,
        )

        invoice=payload.pop("invoice")

        return jsonify({
            "invoice":{
                "id":invoice["id"],
                "invoice_no":invoice.get("invoice_no"),
                "supplier_invoice_no":invoice.get("supplier_invoice_no"),
                "vendor_name":invoice.get("vendor_name"),
                "po_no":invoice.get("po_no"),
            },
            **payload,
        }),200

    except ValueError as e:
        return jsonify({"error":str(e)}),400

@ops_bp.post("/invoices/<int:invoice_id>/accounting-handoff")
@require_auth
@require_ops_permission("ap.handoff")
def handoff_invoice_to_accounting(company_id,invoice_id):
    try:
        row=db_service.handoff_ops_invoice_to_ap(
            company_id,
            invoice_id,
            actor_user_id=_uid(),
        )

        return jsonify(row),200

    except ValueError as e:
        return jsonify({"error":str(e)}),400

    except Exception as e:
        current_app.logger.exception(
            "Nexus → FinSage AP handoff failed"
        )

        return jsonify({
            "error":"Could not create FinSage AP bill.",
            "detail":str(e),
        }),500

@ops_bp.get("/invoices/<int:invoice_id>/accounting-status")
@require_auth
@require_ops_permission("finance.view")
def invoice_accounting_status(company_id,invoice_id):
    schema=db_service.company_schema(company_id)

    row=db_service.fetch_one(
        f"""
        SELECT
            accounting_handoff_status,
            accounting_bill_id,
            accounting_bill_no,
            accounting_handed_off_at,
            accounting_handoff_error
        FROM {schema}.ops_vendor_invoices
        WHERE company_id=%s
          AND id=%s;
        """,
        (int(company_id),int(invoice_id)),
    )

    if not row:
        return jsonify({"error":"Invoice not found."}),404

    if row.get("accounting_bill_id"):
        bill=db_service.get_bill_full(
            company_id,
            int(row["accounting_bill_id"]),
        ) or {}

        row["bill_status"]=bill.get("status")
        row["posted_journal_id"]=bill.get("posted_journal_id")

    return jsonify(row),200

@ops_bp.get("/invoices/<int:invoice_id>/payment-eligibility")
@require_auth
@require_ops_permission("payment_voucher.view")
def invoice_payment_eligibility(company_id,invoice_id):
    try:
        return jsonify(
            db_service.get_ops_payment_eligibility(
                company_id,
                invoice_id,
            )
        ),200
    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.post("/invoices/<int:invoice_id>/payment-vouchers")
@require_auth
@require_ops_permission("payment_voucher.create")
def create_payment_voucher(company_id,invoice_id):
    body=request.get_json(silent=True) or {}

    try:
        row=db_service.create_ops_payment_voucher(
            company_id,
            invoice_id,
            actor_user_id=_uid(),
            payload=body,
        )

        return jsonify(row),201

    except ValueError as e:
        return jsonify({"error":str(e)}),400


@ops_bp.get("/payment-vouchers/<int:voucher_id>")
@require_auth
@require_ops_permission("payment_voucher.view")
def payment_voucher(company_id,voucher_id):
    row=db_service.get_ops_payment_voucher(
        company_id,
        voucher_id,
    )

    if not row:
        return jsonify({"error":"Payment voucher not found."}),404

    return jsonify(row),200

@ops_bp.get("/finance/payables/payment-vouchers")
@require_auth
@require_ops_permission("payment_voucher.view")
def list_payment_vouchers(company_id):
    try:
        rows=db_service.list_ops_payment_vouchers(
            company_id,
            status=request.args.get("status"),
            q=request.args.get("q"),
        )

        return jsonify({
            "items":rows,
            "count":len(rows),
        }),200

    except ValueError as e:
        return jsonify({"error":str(e)}),400