import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle,
  RotateCcw,
  AlertTriangle,
  Clock,
  Server,
  User,
  Building2,
  Ticket as TicketIcon,        // NEW
  MessageSquare,                // NEW
  Lock,                        // NEW
  History,                     // NEW
  Loader2,                     // NEW
} from 'lucide-react'

import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'

import {
  formatDateTime,
  timeAgo,
} from '../utils/formatters'

// NOTE: sound is NOT played on alert open. Sound is fired only when
// the SYSTEM reports a new error and it pops up in the dashboard,
// the notification bell, or the System Alerts list (see those files).
// The /open call below still fires — it just no longer plays sound.


export default function SystemErrorDetail() {
  const { eventId } = useParams()
  const navigate = useNavigate()

  const [error, setError] = useState(null)
  const [occurrences, setOccurrences] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')

  // NEW — linked ticket summary (returned from /open + refreshed on
  // Resolve/Reopen).
  const [linkedTicket, setLinkedTicket] = useState(null)
  const [opening, setOpening] = useState(false)

  // NEW — guards so the /open POST is fired exactly once per visit.
  // React StrictMode double-invokes effects in dev; the ref prevents
  // the audit log from being written twice.
  const openedRef = useRef(false)
  const lastOpenedEventId = useRef(null)


  // ----------------------------------------------------------
  // Loaders
  // ----------------------------------------------------------
  const loadError = async () => {
    try {
      setLoading(true)

      const [errorResponse, occurrenceResponse] = await Promise.all([
        api.get(`/system/errors/${eventId}`),
        api.get(`/system/errors/${eventId}/occurrences?limit=100`),
      ])

      setError(errorResponse.error || null)
      setOccurrences(occurrenceResponse.occurrences || [])

      // Pull the existing linked ticket (if any) so the panel renders
      // immediately for users who re-visit a previously opened alert.
      if (errorResponse.error?.ticket_id) {
        const ticketResponse = await api.get(
          `/system/errors/${eventId}/ticket`
        )
        setLinkedTicket(ticketResponse?.ticket || null)
      } else {
        setLinkedTicket(null)
      }
    } catch (err) {
      setMessage(err.message || 'Unable to load system error')
    } finally {
      setLoading(false)
    }
  }


  // ----------------------------------------------------------
  // NEW — open the alert (audit + auto-ticket + automation kick)
  // ----------------------------------------------------------
  const openAlert = async () => {
    if (opening) return
    if (openedRef.current && lastOpenedEventId.current === eventId) return

    openedRef.current = true
    lastOpenedEventId.current = eventId
    setOpening(true)

    try {
      const response = await api.post(
        `/system/errors/${eventId}/open`,
        {}
      )

      if (response?.error) {
        setError(response.error)
        setLinkedTicket(response.error.linked_ticket || null)

        // NOTE: no sound here. The user requested that sound be
        // triggered only when the SYSTEM reports a new error (and
        // it pops up in the dashboard / notification bell / alerts
        // list), NOT when the user clicks to open an alert detail.
        // The /open POST still fires — it records the audit log,
        // auto-creates the ticket if missing, and kicks automation.
      }
    } catch (err) {
      // Surface a soft warning — the page should still render.
      setMessage(
        'Could not record that this alert was opened. ' +
        (err?.message || '')
      )
    } finally {
      setOpening(false)
    }
  }


  // ----------------------------------------------------------
  // Effects
  // ----------------------------------------------------------
  useEffect(() => {
    // Reset the "opened" guard when eventId changes (user navigates
    // from one alert to another without leaving the page).
    if (lastOpenedEventId.current !== eventId) {
      openedRef.current = false
      lastOpenedEventId.current = eventId
    }

    loadError().then(() => {
      // Fire the open AFTER the page has rendered the alert so the
      // user sees content immediately. Slight delay also lets the
      // browser unlock the AudioContext on the click that navigated
      // here.
      setTimeout(openAlert, 200)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])


  // ----------------------------------------------------------
  // Resolve / Reopen handlers
  // ----------------------------------------------------------
  const handleResolve = async () => {
    try {
      setActionLoading(true)
      setMessage('')

      const response = await api.patch(`/system/errors/${eventId}/resolve`)
      setError(response.error || null)
      setMessage('System error resolved.')
    } catch (err) {
      setMessage(err.message || 'Unable to resolve system error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReopen = async () => {
    try {
      setActionLoading(true)
      setMessage('')

      const response = await api.patch(`/system/errors/${eventId}/reopen`)
      setError(response.error || null)
      setMessage('System error reopened.')
    } catch (err) {
      setMessage(err.message || 'Unable to reopen system error')
    } finally {
      setActionLoading(false)
    }
  }


  // ----------------------------------------------------------
  // Render: loading
  // ----------------------------------------------------------
  if (loading) {
    return (
      <div className="w-full min-h-full p-5 lg:p-6">
        <div className="rounded-xl border border-surface-600 bg-surface-800 p-8 text-center text-sm text-surface-400">
          Loading system error...
        </div>
      </div>
    )
  }

  // ----------------------------------------------------------
  // Render: not found
  // ----------------------------------------------------------
  if (!error) {
    return (
      <div className="w-full min-h-full p-5 lg:p-6">
        <button
          type="button"
          onClick={() => navigate('/alerts')}
          className="mb-6 inline-flex items-center gap-2 text-sm text-surface-300 hover:text-surface-100 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to alerts
        </button>

        <div className="rounded-xl border border-error/30 bg-error/10 p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="text-error" />
            <span className="font-semibold text-surface-100">
              System error not found
            </span>
          </div>

          {message && (
            <div className="mt-3 text-sm text-error">{message}</div>
          )}
        </div>
      </div>
    )
  }

  const latest = error.latest_occurrence || {}


  // ----------------------------------------------------------
  // Render: main
  // ----------------------------------------------------------
  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate('/alerts')}
          className="inline-flex items-center gap-2 text-sm text-surface-300 hover:text-surface-100 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to alerts
        </button>

        <div className="flex items-center gap-2">
          {opening && (
            <span className="inline-flex items-center gap-2 text-xs text-surface-400">
              <Loader2 size={14} className="animate-spin" />
              Recording open…
            </span>
          )}

          {error.status === 'open' ? (
            <button
              type="button"
              onClick={handleResolve}
              disabled={actionLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-surface-900 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              <CheckCircle size={16} />
              {actionLoading ? 'Working...' : 'Resolve'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReopen}
              disabled={actionLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-warning px-4 py-2 text-sm font-medium text-surface-900 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              <RotateCcw size={16} />
              {actionLoading ? 'Working...' : 'Reopen'}
            </button>
          )}
        </div>
      </div>

      {/* Action Message */}
      {message && (
        <div className="rounded-xl border border-surface-600 bg-surface-800 px-4 py-3 text-sm text-surface-200">
          {message}
        </div>
      )}

      {/* Error Overview */}
      <div className="rounded-xl border border-surface-600 bg-surface-800 p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-error/10 text-error flex items-center justify-center shrink-0">
                <AlertTriangle size={21} />
              </div>

              <h1 className="text-xl font-semibold text-surface-100 break-words">
                System Alert #{error.id}
              </h1>
            </div>

            <div className="mt-2 ml-0 lg:ml-[52px] text-sm text-surface-400 font-mono break-all">
              {error.event_code}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PriorityBadge priority={error.severity} />
            <StatusBadge status={error.status} />
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-surface-600 bg-surface-900/60 p-4">
          <div className="text-sm font-medium text-surface-200">
            Error message
          </div>
          <div className="mt-2 text-sm text-surface-100 break-words">
            {error.message || 'No message recorded.'}
          </div>
        </div>
      </div>

      {/* NEW — Linked Ticket progress panel */}
      <LinkedTicketPanel ticket={linkedTicket} onNavigate={(id) => navigate(`/tickets/${id}`)} />

      {/* Error Details */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Error Information */}
        <div className="rounded-xl border border-surface-600 bg-surface-800 p-5 lg:p-6">
          <div className="mb-5 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-muted text-accent flex items-center justify-center">
              <Server size={17} />
            </div>
            <h2 className="font-semibold text-surface-100">Error Information</h2>
          </div>

          <div className="space-y-4 text-sm">
            <InfoRow label="Exception type" value={error.exception_type} mono />
            <InfoRow label="Source" value={error.source} />
            <InfoRow label="Product" value={error.product} />
            <InfoRow label="Module" value={error.module_code} mono />
            <InfoRow label="Occurrences" value={error.occurrence_count || 0} />
            <InfoRow
              label="Last seen"
              value={
                error.last_seen_at
                  ? `${timeAgo(error.last_seen_at)} · ${formatDateTime(error.last_seen_at)}`
                  : '—'
              }
            />
          </div>
        </div>

        {/* Latest Occurrence */}
        <div className="rounded-xl border border-surface-600 bg-surface-800 p-5 lg:p-6">
          <div className="mb-5 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-muted text-accent flex items-center justify-center">
              <Clock size={17} />
            </div>
            <h2 className="font-semibold text-surface-100">Latest Occurrence</h2>
          </div>

          <div className="space-y-4 text-sm">
            <InfoRow
              label="Request"
              value={`${latest.http_method || '—'} ${latest.request_path || '—'}`}
              mono
            />
            <InfoRow label="HTTP status" value={latest.http_status || '—'} />
            <InfoRow
              label="Occurred"
              value={latest.occurred_at ? formatDateTime(latest.occurred_at) : '—'}
            />
            <InfoRow label="Error message" value={latest.error_message || '—'} />
          </div>
        </div>
      </div>

      {/* Context */}
      {(error.company_id || error.company_name || error.user_id || error.user_email) && (
        <div className="rounded-xl border border-surface-600 bg-surface-800 p-5 lg:p-6">
          <h2 className="mb-5 font-semibold text-surface-100">Context</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(error.company_id || error.company_name) && (
              <div className="rounded-lg border border-surface-600 bg-surface-900/50 p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-accent-muted text-accent flex items-center justify-center shrink-0">
                  <Building2 size={17} />
                </div>

                <div className="min-w-0">
                  <div className="text-xs text-surface-400">Company</div>
                  <div className="text-sm font-medium text-surface-100 mt-1 break-words">
                    {error.company_name || `Company #${error.company_id}`}
                  </div>
                </div>
              </div>
            )}

            {(error.user_id || error.user_email) && (
              <div className="rounded-lg border border-surface-600 bg-surface-900/50 p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-accent-muted text-accent flex items-center justify-center shrink-0">
                  <User size={17} />
                </div>

                <div className="min-w-0">
                  <div className="text-xs text-surface-400">User</div>
                  <div className="text-sm font-medium text-surface-100 mt-1 break-words">
                    {error.user_email || `User #${error.user_id}`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Occurrence History */}
      <div className="rounded-xl border border-surface-600 bg-surface-800 overflow-hidden">
        <div className="px-5 py-4 lg:px-6 border-b border-surface-600">
          <h2 className="font-semibold text-surface-100">Occurrence History</h2>
          <p className="text-xs text-surface-400 mt-1">
            Recent recorded occurrences for this system error.
          </p>
        </div>

        {occurrences.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-surface-400">
            No occurrence history available.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead>
                <tr className="bg-surface-700/70 border-b border-surface-600 text-left text-xs uppercase tracking-wide text-surface-300">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Request</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-surface-600">
                {occurrences.map((occurrence) => (
                  <tr key={occurrence.id} className="hover:bg-surface-700/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-surface-300">
                      {formatDateTime(occurrence.occurred_at)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-surface-100 font-mono">
                        {occurrence.http_method || '—'}
                      </div>
                      <div className="text-xs text-surface-400 mt-1 max-w-[360px] truncate font-mono">
                        {occurrence.request_path || '—'}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-surface-200">
                      {occurrence.http_status || '—'}
                    </td>

                    <td className="px-4 py-3 text-surface-300 max-w-[420px]">
                      <div className="truncate">
                        {occurrence.error_message || '—'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stack Trace */}
      <div className="rounded-xl border border-surface-600 bg-surface-800 overflow-hidden">
        <div className="px-5 py-4 lg:px-6 border-b border-surface-600">
          <h2 className="font-semibold text-surface-100">Stack Trace</h2>
        </div>

        <div className="p-4 lg:p-5">
          <pre className="max-h-[500px] overflow-auto rounded-lg border border-surface-600 bg-surface-900 p-4 text-xs leading-5 text-surface-200 font-mono whitespace-pre-wrap break-words">
            {error.stack_trace || 'No stack trace recorded.'}
          </pre>
        </div>
      </div>
    </div>
  )
}


// ============================================================
// NEW — Linked Ticket Panel
// ============================================================
// "compelling the user to show all the ticket progress or outcomes"
// — this panel is rendered on the alert detail page so the agent
// sees the ticket's status, owner, last message and last internal
// note without leaving the page. They can click through to the full
// ticket detail page when they want to take action.
// ============================================================
function LinkedTicketPanel({ ticket, onNavigate }) {
  if (!ticket) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/10 p-5 lg:p-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-warning/15 text-warning flex items-center justify-center shrink-0">
            <TicketIcon size={18} />
          </div>

          <div className="min-w-0">
            <div className="font-semibold text-surface-100">
              No ticket linked yet
            </div>
            <p className="text-sm text-surface-300 mt-1">
              Opening this alert automatically creates a ticket. If this
              message persists, the ticket creation may have failed —
              check the audit trail or refresh the page.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const lastMsg = ticket.last_customer_message
  const lastNote = ticket.last_internal_note
  const lastHist = ticket.last_history_entry

  return (
    <div className="rounded-xl border border-surface-600 bg-surface-800 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 lg:px-6 border-b border-surface-600 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-muted text-accent flex items-center justify-center shrink-0">
            <TicketIcon size={18} />
          </div>

          <div>
            <h2 className="font-semibold text-surface-100">
              Linked Ticket
            </h2>

            <div className="text-xs text-surface-400 mt-0.5 font-mono">
              {ticket.ticket_number}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />

          <button
            type="button"
            onClick={() => onNavigate(ticket.id)}
            className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover font-medium px-2 py-1.5 rounded-md hover:bg-accent-muted transition-colors"
          >
            Open ticket
            <ArrowUpRight size={13} />
          </button>
        </div>
      </div>

      {/* Subject */}
      <div className="px-5 py-4 lg:px-6 border-b border-surface-600">
        <div className="text-xs text-surface-400 mb-1">Subject</div>
        <div className="text-sm text-surface-100 break-words">
          {ticket.subject || '—'}
        </div>
      </div>

      {/* Owner + timestamps */}
      <div className="px-5 py-4 lg:px-6 border-b border-surface-600 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs text-surface-400 mb-1">Owner</div>
          <div className="text-surface-100">
            {ticket.agent_name || 'Unassigned'}
          </div>
        </div>

        <div>
          <div className="text-xs text-surface-400 mb-1">Created</div>
          <div className="text-surface-100">
            {ticket.created_at ? formatDateTime(ticket.created_at) : '—'}
          </div>
        </div>

        <div>
          <div className="text-xs text-surface-400 mb-1">First response</div>
          <div className="text-surface-100">
            {ticket.first_response_at ? formatDateTime(ticket.first_response_at) : '—'}
          </div>
        </div>
      </div>

      {/* Progress timeline (latest 3 entries) */}
      <div className="px-5 py-4 lg:px-6 space-y-4">
        {/* Latest customer message */}
        <ProgressEntry
          icon={<MessageSquare size={14} />}
          label="Latest customer message"
          author={lastMsg?.sender_name}
          body={lastMsg?.body}
          time={lastMsg?.created_at}
          emptyText="No customer messages yet."
        />

        {/* Latest internal note */}
        <ProgressEntry
          icon={<Lock size={14} />}
          label="Latest internal note"
          author={lastNote?.agent_name}
          body={lastNote?.body}
          time={lastNote?.created_at}
          emptyText="No internal notes yet."
          muted
        />

        {/* Latest history entry */}
        <ProgressEntry
          icon={<History size={14} />}
          label="Latest change"
          author={lastHist?.changed_by_name}
          body={
            lastHist
              ? `${lastHist.field}: ${lastHist.old_value || '∅'} → ${lastHist.new_value || '∅'}`
              : null
          }
          time={lastHist?.created_at}
          emptyText="No ticket history yet."
        />
      </div>
    </div>
  )
}


function ProgressEntry({ icon, label, author, body, time, emptyText, muted = false }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${muted ? 'bg-surface-700 text-surface-300' : 'bg-accent-muted text-accent'}`}>
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-surface-200">{label}</div>
          {time && (
            <div className="text-[11px] text-surface-400 whitespace-nowrap">
              {formatDateTime(time)}
            </div>
          )}
        </div>

        {body ? (
          <div className="text-sm text-surface-100 mt-1 break-words">
            {author && (
              <span className="text-surface-300 mr-1.5">— {author}:</span>
            )}
            {body}
          </div>
        ) : (
          <div className="text-xs text-surface-400 mt-1 italic">{emptyText}</div>
        )}
      </div>
    </div>
  )
}


// ============================================================
// InfoRow (unchanged)
// ============================================================
function InfoRow({ label, value, mono = false }) {
  return (
    <div className="border-b border-surface-600 pb-3 last:border-b-0 last:pb-0">
      <div className="text-xs text-surface-400 mb-1">{label}</div>

      <div className={`font-medium text-surface-100 break-words ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '—'}
      </div>
    </div>
  )
}
