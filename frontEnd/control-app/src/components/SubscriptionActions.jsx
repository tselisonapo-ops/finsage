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
} from 'lucide-react'

import { api } from '../api/client'

// The control subscriptions blueprint is registered at
// /api/control/subscriptions. CustomerSubscription.jsx reaches the
// customers blueprint with a bare '/customers/...' path, so this api
// client's baseURL already includes /api/control. If any call here
// 404s, THIS constant is the first thing to check.
const SUB_BASE = '/subscriptions'

// Company-tier plan codes (matches plans_seed.py). Free is intentionally
// absent — leaving a paid plan goes through "Cancel at period end".
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
  const [trialDays, setTrialDays] = useState(14)
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
    if (busy) {
      return
    }

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
        reason: 'Extended from control panel',
      })
    })

  const planAction = (action) =>
    run(`plan-${action}`, async () => {
      await post('/plan', { action, plan_code: planCode })
    })

  const settlePaid = (billingId) =>
    run(`paid-${billingId}`, async () => {
      await post(`/billing/${billingId}/confirm`, {})
    })

  const settleFailed = (billingId) =>
    run(`fail-${billingId}`, async () => {
      await post(`/billing/${billingId}/fail`, {
        reason: failReason.trim() || DEFAULT_FAIL_REASON,
      })
      setFailTarget(null)
      setFailReason('')
    })

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

            <ActionButton
              busyKey="trial-extend"
              busy={busy}
              onClick={extendTrial}
              tone="primary"
            >
              Extend trial
            </ActionButton>

            <div className="text-xs text-surface-400 sm:ml-auto">
              Trial ends {subscription.trial_ends_at || '—'}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Plan changes */}
      <SectionCard title="Plan changes" icon={Layers}>
        <div
          className="
            flex
            flex-col
            sm:flex-row
            sm:items-center
            gap-3
          "
        >
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

          {status === 'trialing' && (
            <ActionButton
              busyKey="plan-commit"
              busy={busy}
              onClick={() => planAction('commit')}
              tone="primary"
            >
              Commit plan
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
                Upgrade now
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
              Cancel
            </ActionButton>
          )}
        </div>

        {cancelEffectiveAt && status !== 'cancelled' && (
          <div className="text-xs text-surface-400 mt-3">
            Cancellation scheduled — runs until {cancelEffectiveAt},
            then the daily job moves the company to free.
          </div>
        )}

        {status === 'cancelled' && (
          <div className="text-xs text-surface-400 mt-3">
            Subscription cancelled. Reactivation is not exposed yet —
            use a fresh commit once the customer is ready.
          </div>
        )}
      </SectionCard>

      {/* Settlement queue */}
      <SectionCard title="Awaiting settlement" icon={Wallet}>
        {openRows.length === 0 ? (
          <div className="text-sm text-surface-400 py-1">
            Nothing awaiting settlement — no pending or failed billing
            rows.
          </div>
        ) : (
          <div className="space-y-3">
            {openRows.map((item) => {
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
                    <div className="min-w-0">
                      <div
                        className="
                          font-medium
                          text-surface-100
                          truncate
                        "
                      >
                        {item.invoice_reference ||
                          item.billing_reference ||
                          `Billing #${item.billing_id}`}
                      </div>

                      <div className="text-xs text-surface-400 mt-1">
                        {item.currency} {item.amount}
                        {item.due_at ? ` · due ${item.due_at}` : ''}
                      </div>
                    </div>

                    <Pill value={item.billing_status} />

                    <div
                      className="
                        flex
                        items-center
                        gap-2
                        sm:ml-auto
                      "
                    >
                      <ActionButton
                        busyKey={`paid-${item.billing_id}`}
                        busy={busy}
                        onClick={() => settlePaid(item.billing_id)}
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

                  {isFailing && (
                    <div
                      className="
                        flex
                        flex-col
                        sm:flex-row
                        sm:items-center
                        gap-2
                        mt-3
                      "
                    >
                      <input
                        type="text"
                        value={failReason}
                        onChange={(event) =>
                          setFailReason(event.target.value)
                        }
                        placeholder={DEFAULT_FAIL_REASON}
                        className="
                          flex-1
                          bg-surface-900
                          border border-surface-600
                          rounded-lg
                          px-3 py-2
                          text-sm
                          text-surface-100
                          placeholder:text-surface-500
                        "
                      />

                      <ActionButton
                        busyKey={`fail-${item.billing_id}`}
                        busy={busy}
                        onClick={() => settleFailed(item.billing_id)}
                        tone="danger"
                      >
                        Confirm failure
                      </ActionButton>
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
