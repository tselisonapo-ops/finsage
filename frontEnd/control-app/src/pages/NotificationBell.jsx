import { useEffect, useState } from 'react'
import {
  Bell,
  AlertTriangle,
  XCircle,
  Info,
} from 'lucide-react'

import { api } from '../api/client'

function iconForSeverity(severity) {
  if (severity === 'critical') {
    return <XCircle size={17} />
  }

  if (severity === 'warning') {
    return <AlertTriangle size={17} />
  }

  return <Info size={17} />
}

function severityClass(severity) {
  if (severity === 'critical') {
    return 'text-error'
  }

  if (severity === 'warning') {
    return 'text-warning'
  }

  return 'text-info'
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  async function loadNotifications() {
    try {
      const data = await api.get(
        '/notifications?limit=10'
      )

      setNotifications(
        data.notifications || []
      )

      setUnreadCount(
        data.unread_count || 0
      )
    } catch {
      // Notification failures must not break Control UI.
    }
  }

  async function markRead(id) {
    try {
      const data = await api.post(
        `/notifications/${id}/read`,
        {}
      )

      setUnreadCount(
        data.unread_count || 0
      )

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
      )
    } catch {
      // Ignore notification UI errors.
    }
  }

  async function markAllRead() {
    try {
      await api.post(
        '/notifications/read-all',
        {}
      )

      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          is_read: true,
        }))
      )

      setUnreadCount(0)
    } catch {
      // Ignore notification UI errors.
    }
  }

  useEffect(() => {
    loadNotifications()

    const timer = setInterval(
      loadNotifications,
      30000
    )

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="relative">
      {/* Notification Button */}
      <button
        type="button"
        onClick={() =>
          setOpen((value) => !value)
        }
        className="
          relative
          p-2
          rounded-lg
          text-surface-300
          hover:text-surface-100
          hover:bg-surface-700
          transition-colors
        "
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell size={19} />

        {unreadCount > 0 && (
          <span className="
            absolute
            -top-1
            -right-1
            min-w-[18px]
            h-[18px]
            px-1
            rounded-full
            bg-error
            text-white
            text-[10px]
            font-semibold
            flex
            items-center
            justify-center
            border-2
            border-surface-900
          ">
            {unreadCount > 99
              ? '99+'
              : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {open && (
        <div className="
          absolute
          right-0
          top-11
          z-50
          w-[calc(100vw-2rem)]
          max-w-[380px]
          rounded-xl
          border border-surface-600
          bg-surface-800
          shadow-2xl
          overflow-hidden
        ">
          {/* Header */}
          <div className="
            px-4 py-3
            border-b border-surface-600
            flex
            items-center
            justify-between
            gap-4
          ">
            <div>
              <div className="
                font-semibold
                text-surface-100
              ">
                Notifications
              </div>

              <div className="
                text-xs
                text-surface-400
                mt-1
              ">
                {unreadCount} unread
              </div>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="
                  text-xs
                  text-accent
                  hover:text-accent-hover
                  font-medium
                  transition-colors
                  whitespace-nowrap
                "
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="
            max-h-[420px]
            overflow-y-auto
          ">
            {!notifications.length && (
              <div className="
                p-8
                text-center
              ">
                <div className="
                  w-10 h-10
                  rounded-lg
                  bg-surface-700
                  flex
                  items-center
                  justify-center
                  mx-auto
                  mb-3
                ">
                  <Bell
                    size={18}
                    className="text-surface-400"
                  />
                </div>

                <div className="
                  text-sm
                  text-surface-300
                ">
                  No notifications.
                </div>
              </div>
            )}

            {notifications.map(
              (notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() =>
                    !notification.is_read &&
                    markRead(notification.id)
                  }
                  className={`
                    w-full
                    text-left
                    px-4 py-4
                    border-b
                    border-surface-600
                    last:border-b-0
                    hover:bg-surface-700/70
                    transition-colors
                    ${
                      notification.is_read
                        ? 'bg-surface-800'
                        : 'bg-accent-muted/40'
                    }
                  `}
                >
                  <div className="flex gap-3">
                    {/* Severity Icon */}
                    <div
                      className={`
                        mt-0.5
                        shrink-0
                        ${severityClass(
                          notification.severity
                        )}
                      `}
                    >
                      {iconForSeverity(
                        notification.severity
                      )}
                    </div>

                    {/* Content */}
                    <div className="
                      min-w-0
                      flex-1
                    ">
                      <div className="
                        flex
                        items-start
                        justify-between
                        gap-2
                      ">
                        <div className="
                          font-medium
                          text-surface-100
                          text-sm
                          leading-snug
                        ">
                          {notification.title}
                        </div>

                        {!notification.is_read && (
                          <span className="
                            w-2
                            h-2
                            rounded-full
                            bg-accent
                            mt-1.5
                            shrink-0
                          " />
                        )}
                      </div>

                      <div className="
                        text-xs
                        text-surface-300
                        mt-1
                        leading-relaxed
                      ">
                        {notification.message}
                      </div>

                      <div className="
                        text-[11px]
                        text-surface-400
                        mt-2
                      ">
                        {notification.created_at
                          ? new Date(
                              notification.created_at
                            ).toLocaleString()
                          : ''}
                      </div>
                    </div>
                  </div>
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}