import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { timeAgo } from '../lib/constants'

// NEW — sound on new system error
import { playAlertDebounced } from '../lib/sound'

import {
  Ticket, AlertTriangle, Clock, TrendingUp, Activity, ArrowUpRight, ExternalLink,
  CreditCard, Users, Wallet, CalendarDays, Sparkles, CheckCircle2
} from 'lucide-react'

export default function Dashboard() {
  const { agent } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [subStats, setSubStats] = useState(null)
  const [systemErrors, setSystemErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorsLoading, setErrorsLoading] = useState(true)

  // NEW — track the previously-seen open-error count so we can
  // beep when new errors arrive.
  const prevErrorsCountRef = useRef(null)

  useEffect(() => {
    api.get('/dashboard')
      .then((data) => {
        setStats(data)
        if (data?.subscriptions) {
          setSubStats(data.subscriptions)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))

    // Also fetch dedicated subscription overview
    api.get('/subscriptions/overview')
      .then(setSubStats)
      .catch((err) => console.warn('Could not load subscription overview:', err))

    const loadSystemErrors = () => {
      api.get('/system/errors?limit=20')
        .then(data => {
          const errors = data?.errors || []
          setSystemErrors(errors)

          // NEW — beep when the open-error count INCREASES.
          const count = errors.length

          if (
            prevErrorsCountRef.current !== null &&
            count > prevErrorsCountRef.current
          ) {
            playAlertDebounced()
          }
          prevErrorsCountRef.current = count
        })
        .catch(console.error)
        .finally(() => setErrorsLoading(false))
    }

    loadSystemErrors()

    // Poll every 5s (was 3s — slightly calmer to reduce sound spam).
    const interval = setInterval(loadSystemErrors, 5000)

    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="p-8 text-surface-300">Loading dashboard...</div>
  if (!stats) return <div className="p-8 text-red-400">Failed to load dashboard</div>

  const cards = [
    {
      label: 'Open Tickets',
      value: stats.open_tickets,
      icon: Ticket,
      color: 'text-accent',
      bg: 'bg-accent/10'
    },
    {
      label: 'Critical',
      value: stats.critical_tickets,
      icon: AlertTriangle,
      color: 'text-p1',
      bg: 'bg-p1/10'
    },
    {
      label: 'New',
      value: stats.new_tickets,
      icon: Clock,
      color: 'text-info',
      bg: 'bg-info/10'
    },
    {
      label: 'SLA Compliance',
      value: `${stats.sla_compliance_pct}%`,
      icon: TrendingUp,
      color: 'text-success',
      bg: 'bg-success/10'
    },
  ]

  return (
    <div className="w-full min-h-full p-5 lg:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-surface-100">
          FinSage Control
        </h1>

        <p className="text-sm text-surface-300 mt-0.5">
          Welcome back, {agent?.display_name}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(c => (
          <div
            key={c.label}
            className="bg-surface-800 rounded-xl border border-surface-600 p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>

              <div>
                <div className={`text-2xl font-bold ${c.color}`}>
                  {c.value}
                </div>
                <div className="text-xs text-surface-300">
                  {c.label}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Subscription Insights */}
      <div className="bg-surface-800 rounded-xl border border-surface-600 mb-6 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-600 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <CreditCard size={15} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
                Subscription Insights & Commercial Fleet
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/subscriptions')}
            className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 font-medium transition-colors"
          >
            Open Fleet Cockpit
            <ExternalLink size={12} />
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* MRR */}
          <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-700/60">
            <div className="text-[11px] font-medium text-surface-400">Monthly Recurring (MRR)</div>
            <div className="text-lg font-bold text-accent mt-0.5">
              M {(Number(subStats?.mrr || 0)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-surface-400 mt-0.5">Run rate active</div>
          </div>

          {/* Active Subscriptions */}
          <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-700/60">
            <div className="text-[11px] font-medium text-surface-400">Active Paid Plans</div>
            <div className="text-lg font-bold text-success mt-0.5">
              {subStats?.active ?? '—'}
            </div>
            <div className="text-[10px] text-surface-400 mt-0.5">Paying customers</div>
          </div>

          {/* Free Trials Active */}
          <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-700/60">
            <div className="text-[11px] font-medium text-surface-400">Free Trials Active</div>
            <div className="text-lg font-bold text-info mt-0.5">
              {subStats?.trialing ?? '—'}
            </div>
            <div className="text-[10px] text-surface-400 mt-0.5">Onboarding companies</div>
          </div>

          {/* Trials Ending Soon */}
          <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-700/60">
            <div className="text-[11px] font-medium text-surface-400">Trials Ending (7d)</div>
            <div className={`text-lg font-bold mt-0.5 ${Number(subStats?.trials_ending_7d || 0) > 0 ? 'text-amber-400' : 'text-surface-200'}`}>
              {subStats?.trials_ending_7d ?? '—'}
            </div>
            <div className="text-[10px] text-surface-400 mt-0.5">Needs conversion</div>
          </div>

          {/* Past Due */}
          <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-700/60">
            <div className="text-[11px] font-medium text-surface-400">Past Due / Dunning</div>
            <div className={`text-lg font-bold mt-0.5 ${Number(subStats?.past_due || 0) > 0 ? 'text-p1' : 'text-surface-200'}`}>
              {subStats?.past_due ?? '—'}
            </div>
            <div className="text-[10px] text-surface-400 mt-0.5">Payment pending</div>
          </div>

          {/* Grace Period */}
          <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-700/60">
            <div className="text-[11px] font-medium text-surface-400">Read-Only Grace</div>
            <div className="text-lg font-bold text-surface-200 mt-0.5">
              {subStats?.grace ?? '—'}
            </div>
            <div className="text-[10px] text-surface-400 mt-0.5">14d grace period</div>
          </div>
        </div>
      </div>

      {/* System Alerts */}
      <div className="bg-surface-800 rounded-xl border border-surface-600 mb-6">
        <div className="px-4 py-3 border-b border-surface-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity
              className={`w-4 h-4 ${
                systemErrors.length > 0 ? 'text-p1' : 'text-success'
              }`}
            />

            <h3 className="text-sm font-semibold text-surface-100">
              System Alerts
            </h3>

            {systemErrors.length > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-p1/10 text-p1">
                {systemErrors.length} open
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success">
                All clear
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* NEW — "View all" link to the new persistent Alerts screen */}
            <button
              type="button"
              onClick={() => navigate('/alerts')}
              className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
            >
              View all
              <ExternalLink size={11} />
            </button>

            <span
              className={`w-2 h-2 rounded-full ${
                systemErrors.length > 0
                  ? 'bg-p1 animate-pulse'
                  : 'bg-success animate-pulse'
              }`}
            />

            <span className="text-xs text-surface-400">
              Live
            </span>
          </div>
        </div>

        {errorsLoading ? (
          <div className="px-4 py-5 text-center text-sm text-surface-400">
            Checking system status...
          </div>
        ) : systemErrors.length === 0 ? (
          <div className="px-4 py-5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-success" />
            </div>

            <div>
              <div className="text-sm font-medium text-success">
                No open system errors
              </div>

              <div className="text-xs text-surface-400 mt-0.5">
                FinSage backend is operating normally.
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-surface-600">
            {systemErrors.slice(0, 3).map(error => {
              const occurrence = error.latest_occurrence

              return (
                <button
                  key={error.id}
                  onClick={() => navigate(`/system/errors/${error.id}`)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-700/50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-p1/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-p1" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-surface-100 truncate">
                        {error.exception_type || 'System Error'}
                      </span>

                      <span className="text-[10px] uppercase font-semibold text-p2">
                        {error.severity?.replace('p', 'P')}
                      </span>
                    </div>

                    <div className="text-xs text-surface-300 truncate mt-0.5">
                      {error.message || 'No error message'}
                    </div>

                    {occurrence?.request_path && (
                      <div className="text-[11px] text-surface-500 truncate mt-1">
                        {occurrence.http_method} {occurrence.request_path}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-p1">
                      {error.occurrence_count}×
                    </div>

                    <div className="text-[10px] text-surface-500 mt-1">
                      {timeAgo(error.last_seen_at)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Today's Activity / Top Modules / Agent Workload */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {/* Today's Activity */}
        <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
          <h3 className="text-sm font-semibold text-surface-100 mb-3">
            Today's Activity
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-200">Created</span>
              <span className="text-sm font-semibold text-accent">
                {stats.created_today}
              </span>
            </div>

            <div className="w-full bg-surface-700 rounded-full h-1.5">
              <div
                className="bg-accent h-1.5 rounded-full"
                style={{
                  width: `${Math.min(stats.created_today * 3, 100)}%`
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-200">Resolved</span>
              <span className="text-sm font-semibold text-success">
                {stats.resolved_today}
              </span>
            </div>

            <div className="w-full bg-surface-700 rounded-full h-1.5">
              <div
                className="bg-success h-1.5 rounded-full"
                style={{
                  width: `${Math.min(stats.resolved_today * 3, 100)}%`
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-200">Unresponded</span>
              <span className="text-sm font-semibold text-warning">
                {stats.unresponded}
              </span>
            </div>
          </div>
        </div>

        {/* Top Modules */}
        <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
          <h3 className="text-sm font-semibold text-surface-100 mb-3">
            Most Reported Modules
          </h3>

          <div className="space-y-2">
            {stats.top_modules?.slice(0, 5).map((m, i) => {
              const max = stats.top_modules?.[0]?.count || 1

              return (
                <div key={m.module}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-surface-200 truncate mr-2">
                      <span className="text-surface-400 mr-1.5">
                        {i + 1}.
                      </span>

                      {m.module === 'Unspecified'
                        ? 'Other'
                        : m.module.replace(/_/g, ' ')}
                    </span>

                    <span className="text-surface-300 font-medium shrink-0">
                      {m.count}
                    </span>
                  </div>

                  <div className="w-full bg-surface-700 rounded-full h-1">
                    <div
                      className="bg-accent/60 h-1 rounded-full"
                      style={{
                        width: `${(m.count / max) * 100}%`
                      }}
                    />
                  </div>
                </div>
              )
            })}

            {(!stats.top_modules || stats.top_modules.length === 0) && (
              <p className="text-xs text-surface-400">
                No data yet
              </p>
            )}
          </div>
        </div>

        {/* Agent Workload */}
        <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
          <h3 className="text-sm font-semibold text-surface-100 mb-3">
            Support Team
          </h3>

          <div className="space-y-2">
            {stats.agent_workload?.map(a => (
              <div
                key={a.display_name}
                className="flex items-center justify-between py-1"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                    {a.display_name?.charAt(0)?.toUpperCase()}
                  </div>

                  <span className="text-sm text-surface-200">
                    {a.display_name}
                  </span>
                </div>

                <span
                  className={`text-sm font-medium ${
                    a.open_count > 10
                      ? 'text-p2'
                      : 'text-surface-300'
                  }`}
                >
                  {a.open_count} open
                </span>
              </div>
            ))}

            {(!stats.agent_workload || stats.agent_workload.length === 0) && (
              <p className="text-xs text-surface-400">
                No agents active
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Tickets */}
      <div className="bg-surface-800 rounded-xl border border-surface-600">
        <div className="px-4 py-3 border-b border-surface-600 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-100">
            Recent Tickets
          </h3>

          <button
            onClick={() => navigate('/tickets')}
            className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
          >
            View all
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        <div className="divide-y divide-surface-600">
          {stats.recent_tickets?.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-surface-400">
              No tickets yet
            </div>
          )}

          {stats.recent_tickets?.map(t => (
            <button
              key={t.id}
              onClick={() => navigate(`/tickets/${t.id}`)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-700/50 transition-colors text-left"
            >
              <StatusBadge status={t.status} />

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-surface-100 truncate">
                  {t.subject}
                </div>

                <div className="text-xs text-surface-300">
                  {t.company_name || 'No company'} &middot; {t.ticket_number}
                </div>
              </div>

              <div className="text-xs text-surface-400 shrink-0">
                {timeAgo(t.created_at)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
