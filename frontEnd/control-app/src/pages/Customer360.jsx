import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import { formatDateTime, timeAgo } from '../lib/constants'
import {
  ArrowLeft, Building2, Users, Package, Clock, Shield, Mail, Ticket, ArrowUpRight
} from 'lucide-react'

export default function Customer360() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/customers/${id}`).then(setCustomer).catch(console.error).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-surface-300">Loading customer...</div>
  if (!customer) return <div className="p-8 text-red-400">Company not found</div>

  const stats = customer.ticket_stats || {}
  const modules = customer.enabled_modules
    ? (typeof customer.enabled_modules === 'string' ? JSON.parse(customer.enabled_modules) : customer.enabled_modules)
    : []

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <button
        onClick={() => navigate('/control/customers')}
        className="flex items-center gap-1.5 text-sm text-surface-300 hover:text-surface-100 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to customers
      </button>

      {/* Header Card */}
      <div className="bg-surface-800 rounded-xl border border-surface-600 p-5 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-surface-100">{customer.company_name}</h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-surface-400">
                <span>ID: {customer.company_id}</span>
                {customer.industry && <span>{customer.industry}{customer.sub_industry ? ` / ${customer.sub_industry}` : ''}</span>}
                <span>{customer.currency || 'ZAR'}</span>
                <span className={`flex items-center gap-1 ${customer.is_active ? 'text-success' : 'text-p1'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${customer.is_active ? 'bg-success' : 'bg-p1'}`} />
                  {customer.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: Stats + Modules */}
        <div className="space-y-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-800 rounded-xl border border-surface-600 p-3">
              <Users className="w-4 h-4 text-accent mb-1" />
              <div className="text-lg font-bold text-surface-100">{customer.users?.length || customer.user_count || 0}</div>
              <div className="text-xs text-surface-400">Users</div>
            </div>
            <div className="bg-surface-800 rounded-xl border border-surface-600 p-3">
              <Ticket className="w-4 h-4 text-p2 mb-1" />
              <div className="text-lg font-bold text-surface-100">{stats.open || 0}</div>
              <div className="text-xs text-surface-400">Open Tickets</div>
            </div>
            <div className="bg-surface-800 rounded-xl border border-surface-600 p-3">
              <Package className="w-4 h-4 text-success mb-1" />
              <div className="text-lg font-bold text-surface-100">{modules.length}</div>
              <div className="text-xs text-surface-400">Modules</div>
            </div>
            <div className="bg-surface-800 rounded-xl border border-surface-600 p-3">
              <Ticket className="w-4 h-4 text-surface-400 mb-1" />
              <div className="text-lg font-bold text-surface-100">{stats.total || 0}</div>
              <div className="text-xs text-surface-400">Total Tickets</div>
            </div>
          </div>

          {/* Modules */}
          <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
            <h3 className="text-sm font-semibold text-surface-100 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-accent" /> Modules
            </h3>
            {modules.length === 0 ? (
              <p className="text-xs text-surface-400">No module data available</p>
            ) : (
              <div className="space-y-1.5">
                {modules.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    <span className="text-surface-200">{typeof m === 'string' ? m.replace(/_/g, ' ') : m}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System Info */}
          <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
            <h3 className="text-sm font-semibold text-surface-100 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" /> System Info
            </h3>
            <div className="space-y-2 text-xs">
              {customer.app_version && (
                <div className="flex justify-between"><span className="text-surface-400">App Version</span><span className="text-surface-200">{customer.app_version}</span></div>
              )}
              <div className="flex justify-between"><span className="text-surface-400">Created</span><span className="text-surface-200">{formatDateTime(customer.company_created_at)}</span></div>
              {customer.last_login_at && (
                <div className="flex justify-between"><span className="text-surface-400">Last Login</span><span className="text-surface-200">{formatDateTime(customer.last_login_at)}</span></div>
              )}
              {customer.last_transaction_at && (
                <div className="flex justify-between"><span className="text-surface-400">Last Transaction</span><span className="text-surface-200">{formatDateTime(customer.last_transaction_at)}</span></div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Users + Tickets */}
        <div className="lg:col-span-2 space-y-4">
          {/* Users */}
          <div className="bg-surface-800 rounded-xl border border-surface-600">
            <div className="px-4 py-3 border-b border-surface-600">
              <h3 className="text-sm font-semibold text-surface-100">Users</h3>
            </div>
            <div className="divide-y divide-surface-600 max-h-64 overflow-auto">
              {(!customer.users || customer.users.length === 0) && (
                <div className="p-4 text-center text-xs text-surface-400">No users found</div>
              )}
              {customer.users?.map(u => (
                <div key={u.user_id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-600 flex items-center justify-center text-xs font-bold text-surface-200">
                    {(u.first_name || u.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-surface-100 truncate">
                      {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                    </div>
                    <div className="text-xs text-surface-400 truncate">{u.email}</div>
                  </div>
                  <span className="text-xs text-surface-400 capitalize bg-surface-700 px-2 py-0.5 rounded">
                    {u.user_role || 'member'}
                  </span>
                  <span className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-success' : 'bg-p1'}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Tickets */}
          <div className="bg-surface-800 rounded-xl border border-surface-600">
            <div className="px-4 py-3 border-b border-surface-600 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-100">Support Tickets</h3>
              {stats.critical > 0 && (
                <span className="text-xs text-p1 font-medium">{stats.critical} critical</span>
              )}
            </div>
            <div className="divide-y divide-surface-600 max-h-96 overflow-auto">
              {(!customer.tickets || customer.tickets.length === 0) && (
                <div className="p-8 text-center text-xs text-surface-400">No tickets for this company</div>
              )}
              {customer.tickets?.map(t => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/control/tickets/${t.id}`)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-700/50 transition-colors text-left"
                >
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-surface-100 truncate">{t.subject}</div>
                    <div className="text-xs text-surface-400">
                      {t.ticket_number} &middot; {t.module_code?.replace(/_/g, ' ') || '—'}
                      {t.agent_name && ` &middot; ${t.agent_name}`}
                    </div>
                  </div>
                  <span className="text-xs text-surface-400 shrink-0">{timeAgo(t.created_at)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}