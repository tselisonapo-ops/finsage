import { useEffect, useState } from 'react'
import {
  Activity,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { api } from '../api/client'

function formatDate(value) {
  if (!value) return '—'

  return new Date(value).toLocaleString()
}

function actionLabel(action) {
  if (!action) return 'Unknown action'

  return action
    .replace(/\./g, ' / ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

export default function AuditTrail() {
  const [events, setEvents] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)

  async function load() {
    try {
      setLoading(true)
      setError('')

      const data = await api.get(
        '/audit?limit=100'
      )

      setEvents(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(
        err?.message ||
        'Unable to load audit activity.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Activity className="text-accent" size={22} />

            <h1 className="text-2xl font-semibold text-surface-100">
              Audit Trail
            </h1>
          </div>

          <p className="text-sm text-surface-300 mt-1">
            Control activity and administrative actions.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
            className="
            flex items-center gap-2
            px-3 py-2
            rounded-lg
            bg-surface-700
            border border-surface-600
            text-surface-200
            hover:bg-surface-600
            hover:text-surface-100
            disabled:opacity-50
            transition-colors
            "
        >
          <RefreshCw
            size={15}
            className={
              loading
                ? 'animate-spin'
                : ''
            }
          />

          Refresh
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm text-surface-300">
        <span>
          {total.toLocaleString()} audit events
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="finsage-card-dark overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-700/70">
              <tr className="text-left text-surface-300">
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3">
                  Time
                </th>
                <th className="px-4 py-3">
                  User
                </th>
                <th className="px-4 py-3">
                  Action
                </th>
                <th className="px-4 py-3">
                  Entity
                </th>
                <th className="px-4 py-3">
                  Description
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                !events.length && (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-12 text-center text-surface-400"
                    >
                      No audit activity recorded yet.
                    </td>
                  </tr>
                )}

              {events.map(event => {
                const isExpanded =
                  expanded === event.id

                return (
                  <>
                    <tr
                      key={event.id}
                      className="border-t border-surface-600 hover:bg-surface-700/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded(
                              isExpanded
                                ? null
                                : event.id
                            )
                          }
                          className="text-surface-300 hover:text-surface-100"
                        >
                          {isExpanded ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </button>
                      </td>

                      <td className="px-4 py-3 text-surface-300 whitespace-nowrap">
                        {formatDate(
                          event.created_at
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-surface-100">
                          {event.control_user_name ||
                            'System'}
                        </div>

                        {event.control_user_email && (
                          <div className="text-xs text-surface-400">
                            {event.control_user_email}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-md bg-accent-muted text-accent text-xs font-medium">
                          {actionLabel(
                            event.action
                          )}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-surface-200">
                        {event.entity_type || '—'}

                        {event.entity_id != null && (
                          <span className="text-surface-400 ml-1">
                            #{event.entity_id}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-surface-300 max-w-md">
                        <div className="truncate">
                          {event.description || '—'}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr
                        key={`${event.id}-details`}
                        className="border-t border-surface-600 bg-surface-900/60"
                      >
                        <td
                          colSpan="6"
                          className="px-8 py-5"
                        >
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                            <div>
                              <div className="text-xs uppercase tracking-wide text-surface-400 mb-2">
                                Request
                              </div>

                              <div className="space-y-1 text-sm">
                                <div className="text-surface-200">
                                  IP:{' '}
                                  <span className="text-surface-400">
                                    {event.ip_address || '—'}
                                  </span>
                                </div>

                                <div className="text-surface-200 break-all">
                                  User Agent:{' '}
                                  <span className="text-surface-400">
                                    {event.user_agent || '—'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <div className="text-xs uppercase tracking-wide text-surface-400 mb-2">
                                Metadata
                              </div>

                              <pre className="text-xs text-surface-300 bg-surface-900 rounded-lg p-3 overflow-auto max-h-48">
                                {JSON.stringify(
                                  event.metadata || {},
                                  null,
                                  2
                                )}
                              </pre>
                            </div>

                            {(event.before_data ||
                              event.after_data) && (
                              <div className="xl:col-span-2 grid grid-cols-1 xl:grid-cols-2 gap-5">
                                <div>
                                  <div className="text-xs uppercase tracking-wide text-surface-400 mb-2">
                                    Before
                                  </div>

                                  <pre className="text-xs text-surface-300 bg-surface-900 rounded-lg p-3 overflow-auto max-h-64">
                                    {JSON.stringify(
                                      event.before_data || {},
                                      null,
                                      2
                                    )}
                                  </pre>
                                </div>

                                <div>
                                  <div className="text-xs uppercase tracking-wide text-surface-400 mb-2">
                                    After
                                  </div>

                                  <pre className="text-xs text-surface-300 bg-surface-900 rounded-lg p-3 overflow-auto max-h-64">
                                    {JSON.stringify(
                                      event.after_data || {},
                                      null,
                                      2
                                    )}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}