import { useEffect, useState } from "react";
import {
  Bell,
  Check,
  AlertTriangle,
  XCircle,
  Info,
} from "lucide-react";
import { api } from "../api/client";

function iconForSeverity(severity) {
  if (severity === "critical") {
    return <XCircle size={17} />;
  }

  if (severity === "warning") {
    return <AlertTriangle size={17} />;
  }

  return <Info size={17} />;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function loadNotifications() {
    try {
      const data = await api.get(
        "/notifications?limit=10"
      );

      setNotifications(
        data.notifications || []
      );

      setUnreadCount(
        data.unread_count || 0
      );
    } catch {
      // Notification failures must not break Control UI.
    }
  }

  async function markRead(id) {
    try {
      const data = await api.post(
        `/notifications/${id}/read`,
        {}
      );

      setUnreadCount(
        data.unread_count || 0
      );

      setNotifications((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                is_read: true,
                read_at: new Date().toISOString(),
              }
            : item
        )
      );
    } catch {
      // Ignore notification UI errors.
    }
  }

  async function markAllRead() {
    try {
      await api.post(
        "/notifications/read-all",
        {}
      );

      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          is_read: true,
        }))
      );

      setUnreadCount(0);
    } catch {
      // Ignore notification UI errors.
    }
  }

  useEffect(() => {
    loadNotifications();

    const timer = setInterval(
      loadNotifications,
      30000
    );

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative p-2 rounded-lg hover:bg-slate-800 text-slate-300"
        title="Notifications"
      >
        <Bell size={19} />

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
            {unreadCount > 99
              ? "99+"
              : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[380px] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <div>
              <div className="font-semibold text-white">
                Notifications
              </div>

              <div className="text-xs text-slate-400 mt-1">
                {unreadCount} unread
              </div>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-slate-300 hover:text-white"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {!notifications.length && (
              <div className="p-6 text-center text-sm text-slate-500">
                No notifications.
              </div>
            )}

            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() =>
                  !notification.is_read &&
                  markRead(notification.id)
                }
                className={`w-full text-left px-4 py-4 border-b border-slate-800 hover:bg-slate-800/70 ${
                  notification.is_read
                    ? ""
                    : "bg-slate-800/30"
                }`}
              >
                <div className="flex gap-3">
                  <div
                    className={`mt-0.5 ${
                      notification.severity === "critical"
                        ? "text-red-400"
                        : notification.severity === "warning"
                          ? "text-amber-400"
                          : "text-sky-400"
                    }`}
                  >
                    {iconForSeverity(
                      notification.severity
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-white text-sm">
                        {notification.title}
                      </div>

                      {!notification.is_read && (
                        <span className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      )}
                    </div>

                    <div className="text-xs text-slate-400 mt-1">
                      {notification.message}
                    </div>

                    <div className="text-[11px] text-slate-500 mt-2">
                      {notification.created_at
                        ? new Date(
                            notification.created_at
                          ).toLocaleString()
                        : ""}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}