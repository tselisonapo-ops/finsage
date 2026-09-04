import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { formatDateTime } from '../lib/constants'
import { Search, Building2, ArrowUpRight } from 'lucide-react'

export default function CustomerList() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(params.get('search') || '')

  const page = parseInt(params.get('page') || '1')
  const perPage = 20

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        page, per_page: perPage,
        ...(params.get('search') && { search: params.get('search') }),
      }).toString()
      const data = await api.get(`/customers?${qs}`)
      setCustomers(data.customers || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [params, page])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-surface-100">Customers</h1>
          <p className="text-sm text-surface-300">{total} compan{total !== 1 ? 'ies' : 'y'}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const p = new URLSearchParams(params)
              if (search) p.set('search', search)
              else p.delete('search')
              p.delete('page')
              setParams(p)
            }
          }}
          placeholder="Search companies..."
          className="w-full bg-surface-800 border border-surface-600 rounded-lg pl-9 pr-3 py-2 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent"
        />
      </div>

      {/* Customer list */}
      <div className="bg-surface-800 rounded-xl border border-surface-600 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-surface-400">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-10 h-10 text-surface-500 mx-auto mb-3" />
            <p className="text-surface-300 text-sm">No companies found</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-600 text-xs text-surface-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Company</th>
                  <th className="text-left px-4 py-3 font-medium">Industry</th>
                  <th className="text-center px-4 py-3 font-medium">Users</th>
                  <th className="text-center px-4 py-3 font-medium">Open Tickets</th>
                  <th className="text-left px-4 py-3 font-medium">Modules</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-600">
                {customers.map(c => {
                  const modules = c.enabled_modules
                    ? (typeof c.enabled_modules === 'string' ? JSON.parse(c.enabled_modules) : c.enabled_modules)
                    : []
                  return (
                    <tr
                      key={c.company_id}
                      onClick={() => navigate(`/control/customers/${c.company_id}`)}
                      className="hover:bg-surface-700/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-surface-100">{c.company_name}</div>
                        <div className="text-xs text-surface-400">ID: {c.company_id} &middot; {c.currency || 'ZAR'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-200">
                        {c.industry || '—'}
                        {c.sub_industry ? <span className="text-surface-400"> / {c.sub_industry}</span> : ''}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-surface-200">{c.user_count || 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-medium ${c.open_ticket_count > 0 ? 'text-p2' : 'text-surface-300'}`}>
                          {c.open_ticket_count || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {modules.slice(0, 3).map((m, i) => (
                            <span key={i} className="text-xs bg-surface-600 text-surface-200 px-2 py-0.5 rounded">
                              {typeof m === 'string' ? m.replace(/_/g, ' ') : m}
                            </span>
                          ))}
                          {modules.length > 3 && (
                            <span className="text-xs text-surface-400">+{modules.length - 3}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-surface-600 flex items-center justify-between">
                <span className="text-xs text-surface-400">Page {page} of {totalPages}</span>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => { const p = new URLSearchParams(params); p.set('page', String(page - 1)); setParams(p) }}
                    className="px-3 py-1 rounded text-xs text-surface-200 hover:bg-surface-700 disabled:opacity-30">Prev</button>
                  <button disabled={page >= totalPages} onClick={() => { const p = new URLSearchParams(params); p.set('page', String(page + 1)); setParams(p) }}
                    className="px-3 py-1 rounded text-xs text-surface-200 hover:bg-surface-700 disabled:opacity-30">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}