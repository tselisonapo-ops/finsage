from flask import Blueprint, request, jsonify, g

from BackEnd.Services.control_auth import require_control_auth


control_notifications_bp = Blueprint(
    "control_notifications",
    __name__,
    url_prefix="/api/control/notifications",
)


@control_notifications_bp.get("")
@require_control_auth
def get_notifications():
    limit = request.args.get(
        "limit",
        50,
        type=int,
    )

    unread_only = (
        request.args.get(
            "unread_only",
            "false",
        ).lower()
        == "true"
    )

    user_id = g.control_user["id"]

    return jsonify({
        "notifications":
            g.control_service.notification_service.get_notifications(
                user_id,
                limit=limit,
                unread_only=unread_only,
            ),
        "unread_count":
            g.control_service.notification_service.get_unread_count(
                user_id
            ),
    })


@control_notifications_bp.get("/unread-count")
@require_control_auth
def get_unread_count():
    user_id = g.control_user["id"]

    return jsonify({
        "unread_count":
            g.control_service.notification_service.get_unread_count(
                user_id
            ),
    })


@control_notifications_bp.post(
    "/<int:notification_id>/read"
)
@require_control_auth
def mark_notification_read(notification_id):
    user_id = g.control_user["id"]

    notification = (
        g.control_service.notification_service
        .mark_notification_read(
            notification_id,
            user_id,
        )
    )

    g.control_service.audit(
        action="notification.read",
        entity_type="notification",
        entity_id=notification_id,
        description="Control administrator marked a notification as read.",
        request=request,
        control_user_id=user_id,
    )

    return jsonify({
        "notification": notification,
        "unread_count":
            g.control_service.notification_service.get_unread_count(
                user_id
            ),
    })


@control_notifications_bp.post("/read-all")
@require_control_auth
def mark_all_notifications_read():
    user_id = g.control_user["id"]

    result = (
        g.control_service.notification_service
        .mark_all_notifications_read(
            user_id
        )
    )

    g.control_service.audit(
        action="notification.read_all",
        entity_type="notification",
        description="Control administrator marked all notifications as read.",
        request=request,
        control_user_id=user_id,
    )
    return jsonify(result)


@control_notifications_bp.get("/preferences")
@require_control_auth
def get_notification_preferences():
    user_id = g.control_user["id"]

    return jsonify({
        "preferences":
            g.control_service.notification_service
            .get_preferences(user_id)
    })


@control_notifications_bp.put("/preferences")
@require_control_auth
def update_notification_preferences():
    data = request.get_json(silent=True) or {}

    user_id = g.control_user["id"]

    preferences = (
        g.control_service.notification_service
        .update_preferences(
            user_id,
            data,
        )
    )

    g.control_service.audit(
        action="notification_preferences.updated",
        entity_type="notification_preferences",
        entity_id=user_id,
        description=(
            "Control administrator updated "
            "notification preferences."
        ),
        after_data=preferences,
        request=request,
        control_user_id=user_id,
    )

    return jsonify({
        "preferences": preferences
    })

@control_notifications_bp.post("/test")
@require_control_auth
def create_test_notification():
    user_id = g.control_user["id"]

    notification = (
        g.control_service.notification_service
        .create_notification(
            notification_type="test",
            title="FinSage Notification Test",
            message=(
                "This is a test notification from "
                "the FinSage Control system."
            ),
            severity="info",
            control_user_id=user_id,
            send_email=False,
        )
    )

    g.control_service.audit(
        action="notification.test_created",
        entity_type="notification",
        entity_id=notification["id"],
        description="Control administrator created a test notification.",
        request=request,
        control_user_id=user_id,
    )

    return jsonify({
        "notification": notification
    })