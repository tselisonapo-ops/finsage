from pathlib import Path
from werkzeug.utils import secure_filename
import uuid
import hashlib
import json
from datetime import date, datetime, time, timedelta
from dateutil.relativedelta import relativedelta
# ===== REQUIRED IMPORTS =====
import math                    # ✅ For math.ceil() on line 898
from datetime import datetime, date  # ✅ For date operations
from flask import jsonify, request, g  # ✅ For Flask response helpers
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

@ops_bp.get("/receipts/<int:receipt_id>/lines")
@require_auth
@require_ops_permission("procurement.receipts.view")
def receipt_lines(company_id, receipt_id):
    """Get all lines for a receipt (partial receipt support)"""
    schema = db_service.company_schema(company_id)
    
    # ✅ FIXED: Uses po_line_id (your table's FK column name)
    lines = db_service.fetch_all(f"""
        SELECT 
            rl.*,
            pol.item_code,
            pol.item_description,
            pol.unit_of_measure,
            pol.quantity AS po_line_quantity_ordered,
            po.purchase_order_number
        FROM {schema}.ops_receipt_lines rl
        JOIN {schema}.ops_purchase_order_lines pol ON pol.id = rl.po_line_id
        JOIN {schema}.ops_purchase_orders po ON po.id = pol.purchase_order_id
        WHERE rl.receipt_id = %s
        ORDER BY rl.id;
    """, (receipt_id,))
    
    if not lines:
        # Check if receipt exists
        receipt = db_service.fetch_one(
            f"SELECT id FROM {schema}.ops_receipts WHERE id = %s AND company_id = %s;",
            (receipt_id, company_id)
        )
        if not receipt:
            return jsonify({"error": "Receipt not found"}), 404
        lines = []
    
    return jsonify({"rows": lines}), 200


@ops_bp.patch("/receipts/<int:receipt_id>/lines/<int:line_id>")
@require_auth
@require_ops_permission("procurement.receipts.edit")
def update_receipt_line(company_id, receipt_id, line_id):
    """Update a specific receipt line (qty received, accepted, rejected)"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    # Validate line exists and belongs to this receipt
    line = db_service.fetch_one(f"""
        SELECT rl.*, r.status as receipt_status
        FROM {schema}.ops_receipt_lines rl
        JOIN {schema}.ops_receipts r ON r.id = rl.receipt_id
        WHERE rl.id = %s AND rl.receipt_id = %s AND r.company_id = %s;
    """, (line_id, receipt_id, company_id))
    
    if not line:
        return jsonify({"error": "Receipt line not found"}), 404
    
    if line.get("receipt_status") in ("submitted", "verified", "completed"):
        return jsonify({"error": "Cannot modify line on submitted/verified receipt"}), 400
    
    # ✅ FIXED: Use YOUR table's actual column names
    allowed_fields = {
        "quantity_received",     # ✓ Your table: quantity_received
        "quantity_accepted",     # ✓ Your table: quantity_accepted  
        "quantity_rejected",     # ✓ Your table: quantity_rejected
        "batch_number",          # ✓ Your table: batch_number
        "serial_numbers",        # ✓ Your table: serial_numbers (TEXT[])
        "expiry_date",           # ✓ Your table: expiry_date
        "condition_on_receipt",  # ✓ Your table: condition_on_receipt
        "location_id",           # ✓ Your table: location_id
        "location_description",  # ✓ Your table: location_description
        "warehouse_zone",        # ✓ Your table: warehouse_zone
        "status",                # ✓ Your table: status
        "rejection_reason",      # ✓ Your table: rejection_reason
        "rejection_code",        # ✓ Your table: rejection_code
        "notes"                  # ✓ Your table: notes
    }
    
    data = {k: v for k, v in payload.items() if k in allowed_fields}
    
    if not data:
        return jsonify({"error": "No valid fields to update"}), 400
    
    # Build update query dynamically from allowed fields
    cols = []
    vals = []
    for k, v in data.items():
        cols.append(f"{k} = %s")
        vals.append(v)
    vals.extend([line_id])
    
    updated = db_service.fetch_one(f"""
        UPDATE {schema}.ops_receipt_lines
        SET {', '.join(cols)}, updated_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, tuple(vals))
    
    # Log the change
    db_service.append_ops_event(
        company_id,
        event_type="receipt_line.updated",
        module="procurement",
        entity_type="receipt_line",
        entity_id=line_id,
        action="update",
        actor_user_id=_uid(),
        after_json=updated,
        **_audit_meta()
    )
    
    return jsonify(updated), 200


@ops_bp.post("/receipts/<int:receipt_id>/lines")
@require_auth
@require_ops_permission("procurement.receipts.edit")
def add_receipt_line(company_id, receipt_id):
    """Add a new line to an existing receipt (for unplanned items)"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    # Validate receipt exists and is editable
    receipt = db_service.fetch_one(f"""
        SELECT * FROM {schema}.ops_receipts 
        WHERE id = %s AND company_id = %s;
    """, (receipt_id, company_id))
    
    if not receipt:
        return jsonify({"error": "Receipt not found"}), 404
    
    if receipt.get("status") in ("submitted", "verified", "completed"):
        return jsonify({"error": "Cannot add lines to submitted/verified receipt"}), 400
    
    # ✅ FIXED: Use po_line_id (your table's FK column)
    po_line_id = payload.get("po_line_id")
    if not po_line_id:
        return jsonify({"error": "po_line_id is required"}), 400
    
    # Verify PO line exists and belongs to same PO as receipt
    po_line = db_service.fetch_one(f"""
        SELECT pol.* 
        FROM {schema}.ops_purchase_order_lines pol
        JOIN {schema}.ops_purchase_orders po ON po.id = pol.purchase_order_id
        WHERE pol.id = %s AND po.id = %s;
    """, (po_line_id, receipt.get("purchase_order_id")))
    
    if not po_line:
        return jsonify({"error": "PO line not found or does not belong to this receipt's PO"}), 400
    
    try:
        # ✅ FIXED: Use YOUR table's actual column names
        new_line = db_service.fetch_one(f"""
            INSERT INTO {schema}.ops_receipt_lines (
                receipt_id, 
                po_line_id,                    -- ✓ Your FK column
                quantity_ordered,              -- ✓ Your column
                quantity_received,             -- ✓ Your column
                quantity_accepted,             -- ✓ Your column
                quantity_rejected,             -- ✓ Your column
                unit_cost,                     -- ✓ Your column
                batch_number,                  -- ✓ Your column
                expiry_date,                   -- ✓ Your column
                condition_on_receipt,          -- ✓ Your column (CHECK constraint)
                location_id,                   -- ✓ Your column
                notes                          -- ✓ Your column
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING *;
        """, (
            receipt_id,
            po_line_id,                        # po_line_id (not purchase_order_line_id)
            float(po_line.get("quantity") or 0),  # quantity_ordered
            float(payload.get("quantity_received") or 0),
            float(payload.get("quantity_accepted") or payload.get("quantity_received") or 0),
            float(payload.get("quantity_rejected") or 0),
            float(po_line.get("unit_price") or 0),  # unit_cost
            payload.get("batch_number"),
            payload.get("expiry_date"),
            payload.get("condition_on_receipt", "good"),  # Must match CHECK constraint
            payload.get("location_id"),
            payload.get("notes")
        ))
        
        # Log creation
        db_service.append_ops_event(
            company_id,
            event_type="receipt_line.created",
            module="procurement",
            entity_type="receipt_line",
            entity_id=new_line.get("id"),
            action="create",
            actor_user_id=_uid(),
            after_json=new_line,
            **_audit_meta()
        )
        
        return jsonify(new_line), 201
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@ops_bp.delete("/receipts/<int:receipt_id>/lines/<int:line_id>")
@require_auth
@require_ops_permission("procurement.receipts.edit")
def remove_receipt_line(company_id, receipt_id, line_id):
    """Remove a receipt line before submission"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    reason = payload.get("reason", "Removed by user")
    
    # Validate line exists
    line = db_service.fetch_one(f"""
        SELECT rl.*, r.status as receipt_status
        FROM {schema}.ops_receipt_lines rl
        JOIN {schema}.ops_receipts r ON r.id = rl.receipt_id
        WHERE rl.id = %s AND rl.receipt_id = %s AND r.company_id = %s;
    """, (line_id, receipt_id, company_id))
    
    if not line:
        return jsonify({"error": "Receipt line not found"}), 404
    
    if line.get("receipt_status") in ("submitted", "verified", "completed"):
        return jsonify({"error": "Cannot remove line from submitted/verified receipt"}), 400
    
    # Soft delete - mark as disposed (using YOUR status values)
    db_service.execute(f"""
        UPDATE {schema}.ops_receipt_lines
        SET status = 'disposed', 
            rejection_reason = %s,
            updated_at = NOW()
        WHERE id = %s;
    """, (reason, line_id))
    
    # Log removal
    db_service.append_ops_event(
        company_id,
        event_type="receipt_line.removed",
        module="procurement",
        entity_type="receipt_line",
        entity_id=line_id,
        action="delete",
        actor_user_id=_uid(),
        metadata={"reason": reason},
        **_audit_meta()
    )
    
    return jsonify({"message": "Line removed successfully"}), 200


@ops_bp.post("/receipts/<int:receipt_id>/complete-partial")
@require_auth
@require_ops_permission("procurement.receipts.edit")
def complete_partial_receipt(company_id, receipt_id):
    """Complete a partial receipt (mark as done, update PO status)"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    # Get receipt with lines - use YOUR column names
    receipt = db_service.fetch_one(f"""
        SELECT r.*, po.status as po_status, po.vendor_id
        FROM {schema}.ops_receipts r
        JOIN {schema}.ops_purchase_orders po ON po.id = r.purchase_order_id
        WHERE r.id = %s AND r.company_id = %s;
    """, (receipt_id, company_id))
    
    if not receipt:
        return jsonify({"error": "Receipt not found"}), 404
    
    if receipt.get("status") == "completed":
        return jsonify({"error": "Receipt already completed"}), 400
    
    # Get all lines with totals - use YOUR column names
    lines = db_service.fetch_all(f"""
        SELECT 
            rl.*,
            pol.quantity AS po_ordered
        FROM {schema}.ops_receipt_lines rl
        JOIN {schema}.ops_purchase_order_lines pol ON pol.id = rl.po_line_id
        WHERE rl.receipt_id = %s
    """, (receipt_id,))
    
    # Calculate totals using YOUR column names
    total_received = sum(float(l.get("quantity_received") or 0) for l in lines)
    total_accepted = sum(float(l.get("quantity_accepted") or 0) for l in lines)
    total_value = sum(
        (float(l.get("quantity_received") or 0) * float(l.get("unit_cost") or 0)) 
        for l in lines
    )
    
    # Determine new PO status based on quantities received
    all_fully_received = all(
        float(l.get("quantity_received") or 0) >= float(l.get("po_ordered") or 0)
        for l in lines
    ) if lines else False
    
    new_po_status = "received" if all_fully_received else "partially_received"
    
    try:
        with db_service.transaction():
            # Update receipt status
            updated_receipt = db_service.fetch_one(f"""
                UPDATE {schema}.ops_receipts
                SET status = 'completed',
                    total_quantity_received = %s,
                    total_value = %s,
                    completed_at = NOW(),
                    completed_by = %s,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *;
            """, (total_received, total_value, _uid(), receipt_id))
            
            # Update PO status if changed
            if receipt.get("po_status") != new_po_status:
                db_service.execute(f"""
                    UPDATE {schema}.ops_purchase_orders
                    SET status = %s, updated_at = NOW()
                    WHERE id = %s;
                """, (new_po_status, receipt.get("purchase_order_id")))
            
            # Update each PO line's received_quantity using YOUR column names
            for line in lines:
                db_service.execute(f"""
                    UPDATE {schema}.ops_purchase_order_lines
                    SET received_quantity = COALESCE(received_quantity, 0) + %s,
                        updated_at = NOW()
                    WHERE id = %s;
                """, (float(line.get("quantity_received") or 0), line.get("po_line_id")))
        
        # Log completion
        db_service.append_ops_event(
            company_id,
            event_type="receipt.completed",
            module="procurement",
            entity_type="receipt",
            entity_id=receipt_id,
            action="complete",
            actor_user_id=_uid(),
            after_json=updated_receipt,
            metadata={
                "total_received": total_received,
                "total_accepted": total_accepted,
                "total_value": total_value,
                "partial": not all_fully_received
            },
            **_audit_meta()
        )
        
        return jsonify({
            "receipt": updated_receipt,
            "new_po_status": new_po_status,
            "is_partial": not all_fully_received,
            "totals": {
                "received": total_received,
                "accepted": total_accepted,
                "value": total_value
            }
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ============================================================
# RETURNS PROCESSING (7 endpoints)
# ============================================================

@ops_bp.post("/receipts/<int:receipt_id>/returns")
@require_auth
@require_ops_permission("procurement.returns.create")
def create_return(company_id, receipt_id):
    """Create a new return request against a receipt"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    # Verify receipt exists
    receipt = db_service.fetch_one(f"""
        SELECT r.*, po.vendor_id, po.purchase_order_number
        FROM {schema}.ops_receipts r
        JOIN {schema}.ops_purchase_orders po ON po.id = r.purchase_order_id
        WHERE r.id = %s AND r.company_id = %s;
    """, (receipt_id, company_id))
    
    if not receipt:
        return jsonify({"error": "Receipt not found"}), 404
    
    if receipt.get("status") not in ("completed", "verified"):
        return jsonify({"error": "Returns can only be created against completed/verified receipts"}), 400
    
    # Generate return number
    return_number = db_service.fetch_one(f"""
        SELECT {schema}.fn_generate_return_number(%s) AS num;
    """, (company_id,)).get("num")
    
    try:
        new_return = db_service.fetch_one(f"""
            INSERT INTO {schema}.ops_returns (
                company_id, receipt_id, return_number,
                return_reason, return_type, status,
                requested_by, notes
            ) VALUES (
                %s, %s, %s, %s, %s, 'draft', %s, %s
            )
            RETURNING *;
        """, (
            company_id, receipt_id, return_number,
            payload.get("return_reason", "defective"),
            payload.get("return_type", "credit"),
            _uid(),
            payload.get("notes")
        ))
        
        # Create return lines if provided - use YOUR column names
        lines_data = payload.get("lines", [])
        for line_data in lines_data:
            receipt_line_id = line_data.get("receipt_line_id")
            if not receipt_line_id:
                continue
                
            # Verify receipt line exists (uses po_line_id FK)
            rl = db_service.fetch_one(f"""
                SELECT * FROM {schema}.ops_receipt_lines 
                WHERE id = %s AND receipt_id = %s;
            """, (receipt_line_id, receipt_id))
            
            if rl:
                db_service.execute(f"""
                    INSERT INTO {schema}.ops_return_lines (
                        return_id, receipt_line_id,
                        quantity_returned, quantity_accepted,
                        reason_code, reason_detail,
                        unit_value, condition_on_return, disposition
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
                """, (
                    new_return.get("id"),
                    receipt_line_id,
                    line_data.get("quantity_returned", 0),
                    0,  # quantity_accepted initially 0
                    line_data.get("reason_code"),
                    line_data.get("reason_detail"),
                    float(rl.get("unit_cost") or 0),  # Use YOUR column: unit_cost
                    line_data.get("condition_on_return", "as_received"),
                    line_data.get("disposition", "return_to_vendor")
                ))
        
        # Log creation
        db_service.append_ops_event(
            company_id,
            event_type="return.created",
            module="procurement",
            entity_type="return",
            entity_id=new_return.get("id"),
            action="create",
            actor_user_id=_uid(),
            after_json=new_return,
            **_audit_meta()
        )
        
        return jsonify(new_return), 201
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@ops_bp.get("/receipts/<int:receipt_id>/returns")
@require_auth
@require_ops_permission("procurement.returns.view")
def list_returns(company_id, receipt_id):
    """List all returns for a receipt"""
    schema = db_service.company_schema(company_id)
    
    # Verify receipt exists
    receipt = db_service.fetch_one(f"""
        SELECT id FROM {schema}.ops_receipts 
        WHERE id = %s AND company_id = %s;
    """, (receipt_id, company_id))
    
    if not receipt:
        return jsonify({"error": "Receipt not found"}), 404
    
    returns_list = db_service.fetch_all(f"""
        SELECT 
            r.*,
            (SELECT COUNT(*) FROM {schema}.ops_return_lines rl WHERE rl.return_id = r.id) AS line_count,
            (SELECT COALESCE(SUM(rl.total_value), 0) FROM {schema}.ops_return_lines rl WHERE rl.return_id = r.id) AS total_value
        FROM {schema}.ops_returns r
        WHERE r.receipt_id = %s AND r.company_id = %s
        ORDER BY r.created_at DESC;
    """, (receipt_id, company_id))
    
    return jsonify({"rows": returns_list}), 200


@ops_bp.get("/receipts/<int:receipt_id>/returns/<int:return_id>")
@require_auth
@require_ops_permission("procurement.returns.view")
def get_return_detail(company_id, receipt_id, return_id):
    """Get detailed return information including lines"""
    schema = db_service.company_schema(company_id)
    
    ret = db_service.fetch_one(f"""
        SELECT r.*,
            v.vendor_name
        FROM {schema}.ops_returns r
        JOIN {schema}.ops_receipts rc ON rc.id = r.receipt_id
        JOIN {schema}.ops_purchase_orders po ON po.id = rc.purchase_order_id
        LEFT JOIN public.ops_vendors v ON v.id = po.vendor_id
        WHERE r.id = %s AND r.receipt_id = %s AND r.company_id = %s;
    """, (return_id, receipt_id, company_id))
    
    if not ret:
        return jsonify({"error": "Return not found"}), 404
    
    # Get return lines - join with receipt_lines using YOUR column names
    lines = db_service.fetch_all(f"""
        SELECT 
            rl.*,
            rll.item_description,
            rll.unit_of_measure,
            rll.quantity_received AS original_received_qty  -- YOUR column name
        FROM {schema}.ops_return_lines rl
        JOIN {schema}.ops_receipt_lines rll ON rll.id = rl.receipt_line_id
        WHERE rl.return_id = %s
        ORDER BY rl.id;
    """, (return_id,))
    
    # Get history
    history = db_service.fetch_all(f"""
        SELECT * FROM {schema}.ops_return_history
        WHERE return_id = %s
        ORDER BY created_at DESC
        LIMIT 50;
    """, (return_id,))
    
    ret["lines"] = lines
    ret["history"] = history
    
    return jsonify(ret), 200


@ops_bp.post("/receipts/<int:receipt_id>/returns/<int:return_id>/submit")
@require_auth
@require_ops_permission("procurement.returns.edit")
def submit_return(company_id, receipt_id, return_id):
    """Submit return for approval workflow"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    ret = db_service.fetch_one(f"""
        SELECT * FROM {schema}.ops_returns
        WHERE id = %s AND receipt_id = %s AND company_id = %s;
    """, (return_id, receipt_id, company_id))
    
    if not ret:
        return jsonify({"error": "Return not found"}), 404
    
    if ret.get("status") != "draft":
        return jsonify({"error": "Only draft returns can be submitted"}), 400
    
    # Check that return has at least one line
    line_count = db_service.fetch_one(f"""
        SELECT COUNT(*) AS cnt FROM {schema}.ops_return_lines
        WHERE return_id = %s;
    """, (return_id,)).get("cnt", 0)
    
    if not line_count or line_count == 0:
        return jsonify({"error": "Return must have at least one line before submission"}), 400
    
    updated = db_service.fetch_one(f"""
        UPDATE {schema}.ops_returns
        SET status = 'submitted',
            notes = COALESCE(%s, notes),
            updated_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, (payload.get("notes"), return_id))
    
    # Log state change
    db_service.execute(f"""
        INSERT INTO {schema}.ops_return_history (return_id, action, performed_by, old_status, new_status, notes)
        VALUES (%s, 'submitted', %s, 'draft', 'submitted', %s);
    """, (return_id, _uid(), payload.get("notes")))
    
    db_service.append_ops_event(
        company_id,
        event_type="return.submitted",
        module="procurement",
        entity_type="return",
        entity_id=return_id,
        action="submit",
        actor_user_id=_uid(),
        **_audit_meta()
    )
    
    return jsonify(updated), 200


@ops_bp.post("/receipts/<int:receipt_id>/returns/<int:return_id>/approve")
@require_auth
@require_ops_permission("procurement.returns.approve")
def approve_return(company_id, receipt_id, return_id):
    """Approve a submitted return"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    ret = db_service.fetch_one(f"""
        SELECT * FROM {schema}.ops_returns
        WHERE id = %s AND receipt_id = %s AND company_id = %s;
    """, (return_id, receipt_id, company_id))
    
    if not ret:
        return jsonify({"error": "Return not found"}), 404
    
    if ret.get("status") != "submitted":
        return jsonify({"error": "Only submitted returns can be approved/rejected"}), 400
    
    action = payload.get("action", "approve")
    new_status = "approved" if action == "approve" else "rejected"
    
    updated = db_service.fetch_one(f"""
        UPDATE {schema}.ops_returns
        SET status = %s,
            approved_by = %s,
            approved_at = NOW(),
            resolution_notes = COALESCE(%s, resolution_notes),
            updated_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, (new_status, _uid(), payload.get("resolution_notes"), return_id))
    
    # Log decision
    db_service.execute(f"""
        INSERT INTO {schema}.ops_return_history (return_id, action, performed_by, old_status, new_status, notes)
        VALUES (%s, %s, %s, 'submitted', %s, %s);
    """, (return_id, action, _uid(), new_status, payload.get("resolution_notes")))
    
    db_service.append_ops_event(
        company_id,
        event_type=f"return.{action}d",
        module="procurement",
        entity_type="return",
        entity_id=return_id,
        action=action,
        actor_user_id=_uid(),
        **_audit_meta()
    )
    
    return jsonify(updated), 200


@ops_bp.post("/receipts/<int:receipt_id>/returns/<int:return_id>/process")
@require_auth
@require_ops_permission("procurement.returns.process")
def process_return(company_id, receipt_id, return_id):
    """Process an approved return (issue credit/refund/initiate replacement)"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    ret = db_service.fetch_one(f"""
        SELECT * FROM {schema}.ops_returns
        WHERE id = %s AND receipt_id = %s AND company_id = %s;
    """, (return_id, receipt_id, company_id))
    
    if not ret:
        return jsonify({"error": "Return not found"}), 404
    
    if ret.get("status") != "approved":
        return jsonify({"error": "Only approved returns can be processed"}), 400
    
    return_type = ret.get("return_type", "credit")
    
    # Calculate financial impact using YOUR column names
    lines = db_service.fetch_all(f"""
        SELECT * FROM {schema}.ops_return_lines WHERE return_id = %s;
    """, (return_id,))
    
    total_value = sum(float(l.get("total_value") or 0) for l in lines)
    
    # Set amounts based on return type
    updates = {
        "status": "processing",
        "processed_by": _uid(),
        "processed_at": "NOW()"
    }
    
    if return_type == "credit":
        updates["credit_amount"] = total_value
    elif return_type == "refund":
        updates["refund_amount"] = total_value
    elif return_type == "replacement":
        updates["replacement_value"] = total_value
    
    # Additional fields from payload
    if payload.get("carrier_name"):
        updates["carrier_name"] = payload.get("carrier_name")
    if payload.get("tracking_number"):
        updates["tracking_number"] = payload.get("tracking_number")
    if payload.get("expected_return_date"):
        updates["expected_return_date"] = payload.get("expected_return_date")
    
    set_clauses = []
    vals = []
    for k, v in updates.items():
        if v == "NOW()":
            set_clauses.append(f"{k} = NOW()")
        else:
            set_clauses.append(f"{k} = %s")
            vals.append(v)
    vals.append(return_id)
    
    updated = db_service.fetch_one(f"""
        UPDATE {schema}.ops_returns
        SET {', '.join(set_clauses)},
            internal_notes = COALESCE(%s, internal_notes),
            updated_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, tuple([payload.get("internal_notes")] + vals))
    
    # Log processing start
    db_service.execute(f"""
        INSERT INTO {schema}.ops_return_history (return_id, action, performed_by, old_status, new_status, metadata)
        VALUES (%s, 'processing_started', %s, 'approved', 'processing', %s);
    """, (return_id, _uid(), json.dumps(payload)))
    
    db_service.append_ops_event(
        company_id,
        event_type="return.processing",
        module="procurement",
        entity_type="return",
        entity_id=return_id,
        action="process",
        actor_user_id=_uid(),
        **_audit_meta()
    )
    
    return jsonify({
        "return": updated,
        "financial_impact": {
            "total_value": total_value,
            "type": return_type,
            "credit_amount": updated.get("credit_amount"),
            "refund_amount": updated.get("refund_amount"),
            "replacement_value": updated.get("replacement_value")
        }
    }), 200


@ops_bp.post("/receipts/<int:receipt_id>/returns/<int:return_id>/complete")
@require_auth
@require_ops_permission("procurement.returns.process")
def complete_return(company_id, receipt_id, return_id):
    """Mark return as completed (after vendor processes it)"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    ret = db_service.fetch_one(f"""
        SELECT * FROM {schema}.ops_returns
        WHERE id = %s AND receipt_id = %s AND company_id = %s;
    """, (return_id, receipt_id, company_id))
    
    if not ret:
        return jsonify({"error": "Return not found"}), 404
    
    if ret.get("status") not in ("processing", "approved"):
        return jsonify({"error": "Return must be processing or approved to complete"}), 400
    
    updated = db_service.fetch_one(f"""
        UPDATE {schema}.ops_returns
        SET status = 'completed',
            actual_return_date = COALESCE(%s, actual_return_date, CURRENT_DATE),
            resolution_notes = COALESCE(%s, resolution_notes),
            vendor_notification_sent_at = COALESCE(vendor_notification_sent_at, NOW()),
            updated_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, (
        payload.get("actual_return_date"),
        payload.get("resolution_notes"),
        return_id
    ))
    
    # Update return lines to accepted
    db_service.execute(f"""
        UPDATE {schema}.ops_return_lines
        SET quantity_accepted = quantity_returned,
            updated_at = NOW()
        WHERE return_id = %s;
    """, (return_id,))
    
    # Log completion
    db_service.execute(f"""
        INSERT INTO {schema}.ops_return_history (return_id, action, performed_by, old_status, new_status)
        VALUES (%s, 'completed', %s, %s, 'completed');
    """, (return_id, _uid(), ret.get("status")))
    
    db_service.append_ops_event(
        company_id,
        event_type="return.completed",
        module="procurement",
        entity_type="return",
        entity_id=return_id,
        action="complete",
        actor_user_id=_uid(),
        **_audit_meta()
    )
    
    return jsonify(updated), 200


# ============================================================
# PROCUREMENT CONTRACTS (11 endpoints)
# ============================================================

@ops_bp.get("/procurement/contracts")
@require_auth
@require_ops_permission("procurement.contracts.view")
def list_procurement_contracts(company_id):
    """List all procurement contracts with filtering"""
    schema = db_service.company_schema(company_id)
    
    # Query parameters for filtering
    status_filter = request.args.get("status", "")
    type_filter = request.args.get("contract_type", "")
    vendor_filter = request.args.get("vendor_id", "")
    search = request.args.get("search", "")
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 25))
    offset = (page - 1) * per_page
    
    where_conditions = ["c.company_id = %s"]
    params = [company_id]
    
    if status_filter:
        where_conditions.append("c.status = %s")
        params.append(status_filter)
    
    if type_filter:
        where_conditions.append("c.contract_type = %s")
        params.append(type_filter)
    
    if vendor_filter:
        where_conditions.append("c.vendor_id = %s")
        params.append(int(vendor_filter))
    
    if search:
        where_conditions.append("(c.title ILIKE %s OR c.contract_number ILIKE %s OR v.vendor_name ILIKE %s)")
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
    
    where_clause = " AND ".join(where_conditions)
    
    # Get total count
    count_result = db_service.fetch_one(f"""
        SELECT COUNT(*) AS total
        FROM {schema}.procurement_contracts c
        LEFT JOIN public.ops_vendors v ON v.id = c.vendor_id
        WHERE {where_clause};
    """, tuple(params))
    
    # Get paginated results
    contracts = db_service.fetch_all(f"""
        SELECT 
            c.*,
            v.vendor_name,
            u_creator.name AS creator_name,
            u_owner.name AS owner_name,
            (SELECT COUNT(*) FROM {schema}.contract_amendments ca WHERE ca.contract_id = c.id) AS amendment_count
        FROM {schema}.procurement_contracts c
        LEFT JOIN public.ops_vendors v ON v.id = c.vendor_id
        LEFT JOIN public.users u_creator ON u_creator.id = c.created_by
        LEFT JOIN public.users u_owner ON u_owner.id = c.contract_owner_id
        WHERE {where_clause}
        ORDER BY c.created_at DESC
        LIMIT %s OFFSET %s;
    """, tuple(params + [per_page, offset]))
    
    return jsonify({
        "rows": contracts,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": count_result.get("total", 0),
            "pages": math.ceil(count_result.get("total", 0) / per_page)
        }
    }), 200


@ops_bp.get("/procurement/contracts/<int:contract_id>")
@require_auth
@require_ops_permission("procurement.contracts.view")
def get_procurement_contract(company_id, contract_id):
    """Get full contract details including amendments"""
    schema = db_service.company_schema(company_id)
    
    contract = db_service.fetch_one(f"""
        SELECT 
            c.*,
            v.vendor_name,
            v.vendor_email,
            v.vendor_phone,
            u_creator.name AS creator_name,
            u_owner.name AS owner_name,
            po.purchase_order_number AS linked_po
        FROM {schema}.procurement_contracts c
        LEFT JOIN public.ops_vendors v ON v.id = c.vendor_id
        LEFT JOIN public.users u_creator ON u_creator.id = c.created_by
        LEFT JOIN public.users u_owner ON u_owner.id = c.contract_owner_id
        LEFT JOIN {schema}.ops_purchase_orders po ON po.contract_id = c.id
        WHERE c.id = %s AND c.company_id = %s;
    """, (contract_id, company_id))
    
    if not contract:
        return jsonify({"error": "Contract not found"}), 404
    
    # Get amendments
    amendments = db_service.fetch_all(f"""
        SELECT 
            ca.*,
            u.name AS approver_name
        FROM {schema}.contract_amendments ca
        LEFT JOIN public.users u ON u.id = ca.approved_by
        WHERE ca.contract_id = %s
        ORDER BY ca.amendment_number;
    """, (contract_id,))
    
    # Get history
    history = db_service.fetch_all(f"""
        SELECT 
            ch.*,
            u.name AS performer_name
        FROM {schema}.contract_history ch
        LEFT JOIN public.users u ON u.id = ch.performed_by
        WHERE ch.contract_id = %s
        ORDER BY ch.created_at DESC
        LIMIT 100;
    """, (contract_id,))
    
    contract["amendments"] = amendments
    contract["history"] = history
    
    return jsonify(contract), 200


@ops_bp.post("/procurement/contracts")
@require_auth
@require_ops_permission("procurement.contracts.create")
def create_procurement_contract(company_id):
    """Create a new procurement contract"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    # Validate required fields
    required_fields = ["title", "contract_type", "start_date", "end_date"]
    missing = [f for f in required_fields if not payload.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400
    
    # Generate contract number
    contract_number = db_service.fetch_one(f"""
        SELECT {schema}.fn_generate_contract_number(%s, %s) AS num;
    """, (company_id, payload.get("contract_type"))).get("num")
    
    try:
        new_contract = db_service.fetch_one(f"""
            INSERT INTO {schema}.procurement_contracts (
                company_id, contract_number, contract_type,
                title, description, vendor_id,
                start_date, end_date,
                contract_value, currency, payment_terms,
                auto_renew, renewal_notice_days,
                primary_contact_name, primary_contact_email, primary_contact_phone,
                risk_level, owner_department, contract_owner_id,
                compliance_requirements, notes,
                created_by
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING *;
        """, (
            company_id, contract_number,
            payload.get("contract_type"),
            payload.get("title"),
            payload.get("description"),
            payload.get("vendor_id"),
            payload.get("start_date"),
            payload.get("end_date"),
            payload.get("contract_value", 0),
            payload.get("currency", "USD"),
            payload.get("payment_terms", "net_30"),
            payload.get("auto_renew", False),
            payload.get("renewal_notice_days", 90),
            payload.get("primary_contact_name"),
            payload.get("primary_contact_email"),
            payload.get("primary_contact_phone"),
            payload.get("risk_level", "medium"),
            payload.get("owner_department"),
            payload.get("contract_owner_id"),
            json.dumps(payload.get("compliance_requirements", {})) if payload.get("compliance_requirements") else None,
            payload.get("notes"),
            _uid()
        ))
        
        # Log creation
        db_service.append_ops_event(
            company_id,
            event_type="contract.created",
            module="procurement",
            entity_type="contract",
            entity_id=new_contract.get("id"),
            action="create",
            actor_user_id=_uid(),
            after_json=new_contract,
            **_audit_meta()
        )
        
        # Record in history
        db_service.execute(f"""
            INSERT INTO {schema}.contract_history (contract_id, action, performed_by, details)
            VALUES (%s, 'created', %s, %s);
        """, (new_contract.get("id"), _uid(), f"Contract {contract_number} created"))
        
        return jsonify(new_contract), 201
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@ops_bp.patch("/procurement/contracts/<int:contract_id>")
@require_auth
@require_ops_permission("procurement.contracts.edit")
def update_procurement_contract(company_id, contract_id):
    """Update procurement contract details"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    # Verify contract exists
    contract = db_service.fetch_one(f"""
        SELECT * FROM {schema}.procurement_contracts
        WHERE id = %s AND company_id = %s;
    """, (contract_id, company_id))
    
    if not contract:
        return jsonify({"error": "Contract not found"}), 404
    
    if contract.get("status") in ("terminated", "expired", "cancelled"):
        return jsonify({"error": "Cannot update terminated/expired/cancelled contract"}), 400
    
    # Allowed fields for update
    allowed_fields = {
        "title", "description", "vendor_id", "start_date", "end_date",
        "contract_value", "currency", "payment_terms",
        "auto_renew", "renewal_notice_days", "renewal_term_months",
        "primary_contact_name", "primary_contact_email", "primary_contact_phone",
        "vendor_signatory_name", "vendor_signatory_title",
        "company_signatory_name", "company_signatory_title",
        "owner_department", "contract_owner_id",
        "risk_level", "deliverables", "sla_requirements", "penalty_clauses",
        "compliance_requirements", "document_url", "notes", "internal_notes"
    }
    
    data = {k: v for k, v in payload.items() if k in allowed_fields}
    
    if not data:
        return jsonify({"error": "No valid fields to update"}), 400
    
    # Convert JSON fields to strings
    for json_field in ["deliverables", "sla_requirements", "penalty_clauses", "compliance_requirements"]:
        if json_field in data and isinstance(data[json_field], dict):
            data[json_field] = json.dumps(data[json_field])
    
    cols = []
    vals = []
    for k, v in data.items():
        cols.append(f"{k} = %s")
        vals.append(v)
    vals.extend([_uid(), contract_id])
    
    updated = db_service.fetch_one(f"""
        UPDATE {schema}.procurement_contracts
        SET {', '.join(cols)}, updated_by = %s, updated_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, tuple(vals))
    
    # Log update
    db_service.append_ops_event(
        company_id,
        event_type="contract.updated",
        module="procurement",
        entity_type="contract",
        entity_id=contract_id,
        action="update",
        actor_user_id=_uid(),
        after_json=updated,
        **_audit_meta()
    )
    
    return jsonify(updated), 200


@ops_bp.post("/procurement/awards/<int:award_id>/contract")
@require_auth
@require_ops_permission("procurement.contracts.create")
def link_contract_to_award(company_id, award_id):
    """Link an existing contract to a procurement award"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    contract_id = payload.get("contract_id")
    if not contract_id:
        return jsonify({"error": "contract_id is required"}), 400
    
    # Verify both exist
    award = db_service.fetch_one(f"""
        SELECT * FROM {schema}.procurement_awards
        WHERE id = %s AND company_id = %s;
    """, (award_id, company_id))
    
    if not award:
        return jsonify({"error": "Award not found"}), 404
    
    contract = db_service.fetch_one(f"""
        SELECT * FROM {schema}.procurement_contracts
        WHERE id = %s AND company_id = %s;
    """, (contract_id, company_id))
    
    if not contract:
        return jsonify({"error": "Contract not found"}), 404
    
    # Link them
    db_service.execute(f"""
        UPDATE {schema}.procurement_contracts
        SET award_id = %s, updated_at = NOW()
        WHERE id = %s;
    """, (award_id, contract_id))
    
    # Also link any POs from this award
    db_service.execute(f"""
        UPDATE {schema}.ops_purchase_orders
        SET contract_id = %s, updated_at = NOW()
        WHERE award_id = %s AND company_id = %s;
    """, (contract_id, award_id, company_id))
    
    # Log
    db_service.append_ops_event(
        company_id,
        event_type="contract.linked_to_award",
        module="procurement",
        entity_type="contract",
        entity_id=contract_id,
        action="link",
        actor_user_id=_uid(),
        metadata={"award_id": award_id},
        **_audit_meta()
    )
    
    return jsonify({
        "message": "Contract linked to award successfully",
        "contract_id": contract_id,
        "award_id": award_id
    }), 200


@ops_bp.delete("/procurement/awards/<int:award_id>/contract")
@require_auth
@require_ops_permission("procurement.contracts.edit")
def unlink_contract_from_award(company_id, award_id):
    """Unlink contract from award"""
    schema = db_service.company_schema(company_id)
    
    # Find linked contract
    contract = db_service.fetch_one(f"""
        SELECT * FROM {schema}.procurement_contracts
        WHERE award_id = %s AND company_id = %s;
    """, (award_id, company_id))
    
    if not contract:
        return jsonify({"error": "No contract linked to this award"}), 404
    
    # Unlink
    db_service.execute(f"""
        UPDATE {schema}.procurement_contracts
        SET award_id = NULL, updated_at = NOW()
        WHERE id = %s;
    """, (contract.get("id"),))
    
    return jsonify({"message": "Contract unlinked from award"}), 200


@ops_bp.post("/procurement/contracts/<int:contract_id>/activate")
@require_auth
@require_ops_permission("procurement.contracts.activate")
def activate_contract(company_id, contract_id):
    """Activate a contract (move from pending_signature to active)"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    contract = db_service.fetch_one(f"""
        SELECT * FROM {schema}.procurement_contracts
        WHERE id = %s AND company_id = %s;
    """, (contract_id, company_id))
    
    if not contract:
        return jsonify({"error": "Contract not found"}), 404
    
    if contract.get("status") not in ("draft", "under_review", "pending_signature"):
        return jsonify({"error": "Contract must be in draft/review/pending_signature status to activate"}), 400
    
    updated = db_service.fetch_one(f"""
        UPDATE {schema}.procurement_contracts
        SET status = 'active',
            signing_date = COALESCE(%s, signing_date, CURRENT_DATE),
            updated_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, (payload.get("signing_date"), contract_id))
    
    # Log activation
    db_service.execute(f"""
        INSERT INTO {schema}.contract_history (contract_id, action, performed_by, old_status, new_status)
        VALUES (%s, 'activated', %s, %s, 'active');
    """, (contract_id, _uid(), contract.get("status")))
    
    db_service.append_ops_event(
        company_id,
        event_type="contract.activated",
        module="procurement",
        entity_type="contract",
        entity_id=contract_id,
        action="activate",
        actor_user_id=_uid(),
        **_audit_meta()
    )
    
    return jsonify(updated), 200


@ops_bp.post("/procurement/contracts/<int:contract_id>/renew")
@require_auth
@require_ops_permission("procurement.contracts.manage")
def renew_contract(company_id, contract_id):
    """Renew an expiring contract"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    contract = db_service.fetch_one(f"""
        SELECT * FROM {schema}.procurement_contracts
        WHERE id = %s AND company_id = %s;
    """, (contract_id, company_id))
    
    if not contract:
        return jsonify({"error": "Contract not found"}), 404
    
    if contract.get("status") != "active":
        return jsonify({"error": "Only active contracts can be renewed"}), 400
    
    new_end_date = payload.get("new_end_date")
    if not new_end_date:
        return jsonify({"error": "new_end_date is required"}), 400
    
    # Increment version
    new_version = (contract.get("contract_version") or 1) + 1
    
    updated = db_service.fetch_one(f"""
        UPDATE {schema}.procurement_contracts
        SET status = 'active',
            end_date = %s,
            contract_version = %s,
            contract_value = COALESCE(%s, contract_value),
            renewal_term_months = %s,
            updated_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, (new_end_date, new_version, payload.get("new_value"), payload.get("renewal_term_months"), contract_id))
    
    # Log renewal
    db_service.execute(f"""
        INSERT INTO {schema}.contract_history (contract_id, action, performed_by, details, metadata)
        VALUES (%s, 'renewed', %s, %s, %s);
    """, (contract_id, _uid(), f"Contract renewed until {new_end_date}", 
          json.dumps({"old_end": str(contract.get("end_date")), "new_end": new_end_date})))
    
    db_service.append_ops_event(
        company_id,
        event_type="contract.renewed",
        module="procurement",
        entity_type="contract",
        entity_id=contract_id,
        action="renew",
        actor_user_id=_uid(),
        **_audit_meta()
    )
    
    return jsonify(updated), 200


@ops_bp.post("/procurement/contracts/<int:contract_id>/terminate")
@require_auth
@require_ops_permission("procurement.contracts.manage")
def terminate_contract(company_id, contract_id):
    """Terminate a contract before its end date"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    contract = db_service.fetch_one(f"""
        SELECT * FROM {schema}.procurement_contracts
        WHERE id = %s AND company_id = %s;
    """, (contract_id, company_id))
    
    if not contract:
        return jsonify({"error": "Contract not found"}), 404
    
    if contract.get("status") not in ("active", "suspended"):
        return jsonify({"error": "Only active or suspended contracts can be terminated"}), 400
    
    termination_reason = payload.get("termination_reason")
    if not termination_reason:
        return jsonify({"error": "termination_reason is required"}), 400
    
    updated = db_service.fetch_one(f"""
        UPDATE {schema}.procurement_contracts
        SET status = 'terminated',
            termination_reason = %s,
            termination_date = COALESCE(%s, termination_date, CURRENT_DATE),
            termination_notice = %s,
            updated_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, (termination_reason, payload.get("termination_date"), payload.get("notice"), contract_id))
    
    # Log termination
    db_service.execute(f"""
        INSERT INTO {schema}.contract_history (contract_id, action, performed_by, old_status, new_status, details)
        VALUES (%s, 'terminated', %s, %s, 'terminated', %s);
    """, (contract_id, _uid(), contract.get("status"), termination_reason))
    
    db_service.append_ops_event(
        company_id,
        event_type="contract.terminated",
        module="procurement",
        entity_type="contract",
        entity_id=contract_id,
        action="terminate",
        actor_user_id=_uid(),
        **_audit_meta()
    )
    
    return jsonify(updated), 200


@ops_bp.get("/procurement/contracts/<int:contract_id>/amendments")
@require_auth
@require_ops_permission("procurement.contracts.view")
def list_contract_amendments(company_id, contract_id):
    """List all amendments for a contract"""
    schema = db_service.company_schema(company_id)
    
    # Verify contract exists
    contract = db_service.fetch_one(f"""
        SELECT id FROM {schema}.procurement_contracts
        WHERE id = %s AND company_id = %s;
    """, (contract_id, company_id))
    
    if not contract:
        return jsonify({"error": "Contract not found"}), 404
    
    amendments = db_service.fetch_all(f"""
        SELECT 
            ca.*,
            u_creator.name AS creator_name,
            u_approver.name AS approver_name
        FROM {schema}.contract_amendments ca
        LEFT JOIN public.users u_creator ON u_creator.id = ca.created_by
        LEFT JOIN public.users u_approver ON u_approver.id = ca.approved_by
        WHERE ca.contract_id = %s
        ORDER BY ca.amendment_number;
    """, (contract_id,))
    
    return jsonify({"rows": amendments}), 200


@ops_bp.post("/procurement/contracts/<int:contract_id>/amendments")
@require_auth
@require_ops_permission("procurement.contracts.edit")
def create_contract_amendment(company_id, contract_id):
    """Create a new amendment for a contract"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    # Verify contract exists and is amendable
    contract = db_service.fetch_one(f"""
        SELECT * FROM {schema}.procurement_contracts
        WHERE id = %s AND company_id = %s;
    """, (contract_id, company_id))
    
    if not contract:
        return jsonify({"error": "Contract not found"}), 404
    
    if contract.get("status") not in ("active", "under_review", "pending_signature"):
        return jsonify({"error": "Amendments can only be created for active/pending contracts"}), 400
    
    # Get next amendment number
    next_num = db_service.fetch_one(f"""
        SELECT COALESCE(MAX(amendment_number), 0) + 1 AS next_num
        FROM {schema}.contract_amendments
        WHERE contract_id = %s;
    """, (contract_id,)).get("next_num", 1)
    
    try:
        new_amendment = db_service.fetch_one(f"""
            INSERT INTO {schema}.contract_amendments (
                contract_id, amendment_number, amendment_version,
                amendment_type, description,
                value_change, new_total_value,
                original_end_date, new_end_date,
                effective_date, notes, created_by
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING *;
        """, (
            contract_id,
            next_num,
            f"V{contract.get('contract_version', 1)}.{next_num}",
            payload.get("amendment_type", "scope_change"),
            payload.get("description"),
            payload.get("value_change", 0),
            payload.get("new_total_value"),
            contract.get("end_date"),
            payload.get("new_end_date"),
            payload.get("effective_date"),
            payload.get("notes"),
            _uid()
        ))
        
        # Log
        db_service.execute(f"""
            INSERT INTO {schema}.contract_history (contract_id, action, performed_by, details)
            VALUES (%s, 'amended', %s, %s);
        """, (contract_id, _uid(), f"Amendment #{next_num}: {payload.get('description', 'N/A')}"))
        
        db_service.append_ops_event(
            company_id,
            event_type="contract.amendment_created",
            module="procurement",
            entity_type="contract_amendment",
            entity_id=new_amendment.get("id"),
            action="create",
            actor_user_id=_uid(),
            **_audit_meta()
        )
        
        return jsonify(new_amendment), 201
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ============================================================
# PROCUREMENT ANALYTICS & DASHBOARD (12+ endpoints)
# ============================================================

@ops_bp.get("/procurement/dashboard")
@require_auth
@require_ops_permission("procurement.analytics.view")
def procurement_dashboard(company_id):
    """Main procurement dashboard with KPIs and summary metrics"""
    schema = db_service.company_schema(company_id)
    period = request.args.get("period", "current_month")
    
    # Calculate date range based on period
    period_dates = {
        "current_month": ("DATE_TRUNC('month', CURRENT_DATE)", "CURRENT_DATE"),
        "last_month": ("DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')", "DATE_TRUNC('month', CURRENT_DATE)"),
        "current_quarter": ("DATE_TRUNC('quarter', CURRENT_DATE)", "CURRENT_DATE"),
        "last_quarter": ("DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '3 months')", "DATE_TRUNC('quarter', CURRENT_DATE)"),
        "current_year": ("DATE_TRUNC('year', CURRENT_DATE)", "CURRENT_DATE"),
        "last_30_days": ("CURRENT_DATE - INTERVAL '30 days'", "CURRENT_DATE"),
        "last_90_days": ("CURRENT_DATE - INTERVAL '90 days'", "CURRENT_DATE"),
        "last_12_months": ("CURRENT_DATE - INTERVAL '12 months'", "CURRENT_DATE")
    }
    
    date_start, date_end = period_dates.get(period, period_dates["current_month"])
    
    # Main KPIs
    dashboard_data = {
        "period": period,
        "kpis": {},
        "charts": {},
        "alerts": [],
        "recent_activity": []
    }
    
    # Purchase Order KPIs
    po_kpis = db_service.fetch_one(f"""
        SELECT 
            COUNT(*) FILTER (WHERE status IN ('issued','acknowledged','partially_received')) AS active_pos,
            COUNT(*) FILTER (WHERE status = 'received') AS completed_pos,
            COUNT(*) FILTER (WHERE status = 'draft') AS draft_pos,
            COUNT(*) FILTER (WHERE created_at BETWEEN {date_start} AND {date_end}) AS new_this_period,
            COALESCE(SUM(total_value) FILTER (WHERE created_at BETWEEN {date_start} AND {date_end}), 0) AS spend_this_period,
            COALESCE(AVG(total_value) FILTER (WHERE status = 'received'), 0) AS avg_completed_value
        FROM {schema}.ops_purchase_orders
        WHERE company_id = %s;
    """, (company_id,))
    
    dashboard_data["kpis"]["purchase_orders"] = po_kpis
    
    # Receipt KPIs
    receipt_kpis = db_service.fetch_one(f"""
        SELECT 
            COUNT(*) FILTER (WHERE status = 'pending') AS pending_receipts,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed_receipts,
            COUNT(*) FILTER (WHERE created_at BETWEEN {date_start} AND {date_end}) AS received_this_period,
            COALESCE(SUM(total_value) FILTER (WHERE status = 'completed' AND completed_at BETWEEN {date_start} AND {date_end}), 0) AS value_received
        FROM {schema}.ops_receipts
        WHERE company_id = %s;
    """, (company_id,))
    
    dashboard_data["kpis"]["receipts"] = receipt_kpis
    
    # Returns KPIs
    returns_kpis = db_service.fetch_one(f"""
        SELECT 
            COUNT(*) FILTER (WHERE status IN ('draft','submitted')) AS pending_returns,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed_returns,
            COUNT(*) FILTER (WHERE created_at BETWEEN {date_start} AND {date_end}) AS returns_this_period,
            COALESCE(SUM(credit_amount) + SUM(refund_amount) FILTER (WHERE status = 'completed'), 0) AS total_credits_issued
        FROM {schema}.ops_returns
        WHERE company_id = %s;
    """, (company_id,))
    
    dashboard_data["kpis"]["returns"] = returns_kpis
    
    # Contract KPIs
    contract_kpis = db_service.fetch_one(f"""
        SELECT 
            COUNT(*) FILTER (WHERE status = 'active') AS active_contracts,
            COUNT(*) FILTER (WHERE end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days' AND status = 'active') AS expiring_soon_90,
            COUNT(*) FILTER (WHERE end_date < CURRENT_DATE AND status = 'active') AS expired_active,
            COUNT(*) FILTER (WHERE created_at BETWEEN {date_start} AND {date_end}) AS new_this_period,
            COALESCE(SUM(contract_value) FILTER (WHERE status = 'active'), 0) AS active_contract_value
        FROM {schema}.procurement_contracts
        WHERE company_id = %s;
    """, (company_id,))
    
    dashboard_data["kpis"]["contracts"] = contract_kpis
    
    # Vendor KPIs
    vendor_kpis = db_service.fetch_one(f"""
        SELECT 
            COUNT(DISTINCT v.id) AS total_vendors,
            COUNT(DISTINCT CASE WHEN po.status IN ('issued','acknowledged') THEN v.id END) AS active_vendors,
            COUNT(DISTINCT CASE WHEN po.created_at BETWEEN {date_start} AND {date_end} THEN v.id END) AS vendors_used_period
        FROM public.ops_vendors v
        LEFT JOIN {schema}.ops_purchase_orders po ON po.vendor_id = v.id AND po.company_id = %s
        WHERE v.company_id = %s;
    """, (company_id, company_id))
    
    dashboard_data["kpis"]["vendors"] = vendor_kpis
    
    # Spend trend data (for chart)
    spend_trend = db_service.fetch_all(f"""
        SELECT 
            DATE_TRUNC('month', created_at) AS month,
            COUNT(*) AS po_count,
            COALESCE(SUM(total_value), 0) AS total_spend
        FROM {schema}.ops_purchase_orders
        WHERE company_id = %s
          AND created_at >= {date_start}
          AND status NOT IN ('cancelled','draft')
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month;
    """, (company_id,))
    
    dashboard_data["charts"]["spend_trend"] = spend_trend
    
    # Category breakdown
    category_breakdown = db_service.fetch_all(f"""
        SELECT 
            COALESCE(pol.category_code, 'uncategorized') AS category,
            COALESCE(pol.category_name, 'Uncategorized') AS category_name,
            COUNT(DISTINCT pol.purchase_order_id) AS po_count,
            COALESCE(SUM(pol.quantity * pol.unit_price), 0) AS total_spend
        FROM {schema}.ops_purchase_order_lines pol
        JOIN {schema}.ops_purchase_orders po ON po.id = pol.purchase_order_id
        WHERE po.company_id = %s
          AND po.created_at >= {date_start}
          AND po.status NOT IN ('cancelled')
        GROUP BY pol.category_code, pol.category_name
        ORDER BY total_spend DESC
        LIMIT 15;
    """, (company_id,))
    
    dashboard_data["charts"]["category_breakdown"] = category_breakdown
    
    # Alerts
    alerts = db_service.fetch_all(f"""
        -- Expiring contracts
        SELECT 'contract_expiring' AS alert_type,
               'warning' AS severity,
               CONCAT('Contract ', contract_number, ' expires on ', end_date) AS message,
               id AS reference_id
        FROM {schema}.procurement_contracts
        WHERE company_id = %s
          AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
          AND status = 'active'
        
        UNION ALL
        
        -- Overdue POs
        SELECT 'po_overdue' AS alert_type,
               'danger' AS severity,
               CONCAT('PO ', purchase_order_number, ' is overdue') AS message,
               id AS reference_id
        FROM {schema}.ops_purchase_orders
        WHERE company_id = %s
          AND expected_delivery_date < CURRENT_DATE
          AND status IN ('issued', 'acknowledged')
        
        UNION ALL
        
        -- Pending returns over 7 days
        SELECT 'return_pending' AS alert_type,
               'info' AS severity,
               CONCAT('Return ', return_number, ' pending approval') AS message,
               id AS reference_id
        FROM {schema}.ops_returns
        WHERE company_id = %s
          AND status = 'submitted'
          AND updated_at < CURRENT_DATE - INTERVAL '7 days'
        
        ORDER BY severity, message
        LIMIT 20;
    """, (company_id, company_id, company_id))
    
    dashboard_data["alerts"] = alerts
    
    # Recent activity
    recent_activity = db_service.fetch_all(f"""
        SELECT event_type, entity_type, entity_id, created_at, actor_user_id
        FROM {schema}.ops_events
        WHERE company_id = %s
        ORDER BY created_at DESC
        LIMIT 10;
    """, (company_id,))
    
    dashboard_data["recent_activity"] = recent_activity
    
    return jsonify(dashboard_data), 200


@ops_bp.get("/procurement/analytics/spend-by-vendor")
@require_auth
@require_ops_permission("procurement.analytics.view")
def spend_by_vendor(company_id):
    """Procurement spend analysis grouped by vendor"""
    schema = db_service.company_schema(company_id)
    
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    vendor_id = request.args.get("vendor_id")
    
    where_parts = ["po.company_id = %s"]
    params = [company_id]
    
    if date_from:
        where_parts.append("po.created_at >= %s")
        params.append(date_from)
    
    if date_to:
        where_parts.append("po.created_at <= %s")
        params.append(date_to)
    
    if vendor_id:
        where_parts.append("po.vendor_id = %s")
        params.append(int(vendor_id))
    
    where_clause = " AND ".join(where_parts)
    
    results = db_service.fetch_all(f"""
        SELECT 
            v.id AS vendor_id,
            v.vendor_name,
            v.vendor_code,
            COUNT(DISTINCT po.id) AS order_count,
            COALESCE(SUM(po.total_value), 0) AS total_spend,
            COALESCE(AVG(po.total_value), 0) AS avg_order_value,
            MIN(po.created_at) AS first_order_date,
            MAX(po.created_at) AS last_order_date,
            COUNT(DISTINCT CASE WHEN po.status IN ('issued','acknowledged') THEN po.id END) AS open_orders,
            COUNT(DISTINCT pc.id) AS contract_count,
            COALESCE(SUM(pc.contract_value), 0) AS contract_value
        FROM public.ops_vendors v
        INNER JOIN {schema}.ops_purchase_orders po ON po.vendor_id = v.id AND {where_clause}
        LEFT JOIN {schema}.procurement_contracts pc ON pc.vendor_id = v.id AND pc.status = 'active'
        GROUP BY v.id, v.vendor_name, v.vendor_code
        ORDER BY total_spend DESC;
    """, tuple(params))
    
    return jsonify({"rows": results}), 200


@ops_bp.get("/procurement/analytics/spend-by-category")
@require_auth
@require_ops_permission("procurement.analytics.view")
def spend_by_category(company_id):
    """Procurement spend analysis grouped by category"""
    schema = db_service.company_schema(company_id)
    
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    
    where_parts = ["po.company_id = %s"]
    params = [company_id]
    
    if date_from:
        where_parts.append("po.created_at >= %s")
        params.append(date_from)
    
    if date_to:
        where_parts.append("po.created_at <= %s")
        params.append(date_to)
    
    where_clause = " AND ".join(where_parts)
    
    results = db_service.fetch_all(f"""
        SELECT 
            COALESCE(pol.category_code, 'uncategorized') AS category_code,
            COALESCE(pol.category_name, 'Uncategorized') AS category_name,
            COUNT(DISTINCT pol.id) AS line_count,
            COUNT(DISTINCT pol.purchase_order_id) AS po_count,
            COUNT(DISTINCT po.vendor_id) AS vendor_count,
            COALESCE(SUM(pol.quantity * pol.unit_price), 0) AS total_spend,
            COALESCE(AVG(pol.quantity * pol.unit_price), 0) AS avg_line_value,
            COALESCE(MIN(pol.quantity * pol.unit_price), 0) AS min_line_value,
            COALESCE(MAX(pol.quantity * pol.unit_price), 0) AS max_line_value,
            ROUND((SUM(pol.quantity * pol.unit_price) / NULLIF(SUM(pol.quantity), 0)), 2) AS avg_unit_price
        FROM {schema}.ops_purchase_order_lines pol
        INNER JOIN {schema}.ops_purchase_orders po ON po.id = pol.purchase_order_id AND {where_clause}
        LEFT JOIN public.ops_vendors v ON v.id = po.vendor_id
        GROUP BY pol.category_code, pol.category_name
        ORDER BY total_spend DESC;
    """, tuple(params))
    
    return jsonify({"rows": results}), 200


@ops_bp.get("/procurement/vendors/<int:vendor_id>/performance")
@require_auth
@require_ops_permission("procurement.analytics.view")
def vendor_performance(company_id, vendor_id):
    """Detailed performance metrics for a specific vendor"""
    schema = db_service.company_schema(company_id)
    
    # Verify vendor exists
    vendor = db_service.fetch_one("""
        SELECT * FROM public.ops_vendors WHERE id = %s AND company_id = %s;
    """, (vendor_id, company_id))
    
    if not vendor:
        return jsonify({"error": "Vendor not found"}), 404
    
    # Delivery performance
    delivery = db_service.fetch_one(f"""
        SELECT 
            COUNT(DISTINCT po.id) AS total_orders,
            COUNT(DISTINCT CASE WHEN po.status = 'received' THEN po.id END) AS delivered_orders,
            COUNT(DISTINCT CASE WHEN r.actual_delivery_date <= r.expected_delivery_date THEN r.id END) AS on_time_deliveries,
            COUNT(DISTINCT CASE WHEN r.actual_delivery_date > r.expected_delivery_date THEN r.id END) AS late_deliveries,
            ROUND(AVG(EXTRACT(EPOCH FROM (r.actual_delivery_date - r.expected_delivery_date)) / 86400), 1) AS avg_days_late,
            ROUND(AVG(EXTRACT(EPOCH FROM (r.received_at - po.issued_at)) / 86400), 1) AS avg_lead_time_days
        FROM {schema}.ops_purchase_orders po
        LEFT JOIN {schema}.ops_receipts r ON r.purchase_order_id = po.id AND r.status = 'completed'
        WHERE po.company_id = %s AND po.vendor_id = %s;
    """, (company_id, vendor_id))
    
    # Quality performance (from returns)
    quality = db_service.fetch_one(f"""
        SELECT 
            COUNT(DISTINCT ret.id) AS total_returns,
            COUNT(DISTINCT ret.id) FILTER (WHERE ret.return_reason = 'defective') AS defective_returns,
            COUNT(DISTINCT ret.id) FILTER (WHERE ret.return_reason = 'wrong_item') AS wrong_item_returns,
            COALESCE(SUM(retl.total_value), 0) AS total_return_value,
            ROUND(COALESCE(SUM(retl.total_value), 0) / NULLIF(
                (SELECT COALESCE(SUM(total_value), 0) FROM {schema}.ops_purchase_orders 
                 WHERE company_id = %s AND vendor_id = %s AND status = 'received'
                ), 1) * 100, 2) AS return_rate_pct
        FROM {schema}.ops_returns ret
        JOIN {schema}.ops_return_lines retl ON retl.return_id = ret.id
        WHERE ret.company_id = %s AND ret.status = 'completed';
    """, (company_id, vendor_id, company_id, vendor_id))
    
    # Financial performance
    financial = db_service.fetch_one(f"""
        SELECT 
            COALESCE(SUM(po.total_value), 0) AS total_spend,
            COUNT(DISTINCT po.id) AS total_orders,
            COALESCE(AVG(po.total_value), 0) AS avg_order_value,
            COALESCE(MIN(po.total_value), 0) AS min_order_value,
            COALESCE(MAX(po.total_value), 0) AS max_order_value,
            COUNT(DISTINCT CASE WHEN vi.discrepancy_amount > 0 THEN vi.id END) AS invoices_with_discrepancies,
            COUNT(DISTINCT vi.id) AS total_invoices,
            ROUND(COUNT(DISTINCT CASE WHEN vi.discrepancy_amount > 0 THEN vi.id END)::NUMERIC / 
                  NULLIF(COUNT(DISTINCT vi.id), 0) * 100, 2) AS discrepancy_rate_pct
        FROM {schema}.ops_purchase_orders po
        LEFT JOIN {schema}.ops_receipts r ON r.purchase_order_id = po.id
        LEFT JOIN {schema}.vendor_invoices vi ON vi.receipt_id = r.id
        WHERE po.company_id = %s AND po.vendor_id = %s;
    """, (company_id, vendor_id))
    
    # Compliance performance
    compliance = db_service.fetch_one(f"""
        SELECT 
            COUNT(DISTINCT po.id) AS total_pos,
            COUNT(DISTINCT CASE WHEN po.contract_id IS NOT NULL THEN po.id END) AS with_contract,
            COUNT(DISTINCT CASE WHEN po.approval_date IS NOT NULL OR NOT po.requires_approval THEN po.id END) AS properly_approved,
            COUNT(DISTINCT pc.id) AS active_contracts,
            COALESCE(SUM(pc.contract_value), 0) AS active_contract_value
        FROM {schema}.ops_purchase_orders po
        LEFT JOIN {schema}.procurement_contracts pc ON pc.vendor_id = po.vendor_id AND pc.status = 'active'
        WHERE po.company_id = %s AND po.vendor_id = %s AND po.status NOT IN ('draft', 'cancelled');
    """, (company_id, vendor_id))
    
    # Monthly trend (last 12 months)
    monthly_trend = db_service.fetch_all(f"""
        SELECT 
            DATE_TRUNC('month', po.created_at) AS month,
            COUNT(*) AS order_count,
            COALESCE(SUM(po.total_value), 0) AS spend
        FROM {schema}.ops_purchase_orders po
        WHERE po.company_id = %s 
          AND po.vendor_id = %s
          AND po.created_at >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', po.created_at)
        ORDER BY month;
    """, (company_id, vendor_id))
    
    return jsonify({
        "vendor": vendor,
        "delivery": delivery,
        "quality": quality,
        "financial": financial,
        "compliance": compliance,
        "monthly_trend": monthly_trend
    }), 200


@ops_bp.get("/procurement/vendors/<int:vendor_id>/scorecard")
@require_auth
@require_ops_permission("procurement.analytics.view")
def vendor_scorecard(company_id, vendor_id):
    """Get vendor scorecard with overall score and component metrics"""
    schema = db_service.company_schema(company_id)
    
    # Use the scorecard function we defined
    scorecard = db_service.fetch_one(f"""
        SELECT {schema}.fn_get_vendor_scorecard(%s, %s) AS scorecard_data;
    """, (company_id, vendor_id))
    
    if not scorecard or not scorecard.get("scorecard_data"):
        return jsonify({"error": "Could not generate scorecard"}), 500
    
    return jsonify(scorecard["scorecard_data"]), 200


@ops_bp.patch("/procurement/vendors/<int:vendor_id>/scorecard")
@require_auth
@require_ops_permission("procurement.analytics.edit")
def update_vendor_scorecard(company_id, vendor_id):
    """Update manual adjustments to vendor scorecard"""
    schema = db_service.company_schema(company_id)
    payload = request.get_json(silent=True) or {}
    
    # This would typically update a scorecard_adjustments table
    # For now, log the adjustment and refresh analytics
    
    db_service.append_ops_event(
        company_id,
        event_type="scorecard.adjustment",
        module="procurement",
        entity_type="vendor_scorecard",
        entity_id=vendor_id,
        action="update",
        actor_user_id=_uid(),
        metadata=payload,
        **_audit_meta()
    )
    
    # Refresh materialized views
    try:
        db_service.execute(f"SELECT {schema}.refresh_procurement_analytics();")
    except:
        pass  # Views may not be populated yet
    
    return jsonify({
        "message": "Scorecard adjustment recorded",
        "adjustments": payload
    }), 200


@ops_bp.get("/procurement/analytics/cycle-time")
@require_auth
@require_ops_permission("procurement.analytics.view")
def cycle_time_analysis(company_id):
    """Procurement cycle time analysis"""
    schema = db_service.company_schema(company_id)
    
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    
    where_parts = ["pr.company_id = %s"]
    params = [company_id]
    
    if date_from:
        where_parts.append("pr.created_at >= %s")
        params.append(date_from)
    
    if date_to:
        where_parts.append("pr.created_at <= %s")
        params.append(date_to)
    
    where_clause = " AND ".join(where_parts)
    
    # Overall cycle time metrics
    cycle_metrics = db_service.fetch_one(f"""
        SELECT 
            AVG(EXTRACT(EPOCH FROM (pa.awarded_at - pr.created_at)) / 86400) AS avg_pr_to_award_days,
            AVG(EXTRACT(EPOCH FROM (po.created_at - pa.awarded_at)) / 86400) AS avg_award_to_po_days,
            AVG(EXTRACT(EPOCH FROM (r.completed_at - po.issued_at)) / 86400) AS avg_po_to_receipt_days,
            AVG(EXTRACT(EPOCH FROM (vi.invoice_date - r.completed_at)) / 86400) AS avg_receipt_to_invoice_days,
            AVG(EXTRACT(EPOCH FROM (pv.paid_at - vi.invoice_date)) / 86400) AS avg_invoice_to_payment_days,
            AVG(EXTRACT(EPOCH FROM (pv.paid_at - pr.created_at)) / 86400) AS avg_total_cycle_days,
            COUNT(*) AS sample_size
        FROM {schema}.ops_requests pr
        LEFT JOIN {schema}.procurement_cases pc ON pc.request_id = pr.id
        LEFT JOIN {schema}.procurement_awards pa ON pa.case_id = pc.id AND pa.status = 'accepted'
        LEFT JOIN {schema}.ops_purchase_orders po ON po.award_id = pa.id
        LEFT JOIN {schema}.ops_receipts r ON r.purchase_order_id = po.id AND r.status = 'completed'
        LEFT JOIN {schema}.vendor_invoices vi ON vi.receipt_id = r.id
        LEFT JOIN {schema}.payment_vouchers pv ON pv.invoice_id = vi.id AND pv.status = 'paid'
        WHERE {where_clause}
          AND pv.paid_at IS NOT NULL;
    """, tuple(params))
    
    # Cycle time by month (trend)
    cycle_trend = db_service.fetch_all(f"""
        SELECT 
            DATE_TRUNC('month', pr.created_at) AS month,
            COUNT(*) AS completions,
            AVG(EXTRACT(EPOCH FROM (pv.paid_at - pr.created_at)) / 86400) AS avg_total_days,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (pv.paid_at - pr.created_at)) / 86400) AS median_days,
            MIN(EXTRACT(EPOCH FROM (pv.paid_at - pr.created_at)) / 86400) AS min_days,
            MAX(EXTRACT(EPOCH FROM (pv.paid_at - pr.created_at)) / 86400) AS max_days
        FROM {schema}.ops_requests pr
        LEFT JOIN {schema}.procurement_cases pc ON pc.request_id = pr.id
        LEFT JOIN {schema}.procurement_awards pa ON pa.case_id = pc.id AND pa.status = 'accepted'
        LEFT JOIN {schema}.ops_purchase_orders po ON po.award_id = pa.id
        LEFT JOIN {schema}.ops_receipts r ON r.purchase_order_id = po.id AND r.status = 'completed'
        LEFT JOIN {schema}.vendor_invoices vi ON vi.receipt_id = r.id
        LEFT JOIN {schema}.payment_vouchers pv ON pv.invoice_id = vi.id AND pv.status = 'paid'
        WHERE pr.company_id = %s
          AND pr.created_at >= CURRENT_DATE - INTERVAL '12 months'
          AND pv.paid_at IS NOT NULL
        GROUP BY DATE_TRUNC('month', pr.created_at)
        ORDER BY month;
    """, (company_id,))
    
    # Bottleneck analysis
    bottlenecks = db_service.fetch_all(f"""
        WITH cycle_times AS (
            SELECT 
                po.id,
                EXTRACT(EPOCH FROM (pa.awarded_at - pr.created_at)) / 86400 AS pr_to_award,
                EXTRACT(EPOCH FROM (po.created_at - pa.awarded_at)) / 86400 AS award_to_po,
                EXTRACT(EPOCH FROM (r.completed_at - po.issued_at)) / 86400 AS po_to_receipt,
                EXTRACT(EPOCH FROM (pv.paid_at - vi.invoice_date)) / 86400 AS invoice_to_payment
            FROM {schema}.ops_requests pr
            JOIN {schema}.procurement_cases pc ON pc.request_id = pr.id
            JOIN {schema}.procurement_awards pa ON pa.case_id = pc.id AND pa.status = 'accepted'
            JOIN {schema}.ops_purchase_orders po ON po.award_id = pa.id
            JOIN {schema}.ops_receipts r ON r.purchase_order_id = po.id AND r.status = 'completed'
            JOIN {schema}.vendor_invoices vi ON vi.receipt_id = r.id
            JOIN {schema}.payment_vouchers pv ON pv.invoice_id = vi.id AND pv.status = 'paid'
            WHERE pr.company_id = %s
              AND pv.paid_at IS NOT NULL
        )
        SELECT 
            'PR to Award' AS phase,
            AVG(pr_to_award) AS avg_days,
            MAX(pr_to_award) AS max_days,
            COUNT(*) FILTER (WHERE pr_to_award > 30) AS outliers
        FROM cycle_times
        UNION ALL
        SELECT 
            'Award to PO' AS phase,
            AVG(award_to_po) AS avg_days,
            MAX(award_to_po) AS max_days,
            COUNT(*) FILTER (WHERE award_to_po > 14) AS outliers
        FROM cycle_times
        UNION ALL
        SELECT 
            'PO to Receipt' AS phase,
            AVG(po_to_receipt) AS avg_days,
            MAX(po_to_receipt) AS max_days,
            COUNT(*) FILTER (WHERE po_to_receipt > 21) AS outliers
        FROM cycle_times
        UNION ALL
        SELECT 
            'Invoice to Payment' AS phase,
            AVG(invoice_to_payment) AS avg_days,
            MAX(invoice_to_payment) AS max_days,
            COUNT(*) FILTER (WHERE invoice_to_payment > 45) AS outliers
        FROM cycle_times;
    """, (company_id,))
    
    return jsonify({
        "summary": cycle_metrics,
        "trend": cycle_trend,
        "bottlenecks": bottlenecks
    }), 200


@ops_bp.get("/procurement/analytics/savings")
@require_auth
@require_ops_permission("procurement.analytics.view")
def savings_analysis(company_id):
    """Procurement savings and cost avoidance analysis"""
    schema = db_service.company_schema(company_id)
    
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    
    where_parts = ["pa.company_id = %s"]
    params = [company_id]
    
    if date_from:
        where_parts.append("pa.awarded_at >= %s")
        params.append(date_from)
    
    if date_to:
        where_parts.append("pa.awarded_at <= %s")
        params.append(date_to)
    
    where_clause = " AND ".join(where_parts)
    
    # Summary metrics
    summary = db_service.fetch_one(f"""
        SELECT 
            COALESCE(SUM(pa.initial_budget - pa.negotiated_value), 0) AS negotiation_savings,
            COALESCE((
                SELECT SUM(max_quote - pa.negotiated_value)
                FROM (
                    SELECT 
                        pa2.id,
                        pa2.negotiated_value,
                        (SELECT MAX(total_quote_value) FROM {schema}.procurement_quotes q WHERE q.case_id = pa2.id) AS max_quote
                    FROM {schema}.procurement_awards pa2
                    WHERE pa2.company_id = %s AND pa2.status = 'accepted'
                      AND (SELECT MAX(total_quote_value) FROM {schema}.procurement_quotes q WHERE q.case_id = pa2.id) > pa2.negotiated_value
                ) sub
            ), 0) AS avoided_costs,
            COUNT(DISTINCT pa.id) AS negotiations_completed,
            ROUND(AVG(
                CASE 
                    WHEN pa.initial_budget > 0 THEN ((pa.initial_budget - pa.negotiated_value) / pa.initial_budget) * 100
                    ELSE 0 
                END
            ), 2) AS avg_savings_percentage
            
        FROM {schema}.procurement_awards pa
        WHERE {where_clause} AND pa.status = 'accepted';
    """, (company_id,) + tuple(params))
    
    # Savings by category
    by_category = db_service.fetch_all(f"""
        SELECT 
            COALESCE(pr.category, 'Other') AS category,
            COUNT(DISTINCT pa.id) AS negotiations,
            COALESCE(SUM(pa.initial_budget - pa.negotiated_value), 0) AS total_savings,
            ROUND(AVG(
                CASE 
                    WHEN pa.initial_budget > 0 THEN ((pa.initial_budget - pa.negotiated_value) / pa.initial_budget) * 100
                    ELSE 0 
                END
            ), 2) AS avg_savings_pct
        FROM {schema}.procurement_awards pa
        JOIN {schema}.procurement_cases pc ON pc.id = pa.case_id
        JOIN {schema}.ops_requests pr ON pr.id = pc.request_id
        WHERE {where_clause} AND pa.status = 'accepted'
        GROUP BY pr.category
        ORDER BY total_savings DESC;
    """, tuple(params))
    
    # Savings by month (trend)
    by_month = db_service.fetch_all(f"""
        SELECT 
            DATE_TRUNC('month', pa.awarded_at) AS month,
            COUNT(*) AS negotiations,
            COALESCE(SUM(pa.initial_budget - pa.negotiated_value), 0) AS savings,
            ROUND(AVG(
                CASE 
                    WHEN pa.initial_budget > 0 THEN ((pa.initial_budget - pa.negotiated_value) / pa.initial_budget) * 100
                    ELSE 0 
                END
            ), 2) AS avg_savings_pct
        FROM {schema}.procurement_awards pa
        WHERE pa.company_id = %s
          AND pa.status = 'accepted'
          AND pa.awarded_at >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', pa.awarded_at)
        ORDER BY month;
    """, (company_id,))
    
    # Top savings opportunities (biggest differences)
    top_savings = db_service.fetch_all(f"""
        SELECT 
            pa.id AS award_id,
            pr.title AS request_title,
            v.vendor_name,
            pa.initial_budget,
            pa.negotiated_value,
            (pa.initial_budget - pa.negotiated_value) AS savings_amount,
            ROUND(((pa.initial_budget - pa.negotiated_value) / NULLIF(pa.initial_budget, 0)) * 100, 2) AS savings_pct
        FROM {schema}.procurement_awards pa
        JOIN {schema}.procurement_cases pc ON pc.id = pa.case_id
        JOIN {schema}.ops_requests pr ON pr.id = pc.request_id
        LEFT JOIN public.ops_vendors v ON v.id = pa.selected_vendor_id
        WHERE pa.company_id = %s
          AND pa.status = 'accepted'
          AND (pa.initial_budget - pa.negotiated_value) > 0
        ORDER BY savings_amount DESC
        LIMIT 20;
    """, (company_id,))
    
    return jsonify({
        "summary": summary,
        "by_category": by_category,
        "by_month": by_month,
        "top_opportunities": top_savings
    }), 200

# ============================================================
# ROUTE: Procurement Compliance Report (thin wrapper)
# ============================================================

@ops_bp.get("/procurement/reports/compliance")
@require_auth
@require_ops_permission("procurement.compliance.view")
def compliance_report(company_id):
    """Procurement compliance report endpoint"""
    schema = db_service.company_schema(company_id)
    
    # Extract query params
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    
    # Call DB method (all SQL lives there)
    data = db_service.get_procurement_compliance_data(
        schema=schema,
        company_id=company_id,
        date_from=date_from,
        date_to=date_to
    )
    
    return jsonify(data), 200


@ops_bp.get("/procurement/reports/export")
@require_auth
@require_ops_permission("procurement.reports.export")
def export_procurement_report(company_id):
    """Export procurement report in various formats"""
    report_type = request.args.get("type", "spend_summary")
    format_type = request.args.get("format", "csv")
    
    schema = db_service.company_schema(company_id)
    
    queries = {
        "spend_summary": f"""
            SELECT 
                v.vendor_name AS Vendor,
                COUNT(DISTINCT po.id) AS "Order Count",
                SUM(po.total_value) AS "Total Spend ($)",
                AVG(po.total_value) AS "Avg Order Value ($)",
                MIN(po.created_at) AS "First Order",
                MAX(po.created_at) AS "Last Order"
            FROM {schema}.ops_purchase_orders po
            JOIN public.ops_vendors v ON v.id = po.vendor_id
            WHERE po.company_id = %s AND po.status NOT IN ('cancelled', 'draft')
            GROUP BY v.vendor_name
            ORDER BY "Total Spend ($)" DESC
        """,
        "vendor_performance": f"""
            SELECT 
                v.vendor_name AS Vendor,
                COUNT(DISTINCT po.id) AS "Total Orders",
                SUM(po.total_value) AS "Total Spend ($)",
                COUNT(DISTINCT CASE WHEN r.actual_delivery_date <= r.expected_delivery_date THEN r.id END) AS "On-Time Deliveries",
                COUNT(DISTINCT ret.id) AS "Returns",
                ROUND(COUNT(DISTINCT CASE WHEN r.actual_delivery_date <= r.expected_delivery_date THEN r.id END)::NUMERIC / 
                      NULLIF(COUNT(DISTINCT r.id), 0) * 100, 1) AS "On-Time %"
            FROM public.ops_vendors v
            JOIN {schema}.ops_purchase_orders po ON po.vendor_id = v.id
            LEFT JOIN {schema}.ops_receipts r ON r.purchase_order_id = po.id
            LEFT JOIN {schema}.ops_returns ret ON ret.receipt_id = r.id AND ret.status = 'completed'
            WHERE v.company_id = %s
            GROUP BY v.vendor_name
            HAVING COUNT(DISTINCT po.id) > 0
            ORDER BY "Total Spend ($)" DESC
        """,
        "compliance": f"""
            SELECT 
                po.purchase_order_number AS "PO Number",
                v.vendor_name AS Vendor,
                po.total_value AS "Value ($)",
                po.status AS Status,
                CASE WHEN po.approval_date IS NOT NULL THEN 'Yes' ELSE 'No' END AS "Approved",
                CASE WHEN po.contract_id IS NOT NULL THEN 'Yes' ELSE 'No' END AS "Has Contract",
                po.department AS Department,
                po.created_at AS "Created Date"
            FROM {schema}.ops_purchase_orders po
            LEFT JOIN public.ops_vendors v ON v.id = po.vendor_id
            WHERE po.company_id = %s AND po.status NOT IN ('draft', 'cancelled')
            ORDER BY po.created_at DESC
        """
    }
    
    query = queries.get(report_type, queries["spend_summary"])
    results = db_service.fetch_all(query, (company_id,))
    
    if format_type == "csv":
        import csv
        import io
        
        if not results:
            return jsonify({"error": "No data found for export"}), 404
        
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)
        
        from flask import Response
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment;filename={report_type}_export.csv'}
        )
    
    elif format_type == "json":
        return jsonify({"rows": results, "exported_at": datetime.utcnow().isoformat()}), 200
    
    else:
        return jsonify({"error": f"Format '{format_type}' not supported yet. Use csv or json."}), 400

# ============================================================
# WAREHOUSE MANAGEMENT
# ============================================================

@ops_bp.get("/warehouses")
@require_auth
@require_ops_permission("inventory.view")
def list_warehouses(company_id):
    """
    List warehouses for a company.
    
    Query params:
        - status: Filter by status (active/inactive)
        - q: Search term (code/name/address)
        - include_inactive: Include inactive warehouses
    """
    return jsonify(
        db_service.list_warehouses(
            company_id,
            status=request.args.get('status'),
            q=request.args.get('q'),
            include_inactive=request.args.get('include_inactive', '').lower() in ('true', '1', 'yes'),
        )
    ), 200


@ops_bp.get("/warehouses/<int:warehouse_id>")
@require_auth
@require_ops_permission("inventory.view")
def get_warehouse(company_id, warehouse_id):
    """Get single warehouse by ID with location counts."""
    try:
        result = db_service.get_warehouse(
            company_id,
            warehouse_id=warehouse_id,
        )
        
        if not result:
            return jsonify({"error": "Warehouse not found"}), 404
            
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ops_bp.post("/warehouses")
@require_auth
@require_ops_permission("inventory.manage")
def create_warehouse(company_id):
    """Create new warehouse."""
    payload = request.get_json(silent=True) or {}
    
    try:
        result = db_service.create_warehouse(
            company_id,
            actor_user_id=_uid(),
            payload=payload,
        )
        return jsonify(result), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ops_bp.put("/warehouses/<int:warehouse_id>")
@require_auth
@require_ops_permission("inventory.manage")
def update_warehouse(company_id, warehouse_id):
    """Update existing warehouse."""
    payload = request.get_json(silent=True) or {}
    
    try:
        result = db_service.update_warehouse(
            company_id,
            warehouse_id=warehouse_id,
            actor_user_id=_uid(),
            payload=payload,
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================
# WAREHOUSE LOCATIONS (Bins/Aisles/Racks)
# ============================================================

@ops_bp.get("/locations")
@require_auth
@require_ops_permission("inventory.view")
def list_locations(company_id):
    """
    List warehouse locations.
    
    Query params:
        - warehouse_id: Filter by warehouse
        - location_type: bin/aisle/rack/floor/dock/receiving/shipping
        - q: Search term
        - include_inactive: Include inactive locations
    """
    return jsonify(
        db_service.list_warehouse_locations(
            company_id,
            warehouse_id=request.args.get('warehouse_id', type=int),
            location_type=request.args.get('location_type'),
            q=request.args.get('q'),
            include_inactive=request.args.get('include_inactive', '').lower() in ('true', '1', 'yes'),
        )
    ), 200


@ops_bp.get("/locations/<int:location_id>")
@require_auth
@require_ops_permission("inventory.view")
def get_location(company_id, location_id):
    """Get single location by ID with warehouse info."""
    try:
        result = db_service.get_warehouse_location(
            company_id,
            location_id=location_id,
        )
        
        if not result:
            return jsonify({"error": "Location not found"}), 404
            
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ops_bp.post("/locations")
@require_auth
@require_ops_permission("inventory.manage")
def create_location(company_id):
    """Create new warehouse location (bin/aisle/rack)."""
    payload = request.get_json(silent=True) or {}
    
    try:
        result = db_service.create_warehouse_location(
            company_id,
            actor_user_id=_uid(),
            payload=payload,
        )
        return jsonify(result), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ops_bp.put("/locations/<int:location_id>")
@require_auth
@require_ops_permission("inventory.manage")
def update_location(company_id, location_id):
    """Update existing location."""
    payload = request.get_json(silent=True) or {}
    
    try:
        result = db_service.update_warehouse_location(
            company_id,
            location_id=location_id,
            actor_user_id=_uid(),
            payload=payload,
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================
# INVENTORY ON-HAND & VALUATION
# ============================================================

@ops_bp.get("/inventory/on-hand")
@require_auth
@require_ops_permission("inventory.view")
def get_on_hand(company_id):
    """
    Get inventory on-hand quantities.
    
    Query params:
        - item_id: Single item filter
        - location_id: Location filter
        - warehouse_id: Warehouse filter
        - as_of_date: Point-in-time date (YYYY-MM-DD)
        - include_zero_qty: Include items with zero balance
    """
    return jsonify(
        db_service.get_inventory_on_hand(
            company_id,
            item_id=request.args.get('item_id', type=int),
            location_id=request.args.get('location_id', type=int),
            warehouse_id=request.args.get('warehouse_id', type=int),
            as_of_date=request.args.get('as_of_date'),
            include_zero_qty=request.args.get('include_zero_qty', '').lower() in ('true', '1', 'yes'),
        )
    ), 200


@ops_bp.get("/inventory/valuation")
@require_auth
@require_ops_permission("inventory.view")
def get_valuation(company_id):
    """
    Get inventory valuation summary.
    
    Returns total value (AVG + FIFO), by category, by warehouse,
    reorder alerts.
    
    Query params:
        - as_of_date: Valuation date
        - category: Category filter
        - warehouse_id: Warehouse filter
        - valuation_method: avg/fifo filter
    """
    return jsonify(
        db_service.get_inventory_valuation_summary(
            company_id,
            as_of_date=request.args.get('as_of_date'),
            category=request.args.get('category'),
            warehouse_id=request.args.get('warehouse_id', type=int),
            valuation_method=request.args.get('valuation_method'),
        )
    ), 200


@ops_bp.get("/inventory/items/<int:item_id>")
@require_auth
@require_ops_permission("inventory.view")
def get_item_detail(company_id, item_id):
    """Get detailed view of inventory item with on-hand, layers, recent TXs."""
    try:
        result = db_service.get_inventory_item_detail(
            company_id,
            item_id=item_id,
        )
        
        if not result:
            return jsonify({"error": "Item not found"}), 404
            
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ops_bp.get("/inventory/items/<int:item_id>/movements")
@require_auth
@require_ops_permission("inventory.view")
def get_item_movements(company_id, item_id):
    """
    Get stock movement history for an item.
    
    Query params:
        - from_date: Start date
        - to_date: End date
        - tx_type: receipt/issue/adjustment/transfer
        - limit: Per page (default 100)
        - offset: Page offset
    """
    return jsonify(
        db_service.get_item_stock_movements(
            company_id,
            item_id=item_id,
            from_date=request.args.get('from_date'),
            to_date=request.args.get('to_date'),
            tx_type=request.args.get('tx_type'),
            limit=request.args.get('limit', 100, type=int),
            offset=request.args.get('offset', 0, type=int),
        )
    ), 200


# ============================================================
# RECEIPT → INVENTORY HANDOFF
# ============================================================

@ops_bp.post("/receipts/<int:receipt_id>/handoff-to-inventory")
@require_auth
@require_ops_permission("inventory.receive")
def handoff_receipt_to_inventory(company_id, receipt_id):
    """
    Hand off Ops Receipt to FinSage Inventory.
    
    Creates inventory_tx, layers, updates on-hand, posts GL.
    Idempotent - safe to call multiple times.
    
    JSON body (optional):
        - target_location_id: Default location for received items
        - force_repost: Force GL repost even if already posted
    """
    payload = request.get_json(silent=True) or {}
    
    try:
        result = db_service.handoff_ops_receipt_to_inventory(
            company_id,
            receipt_id=receipt_id,
            actor_user_id=_uid(),
            target_location_id=payload.get('target_location_id'),
            force_repost=payload.get('force_repost', False),
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ops_bp.post("/receipts/bulk-handoff-to-inventory")
@require_auth
@require_ops_permission("inventory.receive")
def bulk_handoff_receipts(company_id):
    """
    Bulk hand off multiple receipts to inventory.
    
    JSON body:
        - receipt_ids: List of receipt IDs [1,2,3,...]
        - target_location_id: Default location
    """
    payload = request.get_json(silent=True) or {}
    receipt_ids = payload.get('receipt_ids', [])
    
    if not receipt_ids:
        return jsonify({"error": "receipt_ids is required (list of IDs)"}), 400
    
    try:
        result = db_service.bulk_handoff_receipts_to_inventory(
            company_id,
            receipt_ids=receipt_ids,
            actor_user_id=_uid(),
            target_location_id=payload.get('target_location_id'),
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================
# STOCKTAKE / CYCLE COUNT WORKFLOW
# ============================================================

@ops_bp.post("/stocktakes")
@require_auth
@require_ops_permission("inventory.stocktake")
def create_stocktake(company_id):
    """
    Create new stocktake session.
    
    Auto-generates lines for items in scope.
    
    JSON body:
        - session_name (required): Descriptive name
        - stocktake_type: full/cycle_count/spot_check/blind
        - count_method: system-directed/user-selected/blank_sheet
        - warehouse_id: Scope to warehouse
        - location_ids: Scope to specific locations
        - item_ids: Specific items only
        - scheduled_date: When planned
        - variance_threshold_pct: Tolerance % (default 5)
        - notes
    """
    payload = request.get_json(silent=True) or {}
    
    try:
        result = db_service.create_stocktake_session(
            company_id,
            actor_user_id=_uid(),
            payload=payload,
        )
        return jsonify(result), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ops_bp.get("/stocktakes")
@require_auth
@require_ops_permission("inventory.stocktake")
def list_stocktakes(company_id):
    """
    List stocktake sessions.
    
    Query params:
        - status: draft/in_progress/completed/cancelled
        - stocktake_type: full/cycle_count/spot_check/blind
        - limit: Per page (default 50)
        - offset: Page offset
    """
    return jsonify(
        db_service.list_stocktake_sessions(
            company_id,
            status=request.args.get('status'),
            stocktake_type=request.args.get('stocktake_type'),
            limit=request.args.get('limit', 50, type=int),
            offset=request.args.get('offset', 0, type=int),
        )
    ), 200


@ops_bp.get("/stocktakes/<int:session_id>")
@require_auth
@require_ops_permission("inventory.stocktake")
def get_stocktake(company_id, session_id):
    """Get stocktake session detail with line summaries and progress."""
    try:
        result = db_service.get_stocktake_session(
            company_id,
            session_id=session_id,
        )
        
        if not result:
            return jsonify({"error": "Stocktake session not found"}), 404
            
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ops_bp.put("/stocktakes/<int:session_id>/lines/<int:line_id>")
@require_auth
@require_ops_permission("inventory.stocktake")
def update_stocktake_line(company_id, session_id, line_id):
    """
    Update stocktake line count.
    
    JSON body:
        - counted_qty (required): Quantity counted
        - batch_no: Batch number observed
        - expiry_date: Expiry date observed
        - notes: Count notes
    """
    payload = request.get_json(silent=True) or {}
    qty = payload.get('counted_qty')
    
    if qty is None:
        return jsonify({"error": "counted_qty is required"}), 400
    
    try:
        result = db_service.update_stocktake_line_count(
            company_id,
            line_id=line_id,
            actor_user_id=_uid(),
            counted_qty=float(qty),
            batch_no=payload.get('batch_no'),
            expiry_date=payload.get('expiry_date'),
            notes=payload.get('notes'),
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ops_bp.post("/stocktakes/<int:session_id>/complete")
@require_auth
@require_ops_permission("inventory.stocktake")
def complete_stocktake(company_id, session_id):
    """
    Complete stocktake session and post adjustments.
    
    Creates adjustment TX for variances, updates layers, posts GL.
    
    JSON body (optional):
        - post_adjustments: Whether to post (default true)
        - adjustment_notes: Notes for adjustment journal entry
    """
    payload = request.get_json(silent=True) or {}
    
    try:
        result = db_service.complete_stocktake_session(
            company_id,
            session_id=session_id,
            actor_user_id=_uid(),
            post_adjustments=payload.get('post_adjustments', True),
            adjustment_notes=payload.get('adjustment_notes'),
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ops_bp.get("/stocktakes/<int:session_id>/variances")
@require_auth
@require_ops_permission("inventory.stocktake")
def get_stocktake_variances(company_id, session_id):
    """
    Get variance lines from stocktake session.
    
    Query params:
        - only_unadjusted: Only show unadjusted variances
    """
    return jsonify(
        db_service.get_stocktake_variances(
            company_id,
            session_id=session_id,
            only_unadjusted=request.args.get('only_unadjusted', '').lower() in ('true', '1', 'yes'),
        )
    ), 200


# ============================================================
# INVENTORY DASHBOARD & REPORTING
# ============================================================

@ops_bp.get("/inventory/dashboard")
@require_auth
@require_ops_access
def inventory_dashboard(company_id):
    """
    Comprehensive inventory dashboard data.
    
    Returns summary metrics, valuation, reorder alerts,
    recent receipts/adjustments, active stocktakes,
    top movers, warehouse breakdown.
    
    Query params:
        - warehouse_id: Scope to specific warehouse
    """
    return jsonify(
        db_service.get_inventory_dashboard_data(
            company_id,
            warehouse_id=request.args.get('warehouse_id', type=int),
        )
    ), 200


@ops_bp.get("/inventory/transactions")
@require_auth
@require_ops_permission("inventory.view")
def list_transactions(company_id):
    """
    List inventory transactions with filtering/pagination.
    
    Query params:
        - tx_type: receipt/issue/adjustment/transfer
        - from_date: Start date (YYYY-MM-DD)
        - to_date: End date (YYYY-MM-DD)
        - item_id: Item filter
        - status: Status filter
        - limit: Per page (default 50)
        - offset: Page offset
    """
    return jsonify(
        db_service.get_inventory_transactions_list(
            company_id,
            tx_type=request.args.get('tx_type'),
            from_date=request.args.get('from_date'),
            to_date=request.args.get('to_date'),
            item_id=request.args.get('item_id', type=int),
            status=request.args.get('status'),
            limit=request.args.get('limit', 50, type=int),
            offset=request.args.get('offset', 0, type=int),
        )
    ), 200


@ops_bp.get("/inventory/reorder-alerts")
@require_auth
@require_ops_permission("inventory.view")
def reorder_alerts(company_id):
    """
    Get items needing reorder attention.
    
    Returns items at or below reorder level with alert status:
    - out_of_stock: Qty <= 0
    - reorder_now: Qty <= reorder_level
    - low_stock: Qty <= reorder_level * 1.5
    
    Query params:
        - warehouse_id: Scope to warehouse
        - category: Filter by category
    """
    valuation = db_service.get_inventory_valuation_summary(
        company_id,
        warehouse_id=request.args.get('warehouse_id', type=int),
        category=request.args.get('category'),
    )
    
    return jsonify({
        "alerts": valuation.get("reorder_alerts", []),
        "total_alerts": len(valuation.get("reorder_alerts", [])),
        "generated_at": datetime.now().isoformat() if 'datetime' in dir() else None,
    }), 200


# ============================================================
# END OF PHASE 6 INVENTORY ROUTES
# ============================================================
