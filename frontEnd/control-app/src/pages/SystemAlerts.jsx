import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Activity,
  Search,
  Filter,
  X,
  RefreshCw,
  Volume2,
  VolumeX,
  Ticket as TicketIcon,
  ExternalLink,
} from 'lucide-react'

import { api } from '../api/client'
import PriorityBadge from '../components/PriorityBadge'
import StatusBadge from '../components/StatusBadge'
import { timeAgo } from '../utils/formatters'

import {
  isMuted,
  toggleMuted,
  playAlertDebounced,
} from '../lib/sound'


// ============================================================
// Constants — mirrors the server enums
// ============================================================

const SEVERITIES = [
  { value: '',           label: 'All severities' },
  { value: 'p1_critical', label: 'P1 Critical' },
  { value: 'p2_high',     label: 'P2 High' },
  { value: 'p3_medium',   label: 'P3 Medium' },
  { value: 'p4_low',      label: 'P4 Low' },
]

const STATUSES = [
  { value: '',         label: 'Open + resolved' },
  { value: 'open',     label: 'Open only' },
  { value: 'resolved', label: 'Resolved only' },
]

const HAS_TICKET = [
  { value: '',       label: 'Either' },
  { value: 'true',   label: 'Has ticket' },
  { value: 'false',  label: 'No ticket yet' },
]


// ============================================================
// Component
// ============================================================

export default function SystemAlerts() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [alerts, setAlerts] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(isMuted())

  // Track the previous open count so we can beep when new alerts arrive.
  const [prevOpenCount, setPrevOpenCount] = useState(null)

  const page = parseInt(params.get('page') || '1', 10)
  const perPage = 20

  const search = params.get('search') || ''
  const status = params.get('status') || ''
  const severity = params.get('severity') || ''
  const hasTicket = params.get('has_ticket') || ''

  const hasFilters = Boolean(search || status || severity || hasTicket)


  // ----------------------------------------------------------
  // Data fetcher
  // ----------------------------------------------------------
  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const qs = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      })

      if (status)     qs.set('status', status)
      if (severity)   qs.set('severity', severity)
      if (hasTicket)  qs.set('has_ticket', hasTicket)
      if (search)     qs.set('search', search)

      const data = await api.get(`/system/alerts?${qs.toString()}`)

      setAlerts(data.alerts || [])
      setTotal(data.total || 0)
      setSummary(data.summary || null)

      // --- sound trigger -------------------------------------
      // Only beep on natural polls (not the very first one — we
      // don't know what the prior count was).
      const openCount = data.summary?.open_count || 0

      setPrevOpenCount((prev) => {
        if (prev !== null && openCount > prev) {
          playAlertDebounced()
        }
        return openCount
      })
    } catch (err) {
      setError(err?.message || 'Unable to load system alerts.')
    } finally {
      setLoading(false)
    }
  }, [page, status, severity, hasTicket, search])


  // ----------------------------------------------------------
  // Initial load + polling
  // ----------------------------------------------------------
  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  // Listen for manual mute toggles fired from elsewhere (header).
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


  // ----------------------------------------------------------
  // Filter helpers
  // ----------------------------------------------------------
  const updateParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)

    if (key !== 'page') next.delete('page')
    setParams(next)
  }

  const clearFilters = () => {
    setParams({})
  }


  // ----------------------------------------------------------
  // Render helpers
  // ----------------------------------------------------------
  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const handleToggleMute = () => {
    toggleMuted()
    setMuted(isMuted())
  }


  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-muted text-accent flex items-center justify-center">
              <Activity size={20} />
            </div>

            <div>
              <h1 className="text-xl font-bold text-surface-100">
                System Alerts
              </h1>

              <p className="text-sm text-surface-300 mt-0.5">
                Persistent log of every system event. Resolved alerts
                are kept here permanently.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleMute}
            title={muted ? 'Unmute alert sound' : 'Mute alert sound'}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
              muted
                ? 'border-surface-600 text-surface-300 hover:bg-surface-700'
                : 'border-accent text-accent bg-accent-muted'
            }`}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            {muted ? 'Muted' : 'Sound on'}
          </button>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-600 text-surface-200 hover:bg-surface-700 disabled:opacity-50 transition-colors text-sm"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard
          label="Open"
          value={summary?.open_count ?? 0}
          tone="open"
        />

        <SummaryCard
          label="Critical"
          value={summary?.critical_count ?? 0}
          tone="critical"
        />

        <SummaryCard
          label="High"
          value={summary?.high_count ?? 0}
          tone="high"
        />

        <SummaryCard
          label="No ticket yet"
          value={summary?.without_ticket ?? 0}
          tone="warning"
        />

        <SummaryCard
          label="Occurrences"
          value={summary?.total_occurrences ?? 0}
          tone="info"
        />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />

          <input
            type="text"
            value={search}
            onChange={(e) => updateParam('search', e.target.value)}
            placeholder="Search by event code, message, exception, company..."
            className="w-full bg-surface-800 border border-surface-600 rounded-lg pl-9 pr-3 py-2.5 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={status}
            onChange={(e) => updateParam('status', e.target.value)}
            className="bg-surface-800 border border-surface-600 rounded-lg px-3 py-2.5 text-sm text-surface-100 focus:outline-none focus:border-accent"
          >
            {STATUSES.map((s) => (
              <option key={s.value || 'all'} value={s.value}>{s.label}</option>
            ))}
          </select>

          <select
            value={severity}
            onChange={(e) => updateParam('severity', e.target.value)}
            className="bg-surface-800 border border-surface-600 rounded-lg px-3 py-2.5 text-sm text-surface-100 focus:outline-none focus:border-accent"
          >
            {SEVERITIES.map((s) => (
              <option key={s.value || 'all'} value={s.value}>{s.label}</option>
            ))}
          </select>

          <select
            value={hasTicket}
            onChange={(e) => updateParam('has_ticket', e.target.value)}
            className="bg-surface-800 border border-surface-600 rounded-lg px-3 py-2.5 text-sm text-surface-100 focus:outline-none focus:border-accent"
          >
            {HAS_TICKET.map((s) => (
              <option key={s.value || 'all'} value={s.value}>{s.label}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-surface-300 hover:text-surface-100 transition-colors px-2"
            >
              <X size={14} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Alerts list */}
      <div className="bg-surface-800 rounded-xl border border-surface-600 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-surface-400">
            Loading system alerts...
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />

            <p className="text-surface-300 text-sm">
              No alerts match your filters.
            </p>

            <p className="text-surface-400 text-xs mt-1">
              Try clearing filters or refreshing.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-surface-600">
              {alerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onOpen={() =>
                    navigate(`/system/errors/${alert.id}`)
                  }
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-surface-600 flex items-center justify-between gap-4">
                <span className="text-xs text-surface-400">
                  Page {page} of {totalPages} · {total} alerts
                </span>

                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => updateParam('page', String(page - 1))}
                    className="px-3 py-1.5 rounded-lg text-xs text-surface-200 hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>

                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => updateParam('page', String(page + 1))}
                    className="px-3 py-1.5 rounded-lg text-xs text-surface-200 hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}


// ============================================================
// Sub-components
// ============================================================

function SummaryCard({ label, value, tone }) {
  const palette = {
    open:     { bg: 'bg-error/10',   text: 'text-error',   pulse: true  },
    critical: { bg: 'bg-p1/10',      text: 'text-p1',      pulse: true  },
    high:     { bg: 'bg-p2/10',      text: 'text-p2',      pulse: false },
    warning:  { bg: 'bg-warning/10', text: 'text-warning', pulse: false },
    info:     { bg: 'bg-info/10',    text: 'text-info',    pulse: false },
  }[tone] || { bg: 'bg-surface-700', text: 'text-surface-100', pulse: false }

  return (
    <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-surface-300">{label}</div>

        {palette.pulse && value > 0 && (
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${palette.text} opacity-60`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${palette.text}`} style={{ backgroundColor: 'currentColor' }} />
          </span>
        )}
      </div>

      <div className={`text-2xl font-bold ${palette.text} mt-1`}>
        {value}
      </div>
    </div>
  )
}


function AlertRow({ alert, onOpen }) {
  const occurrence = alert.latest_occurrence || {}

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full px-4 py-3.5 flex items-start gap-3 hover:bg-surface-700/50 transition-colors text-left"
    >
      {/* Severity / status badges */}
      <div className="shrink-0 flex flex-col gap-2 items-start">
        <PriorityBadge priority={alert.severity} />

        <StatusBadge status={alert.status === 'open' ? 'new' : 'resolved'} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-surface-100 truncate">
              {alert.exception_type || alert.event_code || 'System Error'}
            </div>

            <div className="text-xs text-surface-400 mt-0.5 font-mono truncate">
              {alert.event_code}
            </div>

            <div className="text-xs text-surface-300 mt-1 line-clamp-2">
              {alert.message || 'No message recorded.'}
            </div>

            {occurrence.request_path && (
              <div className="text-[11px] text-surface-500 mt-1 font-mono truncate">
                {occurrence.http_method} {occurrence.request_path}
              </div>
            )}
          </div>

          {/* Linked ticket chip */}
          {alert.ticket_id ? (
            <div
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-accent-muted text-accent text-[11px] font-medium"
              title="Ticket linked to this alert"
            >
              <TicketIcon size={12} />

              <span className="font-mono">
                {alert.ticket_number || `#${alert.ticket_id}`}
              </span>

              <ExternalLink size={11} />
            </div>
          ) : (
            <div
              className="shrink-0 px-2 py-1 rounded-md bg-warning/10 text-warning text-[11px] font-medium"
              title="Opening this alert will auto-create a ticket"
            >
              No ticket
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-surface-400">
          <span className="flex items-center gap-1">
            <AlertTriangle size={11} />

            {alert.occurrence_count || 0} occurrences
          </span>

          <span>·</span>

          <span>Last seen {timeAgo(alert.last_seen_at)}</span>

          {alert.company_name && (
            <>
              <span>·</span>
              <span className="truncate max-w-[180px]">
                {alert.company_name}
              </span>
            </>
            )}
        </div>
      </div>
    </button>
  )
}
