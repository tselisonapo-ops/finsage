import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import {
  timeAgo,
  TICKET_STATUSES,
  PRIORITIES,
  TICKET_TYPES,
} from '../lib/constants'
import { Plus, Search, Filter, X, FileText } from 'lucide-react'

export default function TicketList() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [tickets, setTickets] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [search, setSearch] = useState(params.get('search') || '')
  const [agents, setAgents] = useState([])
  const [categories, setCategories] = useState([])

  const page = parseInt(params.get('page') || '1', 10)
  const perPage = 20

  const fetchTickets = useCallback(async () => {
    setLoading(true)

    try {
      const filters = {}

      if (params.get('status')) {
        filters.status = params.get('status')
      }

      if (params.get('priority')) {
        filters.priority = params.get('priority')
      }

      if (params.get('ticket_type')) {
        filters.ticket_type = params.get('ticket_type')
      }

      if (params.get('category_id')) {
        filters.category_id = params.get('category_id')
      }

      if (params.get('assigned_agent_id')) {
        filters.assigned_agent_id = params.get('assigned_agent_id')
      }

      if (params.get('search')) {
        filters.search = params.get('search')
      }

      const qs = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
        ...filters,
      }).toString()

      const data = await api.get(`/tickets?${qs}`)

      setTickets(data.tickets || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Failed to fetch tickets:', err)
      setTickets([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [params, page])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  useEffect(() => {
    let mounted = true

    Promise.all([
      api.get('/settings/agents').catch(() => []),
      api.get('/settings/categories').catch(() => []),
    ]).then(([agentsData, categoriesData]) => {
      if (!mounted) return

      setAgents(agentsData || [])
      setCategories(categoriesData || [])
    })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    setSearch(params.get('search') || '')
  }, [params])

  const updateParam = (key, value) => {
    const nextParams = new URLSearchParams(params)

    if (value) {
      nextParams.set(key, value)
    } else {
      nextParams.delete(key)
    }

    if (key !== 'page') {
      nextParams.delete('page')
    }

    setParams(nextParams)
  }

  const clearFilters = () => {
    setParams({})
    setSearch('')
  }

  const hasFilters = Boolean(
    params.get('status') ||
    params.get('priority') ||
    params.get('ticket_type') ||
    params.get('category_id') ||
    params.get('assigned_agent_id') ||
    params.get('search')
  )

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-surface-100">
            Tickets
          </h1>
          <p className="text-sm text-surface-300 mt-1">
            {total} ticket{total !== 1 ? 's' : ''} total
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/tickets/new')}
          className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-surface-900 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Ticket
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateParam('search', search)
              }
            }}
            placeholder="Search tickets..."
            className="w-full bg-surface-800 border border-surface-600 rounded-lg pl-9 pr-3 py-2.5 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
              showFilters || hasFilters
                ? 'border-accent text-accent bg-accent-muted'
                : 'border-surface-600 text-surface-200 hover:bg-surface-700'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-surface-300 hover:text-surface-100 transition-colors px-2"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">
                Status
              </label>

              <select
                value={params.get('status') || ''}
                onChange={(e) => updateParam('status', e.target.value)}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              >
                <option value="">All Statuses</option>

                {TICKET_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">
                Priority
              </label>

              <select
                value={params.get('priority') || ''}
                onChange={(e) => updateParam('priority', e.target.value)}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              >
                <option value="">All Priorities</option>

                {PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">
                Type
              </label>

              <select
                value={params.get('ticket_type') || ''}
                onChange={(e) =>
                  updateParam('ticket_type', e.target.value)
                }
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              >
                <option value="">All Types</option>

                {TICKET_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">
                Assigned To
              </label>

              <select
                value={params.get('assigned_agent_id') || ''}
                onChange={(e) =>
                  updateParam('assigned_agent_id', e.target.value)
                }
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              >
                <option value="">Anyone</option>

                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {categories.length > 0 && (
            <div className="mt-3 max-w-sm">
              <label className="block text-xs font-medium text-surface-300 mb-1.5">
                Category
              </label>

              <select
                value={params.get('category_id') || ''}
                onChange={(e) =>
                  updateParam('category_id', e.target.value)
                }
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              >
                <option value="">All Categories</option>

                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Ticket List */}
      <div className="bg-surface-800 rounded-xl border border-surface-600 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center">
            <div className="text-sm text-surface-400">
              Loading tickets...
            </div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-surface-500 mx-auto mb-3" />

            <p className="text-surface-300 text-sm">
              No tickets found
            </p>

            <p className="text-surface-400 text-xs mt-1">
              Try adjusting your filters or create a new ticket
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-surface-600">
              {tickets.map((ticket) => (
                <button
                  type="button"
                  key={ticket.id}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-surface-700/50 transition-colors text-left"
                >
                  <div className="shrink-0">
                    <PriorityBadge priority={ticket.priority} />
                  </div>

                  <div className="shrink-0">
                    <StatusBadge status={ticket.status} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-surface-100 truncate">
                      <span className="text-surface-400 font-mono mr-2">
                        {ticket.ticket_number}
                      </span>

                      {ticket.subject}
                    </div>

                    <div className="text-xs text-surface-300 mt-1 truncate">
                      {ticket.company_name && (
                        <span className="mr-3">
                          {ticket.company_name}
                        </span>
                      )}

                      {ticket.agent_name && (
                        <span className="text-surface-400">
                          {ticket.agent_name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-surface-400 shrink-0 hidden sm:block">
                    {timeAgo(ticket.created_at)}
                  </div>
                </button>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-surface-600 flex items-center justify-between gap-4">
                <span className="text-xs text-surface-400">
                  Page {page} of {totalPages}
                </span>

                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() =>
                      updateParam('page', String(page - 1))
                    }
                    className="px-3 py-1.5 rounded-lg text-xs text-surface-200 hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>

                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() =>
                      updateParam('page', String(page + 1))
                    }
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