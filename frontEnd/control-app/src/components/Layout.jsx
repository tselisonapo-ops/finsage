import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, Ticket, Users, Settings, LogOut, Command, ChevronLeft, ChevronRight
} from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { to: '/control', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/control/tickets', icon: Ticket, label: 'Tickets' },
  { to: '/control/customers', icon: Users, label: 'Customers' },
  { to: '/control/settings', icon: Settings, label: 'Settings' },
]

export default function Layout() {
  const { agent, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/control/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-surface-800 border-r border-surface-600 flex flex-col transition-all duration-200 shrink-0`}>
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
        <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-surface-200 hover:text-surface-100 hover:bg-surface-700'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-surface-600 p-3 flex flex-col gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-surface-300 hover:text-surface-100 rounded hover:bg-surface-700"
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            {!collapsed && 'Collapse'}
          </button>
          {!collapsed && (
            <div className="px-2 py-1.5">
              <div className="text-xs font-medium text-surface-100 truncate">{agent?.display_name}</div>
              <div className="text-xs text-surface-300 capitalize">{agent?.role}</div>
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
      <main className="flex-1 overflow-auto bg-surface-900">
        <Outlet />
      </main>
    </div>
  )
}