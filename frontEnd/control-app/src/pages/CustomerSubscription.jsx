import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CreditCard,
  CalendarDays,
  Receipt,
  Activity,
  Plus,
  Download,
  FileText,
  Sparkles,
  Loader2,
  X,
} from 'lucide-react'

import { api } from '../api/client'
import { formatDateTime } from '../utils/formatters'
import SubscriptionActions from '../components/SubscriptionActions'

function valueOrDash(value) {
  return value === null || value === undefined || value === ''
    ? '—'
    : value
}

function StatusBadge({ value }) {
  if (!value) {
    return (
      <span className="text-surface-400">
        —
      </span>
    )
  }

  const normalized = String(value).toLowerCase()

  const positive = [
    'active',
    'paid',
    'trialing',
    'current',
  ].includes(normalized)

  const negative = [
    'failed',
    'overdue',
    'suspended',
    'cancelled',
    'expired',
    'grace',
  ].includes(normalized)

  return (
    <span
      className={`
        inline-flex
        px-2.5 py-1
        rounded-full
        text-xs
        font-medium
        ${
          positive
            ? 'bg-success/10 text-success'
            : negative
              ? 'bg-error/10 text-error'
              : 'bg-surface-700 text-surface-300'
        }
      `}
    >
      {String(value).replace('_', ' ')}
    </span>
  )
}

function Card({ title, icon: Icon, children }) {
  return (
    <div className="
      bg-surface-800
      border border-surface-600
      rounded-xl
      p-5
    ">
      <div className="
        flex
        items-center
        gap-2
        mb-4
      ">
        <div className="
          w-8 h-8
          rounded-lg
          bg-accent-muted
          flex
          items-center
          justify-center
        ">
          <Icon
            size={17}
            className="text-accent"
          />
        </div>

        <h2 className="
          font-semibold
          text-surface-100
        ">
          {title}
        </h2>
      </div>

      {children}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="
      flex
      flex-col
      sm:flex-row
      sm:items-center
      sm:justify-between
      gap-1 sm:gap-4
      py-2.5
      border-b
      border-surface-600
      last:border-b-0
    ">
      <span className="
        text-sm
        text-surface-400
      ">
        {label}
      </span>

      <span className="
        text-sm
        text-surface-200
        sm:text-right
      ">
        {valueOrDash(value)}
      </span>
    </div>
  )
}

function ProvisionSection({ companyId, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('trial')
  const [planCode, setPlanCode] = useState('premium')
  const [trialDays, setTrialDays] = useState(14)
  const [billingInterval, setBillingInterval] = useState('monthly')
  const [reason, setReason] = useState('')

  const handleProvision = async () => {
    setBusy(true)
    setError('')
    try {
      await api.post(`/subscriptions/${companyId}/provision`, {
        mode,
        plan_code: planCode,
        trial_days: mode === 'trial' ? trialDays : undefined,
        billing_interval: mode === 'commit' ? billingInterval : undefined,
        reason: reason.trim() || undefined,
      })
      onDone?.()
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Provisioning failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface-800 border border-surface-600 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center text-accent">
          <Sparkles size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-surface-100">No Subscription Recorded</h2>
          <p className="text-xs text-surface-400">
            This company does not currently have an active subscription or trial. Provision one below:
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs text-error bg-error/10 border border-error/30 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-surface-900/60 p-4 rounded-xl border border-surface-700 space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('trial')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
              mode === 'trial'
                ? 'bg-accent/15 border-accent text-accent'
                : 'border-surface-600 text-surface-400 hover:text-surface-200'
            }`}
          >
            Start Free Trial
          </button>
          <button
            type="button"
            onClick={() => setMode('commit')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
              mode === 'commit'
                ? 'bg-accent/15 border-accent text-accent'
                : 'border-surface-600 text-surface-400 hover:text-surface-200'
            }`}
          >
            Provision Active Paid Plan
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-surface-300 mb-1">Plan</label>
            <select
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
              className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-accent"
            >
              <option value="business">Business</option>
              <option value="premium">Premium</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          {mode === 'trial' ? (
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1">Trial Duration</label>
              <div className="flex gap-2">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setTrialDays(d)}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                      trialDays === d
                        ? 'border-accent text-accent bg-accent/10 font-medium'
                        : 'border-surface-600 text-surface-400 hover:bg-surface-800'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1">Billing Interval</label>
              <select
                value={billingInterval}
                onChange={(e) => setBillingInterval(e.target.value)}
                className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-xs text-surface-100 focus:outline-none focus:border-accent"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual (Yearly)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-surface-300 mb-1">Reason / Note (Audited)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Sales onboarding"
              className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-xs text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleProvision}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-accent text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {mode === 'trial' ? 'Start Free Trial' : 'Provision Subscription & Charge'}
          </button>
        </div>
      </div>
    </div>
  )
}

function IssueInvoiceModal({ companyId, companyName, currency = 'LSL', onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const plus30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const plus14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)

  const [invoiceRef, setInvoiceRef] = useState(`FS-INV-${companyId}-${Date.now().toString().slice(-6)}`)
  const [description, setDescription] = useState('FinSage Subscription')
  const [invCurrency, setInvCurrency] = useState(currency || 'LSL')
  const [dueDate, setDueDate] = useState(plus14)
  const [periodStart, setPeriodStart] = useState(today)
  const [periodEnd, setPeriodEnd] = useState(plus30)
  const [note, setNote] = useState(
    'Payment via Mobile Money:\n' +
    '• M-Pesa: [M-Pesa Number] (Tseliso Napo)\n' +
    '• EcoCash: [EcoCash Number] (Tseliso Napo)\n' +
    'Ref: Please use Invoice Reference above.'
  )

  const [lines, setLines] = useState([
    { id: 1, description: 'FinSage Platform Subscription (1 Month)', quantity: 1, unit_price: 500 }
  ])

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: Date.now(), description: '', quantity: 1, unit_price: 0 }
    ])
  }

  const removeLine = (id) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  const updateLine = (id, field, val) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: val } : l))
    )
  }

  const totalAmount = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
    0
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (lines.length === 0) {
      setError('Please add at least one line item')
      return
    }
    setBusy(true)
    setError('')
    try {
      const payloadLines = lines.map((l) => ({
        description: l.description.trim() || 'Service fee',
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
        total: (Number(l.quantity) || 1) * (Number(l.unit_price) || 0),
      }))

      await api.post(`/subscriptions/${companyId}/billing/issue`, {
        amount: totalAmount,
        currency: invCurrency,
        description: description.trim() || 'Subscription Invoice',
        lines: payloadLines,
        due_at: dueDate,
        period_start: periodStart,
        period_end: periodEnd,
        invoice_reference: invoiceRef.trim() || undefined,
        note: note.trim() || undefined,
      })

      onDone?.()
      onClose?.()
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to issue invoice')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-surface-800 border border-surface-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-700 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Receipt size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">Issue Subscription Invoice</h2>
              <p className="text-xs text-surface-400">For {companyName} (Company #{companyId})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-surface-400 hover:text-surface-100 p-1 rounded-lg hover:bg-surface-700"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs text-error bg-error/10 border border-error/30 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1">Invoice Reference</label>
              <input
                type="text"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                required
                className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1">Currency</label>
              <select
                value={invCurrency}
                onChange={(e) => setInvCurrency(e.target.value)}
                className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent"
              >
                <option value="LSL">LSL (Lesotho Loti)</option>
                <option value="ZAR">ZAR (South African Rand)</option>
                <option value="USD">USD (US Dollar)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-1.5 text-xs text-surface-100 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1">Period Start</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-1.5 text-xs text-surface-100 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1">Period End</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-1.5 text-xs text-surface-100 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-surface-300">Invoice Line Items</label>
              <button
                type="button"
                onClick={addLine}
                className="text-xs text-accent hover:underline font-medium"
              >
                + Add Line
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.id} className="flex items-center gap-2 bg-surface-900/60 p-2 rounded-lg border border-surface-700">
                  <input
                    type="text"
                    value={l.description}
                    onChange={(e) => updateLine(l.id, 'description', e.target.value)}
                    placeholder="Description (e.g. Monthly Fee)"
                    className="flex-1 bg-surface-900 border border-surface-600 rounded px-2.5 py-1 text-xs text-surface-100 placeholder:text-surface-500"
                    required
                  />
                  <input
                    type="number"
                    min="1"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.id, 'quantity', e.target.value)}
                    placeholder="Qty"
                    className="w-16 bg-surface-900 border border-surface-600 rounded px-2 py-1 text-xs text-surface-100 text-center"
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.unit_price}
                    onChange={(e) => updateLine(l.id, 'unit_price', e.target.value)}
                    placeholder="Price"
                    className="w-24 bg-surface-900 border border-surface-600 rounded px-2 py-1 text-xs text-surface-100 text-right"
                    required
                  />
                  <span className="text-xs font-medium text-surface-200 w-20 text-right">
                    {invCurrency} {((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)).toLocaleString()}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(l.id)}
                      className="text-surface-400 hover:text-error p-1"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 text-sm">
              <span className="text-surface-400 mr-3">Total Amount:</span>
              <span className="font-semibold text-accent text-base">
                {invCurrency} {totalAmount.toLocaleString()}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-300 mb-1">Notes / Remittance Instructions</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bank details, payment instructions..."
              className="w-full bg-surface-900 border border-surface-600 rounded-lg p-2.5 text-xs text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-700">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-surface-400 hover:text-surface-100 rounded-lg hover:bg-surface-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || totalAmount <= 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-40"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Generate & Issue Invoice
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CustomerSubscription() {
  const { companyId } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      setError('')

      try {
        const result = await api.get(
          `/customers/${companyId}/subscription`
        )

        if (mounted) {
          setData(result)
        }
      } catch (err) {
        console.error(
          'Failed to load subscription:',
          err
        )

        if (mounted) {
          setError(
            err?.response?.data?.error ||
            err?.message ||
            'Unable to load subscription'
          )
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      mounted = false
    }
  }, [companyId, version])

  const downloadInvoicePdf = async (billingId, ref) => {
    try {
      await api.downloadBlob(
        `/subscriptions/${companyId}/billing/${billingId}/invoice-pdf`,
        `Invoice-${ref || billingId}.pdf`
      )
    } catch (err) {
      alert(err?.message || 'Failed to download PDF invoice')
    }
  }

  if (loading) {
    return (
      <div className="w-full min-h-full p-5 lg:p-6">
        <div className="finsage-card-dark p-8 text-center text-sm text-surface-400">
          Loading subscription...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full min-h-full p-5 lg:p-6 space-y-6">
        <button
          type="button"
          onClick={() => navigate(`/customers/${companyId}`)}
          className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-100 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to company
        </button>

        <div className="bg-surface-800 border border-error/30 rounded-xl p-8">
          <div className="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center mb-4">
            <Activity size={20} className="text-error" />
          </div>

          <h1 className="font-semibold text-surface-100 mb-2">
            Subscription unavailable
          </h1>

          <p className="text-sm text-surface-400">
            {error}
          </p>
        </div>
      </div>
    )
  }

  const company = data?.company
  const subscription = data?.subscription
  const billing = data?.billing || []
  const events = data?.events || []

  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">
      {/* Back & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate(`/customers/${companyId}`)}
          className="inline-flex items-center gap-2 text-sm text-surface-400 hover:text-surface-100 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to company
        </button>

        <button
          type="button"
          onClick={() => setShowInvoiceModal(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:opacity-90 transition-opacity"
        >
          <Receipt size={16} />
          Issue Manual Invoice
        </button>
      </div>

      {/* Header */}
      <div className="bg-surface-800 border border-surface-600 rounded-xl p-5 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-accent-muted border border-accent/20 flex items-center justify-center shrink-0">
            <CreditCard size={22} className="text-accent" />
          </div>

          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-accent">
              Subscription Management
            </div>

            <h1 className="text-xl font-semibold text-surface-100 mt-1">
              {company?.company_name}
            </h1>

            <div className="text-sm text-surface-400 mt-1">
              Company #{company?.company_id} · {company?.currency || 'LSL'}
            </div>
          </div>
        </div>
      </div>

      {/* No Subscription State with direct Provisioning Action */}
      {!subscription ? (
        <ProvisionSection companyId={companyId} onDone={reload} />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card title="Plan" icon={CreditCard}>
              <div className="text-xl font-semibold text-surface-100">
                {valueOrDash(subscription.plan_name)}
              </div>
              <div className="text-xs text-surface-400 mt-1">
                {valueOrDash(subscription.plan_code)} · {subscription.billing_interval || 'monthly'}
              </div>
            </Card>

            <Card title="Status" icon={Activity}>
              <StatusBadge value={subscription.status} />
            </Card>

            <Card title="Billing" icon={Receipt}>
              <StatusBadge value={subscription.billing_status} />
            </Card>

            <Card title="Next billing / Trial" icon={CalendarDays}>
              <div className="text-sm text-surface-200">
                {subscription.status === 'trialing'
                  ? formatDateTime(subscription.trial_ends_at)
                  : formatDateTime(subscription.next_billing_at)}
              </div>
            </Card>
          </div>

          {/* Subscription Details */}
          <Card title="Subscription details" icon={CreditCard}>
            <InfoRow label="Plan" value={subscription.plan_name} />
            <InfoRow label="Plan code" value={subscription.plan_code} />
            <InfoRow label="Subscription status" value={subscription.status} />
            <InfoRow label="Billing status" value={subscription.billing_status} />
            <InfoRow label="Billing interval" value={subscription.billing_interval} />
            <InfoRow
              label="Amount"
              value={
                subscription.amount !== null
                  ? `${subscription.currency} ${Number(subscription.amount).toLocaleString()}`
                  : null
              }
            />
            <InfoRow label="Started" value={formatDateTime(subscription.started_at)} />
            <InfoRow label="Trial ends" value={formatDateTime(subscription.trial_ends_at)} />
            <InfoRow
              label="Current period"
              value={
                subscription.current_period_start && subscription.current_period_end
                  ? `${formatDateTime(subscription.current_period_start)} → ${formatDateTime(subscription.current_period_end)}`
                  : null
              }
            />
            <InfoRow label="Next billing" value={formatDateTime(subscription.next_billing_at)} />
            <InfoRow label="Cancelled" value={formatDateTime(subscription.cancelled_at)} />
            <InfoRow label="Cancellation effective" value={formatDateTime(subscription.cancellation_effective_at)} />
            <InfoRow label="Payment provider" value={subscription.payment_provider || 'Manual / Invoicing'} />
          </Card>

          {/* Lifecycle & Plan Actions */}
          <SubscriptionActions
            companyId={companyId}
            subscription={subscription}
            billing={billing}
            onChanged={reload}
          />
        </>
      )}

      {/* Billing History */}
      <Card title="Billing history" icon={Receipt}>
        {billing.length === 0 ? (
          <div className="text-sm text-surface-400 py-2">
            No billing records recorded. Click &ldquo;Issue Manual Invoice&rdquo; above to generate one.
          </div>
        ) : (
          <div className="space-y-3">
            {billing.map((item) => (
              <div
                key={item.billing_id}
                className="bg-surface-900/50 border border-surface-600 rounded-lg p-4 hover:border-surface-500 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-surface-100">
                        {valueOrDash(item.invoice_reference || item.billing_reference)}
                      </span>
                      <StatusBadge value={item.billing_status} />
                    </div>

                    <div className="text-xs text-surface-400 mt-1">
                      Created: {formatDateTime(item.created_at)}
                      {item.external_payment_id && ` · Ref: ${item.external_payment_id}`}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => downloadInvoicePdf(item.billing_id, item.invoice_reference || item.billing_reference)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-surface-500 text-surface-300 hover:text-surface-100 hover:bg-surface-700 transition-colors shrink-0"
                  >
                    <Download size={13} />
                    Download Invoice PDF
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div>
                    <div className="text-xs text-surface-400">Amount</div>
                    <div className="text-sm text-surface-200 mt-1 font-medium">
                      {item.currency} {Number(item.amount).toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-surface-400">Due Date</div>
                    <div className="text-sm text-surface-200 mt-1">
                      {formatDateTime(item.due_at)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-surface-400">Paid Date</div>
                    <div className="text-sm text-surface-200 mt-1">
                      {formatDateTime(item.paid_at)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-surface-400">Failed Date</div>
                    <div className="text-sm text-surface-200 mt-1">
                      {formatDateTime(item.failed_at)}
                    </div>
                  </div>
                </div>

                {item.failure_reason && (
                  <div className="mt-3 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
                    Failure reason: {item.failure_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Subscription History */}
      <Card title="Subscription audit events" icon={Activity}>
        {events.length === 0 ? (
          <div className="text-sm text-surface-400 py-2">
            No subscription events recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.event_id}
                className="bg-surface-900/50 border border-surface-600 rounded-lg p-3 hover:border-surface-500 transition-colors text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                  <span className="font-semibold text-surface-200">
                    {valueOrDash(event.event_type)}
                  </span>
                  <span className="text-surface-400">
                    {formatDateTime(event.created_at)}
                  </span>
                </div>
                {event.description && (
                  <div className="text-surface-400 mt-1">
                    {event.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Manual Invoicing Modal */}
      {showInvoiceModal && (
        <IssueInvoiceModal
          companyId={companyId}
          companyName={company?.company_name}
          currency={company?.currency || 'LSL'}
          onClose={() => setShowInvoiceModal(false)}
          onDone={reload}
        />
      )}
    </div>
  )
}
