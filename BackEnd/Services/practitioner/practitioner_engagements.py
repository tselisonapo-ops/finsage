
from datetime import date, timedelta
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from flask import Blueprint, request, jsonify, make_response, current_app
from BackEnd.Services.utils.registration_utils import create_company_record_from_payload
from BackEnd.Services.assets.ppe_reporting import _audit_safe

engagements_bp = Blueprint("engagements", __name__)


def _json_ok(data=None, status=200):
    body = {"ok": True}
    if isinstance(data, dict):
        body.update(data)
    elif data is not None:
        body["data"] = data
    return _corsify(make_response(jsonify(body), status))


def _json_err(message, status=400, **extra):
    body = {"ok": False, "error": message}
    if extra:
        body.update(extra)
    return _corsify(make_response(jsonify(body), status))


def _get_reporting_service():
    # replace this with however you access your reporting/service layer
    svc = getattr(current_app, "reporting_service", None)
    if svc is None:
        svc = getattr(current_app, "reporting", None)
    if svc is None:
        raise RuntimeError("Reporting service not configured")
    return svc


def _user_role_from_payload(payload: dict) -> str:
    return str(
        payload.get("role")
        or payload.get("user_role")
        or payload.get("role_name")
        or ""
    ).strip().lower()


def _can_manage_engagements(payload: dict) -> bool:
    role = _user_role_from_payload(payload)
    return role in {
        "owner",
        "admin",
        "audit_manager",
        "client_service_manager",
        "audit_partner",
        "engagement_partner",
    }


def _can_close_engagements(payload: dict) -> bool:
    role = _user_role_from_payload(payload)
    return role in {
        "owner",
        "admin",
        "audit_partner",
        "engagement_partner",
    }


def _parse_int(value, default=None):
    if value in (None, "", "null"):
        return default
    try:
        return int(value)
    except Exception:
        return default


def _parse_bool(value, default=None):
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    if s in {"1", "true", "yes", "y", "on"}:
        return True
    if s in {"0", "false", "no", "n", "off"}:
        return False
    return default

def _engagement_audit(
    *,
    cur,
    company_id: int,
    payload: dict,
    action: str,
    entity_type: str,
    entity_id,
    entity_ref: str | None = None,
    before_json: dict | None = None,
    after_json: dict | None = None,
    message: str | None = None,
):
    _audit_safe(
        company_id=company_id,
        payload=payload,
        module="engagements",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        entity_ref=entity_ref,
        before_json=before_json,
        after_json=after_json,
        message=message,
        cur=cur,
    )

def ensure_customer_workspace(
    *,
    cur,
    company_id: int,
    customer_id: int,
    current_user_id: int,
    onboarding_data: dict | None = None,
) -> tuple[int, str, str]:
    onboarding_data = onboarding_data or {}

    customer = db_service.get_customer_workspace_link(cur, company_id, customer_id)
    if not customer:
        raise ValueError("Customer not found.")

    existing_company_id = customer.get("company_master_id")
    if existing_company_id:
        return int(existing_company_id), "linked", "customer_link"

    company_payload = {
        "name": (
            onboarding_data.get("name")
            or customer.get("legal_name")
            or customer.get("name")
            or "Company"
        ),
        "companyName": (
            onboarding_data.get("companyName")
            or onboarding_data.get("name")
            or customer.get("legal_name")
            or customer.get("name")
            or "Company"
        ),
        "country": (
            onboarding_data.get("country")
            or customer.get("country")
            or customer.get("billing_country")
            or ""
        ),
        "industry": (
            onboarding_data.get("industry")
            or customer.get("industry")
            or ""
        ),
        "subIndustry": (
            onboarding_data.get("subIndustry")
            or customer.get("sub_industry")
        ),
        "currency": (
            onboarding_data.get("currency")
            or customer.get("currency")
        ),
        "finYearStart": (
            onboarding_data.get("finYearStart")
            or customer.get("fin_year_start")
            or "01/01"
        ),
        "companyRegDate": (
            onboarding_data.get("companyRegDate")
            or customer.get("company_reg_date")
        ),
        "companyRegNo": (
            onboarding_data.get("companyRegNo")
            or customer.get("registration_no")
        ),
        "vat": (
            onboarding_data.get("vat")
            or customer.get("vat_number")
        ),
        "tin": (
            onboarding_data.get("tin")
            or customer.get("tax_number")
        ),
        "companyEmail": (
            onboarding_data.get("companyEmail")
            or customer.get("email")
        ),
        "companyPhone": (
            onboarding_data.get("companyPhone")
            or customer.get("company_phone")
            or customer.get("phone")
        ),
        "registeredAddress": (
            onboarding_data.get("registeredAddress")
            or customer.get("registered_address_json")
        ),
        "postalAddress": (
            onboarding_data.get("postalAddress")
            or customer.get("postal_address_json")
        ),
        "logoUrl": (
            onboarding_data.get("logoUrl")
            or customer.get("logo_url")
        ),
        "entity_kind": "company",
        "created_via": "firm_client_provisioning",
        "source_customer_company_id": company_id,
        "provisioning_context": "engagement_auto_provision",
    }

    missing = []
    if not (company_payload.get("companyName") or "").strip():
        missing.append("companyName")
    if not (company_payload.get("country") or "").strip():
        missing.append("country")
    if not (company_payload.get("industry") or "").strip():
        missing.append("industry")

    if missing:
        raise ValueError({
            "message": "Customer workspace setup is incomplete.",
            "missing_fields": missing,
        })

    # Heavy provisioning uses its own DB lifecycle internally.
    result = create_company_record_from_payload(
        data=company_payload,
        owner_user_id=current_user_id,
        make_primary_membership=False,
        membership_kind="secondary",
    )

    linked_company_id = int(result["company_id"])

    # IMPORTANT: do not reuse the old outer cursor after provisioning.
    with db_service._conn_cursor() as (conn2, cur2):
        db_service.update_customer_workspace_link(
            cur2,
            company_id,
            customer_id=customer_id,
            linked_company_id=linked_company_id,
            workspace_status="provisioned",
            workspace_created_by_user_id=current_user_id,
        )

        db_service.create_customer_company_link(
            cur2,
            company_id,
            customer_id=customer_id,
            linked_company_id=linked_company_id,
            linked_by_user_id=current_user_id,
            link_type="workspace",
            notes="Auto-provisioned during engagement creation",
        )

        conn2.commit()

    return linked_company_id, "provisioned", "auto_provision"



def derive_fiscal_year_end_from_start(start_iso: str) -> str:
    start_dt = date.fromisoformat(start_iso)
    try:
        next_start = start_dt.replace(year=start_dt.year + 1)
    except ValueError:
        next_start = start_dt.replace(year=start_dt.year + 1, day=28)
    return (next_start - timedelta(days=1)).isoformat()

@engagements_bp.route("/api/companies/<int:cid>/engagements", methods=["POST", "OPTIONS"])
@require_auth
def create_engagement_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    body = {}
    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(
            payload,
            company_id,
            db_service=db_service,
        )
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to create engagements.", 403)

        body = request.get_json(silent=True) or {}

        customer_id = _parse_int(body.get("customer_id"))
        target_company_id = _parse_int(body.get("target_company_id"))
        engagement_name = (body.get("engagement_name") or "").strip()
        engagement_type = (body.get("engagement_type") or "").strip().lower()
        current_user_id = _parse_int(payload.get("user_id") or payload.get("id"))
        partner_user_id = _parse_int(body.get("partner_user_id"))

        if not customer_id:
            return _json_err("customer_id is required.", 400)
        if not engagement_name:
            return _json_err("engagement_name is required.", 400)
        if not engagement_type:
            return _json_err("engagement_type is required.", 400)

        financial_year_start = (body.get("financial_year_start") or "").strip() or None
        if financial_year_start:
            try:
                financial_year_start = date.fromisoformat(financial_year_start).isoformat()
            except ValueError:
                return _json_err("Invalid financial_year_start. Expected YYYY-MM-DD.", 400)

        fiscal_year_end = (
            derive_fiscal_year_end_from_start(financial_year_start)
            if financial_year_start else None
        )

        with db_service._conn_cursor() as (_conn1, cur1):
            policy = db_service.get_engagement_service_policy(cur1, company_id, engagement_type)
            if not policy or not policy.get("is_active"):
                return _json_err("Invalid or inactive engagement_type.", 400)

            requires_workspace = bool(policy.get("requires_workspace"))
            allows_auto_provision = bool(policy.get("allows_auto_provision"))

            workflow_stage = (
                body.get("workflow_stage")
                or policy.get("default_workflow_stage")
                or "planning"
            ).strip().lower()

            priority = (
                body.get("priority")
                or policy.get("default_priority")
                or "normal"
            ).strip().lower()

            workspace_status = "not_required"
            workspace_source = None
            target_company_source = None

            if requires_workspace:
                if target_company_id:
                    workspace_status = "linked"
                    workspace_source = "manual_select"
                    target_company_source = "manual_select"
                else:
                    customer = db_service.get_customer_workspace_link(cur1, company_id, customer_id)
                    if not customer:
                        return _json_err("Customer not found.", 404)

                    linked_company_id = customer.get("company_master_id")
                    if linked_company_id:
                        target_company_id = int(linked_company_id)
                        workspace_status = "linked"
                        workspace_source = "customer_link"
                        target_company_source = "customer_link"

        if requires_workspace and not target_company_id:
            if not allows_auto_provision:
                return _json_err(
                    "This engagement type requires a linked company workspace.",
                    400,
                )

            try:
                with db_service._conn_cursor() as (_conn2, cur2):
                    target_company_id, workspace_status, workspace_source = ensure_customer_workspace(
                        cur=cur2,
                        company_id=company_id,
                        customer_id=customer_id,
                        current_user_id=current_user_id,
                        onboarding_data=body.get("target_company") or {},
                    )
                target_company_source = workspace_source
            except ValueError as ve:
                msg = ve.args[0]
                if isinstance(msg, dict):
                    return _json_err(msg, 400)
                return _json_err(str(msg), 400)

        with db_service._conn_cursor() as (conn3, cur3):
            current_app.logger.warning("create_engagement_route: before create_engagement")
            engagement_id = db_service.create_engagement(
                cur3,
                company_id,
                customer_id=customer_id,
                target_company_id=target_company_id,
                engagement_name=engagement_name,
                engagement_type=engagement_type,
                engagement_code=(body.get("engagement_code") or "").strip() or None,
                status="pending_acceptance",
                governance_mode=(body.get("governance_mode") or "").strip().lower() or None,
                reporting_cycle=(body.get("reporting_cycle") or "").strip().lower() or None,
                due_date=body.get("due_date"),
                start_date=body.get("start_date"),
                end_date=body.get("end_date"),
                manager_user_id=_parse_int(body.get("manager_user_id")),
                partner_user_id=partner_user_id,
                description=(body.get("description") or "").strip() or None,
                scope_summary=(body.get("scope_summary") or "").strip() or None,
                fiscal_year_end=fiscal_year_end,
                priority=priority,
                workflow_stage=workflow_stage,
                created_by_user_id=current_user_id,
                requires_workspace=requires_workspace,
                workspace_status=workspace_status,
                workspace_source=workspace_source,
                target_company_source=target_company_source,
            )

            current_app.logger.warning("create_engagement_route: before create_engagement_acceptance")
            acceptance_id = db_service.create_engagement_acceptance(
                cur3,
                company_id,
                engagement_id=engagement_id,
                acceptance_type="acceptance",
                assigned_partner_user_id=partner_user_id,
                risk_level="normal",
                independence_cleared=False,
                conflicts_checked=False,
                competence_confirmed=False,
                capacity_confirmed=False,
                client_risk_notes="",
                service_complexity_notes="",
                preconditions_notes="",
                decision_notes="",
                valid_from=body.get("start_date"),
                valid_to=body.get("end_date"),
                requested_by_user_id=current_user_id,
                actor_user_id=current_user_id,
            )

            current_app.logger.warning("create_engagement_route: before get_engagement")
            row = db_service.get_engagement(cur3, company_id, engagement_id=engagement_id)

            current_app.logger.warning("create_engagement_route: before _engagement_audit")
            _engagement_audit(
                cur=cur3,
                company_id=company_id,
                payload=payload,
                action="create_engagement",
                entity_type="engagement",
                entity_id=engagement_id,
                entity_ref=(row.get("engagement_name") or engagement_name or f"ENG-{engagement_id}"),
                before_json={"request": body},
                after_json={
                    **(row or {}),
                    "_acceptance": {
                        "acceptance_id": acceptance_id,
                        "status": "draft",
                        "acceptance_type": "acceptance",
                    },
                },
                message=f"Created engagement {engagement_id} pending acceptance",
            )

            current_app.logger.warning("create_engagement_route: before commit")

            conn3.commit()

        return _json_ok({
            "row": row,
            "acceptance_id": acceptance_id,
            "message": "Engagement created and sent for acceptance review.",
        }, 201)

    except Exception as e:
        current_app.logger.exception("create_engagement_route failed; body=%r", body)
        return _json_err(str(e), 500)

@engagements_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>", methods=["PATCH", "OPTIONS"])
@require_auth
def update_engagement_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    body = {}
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

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update engagements.", 403)

        body = request.get_json(silent=True) or {}

        current_user_id = _parse_int(payload.get("user_id") or payload.get("id"))

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)
            if not before_row:
                return _json_err("Engagement not found.", 404)

            # ---- resolve incoming values or keep existing ones ----
            engagement_type = (
                (body.get("engagement_type") or before_row.get("engagement_type") or "")
                .strip()
                .lower()
            )
            if not engagement_type:
                return _json_err("engagement_type is required.", 400)

            customer_id = _parse_int(body.get("customer_id")) or _parse_int(before_row.get("customer_id"))
            if not customer_id:
                return _json_err("customer_id is required.", 400)

            financial_year_start = (
                body.get("financial_year_start")
                or body.get("financial_year_start_date")
                or ""
            )
            financial_year_start = (financial_year_start or "").strip() or None
            if financial_year_start:
                try:
                    financial_year_start = date.fromisoformat(financial_year_start).isoformat()
                except ValueError:
                    return _json_err("Invalid financial_year_start. Expected YYYY-MM-DD.", 400)

            fiscal_year_end = (
                derive_fiscal_year_end_from_start(financial_year_start)
                if financial_year_start
                else body.get("fiscal_year_end")
            )

            # ---- policy lookup, same as create route ----
            policy = db_service.get_engagement_service_policy(cur, company_id, engagement_type)
            if not policy or not policy.get("is_active"):
                return _json_err("Invalid or inactive engagement_type.", 400)

            requires_workspace = bool(policy.get("requires_workspace"))
            allows_auto_provision = bool(policy.get("allows_auto_provision"))

            workflow_stage = (
                body.get("workflow_stage")
                or before_row.get("workflow_stage")
                or policy.get("default_workflow_stage")
                or "planning"
            ).strip().lower()

            priority = (
                body.get("priority")
                or before_row.get("priority")
                or policy.get("default_priority")
                or "normal"
            ).strip().lower()

            # ---- workspace resolution / repair ----
            before_target_company_id = _parse_int(before_row.get("target_company_id"))
            incoming_target_company_id = _parse_int(body.get("target_company_id"))

            target_company_id = before_target_company_id
            workspace_status = before_row.get("workspace_status") or "not_required"
            workspace_source = before_row.get("workspace_source")
            target_company_source = before_row.get("target_company_source")

            if requires_workspace:
                # Only relink if caller explicitly changed the target company
                if incoming_target_company_id and incoming_target_company_id != before_target_company_id:
                    target_company_id = incoming_target_company_id
                    workspace_status = "linked"
                    workspace_source = "manual_select"
                    target_company_source = "manual_select"

                # If no workspace exists at all yet, try customer-linked company
                elif not target_company_id:
                    customer = db_service.get_customer_workspace_link(cur, company_id, customer_id)
                    if not customer:
                        return _json_err("Customer not found.", 404)

                    linked_company_id = customer.get("company_master_id")
                    if linked_company_id:
                        target_company_id = int(linked_company_id)
                        workspace_status = "linked"
                        workspace_source = "customer_link"
                        target_company_source = "customer_link"

                # If still missing, try auto-provision
                if not target_company_id:
                    if not allows_auto_provision:
                        return _json_err(
                            "This engagement type requires a linked company workspace.",
                            400,
                        )

                    try:
                        target_company_id, workspace_status, workspace_source = ensure_customer_workspace(
                            cur=cur,
                            company_id=company_id,
                            customer_id=customer_id,
                            current_user_id=current_user_id,
                            onboarding_data=body.get("target_company") or {},
                        )
                        target_company_source = workspace_source
                    except ValueError as ve:
                        msg = ve.args[0]
                        if isinstance(msg, dict):
                            return _json_err(msg, 400)
                        return _json_err(str(msg), 400)

            else:
                target_company_id = None
                workspace_status = "not_required"
                workspace_source = None
                target_company_source = None

            # ---- update engagement row ----
            out_id = db_service.update_engagement(
                cur,
                company_id,
                engagement_id=engagement_id,
                updated_by_user_id=current_user_id,
                engagement_code=body.get("engagement_code"),
                engagement_name=body.get("engagement_name"),
                engagement_type=engagement_type,
                status=body.get("status"),
                governance_mode=body.get("governance_mode"),
                reporting_cycle=body.get("reporting_cycle"),
                due_date=body.get("due_date"),
                start_date=body.get("start_date"),
                end_date=body.get("end_date"),
                manager_user_id=_parse_int(body.get("manager_user_id")),
                partner_user_id=_parse_int(body.get("partner_user_id")),
                target_company_id=target_company_id,
                description=body.get("description"),
                scope_summary=body.get("scope_summary"),
                fiscal_year_end=fiscal_year_end,
                priority=priority,
                workflow_stage=workflow_stage,
                is_active=_parse_bool(body.get("is_active")),
                requires_workspace=requires_workspace,
                workspace_status=workspace_status,
                workspace_source=workspace_source,
                target_company_source=target_company_source,
            )

            if not out_id:
                return _json_err("Engagement not found.", 404)

            if "manager_user_id" in body or "partner_user_id" in body:
                db_service.assign_manager_and_partner(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    manager_user_id=_parse_int(body.get("manager_user_id")),
                    partner_user_id=_parse_int(body.get("partner_user_id")),
                    updated_by_user_id=current_user_id,
                )

            row = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)

            _engagement_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="update_engagement",
                entity_type="engagement",
                entity_id=engagement_id,
                entity_ref=(row.get("engagement_name") or before_row.get("engagement_name") or f"ENG-{engagement_id}"),
                before_json=before_row,
                after_json=row,
                message=f"Updated engagement {engagement_id}",
            )

            conn.commit()
            return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("update_engagement_route failed; body=%r", body)
        return _json_err(str(e), 500)

@engagements_bp.route("/api/companies/<int:cid>/engagements", methods=["GET", "OPTIONS"])
@require_auth
def list_engagements_route(cid: int):
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

        user_id = _parse_int(payload.get("user_id") or payload.get("sub"))
        if not user_id:
            return _json_err("Missing user id in token", 401)

        status = (request.args.get("status") or "").strip()
        engagement_type = (request.args.get("engagement_type") or "").strip()
        customer_id = _parse_int(request.args.get("customer_id"))
        q = (request.args.get("q") or "").strip()
        limit = _parse_int(request.args.get("limit"), 100)
        offset = _parse_int(request.args.get("offset"), 0)

        assignments_only = str(request.args.get("assignments_only") or "").strip().lower() in ("1", "true", "yes")

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_engagements(
                cur,
                company_id,
                status=status,
                engagement_type=engagement_type,
                customer_id=customer_id,
                q=q,
                limit=limit,
                offset=offset,
                assigned_user_id=user_id if assignments_only else None,
                assignments_only=assignments_only,
            )

        return _json_ok({"rows": rows})

    except Exception as e:
        current_app.logger.exception("list_engagements_route failed")
        return _json_err(str(e), 500)

@engagements_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>", methods=["GET", "OPTIONS"])
@require_auth
def get_engagement_route(cid: int, engagement_id: int):
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

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)
            if not row:
                return _json_err("Engagement not found.", 404)

            team = db_service.list_engagement_team(cur, company_id, engagement_id=engagement_id, active_only=False)

        return _json_ok({"row": row, "team": team})

    except Exception as e:
        current_app.logger.exception("get_engagement_route failed")
        return _json_err(str(e), 500)



@engagements_bp.route(
    "/api/companies/<int:cid>/engagements/<int:engagement_id>/status",
    methods=["POST", "PATCH", "OPTIONS"],
)
@require_auth
def set_engagement_status_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(
            payload,
            company_id,
            db_service=db_service,
        )
        if deny:
            return deny

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        if not status:
            return _json_err("status is required.", 400)

        allowed_statuses = {
            "draft",
            "pending",
            "pending_acceptance",
            "active",
            "declined",
            "on_hold",
            "completed",
            "cancelled",
            "archived",
        }
        if status not in allowed_statuses:
            return _json_err(f"Invalid status '{status}'.", 400)

        closing_statuses = {"completed", "archived", "cancelled"}
        governance_statuses = {"pending_acceptance", "active", "declined"}

        if status in closing_statuses:
            if not _can_close_engagements(payload):
                return _json_err("You do not have permission to set this status.", 403)
        elif status in governance_statuses:
            if not _can_manage_engagements(payload):
                return _json_err("You do not have permission to update engagement status.", 403)
        else:
            if not _can_manage_engagements(payload):
                return _json_err("You do not have permission to update engagement status.", 403)

        updated_by_user_id = _parse_int(
            payload.get("user_id") or payload.get("id") or payload.get("sub")
        )
        if not updated_by_user_id:
            return _json_err("Missing authenticated user id.", 401)

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_engagement(
                cur,
                company_id,
                engagement_id=engagement_id,
            )
            if not before_row:
                return _json_err("Engagement not found.", 404)

            row = db_service.set_engagement_status(
                cur,
                company_id,
                engagement_id=engagement_id,
                status=status,
                updated_by_user_id=updated_by_user_id,
            )
            if not row:
                return _json_err("Engagement not found.", 404)

            _engagement_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="set_engagement_status",
                entity_type="engagement",
                entity_id=engagement_id,
                entity_ref=(
                    row.get("engagement_name")
                    or before_row.get("engagement_name")
                    or f"ENG-{engagement_id}"
                ),
                before_json=before_row,
                after_json=row,
                message=f"Changed engagement {engagement_id} status to {status}",
            )

            conn.commit()

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("set_engagement_status_route failed")
        return _json_err(str(e), 500)
    
@engagements_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/team", methods=["POST", "OPTIONS"])
@require_auth
def add_engagement_team_member_route(cid: int, engagement_id: int):
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

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to manage engagement team.", 403)

        body = request.get_json(silent=True) or {}

        user_id = _parse_int(body.get("user_id"))
        role_on_engagement = (body.get("role_on_engagement") or "").strip().lower()

        if not user_id:
            return _json_err("user_id is required.", 400)
        if not role_on_engagement:
            return _json_err("role_on_engagement is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            parent = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)
            if not parent:
                return _json_err("Engagement not found.", 404)

            team_id = db_service.add_engagement_team_member(
                cur,
                company_id,
                engagement_id=engagement_id,
                user_id=user_id,
                role_on_engagement=role_on_engagement,
                allocation_percent=body.get("allocation_percent"),
                start_date=body.get("start_date"),
                end_date=body.get("end_date"),
                notes=body.get("notes"),
            )

            team = db_service.list_engagement_team(cur, company_id, engagement_id=engagement_id, active_only=False)
            created_row = next((r for r in team if int(r.get("id") or 0) == int(team_id)), None)

            _engagement_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="add_engagement_team_member",
                entity_type="engagement_team_member",
                entity_id=team_id,
                entity_ref=(
                    (created_row or {}).get("role_on_engagement")
                    or role_on_engagement
                    or f"ENG-TEAM-{team_id}"
                ),
                before_json={"request": body},
                after_json=created_row or {"id": team_id, "engagement_id": engagement_id, "user_id": user_id},
                message=f"Added team member {user_id} to engagement {engagement_id}",
            )

        return _json_ok({"id": team_id, "rows": team}, 201)

    except Exception as e:
        current_app.logger.exception("add_engagement_team_member_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/team", methods=["GET", "OPTIONS"])
@require_auth
def list_engagement_team_route(cid: int, engagement_id: int):
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

        active_only = _parse_bool(request.args.get("active_only"), True)

        with db_service._conn_cursor() as (conn, cur):
            parent = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)
            if not parent:
                return _json_err("Engagement not found.", 404)

            rows = db_service.list_engagement_team(
                cur,
                company_id,
                engagement_id=engagement_id,
                active_only=active_only,
            )

        return _json_ok({"rows": rows})

    except Exception as e:
        current_app.logger.exception("list_engagement_team_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route("/api/companies/<int:cid>/engagements/team/<int:engagement_team_id>/deactivate", methods=["POST", "OPTIONS"])
@require_auth
def deactivate_engagement_team_member_route(cid: int, engagement_team_id: int):
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

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to manage engagement team.", 403)

        with db_service._conn_cursor() as (conn, cur):
            before_rows = db_service.list_engagement_team(cur, company_id, engagement_id=None, active_only=False)
            before_row = next((r for r in before_rows if int(r.get("id") or 0) == int(engagement_team_id)), None)
            if not before_row:
                return _json_err("Engagement team record not found.", 404)

            out_id = db_service.deactivate_engagement_team_member(
                cur,
                company_id,
                engagement_team_id=engagement_team_id,
            )
            if not out_id:
                return _json_err("Engagement team record not found.", 404)

            after_rows = db_service.list_engagement_team(
                cur,
                company_id,
                engagement_id=int(before_row.get("engagement_id")),
                active_only=False,
            )
            after_row = next((r for r in after_rows if int(r.get("id") or 0) == int(engagement_team_id)), None) or {
                **before_row,
                "is_active": False,
            }

            _engagement_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="deactivate_engagement_team_member",
                entity_type="engagement_team_member",
                entity_id=engagement_team_id,
                entity_ref=(
                    after_row.get("role_on_engagement")
                    or before_row.get("role_on_engagement")
                    or f"ENG-TEAM-{engagement_team_id}"
                ),
                before_json=before_row,
                after_json=after_row,
                message=f"Deactivated engagement team member {engagement_team_id}",
            )
        return _json_ok({"id": out_id})

    except Exception as e:
        current_app.logger.exception("deactivate_engagement_team_member_route failed")
        return _json_err(str(e), 500)
    

@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-team/capacity/summary",
    methods=["GET", "OPTIONS"],
)
@require_auth
def get_team_capacity_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            company_id,
            db_service=db_service,
        )
        if deny:
            return deny

        search = (request.args.get("q") or "").strip()
        role_on_engagement = (request.args.get("role_on_engagement") or "").strip().lower()
        active_only = _parse_bool(request.args.get("active_only"), True)

        with db_service._conn_cursor() as (conn, cur):
            summary = db_service.get_team_capacity_summary(
                cur,
                company_id,
                search=search,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
            )

        return _json_ok({"summary": summary or {}})

    except Exception as e:
        current_app.logger.exception("get_team_capacity_summary_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-team/capacity/users",
    methods=["GET", "OPTIONS"],
)
@require_auth
def list_team_capacity_users_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            company_id,
            db_service=db_service,
        )
        if deny:
            return deny

        search = (request.args.get("q") or "").strip()
        role_on_engagement = (request.args.get("role_on_engagement") or "").strip().lower()

        active_only = _parse_bool(request.args.get("active_only"), True)
        only_available = _parse_bool(request.args.get("only_available"), False)
        only_overloaded = _parse_bool(request.args.get("only_overloaded"), False)

        limit = _parse_int(request.args.get("limit"), 100)
        offset = _parse_int(request.args.get("offset"), 0)

        if limit is None or limit < 1:
            limit = 100
        if limit > 500:
            limit = 500
        if offset is None or offset < 0:
            offset = 0

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_team_capacity_by_user(
                cur,
                company_id,
                search=search,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
                only_available=only_available,
                only_overloaded=only_overloaded,
                limit=limit,
                offset=offset,
            )

        return _json_ok(
            {
                "rows": rows,
                "filters": {
                    "q": search,
                    "role_on_engagement": role_on_engagement,
                    "active_only": active_only,
                    "only_available": only_available,
                    "only_overloaded": only_overloaded,
                    "limit": limit,
                    "offset": offset,
                },
            }
        )

    except Exception as e:
        current_app.logger.exception("list_team_capacity_users_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-team/capacity/users/<int:user_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def get_team_capacity_user_route(cid: int, user_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            company_id,
            db_service=db_service,
        )
        if deny:
            return deny

        active_only = _parse_bool(request.args.get("active_only"), True)

        with db_service._conn_cursor() as (conn, cur):
            totals = db_service.get_team_capacity_user_totals(
                cur,
                company_id,
                user_id=user_id,
                active_only=active_only,
            )
            engagements = db_service.list_team_capacity_user_engagements(
                cur,
                company_id,
                user_id=user_id,
                active_only=active_only,
            )

        return _json_ok(
            {
                "totals": totals or {},
                "engagements": engagements or [],
            }
        )

    except Exception as e:
        current_app.logger.exception("get_team_capacity_user_route failed")
        return _json_err(str(e), 500)
    
from flask import request, make_response, current_app

@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-team/capacity",
    methods=["GET", "OPTIONS"],
)
@require_auth
def get_team_capacity_dashboard_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(
            payload,
            company_id,
            db_service=db_service,
        )
        if deny:
            return deny

        search = (request.args.get("q") or "").strip()
        role_on_engagement = (request.args.get("role_on_engagement") or "").strip().lower()

        active_only = _parse_bool(request.args.get("active_only"), True)
        only_available = _parse_bool(request.args.get("only_available"), False)
        only_overloaded = _parse_bool(request.args.get("only_overloaded"), False)

        limit = _parse_int(request.args.get("limit"), 100)
        offset = _parse_int(request.args.get("offset"), 0)

        if limit is None or limit < 1:
            limit = 100
        if limit > 500:
            limit = 500

        if offset is None or offset < 0:
            offset = 0

        with db_service._conn_cursor() as (conn, cur):
            summary = db_service.get_team_capacity_summary(
                cur,
                company_id,
                search=search,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
            )

            rows = db_service.list_team_capacity_by_user(
                cur,
                company_id,
                search=search,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
                only_available=only_available,
                only_overloaded=only_overloaded,
                limit=limit,
                offset=offset,
            )

        return _json_ok({
            "summary": summary or {},
            "rows": rows or [],
            "filters": {
                "q": search,
                "role_on_engagement": role_on_engagement,
                "active_only": active_only,
                "only_available": only_available,
                "only_overloaded": only_overloaded,
                "limit": limit,
                "offset": offset,
            },
        })

    except Exception as e:
        current_app.logger.exception("get_team_capacity_dashboard_route failed")
        return _json_err(str(e), 500)

@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-escalations",
    methods=["GET", "OPTIONS"],
)
@require_auth
def list_engagement_escalations_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        engagement_id = _parse_int(request.args.get("engagement_id"))
        customer_id = _parse_int(request.args.get("customer_id"))
        assigned_to_user_id = _parse_int(request.args.get("assigned_to_user_id"))

        status = (request.args.get("status") or "").strip().lower()
        severity = (request.args.get("severity") or "").strip().lower()
        escalation_type = (request.args.get("escalation_type") or "").strip().lower()
        source_type = (request.args.get("source_type") or "").strip().lower()
        q = (request.args.get("q") or "").strip()

        active_only = _parse_bool(request.args.get("active_only"), True)
        limit = _parse_int(request.args.get("limit"), 100)
        offset = _parse_int(request.args.get("offset"), 0)

        if limit is None or limit < 1:
            limit = 100
        if limit > 500:
            limit = 500
        if offset is None or offset < 0:
            offset = 0

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_engagement_escalations(
                cur,
                company_id,
                engagement_id=engagement_id,
                customer_id=customer_id,
                status=status,
                severity=severity,
                escalation_type=escalation_type,
                source_type=source_type,
                assigned_to_user_id=assigned_to_user_id,
                q=q,
                active_only=active_only,
                limit=limit,
                offset=offset,
            )

        return _json_ok({
            "rows": rows or [],
            "filters": {
                "engagement_id": engagement_id,
                "customer_id": customer_id,
                "assigned_to_user_id": assigned_to_user_id,
                "status": status,
                "severity": severity,
                "escalation_type": escalation_type,
                "source_type": source_type,
                "q": q,
                "active_only": active_only,
                "limit": limit,
                "offset": offset,
            },
        })

    except Exception as e:
        current_app.logger.exception("list_engagement_escalations_route failed")
        return _json_err(str(e), 500)
    
@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-escalations/<int:escalation_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def get_engagement_escalation_route(cid: int, escalation_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_engagement_escalation(
                cur,
                company_id,
                escalation_id=escalation_id,
            )

        if not row:
            return _json_err("Escalation not found.", 404)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("get_engagement_escalation_route failed")
        return _json_err(str(e), 500)
    

@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-escalations/<int:escalation_id>",
    methods=["PUT", "OPTIONS"],
)
@require_auth
def update_engagement_escalation_route(cid: int, escalation_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        body = request.get_json(silent=True) or {}

        source_id = _parse_int(body.get("source_id")) if "source_id" in body else None
        assigned_to_user_id = _parse_int(body.get("assigned_to_user_id")) if "assigned_to_user_id" in body else None

        source_type = (body.get("source_type") or "").strip().lower() if "source_type" in body else None
        escalation_type = (body.get("escalation_type") or "").strip().lower() if "escalation_type" in body else None
        severity = (body.get("severity") or "").strip().lower() if "severity" in body else None
        title = body.get("title") if "title" in body else None
        description = body.get("description") if "description" in body else None
        status = (body.get("status") or "").strip().lower() if "status" in body else None
        due_date = body.get("due_date") if "due_date" in body else None

        user_id = _parse_int(payload.get("user_id") or payload.get("id"))

        with db_service._conn_cursor() as (conn, cur):
            existing = db_service.get_engagement_escalation(
                cur,
                company_id,
                escalation_id=escalation_id,
            )
            if not existing:
                return _json_err("Escalation not found.", 404)

            db_service.update_engagement_escalation(
                cur,
                company_id,
                escalation_id=escalation_id,
                source_type=source_type,
                source_id=source_id,
                escalation_type=escalation_type,
                severity=severity,
                title=title,
                description=description,
                status=status,
                assigned_to_user_id=assigned_to_user_id,
                due_date=due_date,
                updated_by_user_id=user_id,
            )

            row = db_service.get_engagement_escalation(
                cur,
                company_id,
                escalation_id=escalation_id,
            )

            conn.commit()

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("update_engagement_escalation_route failed")
        return _json_err(str(e), 500)
    
@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-escalations/<int:escalation_id>/deactivate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deactivate_engagement_escalation_route(cid: int, escalation_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        user_id = _parse_int(payload.get("user_id") or payload.get("id"))

        with db_service._conn_cursor() as (conn, cur):
            affected = db_service.deactivate_engagement_escalation(
                cur,
                company_id,
                escalation_id=escalation_id,
                updated_by_user_id=user_id,
            )
            conn.commit()

        if not affected:
            return _json_err("Escalation not found or already inactive.", 404)

        return _json_ok({"ok": True})

    except Exception as e:
        current_app.logger.exception("deactivate_engagement_escalation_route failed")
        return _json_err(str(e), 500)
    
@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-escalations/auto-backfill-overdue-working-papers",
    methods=["POST", "OPTIONS"],
)
@require_auth
def backfill_overdue_working_paper_escalations_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        with db_service._conn_cursor() as (conn, cur):
            inserted = db_service.backfill_overdue_working_paper_escalations(
                cur,
                company_id,
            )
            conn.commit()

        return _json_ok({"inserted": inserted})

    except Exception as e:
        current_app.logger.exception("backfill_overdue_working_paper_escalations_route failed")
        return _json_err(str(e), 500)

@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-acceptance",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def engagement_acceptance_list_create_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        if request.method == "GET":
            engagement_id = _parse_int(request.args.get("engagement_id"))
            customer_id = _parse_int(request.args.get("customer_id"))
            acceptance_type = (request.args.get("acceptance_type") or "").strip().lower()
            status = (request.args.get("status") or "").strip().lower()
            risk_level = (request.args.get("risk_level") or "").strip().lower()
            assigned_partner_user_id = _parse_int(request.args.get("assigned_partner_user_id"))
            q = (request.args.get("q") or "").strip()
            active_only = str(request.args.get("active_only", "true")).strip().lower() in ("1", "true", "yes", "on")
            limit = _parse_int(request.args.get("limit")) or 100
            offset = _parse_int(request.args.get("offset")) or 0

            with db_service._conn_cursor() as (conn, cur):
                rows = db_service.list_engagement_acceptance_items(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    customer_id=customer_id,
                    acceptance_type=acceptance_type,
                    status=status,
                    risk_level=risk_level,
                    assigned_partner_user_id=assigned_partner_user_id,
                    q=q,
                    active_only=active_only,
                    limit=limit,
                    offset=offset,
                )

            return _json_ok(rows or [])

        body = request.get_json(silent=True) or {}
        user_id = _parse_int(payload.get("user_id") or payload.get("id"))

        with db_service._conn_cursor() as (conn, cur):
            acceptance_id = db_service.create_engagement_acceptance(
                cur,
                company_id,
                engagement_id=_parse_int(body.get("engagement_id")),
                acceptance_type=(body.get("acceptance_type") or "acceptance"),
                assigned_partner_user_id=_parse_int(body.get("assigned_partner_user_id")),
                risk_level=(body.get("risk_level") or "normal"),
                independence_cleared=bool(body.get("independence_cleared")),
                conflicts_checked=bool(body.get("conflicts_checked")),
                competence_confirmed=bool(body.get("competence_confirmed")),
                capacity_confirmed=bool(body.get("capacity_confirmed")),
                client_risk_notes=body.get("client_risk_notes") or "",
                service_complexity_notes=body.get("service_complexity_notes") or "",
                preconditions_notes=body.get("preconditions_notes") or "",
                decision_notes=body.get("decision_notes") or "",
                valid_from=body.get("valid_from"),
                valid_to=body.get("valid_to"),
                requested_by_user_id=user_id,
                actor_user_id=user_id,
            )

            row = db_service.get_engagement_acceptance_detail(
                cur,
                company_id,
                acceptance_id=acceptance_id,
            )

            conn.commit()

        return _json_ok({"row": row}, 201)

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("engagement_acceptance_list_create_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-acceptance/<int:acceptance_id>",
    methods=["GET", "PUT", "OPTIONS"],
)
@require_auth
def update_engagement_acceptance_route(cid: int, acceptance_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        with db_service._conn_cursor() as (conn, cur):
            if request.method == "GET":
                row = db_service.get_engagement_acceptance_detail(
                    cur,
                    company_id,
                    acceptance_id=acceptance_id,
                )
                if not row:
                    return _json_err("Engagement acceptance item not found.", 404)
                return _json_ok({"row": row})

            body = request.get_json(silent=True) or {}
            user_id = _parse_int(payload.get("user_id") or payload.get("id"))

            existing = db_service.get_engagement_acceptance_detail(
                cur,
                company_id,
                acceptance_id=acceptance_id,
            )
            if not existing:
                return _json_err("Engagement acceptance item not found.", 404)

            db_service.update_engagement_acceptance(
                cur,
                company_id,
                acceptance_id=acceptance_id,
                acceptance_type=(body.get("acceptance_type") or "acceptance"),
                assigned_partner_user_id=_parse_int(body.get("assigned_partner_user_id")),
                risk_level=(body.get("risk_level") or "normal"),
                independence_cleared=bool(body.get("independence_cleared")),
                conflicts_checked=bool(body.get("conflicts_checked")),
                competence_confirmed=bool(body.get("competence_confirmed")),
                capacity_confirmed=bool(body.get("capacity_confirmed")),
                client_risk_notes=body.get("client_risk_notes") or "",
                service_complexity_notes=body.get("service_complexity_notes") or "",
                preconditions_notes=body.get("preconditions_notes") or "",
                decision_notes=body.get("decision_notes") or "",
                valid_from=body.get("valid_from"),
                valid_to=body.get("valid_to"),
                actor_user_id=user_id,
            )

            row = db_service.get_engagement_acceptance_detail(
                cur,
                company_id,
                acceptance_id=acceptance_id,
            )

            conn.commit()

        return _json_ok({"row": row})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("update_engagement_acceptance_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route(
    "/api/companies/<int:cid>/engagement-acceptance/<int:acceptance_id>/decision",
    methods=["POST", "OPTIONS"],
)
@require_auth
def decide_engagement_acceptance_route(cid: int, acceptance_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        body = request.get_json(silent=True) or {}
        action = (body.get("action") or "").strip().lower()
        decision_notes = (body.get("decision_notes") or "").strip()
        user_id = _parse_int(payload.get("user_id") or payload.get("id"))

        if not user_id:
            return _json_err("Missing authenticated user id.", 401)

        if action not in ("submit", "approve", "decline", "return"):
            return _json_err("Unsupported action.", 400)

        with db_service._conn_cursor() as (conn, cur):
            existing = db_service.get_engagement_acceptance_detail(
                cur,
                company_id,
                acceptance_id=acceptance_id,
            )
            if not existing:
                return _json_err("Engagement acceptance item not found.", 404)

            db_service.apply_engagement_acceptance_decision(
                cur,
                company_id,
                acceptance_id=acceptance_id,
                action=action,
                actor_user_id=user_id,
                decision_notes=decision_notes,
            )

            acceptance_row = db_service.get_engagement_acceptance_detail(
                cur,
                company_id,
                acceptance_id=acceptance_id,
            )
            if not acceptance_row:
                return _json_err("Engagement acceptance item not found after update.", 404)

            engagement_id = acceptance_row.get("engagement_id")
            if not engagement_id:
                return _json_err("Linked engagement not found for acceptance item.", 400)

            if action == "approve":
                db_service.set_engagement_status(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    status="active",
                    updated_by_user_id=user_id,
                )
            elif action == "decline":
                db_service.set_engagement_status(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    status="declined",
                    updated_by_user_id=user_id,
                )
            elif action in ("submit", "return"):
                db_service.set_engagement_status(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    status="pending_acceptance",
                    updated_by_user_id=user_id,
                )

            engagement_row = db_service.get_engagement(
                cur,
                company_id,
                engagement_id=engagement_id,
            )

            _engagement_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="decide_engagement_acceptance",
                entity_type="engagement_acceptance",
                entity_id=acceptance_id,
                entity_ref=(
                    acceptance_row.get("engagement_name")
                    or (engagement_row or {}).get("engagement_name")
                    or f"EA-{acceptance_id}"
                ),
                before_json=existing,
                after_json=acceptance_row,
                message=f"Applied engagement acceptance action '{action}' to acceptance {acceptance_id}",
            )

            conn.commit()

        return _json_ok({
            "updated": True,
            "action": action,
            "row": acceptance_row,
            "engagement_row": engagement_row,
        })

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("decide_engagement_acceptance_route failed")
        return _json_err(str(e), 500)