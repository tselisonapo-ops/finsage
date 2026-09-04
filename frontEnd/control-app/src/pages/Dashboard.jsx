import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import { formatDateTime, timeAgo, getPriority, getTicketTypeLabel } from '../lib/constants'
import {
  Ticket, AlertTriangle, Clock, TrendingUp, Users, Activity, BarChart3, ArrowUpRight
} from 'lucide-react'

export default function Dashboard() {
  const { agent } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard').then(setStats).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-surface-300">Loading dashboard...</div>
  if (!stats) return <div className="p-8 text-red-400">Failed to load dashboard</div>

  const cards = [
    { label: 'Open Tickets', value: stats.open_tickets, icon: Ticket, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Critical', value: stats.critical_tickets, icon: AlertTriangle, color: 'text-p1', bg: 'bg-p1/10' },
    { label: 'New', value: stats.new_tickets, icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'SLA Compliance', value: `${stats.sla_compliance_pct}%`, icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-surface-100">FinSage Control</h1>
        <p className="text-sm text-surface-300 mt-0.5">Welcome back, {agent?.display_name}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(c => (
          <div key={c.label} className="bg-surface-800 rounded-xl border border-surface-600 p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                <div className="text-xs text-surface-300">{c.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {/* Today's Activity */}
        <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
          <h3 className="text-sm font-semibold text-surface-100 mb-3">Today's Activity</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-200">Created</span>
              <span className="text-sm font-semibold text-accent">{stats.created_today}</span>
            </div>
            <div className="w-full bg-surface-700 rounded-full h-1.5">
              <div className="bg-accent h-1.5 rounded-full" style={{ width: `${Math.min(stats.created_today * 3, 100)}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-200">Resolved</span>
              <span className="text-sm font-semibold text-success">{stats.resolved_today}</span>
            </div>
            <div className="w-full bg-surface-700 rounded-full h-1.5">
              <div className="bg-success h-1.5 rounded-full" style={{ width: `${Math.min(stats.resolved_today * 3, 100)}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-200">Unresponded</span>
              <span className="text-sm font-semibold text-warning">{stats.unresponded}</span>
            </div>
          </div>
        </div>

        {/* Top Modules */}
        <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
          <h3 className="text-sm font-semibold text-surface-100 mb-3">Most Reported Modules</h3>
          <div className="space-y-2">
            {stats.top_modules?.slice(0, 5).map((m, i) => {
              const max = stats.top_modules?.[0]?.count || 1
              return (
                <div key={m.module}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-surface-200 truncate mr-2">
                      <span className="text-surface-400 mr-1.5">{i + 1}.</span>
                      {m.module === 'Unspecified' ? 'Other' : m.module.replace(/_/g, ' ')}
                    </span>
                    <span className="text-surface-300 font-medium shrink-0">{m.count}</span>
                  </div>
                  <div className="w-full bg-surface-700 rounded-full h-1">
                    <div className="bg-accent/60 h-1 rounded-full" style={{ width: `${(m.count / max) * 100}%` }} />
                  </div>
                </div>
              )
            })}
            {(!stats.top_modules || stats.top_modules.length === 0) && (
              <p className="text-xs text-surface-400">No data yet</p>
            )}
          </div>
        </div>

        {/* Agent Workload */}
        <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
          <h3 className="text-sm font-semibold text-surface-100 mb-3">Support Team</h3>
          <div className="space-y-2">
            {stats.agent_workload?.map(a => (
              <div key={a.display_name} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                    {a.display_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <span className="text-sm text-surface-200">{a.display_name}</span>
                </div>
                <span className={`text-sm font-medium ${a.open_count > 10 ? 'text-p2' : 'text-surface-300'}`}>
                  {a.open_count} open
                </span>
              </div>
            ))}
            {(!stats.agent_workload || stats.agent_workload.length === 0) && (
              <p className="text-xs text-surface-400">No agents active</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Tickets */}
      <div className="bg-surface-800 rounded-xl border border-surface-600">
        <div className="px-4 py-3 border-b border-surface-600 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-100">Recent Tickets</h3>
          <button onClick={() => navigate('/control/tickets')} className="text-xs text-accent hover:text-accent-hover flex items-center gap-1">
            View all <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
        <div className="divide-y divide-surface-600">
          {stats.recent_tickets?.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-surface-400">No tickets yet</div>
          )}
          {stats.recent_tickets?.map(t => (
            <button
              key={t.id}
              onClick={() => navigate(`/control/tickets/${t.id}`)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-700/50 transition-colors text-left"
            >
              <StatusBadge status={t.status} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-surface-100 truncate">{t.subject}</div>
                <div className="text-xs text-surface-300">{t.company_name || 'No company'} &middot; {t.ticket_number}</div>
              </div>
              <div className="text-xs text-surface-400 shrink-0">{timeAgo(t.created_at)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}