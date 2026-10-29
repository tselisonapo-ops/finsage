import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CreditCard,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Users,
  Clock,
  TrendingUp,
  Wallet,
  Loader2,
} from 'lucide-react'

import { api } from '../api/client'
import { formatDateTime } from '../utils/formatters'
import SettleInline from '../components/SettleInline'

/**
 * Subscriptions — the fleet cockpit.
 *
 * KPIs + awaiting-settlement money queue + per-company subscription list
 * (latest row per company). Row click → the company's subscription page.
 * Settlement actions are admin-side; the backend enforces role + ownership.
 */

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'trialing', label: 'Trialing' },
  { key: 'past_due', label: 'Past due' },
  { key: 'grace', label: 'Grace' },
  { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
]

const SORTS = [
  { key: 'next_billing', label: 'Next billing' },
  { key: 'trial_ending', label: 'Trial ending' },
  { key: 'recent', label: 'Most recent' },
  { key: 'amount', label: 'Amount' },
  { key: 'company', label: 'Company' },
]

function valueOrDash(value) {
  return value === null || value === undefined || value === ''
    ? '—'
    : value
}

function fmtMoney(amount, currency) {
  if (amount === null || amount === undefined) return '—'
  const prefix = String(currency || '') === 'LSL' ? 'M' : currency
  return `${prefix} ${Number(amount).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`
}

function StatusBadge({ value }) {
  if (!value) {
    return <span className="text-surface-400">—</span>
  }

  const normalized = String(value).toLowerCase()

  const positive = ['active', 'paid', 'trialing', 'current'].includes(
    normalized
  )
  const negative = [
    'failed',
    'past_due',
    'overdue',
    'suspended',
    'cancelled',
    'expired',
    'grace',
  ].includes(normalized)

  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
        positive
          ? 'bg-success/10 text-success'
          : negative
          ? 'bg-error/10 text-error'
          : 'bg-surface-700 text-surface-300'
      }`}
    >
      {String(value).replace('_', ' ')}
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-surface-800 border border-surface-600 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center">
          <Icon size={16} className="text-accent" />
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-surface-400">
          {label}
        </span>
      </div>
      <div className={`text-2xl font-semibold ${accent || 'text-surface-100'}`}>
        {value}
      </div>
    </div>
  )
}

export default function Subscriptions() {
  const navigate = useNavigate()

  const [overview, setOverview] = useState(null)
  const [queue, setQueue] = useState([])
  const [list, setList] = useState({ subscriptions: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState('')

  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [searchApplied, setSearchApplied] = useState('')
  const [sort, setSort] = useState('next_billing')
  const [page, setPage] = useState(1)
  const perPage = 20

  async function loadFleet(showListSpinner = true) {
    if (showListSpinner) setListLoading(true)

    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (searchApplied) params.set('search', searchApplied)
      params.set('sort', sort)
      params.set('page', String(page))
      params.set('per_page', String(perPage))

      const result = await api.get(`/subscriptions?${params.toString()}`)
      setList(result || { subscriptions: [], total: 0 })
    } catch (err) {
      setError(err?.message || 'Unable to load subscriptions')
    } finally {
      setListLoading(false)
    }
  }

  async function loadHeader() {
    try {
      const [ov, q] = await Promise.all([
        api.get('/subscriptions/overview'),
        api.get('/subscriptions/awaiting-settlement'),
      ])
      setOverview(ov)
      setQueue(q?.billing || [])
    } catch (err) {
      // header is non-critical — the list still renders
      console.error('Failed to load subscription overview:', err)
    }
  }

  useEffect(() => {
    let mounted = true

    async function boot() {
      setLoading(true)
      setError('')
      await Promise.all([loadFleet(false), loadHeader()])
      if (mounted) setLoading(false)
    }

    boot()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadFleet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, searchApplied, sort, page])

  const reloadAll = () => {
    loadFleet()
    loadHeader()
  }

  const totalPages = Math.max(
    1,
    Math.ceil((list.total || 0) / perPage)
  )

  if (loading) {
    return (
      <div className="w-full min-h-full p-5 lg:p-6">
        <div className="finsage-card-dark p-8 text-center text-sm text-surface-400">
          Loading subscriptions...
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent-muted border border-accent/20 flex items-center justify-center">
            <CreditCard size={22} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-surface-100">
              Subscriptions
            </h1>
            <p className="text-sm text-surface-400">
              Fleet cockpit — plans, trials, payments and plan changes
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={reloadAll}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-700 transition-colors"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-surface-800 border border-error/30 rounded-xl p-4 text-sm text-error">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          icon={Users}
          label="Active"
          value={overview?.active ?? '—'}
        />
        <KpiCard
          icon={Clock}
          label="Trialing"
          value={overview?.trialing ?? '—'}
        />
        <KpiCard
          icon={AlertCircle}
          label="Past due"
          value={overview?.past_due ?? '—'}
          accent={
            (overview?.past_due || 0) > 0
              ? 'text-error'
              : 'text-surface-100'
          }
        />
        <KpiCard
          icon={Wallet}
          label="Awaiting"
          value={overview?.awaiting_settlement ?? '—'}
          accent={
            (overview?.awaiting_settlement || 0) > 0
              ? 'text-warning'
              : 'text-surface-100'
          }
        />
        <KpiCard
          icon={TrendingUp}
          label="MRR"
          value={
            overview
              ? fmtMoney(
                  Math.round(overview.mrr || 0),
                  'LSL'
                )
              : '—'
          }
        />
      </div>

      {/* Trials ending soon */}
      {overview?.trials_ending_soon?.length > 0 && (
        <div className="bg-surface-800 border border-warning/30 rounded-xl p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-warning mb-2">
            Trials ending within 7 days
          </div>
          <div className="flex flex-wrap gap-2">
            {overview.trials_ending_soon.map((t) => (
              <button
                key={t.company_id}
                type="button"
                onClick={() =>
                  navigate(`/customers/${t.company_id}/subscription`)
                }
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-900 border border-surface-600 text-xs text-surface-200 hover:border-accent transition-colors"
              >
                <span className="font-medium">{t.company_name}</span>
                <span className="text-surface-400">
                  ends {formatDateTime(t.trial_ends_at)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Awaiting settlement queue */}
      {queue.length > 0 && (
        <div className="bg-surface-800 border border-surface-600 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={17} className="text-warning" />
            <h2 className="font-semibold text-surface-100">
              Awaiting settlement ({queue.length})
            </h2>
            <span className="text-xs text-surface-400">
              — pending / failed charge rows; confirm once the EFT or
              mobile-money payment lands
            </span>
          </div>

          <div className="space-y-3">
            {queue.map((row) => (
              <div
                key={row.billing_id}
                className="bg-surface-900/50 border border-surface-600 rounded-lg p-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/customers/${row.company_id}/subscription`
                        )
                      }
                      className="font-medium text-surface-100 hover:text-accent transition-colors"
                    >
                      {row.company_name}
                    </button>
                    <div className="text-xs text-surface-400 mt-1">
                      {valueOrDash(
                        row.invoice_reference || row.billing_reference
                      )}
                      {' · '}
                      {row.plan_name || '—'} ·{' '}
                      <StatusBadge value={row.billing_status} /> · due{' '}
                      {formatDateTime(row.due_at)}
                    </div>
                    {row.failure_reason && (
                      <div className="text-xs text-error mt-1">
                        {row.failure_reason}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-sm font-medium text-surface-100">
                      {fmtMoney(row.amount, row.currency)}
                    </span>
                    <SettleInline
                      companyId={row.company_id}
                      billingId={row.billing_id}
                      onDone={reloadAll}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface-800 border border-surface-600 rounded-xl p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatus(tab.key)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  status === tab.key
                    ? 'bg-accent-muted text-accent'
                    : 'text-surface-300 hover:text-surface-100 hover:bg-surface-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 lg:ml-auto">
            <div className="relative flex-1 min-w-0">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearchApplied(search.trim())
                    setPage(1)
                  }
                }}
                placeholder="Search company (Enter)"
                className="w-full bg-surface-900 border border-surface-500 rounded-lg pl-9 pr-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent"
              />
            </div>

            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value)
                setPage(1)
              }}
              className="bg-surface-900 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Fleet table */}
      <div className="bg-surface-800 border border-surface-600 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-surface-400 border-b border-surface-600">
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Billing</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">
                  Next billing / trial end
                </th>
              </tr>
            </thead>

            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center">
                    <Loader2
                      size={18}
                      className="animate-spin text-surface-400 mx-auto"
                    />
                  </td>
                </tr>
              ) : (list.subscriptions || []).length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-surface-400"
                  >
                    No subscriptions match these filters.
                  </td>
                </tr>
              ) : (
                (list.subscriptions || []).map((s) => (
                  <tr
                    key={s.subscription_id}
                    onClick={() =>
                      navigate(`/customers/${s.company_id}/subscription`)
                    }
                    className="border-b border-surface-600/50 last:border-b-0 hover:bg-surface-700/40 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-surface-100">
                        {s.company_name}
                      </div>
                      <div className="text-xs text-surface-500 mt-0.5">
                        #{s.company_id}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-surface-200">
                      {s.plan_name || s.plan_code}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge value={s.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge value={s.billing_status} />
                    </td>
                    <td className="px-5 py-3.5 text-surface-200">
                      {s.amount > 0
                        ? `${s.currency} ${Number(
                            s.amount
                          ).toLocaleString()} / ${
                            s.billing_interval || 'monthly'
                          }`
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-surface-300">
                      {formatDateTime(s.next_billing_at) !== '—'
                        ? formatDateTime(s.next_billing_at)
                        : formatDateTime(s.trial_ends_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-surface-600">
          <span className="text-xs text-surface-400">
            {list.total || 0} subscription
            {(list.total || 0) === 1 ? '' : 's'} · page {page} of{' '}
            {totalPages}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || listLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg text-surface-300 hover:text-surface-100 hover:bg-surface-700 transition-colors disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages || listLoading}
              onClick={() =>
                setPage((p) => Math.min(totalPages, p + 1))
              }
              className="p-1.5 rounded-lg text-surface-300 hover:text-surface-100 hover:bg-surface-700 transition-colors disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
