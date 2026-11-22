import { useState } from 'react'
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Ban,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Loader2,
  Wallet,
  Layers,
  RotateCcw,
  Download,
  Calendar,
} from 'lucide-react'

import { api } from '../api/client'

const SUB_BASE = '/subscriptions'

const PLAN_OPTIONS = [
  { code: 'business', label: 'Business' },
  { code: 'premium', label: 'Premium' },
  { code: 'enterprise', label: 'Enterprise' },
]

const PLAN_RANK = {
  business: 1,
  premium: 2,
  enterprise: 3,
}

const TRIAL_CHIPS = [7, 14, 30]
const DEFAULT_FAIL_REASON = 'Payment not received'

function Pill({ value, tone }) {
  const normalized = String(value || '').toLowerCase()
  const positive = ['active', 'paid', 'trialing'].includes(normalized)
  const negative = ['failed', 'overdue', 'suspended', 'cancelled', 'expired'].includes(
    normalized
  )
  const resolved = tone || (positive ? 'ok' : negative ? 'bad' : 'muted')

  const classes = {
    ok: 'bg-success/10 text-success',
    bad: 'bg-error/10 text-error',
    muted: 'bg-surface-700 text-surface-300',
  }[resolved]

  return (
    <span
      className={`
        inline-flex
        px-2.5 py-1
        rounded-full
        text-xs
        font-medium
        ${classes}
      `}
    >
      {value}
    </span>
  )
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div
      className="
        bg-surface-800
        border border-surface-600
        rounded-xl
        p-5
      "
    >
      <div
        className="
          flex
          items-center
          gap-2
          mb-4
        "
      >
        <div
          className="
            w-8 h-8
            rounded-lg
            bg-accent-muted
            flex
            items-center
            justify-center
          "
        >
          <Icon size={17} className="text-accent" />
        </div>

        <h3 className="font-semibold text-surface-100">{title}</h3>
      </div>

      {children}
    </div>
  )
}

function ActionButton({ busyKey, busy, onClick, disabled, tone, children }) {
  const tones = {
    primary: 'bg-accent text-white hover:opacity-90 border border-accent',
    success: 'border border-success/40 text-success hover:bg-success/10',
    danger: 'border border-error/40 text-error hover:bg-error/10',
    neutral: 'border border-surface-500 text-surface-200 hover:bg-surface-700',
  }

  const isBusy = busy === busyKey

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || Boolean(busy)}
      className={`
        inline-flex
        items-center
        gap-2
        px-3.5 py-2
        rounded-lg
        text-sm
        font-medium
        transition-colors
        disabled:opacity-40
        disabled:cursor-not-allowed
        ${tones[tone || 'neutral']}
      `}
    >
      {isBusy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

export default function SubscriptionActions({
  companyId,
  subscription,
  billing,
  onChanged,
}) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [planCode, setPlanCode] = useState(
    PLAN_OPTIONS.some((p) => p.code === subscription?.plan_code)
      ? subscription.plan_code
      : 'premium'
  )
  const [billingInterval, setBillingInterval] = useState('monthly')
  const [trialDays, setTrialDays] = useState(14)
  const [trialReason, setTrialReason] = useState('')
  const [actionReason, setActionReason] = useState('')

  // Settle states
  const [paidTarget, setPaidTarget] = useState(null)
  const [paymentRef, setPaymentRef] = useState('')
  const [paymentNote, setPaymentNote] = useState('')

  const [failTarget, setFailTarget] = useState(null)
  const [failReason, setFailReason] = useState('')

  const status = String(subscription?.status || '').toLowerCase()
  const currentRank = PLAN_RANK[subscription?.plan_code] || 0
  const selectedRank = PLAN_RANK[planCode] || 0
  const cancelEffectiveAt = subscription?.cancellation_effective_at

  const openRows = (billing || []).filter((item) =>
    ['pending', 'failed'].includes(
      String(item.billing_status || '').toLowerCase()
    )
  )

  async function run(key, fn) {
    if (busy) return

    setBusy(key)
    setError('')

    try {
      await fn()
      onChanged?.()
    } catch (err) {
      setError(
        err?.response?.data?.error || err?.message || 'Action failed'
      )
    } finally {
      setBusy('')
    }
  }

  const post = (path, body) =>
    api.post(`${SUB_BASE}/${companyId}${path}`, body)

  const extendTrial = () =>
    run('trial-extend', async () => {
      await post('/trial/extend', {
        days: trialDays,
        reason: trialReason.trim() || 'Extended from control panel',
      })
      setTrialReason('')
    })

  const planAction = (action) =>
    run(`plan-${action}`, async () => {
      await post('/plan', {
        action,
        plan_code: planCode,
        billing_interval: billingInterval,
        reason: actionReason.trim() || undefined,
      })
      setActionReason('')
    })

  const undoCancellation = () =>
    run('undo-cancel', async () => {
      await post('/uncancel', {
        reason: actionReason.trim() || 'Cancellation reversed from control panel',
      })
      setActionReason('')
    })

  const settlePaid = (billingId) =>
    run(`paid-${billingId}`, async () => {
      await post(`/billing/${billingId}/confirm`, {
        payment_reference: paymentRef.trim() || null,
        note: paymentNote.trim() || null,
      })
      setPaidTarget(null)
      setPaymentRef('')
      setPaymentNote('')
    })

  const settleFailed = (billingId) =>
    run(`fail-${billingId}`, async () => {
      await post(`/billing/${billingId}/fail`, {
        reason: failReason.trim() || DEFAULT_FAIL_REASON,
      })
      setFailTarget(null)
      setFailReason('')
    })

  const downloadPdf = async (billingId, ref) => {
    try {
      await api.downloadBlob(
        `/subscriptions/${companyId}/billing/${billingId}/invoice-pdf`,
        `Invoice-${ref || billingId}.pdf`
      )
    } catch (err) {
      setError(err?.message || 'Failed to download invoice PDF')
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="
            bg-surface-800
            border border-error/30
            rounded-xl
            px-4 py-3
            text-sm
            text-error
          "
        >
          {error}
        </div>
      )}

      {/* Trial window */}
      {status === 'trialing' && (
        <SectionCard title="Trial window" icon={CalendarClock}>
          <div className="space-y-3">
            <div
              className="
                flex
                flex-col
                sm:flex-row
                sm:items-center
                gap-3
              "
            >
              <div className="flex items-center gap-2">
                {TRIAL_CHIPS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setTrialDays(days)}
                    className={`
                      px-3 py-1.5
                      rounded-lg
                      text-sm
                      border
                      transition-colors
                      ${
                        trialDays === days
                          ? 'border-accent text-accent bg-accent/10'
                          : 'border-surface-600 text-surface-300 hover:bg-surface-700'
                      }
                    `}
                  >
                    +{days}d
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={trialReason}
                onChange={(e) => setTrialReason(e.target.value)}
                placeholder="Reason / Note (e.g. Sales extension)"
                className="flex-1 bg-surface-900 border border-surface-600 rounded-lg px-3 py-1.5 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent"
              />

              <ActionButton
                busyKey="trial-extend"
                busy={busy}
                onClick={extendTrial}
                tone="primary"
              >
                Extend trial
              </ActionButton>
            </div>

            <div className="text-xs text-surface-400">
              Current trial ends: {subscription.trial_ends_at || '—'}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Plan changes & Lifecycle */}
      <SectionCard title="Plan changes & Lifecycle" icon={Layers}>
        <div className="space-y-4">
          <div
            className="
              flex
              flex-wrap
              items-center
              gap-3
            "
          >
            <div>
              <label className="block text-xs text-surface-400 mb-1">Target Plan</label>
              <select
                value={planCode}
                onChange={(event) => setPlanCode(event.target.value)}
                className="
                  bg-surface-900
                  border border-surface-600
                  rounded-lg
                  px-3 py-2
                  text-sm
                  text-surface-100
                "
              >
                {PLAN_OPTIONS.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-surface-400 mb-1">Billing Interval</label>
              <div className="inline-flex rounded-lg border border-surface-600 bg-surface-900 p-0.5">
                <button
                  type="button"
                  onClick={() => setBillingInterval('monthly')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    billingInterval === 'monthly'
                      ? 'bg-accent text-white'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingInterval('annual')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    billingInterval === 'annual'
                      ? 'bg-accent text-white'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  Annual (Yearly)
                </button>
              </div>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-surface-400 mb-1">Reason / Note (Audited)</label>
              <input
                type="text"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Reason for change..."
                className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {status === 'trialing' && (
              <ActionButton
                busyKey="plan-commit"
                busy={busy}
                onClick={() => planAction('commit')}
                tone="primary"
              >
                Commit plan now
              </ActionButton>
            )}

            {(status === 'active' || status === 'grace') && (
              <>
                <ActionButton
                  busyKey="plan-upgrade"
                  busy={busy}
                  onClick={() => planAction('upgrade')}
                  tone="primary"
                  disabled={selectedRank <= currentRank}
                >
                  <ArrowUpCircle size={15} />
                  Upgrade now (Prorated)
                </ActionButton>

                <ActionButton
                  busyKey="plan-downgrade"
                  busy={busy}
                  onClick={() => planAction('downgrade')}
                  tone="neutral"
                  disabled={selectedRank >= currentRank}
                >
                  <ArrowDownCircle size={15} />
                  Downgrade at period end
                </ActionButton>
              </>
            )}

            {/* Reactivate cancelled or expired */}
            {(status === 'cancelled' || status === 'expired') && (
              <ActionButton
                busyKey="plan-commit"
                busy={busy}
                onClick={() => planAction('commit')}
                tone="success"
              >
                <RotateCcw size={15} />
                Reactivate & Commit Plan
              </ActionButton>
            )}

            {/* Undo scheduled cancellation */}
            {cancelEffectiveAt && (
              <ActionButton
                busyKey="undo-cancel"
                busy={busy}
                onClick={undoCancellation}
                tone="success"
              >
                <RotateCcw size={15} />
                Undo Cancellation
              </ActionButton>
            )}

            {/* Cancel at period end */}
            {status !== 'cancelled' && (
              <ActionButton
                busyKey="plan-cancel"
                busy={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Cancel this subscription at the end of the current period?'
                    )
                  ) {
                    planAction('cancel')
                  }
                }}
                tone="danger"
              >
                <Ban size={15} />
                Cancel at period end
              </ActionButton>
            )}
          </div>

          {cancelEffectiveAt && status !== 'cancelled' && (
            <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg p-3">
              Cancellation is scheduled for {cancelEffectiveAt}. The company retains active access until then. Click &ldquo;Undo Cancellation&rdquo; to restore.
            </div>
          )}

          {status === 'cancelled' && (
            <div className="text-xs text-surface-400 bg-surface-900/60 border border-surface-600 rounded-lg p-3">
              Subscription is currently cancelled. Select a plan above and click &ldquo;Reactivate &amp; Commit Plan&rdquo; to immediately put the company back on a live subscription.
            </div>
          )}
        </div>
      </SectionCard>

      {/* Settlement queue */}
      <SectionCard title="Awaiting settlement" icon={Wallet}>
        {openRows.length === 0 ? (
          <div className="text-sm text-surface-400 py-1">
            Nothing awaiting settlement — all billing rows are settled.
          </div>
        ) : (
          <div className="space-y-4">
            {openRows.map((item) => {
              const isPaying = paidTarget === item.billing_id
              const isFailing = failTarget === item.billing_id

              return (
                <div
                  key={item.billing_id}
                  className="
                    bg-surface-900/50
                    border border-surface-600
                    rounded-lg
                    p-4
                  "
                >
                  <div
                    className="
                      flex
                      flex-col
                      sm:flex-row
                      sm:items-center
                      gap-3
                    "
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-surface-100">
                          {item.invoice_reference ||
                            item.billing_reference ||
                            `Billing #${item.billing_id}`}
                        </span>
                        <Pill value={item.billing_status} />
                      </div>

                      <div className="text-xs text-surface-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <span>{item.currency} {Number(item.amount).toLocaleString()}</span>
                        {item.due_at && <span>Due: {item.due_at.substring(0, 10)}</span>}
                        {item.failure_reason && (
                          <span className="text-error font-medium">Failed: {item.failure_reason}</span>
                        )}
                      </div>
                    </div>

                    <div
                      className="
                        flex
                        flex-wrap
                        items-center
                        gap-2
                        shrink-0
                      "
                    >
                      <button
                        type="button"
                        onClick={() => downloadPdf(item.billing_id, item.invoice_reference || item.billing_reference)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-surface-500 text-surface-300 hover:text-surface-100 hover:bg-surface-700 transition-colors"
                        title="Download PDF Invoice"
                      >
                        <Download size={13} />
                        Invoice PDF
                      </button>

                      <ActionButton
                        busyKey={`paid-${item.billing_id}`}
                        busy={busy}
                        onClick={() => {
                          if (isPaying) {
                            setPaidTarget(null)
                          } else {
                            setPaidTarget(item.billing_id)
                            setFailTarget(null)
                            setPaymentRef('')
                            setPaymentNote('')
                          }
                        }}
                        tone="success"
                      >
                        <CheckCircle2 size={15} />
                        Mark paid
                      </ActionButton>

                      <ActionButton
                        busyKey={`fail-${item.billing_id}`}
                        busy={busy}
                        onClick={() => {
                          if (isFailing) {
                            setFailTarget(null)
                          } else {
                            setFailTarget(item.billing_id)
                            setPaidTarget(null)
                            setFailReason('')
                          }
                        }}
                        tone="danger"
                      >
                        <XCircle size={15} />
                        Mark failed
                      </ActionButton>
                    </div>
                  </div>

                  {/* Inline Mark Paid Form */}
                  {isPaying && (
                    <div className="mt-3 p-3 bg-surface-950/60 rounded-lg border border-success/30 space-y-3">
                      <div className="text-xs font-medium text-success">
                        Confirm Payment Settlement
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={paymentRef}
                          onChange={(e) => setPaymentRef(e.target.value)}
                          placeholder="Payment reference (EFT / Bank / Mobile money ref)"
                          className="bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-success"
                        />
                        <input
                          type="text"
                          value={paymentNote}
                          onChange={(e) => setPaymentNote(e.target.value)}
                          placeholder="Settlement note / memo (optional)"
                          className="bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-success"
                        />
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setPaidTarget(null)}
                          className="px-3 py-1.5 rounded-lg text-xs text-surface-400 hover:text-surface-200"
                        >
                          Cancel
                        </button>
                        <ActionButton
                          busyKey={`paid-${item.billing_id}`}
                          busy={busy}
                          onClick={() => settlePaid(item.billing_id)}
                          tone="success"
                        >
                          Confirm Paid ({item.currency} {Number(item.amount).toLocaleString()})
                        </ActionButton>
                      </div>
                    </div>
                  )}

                  {/* Inline Mark Failed Form */}
                  {isFailing && (
                    <div className="mt-3 p-3 bg-surface-950/60 rounded-lg border border-error/30 space-y-3">
                      <div className="text-xs font-medium text-error">
                        Record Payment Failure
                      </div>
                      <input
                        type="text"
                        value={failReason}
                        onChange={(e) => setFailReason(e.target.value)}
                        placeholder="Failure reason (e.g. EFT bounced / Insufficient funds)"
                        className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-error"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setFailTarget(null)}
                          className="px-3 py-1.5 rounded-lg text-xs text-surface-400 hover:text-surface-200"
                        >
                          Cancel
                        </button>
                        <ActionButton
                          busyKey={`fail-${item.billing_id}`}
                          busy={busy}
                          onClick={() => settleFailed(item.billing_id)}
                          tone="danger"
                        >
                          Confirm Failure
                        </ActionButton>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
