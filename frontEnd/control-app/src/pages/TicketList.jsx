import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import { timeAgo, getTicketTypeLabel, TICKET_STATUSES, PRIORITIES, TICKET_TYPES } from '../lib/constants'
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

  const page = parseInt(params.get('page') || '1')
  const perPage = 20

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    try {
      const filters = {}
      if (params.get('status')) filters.status = params.get('status')
      if (params.get('priority')) filters.priority = params.get('priority')
      if (params.get('ticket_type')) filters.ticket_type = params.get('ticket_type')
      if (params.get('category_id')) filters.category_id = params.get('category_id')
      if (params.get('assigned_agent_id')) filters.assigned_agent_id = params.get('assigned_agent_id')
      if (params.get('search')) filters.search = params.get('search')

      const qs = new URLSearchParams({ page, per_page: perPage, ...filters }).toString()
      const data = await api.get(`/tickets?${qs}`)
      setTickets(data.tickets || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [params, page])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  useEffect(() => {
    Promise.all([
      api.get('/settings/agents').catch(() => []),
      api.get('/settings/categories').catch(() => []),
    ]).then(([a, c]) => {
      setAgents(a || [])
      setCategories(c || [])
    })
  }, [])

  const updateParam = (key, value) => {
    const p = new URLSearchParams(params)
    if (value) p.set(key, value)
    else p.delete(key)
    if (key !== 'page') p.delete('page')
    setParams(p)
  }

  const clearFilters = () => {
    setParams({})
    setSearch('')
  }

  const hasFilters = params.get('status') || params.get('priority') || params.get('ticket_type') || params.get('search')

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-surface-100">Tickets</h1>
          <p className="text-sm text-surface-300">{total} ticket{total !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => navigate('/control/tickets/new')}
          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Ticket
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && updateParam('search', search)}
            placeholder="Search tickets..."
            className="w-full bg-surface-800 border border-surface-600 rounded-lg pl-9 pr-3 py-2 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
            showFilters || hasFilters
              ? 'border-accent text-accent bg-accent/10'
              : 'border-surface-600 text-surface-200 hover:bg-surface-700'
          }`}
        >
          <Filter className="w-4 h-4" /> Filters
        </button>
        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-surface-300 hover:text-surface-100">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-surface-800 rounded-xl border border-surface-600 p-4 mb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-surface-300 mb-1">Status</label>
              <select
                value={params.get('status') || ''}
                onChange={(e) => updateParam('status', e.target.value)}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent"
              >
                <option value="">All Statuses</option>
                {TICKET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-surface-300 mb-1">Priority</label>
              <select
                value={params.get('priority') || ''}
                onChange={(e) => updateParam('priority', e.target.value)}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent"
              >
                <option value="">All Priorities</option>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-surface-300 mb-1">Type</label>
              <select
                value={params.get('ticket_type') || ''}
                onChange={(e) => updateParam('ticket_type', e.target.value)}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent"
              >
                <option value="">All Types</option>
                {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-surface-300 mb-1">Assigned To</label>
              <select
                value={params.get('assigned_agent_id') || ''}
                onChange={(e) => updateParam('assigned_agent_id', e.target.value)}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent"
              >
                <option value="">Anyone</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Ticket list */}
      <div className="bg-surface-800 rounded-xl border border-surface-600 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-surface-400">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-surface-500 mx-auto mb-3" />
            <p className="text-surface-300 text-sm">No tickets found</p>
            <p className="text-surface-400 text-xs mt-1">Try adjusting your filters or create a new ticket</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-surface-600">
              {tickets.map(t => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/control/tickets/${t.id}`)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-700/50 transition-colors text-left"
                >
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-surface-100 truncate">
                      <span className="text-surface-400 font-mono mr-2">{t.ticket_number}</span>
                      {t.subject}
                    </div>
                    <div className="text-xs text-surface-300 mt-0.5">
                      {t.company_name && <span className="mr-3">{t.company_name}</span>}
                      {t.agent_name && <span className="text-surface-400">{t.agent_name}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-surface-400 shrink-0">{timeAgo(t.created_at)}</div>
                </button>
              ))}
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-surface-600 flex items-center justify-between">
                <span className="text-xs text-surface-400">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => updateParam('page', String(page - 1))}
                    className="px-3 py-1 rounded text-xs text-surface-200 hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >Prev</button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => updateParam('page', String(page + 1))}
                    className="px-3 py-1 rounded text-xs text-surface-200 hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

