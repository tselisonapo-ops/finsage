import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard,
  Ticket,
  Users,
  Settings,
  Activity,
  ScrollText,
  Zap,
  LogOut,
  Command,
  ChevronLeft,
  ChevronRight,
  Bell,
  Volume2,
  VolumeX,
  CreditCard,            // ← ADDED for the Subscriptions nav entry
} from 'lucide-react'
import { useEffect, useState } from 'react'
import NotificationBell from '../pages/NotificationBell'
import { api } from '../api/client'
import { isMuted, toggleMuted } from '../lib/sound'

const NAV = [
  { to: '/',              icon: LayoutDashboard, label: 'Dashboard',     end: true },
  { to: '/alerts',        icon: Bell,             label: 'System Alerts' },
  { to: '/tickets',       icon: Ticket,           label: 'Tickets' },
  { to: '/customers',     icon: Users,            label: 'Customers' },
  { to: '/subscriptions', icon: CreditCard,       label: 'Subscriptions' },   // ← ADDED
  { to: '/system/health', icon: Activity,         label: 'System Health' },
  { to: '/audit',         icon: ScrollText,       label: 'Audit Trail' },
  { to: '/automation',    icon: Zap,              label: 'Automation' },
  { to: '/settings',      icon: Settings,         label: 'Settings' },
]

export default function Layout() {
  const { agent, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  // Sound toggle state + open-alerts badge
  const [muted, setMuted] = useState(isMuted())
  const [openAlerts, setOpenAlerts] = useState(0)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Poll the alerts unread-count endpoint for the nav badge.
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await api.get('/system/alerts/unread-count')
        if (!cancelled) setOpenAlerts(data?.open_count || 0)
      } catch {
        // Best-effort — never block the shell.
      }
    }

    load()
    const t = setInterval(load, 15000)

    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  // Keep mute state in sync with other components (header toggle).
  useEffect(() => {
    function onMute(e) { setMuted(!!e.detail.muted) }
    function onStorage() { setMuted(isMuted()) }

    window.addEventListener('finsage:sound-mute-changed', onMute)
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener('finsage:sound-mute-changed', onMute)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const handleToggleMute = () => {
    toggleMuted()
    setMuted(isMuted())
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-56'
        } bg-surface-800 border-r border-surface-600 flex flex-col transition-all duration-200 shrink-0`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-surface-600">
          <Command className="w-6 h-6 text-accent shrink-0" />

          {!collapsed && (
            <span className="font-semibold text-sm tracking-wide text-surface-100">
              FINSAGE CONTROL
            </span>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2 overflow-y-auto">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-surface-200 hover:text-surface-100 hover:bg-surface-700'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />

              {!collapsed && item.label}

              {/* Red badge for open system alerts */}
              {!collapsed && item.to === '/alerts' && openAlerts > 0 && (
                <span className="
                  ml-auto
                  min-w-[20px]
                  h-5
                  px-1.5
                  rounded-full
                  bg-error
                  text-white
                  text-[10px]
                  font-semibold
                  flex
                  items-center
                  justify-center
                ">
                  {openAlerts > 99 ? '99+' : openAlerts}
                </span>
              )}

              {/* Collapsed-mode mini badge */}
              {collapsed && item.to === '/alerts' && openAlerts > 0 && (
                <span className="
                  absolute
                  -top-0.5
                  -right-0.5
                  min-w-[16px]
                  h-4
                  px-1
                  rounded-full
                  bg-error
                  text-white
                  text-[9px]
                  font-semibold
                  flex
                  items-center
                  justify-center
                ">
                  {openAlerts > 9 ? '9+' : openAlerts}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-surface-600 p-3 flex flex-col gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-surface-300 hover:text-surface-100 rounded hover:bg-surface-700"
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}

            {!collapsed && 'Collapse'}
          </button>

          {!collapsed && (
            <div className="px-2 py-1.5">
              <div className="text-xs font-medium text-surface-100 truncate">
                {agent?.display_name}
              </div>

              <div className="text-xs text-surface-300 capitalize">
                {agent?.role}
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!collapsed && 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden bg-surface-900 flex flex-col">
        {/* Top bar — sound toggle + the bell */}
        <header className="h-14 shrink-0 border-b border-surface-600 bg-surface-800 flex items-center justify-end px-5 gap-2">
          {/* Sound mute toggle */}
          <button
            type="button"
            onClick={handleToggleMute}
            title={muted ? 'Unmute alert sounds' : 'Mute alert sounds'}
            aria-label={muted ? 'Unmute alert sounds' : 'Mute alert sounds'}
            className={`relative p-2 rounded-lg transition-colors ${
              muted
                ? 'text-surface-400 hover:text-surface-100 hover:bg-surface-700'
                : 'text-accent hover:bg-surface-700'
            }`}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          <NotificationBell />
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
