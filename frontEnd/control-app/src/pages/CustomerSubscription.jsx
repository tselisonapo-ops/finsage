import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CreditCard,
  CalendarDays,
  Receipt,
  Activity,
} from 'lucide-react'

import { api } from '../api/client'
import { formatDateTime } from '../utils/formatters'

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
  ].includes(normalized)

  const negative = [
    'failed',
    'overdue',
    'suspended',
    'cancelled',
    'expired',
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
      {value}
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

export default function CustomerSubscription() {
  const { companyId } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
  }, [companyId])

  if (loading) {
    return (
      <div className="
        w-full
        min-h-full
        p-5 lg:p-6
      ">
        <div className="
          finsage-card-dark
          p-8
          text-center
          text-sm
          text-surface-400
        ">
          Loading subscription...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="
        w-full
        min-h-full
        p-5 lg:p-6
        space-y-6
      ">
        <button
          type="button"
          onClick={() =>
            navigate(`/customers/${companyId}`)
          }
          className="
            flex
            items-center
            gap-2
            text-sm
            text-surface-400
            hover:text-surface-100
            transition-colors
          "
        >
          <ArrowLeft size={16} />
          Back to company
        </button>

        <div className="
          bg-surface-800
          border border-error/30
          rounded-xl
          p-8
        ">
          <div className="
            w-10 h-10
            rounded-lg
            bg-error/10
            flex
            items-center
            justify-center
            mb-4
          ">
            <Activity
              size={20}
              className="text-error"
            />
          </div>

          <h1 className="
            font-semibold
            text-surface-100
            mb-2
          ">
            Subscription unavailable
          </h1>

          <p className="
            text-sm
            text-surface-400
          ">
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
    <div className="
      w-full
      min-h-full
      p-5 lg:p-6
      space-y-6
    ">

      {/* Back */}
      <button
        type="button"
        onClick={() =>
          navigate(`/customers/${companyId}`)
        }
        className="
          flex
          items-center
          gap-2
          text-sm
          text-surface-400
          hover:text-surface-100
          transition-colors
        "
      >
        <ArrowLeft size={16} />
        Back to company
      </button>

      {/* Header */}
      <div className="
        bg-surface-800
        border border-surface-600
        rounded-xl
        p-5 lg:p-6
      ">
        <div className="
          flex
          flex-col
          sm:flex-row
          sm:items-center
          gap-4
        ">
          <div className="
            w-11 h-11
            rounded-xl
            bg-accent-muted
            border border-accent/20
            flex
            items-center
            justify-center
            shrink-0
          ">
            <CreditCard
              size={22}
              className="text-accent"
            />
          </div>

          <div>
            <div className="
              text-xs
              font-medium
              uppercase
              tracking-wide
              text-accent
            ">
              Subscription
            </div>

            <h1 className="
              text-xl
              font-semibold
              text-surface-100
              mt-1
            ">
              {company?.company_name}
            </h1>

            <div className="
              text-sm
              text-surface-400
              mt-1
            ">
              Company #{company?.company_id}
            </div>
          </div>
        </div>
      </div>

      {/* No Subscription */}
      {!subscription ? (
        <div className="
          bg-surface-800
          border border-surface-600
          rounded-xl
          p-8
        ">
          <div className="
            w-10 h-10
            rounded-lg
            bg-surface-700
            flex
            items-center
            justify-center
            mb-4
          ">
            <CreditCard
              size={19}
              className="text-surface-300"
            />
          </div>

          <h2 className="
            font-semibold
            text-surface-100
          ">
            No subscription recorded
          </h2>

          <p className="
            text-sm
            text-surface-400
            mt-2
          ">
            This company does not currently have a
            subscription record.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="
            grid
            grid-cols-1
            sm:grid-cols-2
            xl:grid-cols-4
            gap-4
          ">
            <Card
              title="Plan"
              icon={CreditCard}
            >
              <div className="
                text-xl
                font-semibold
                text-surface-100
              ">
                {valueOrDash(
                  subscription.plan_name
                )}
              </div>

              <div className="
                text-xs
                text-surface-400
                mt-1
              ">
                {valueOrDash(
                  subscription.plan_code
                )}
              </div>
            </Card>

            <Card
              title="Status"
              icon={Activity}
            >
              <StatusBadge
                value={subscription.status}
              />
            </Card>

            <Card
              title="Billing"
              icon={Receipt}
            >
              <StatusBadge
                value={
                  subscription.billing_status
                }
              />
            </Card>

            <Card
              title="Next billing"
              icon={CalendarDays}
            >
              <div className="
                text-sm
                text-surface-200
              ">
                {formatDateTime(
                  subscription.next_billing_at
                )}
              </div>
            </Card>
          </div>

          {/* Subscription Details */}
          <Card
            title="Subscription details"
            icon={CreditCard}
          >
            <InfoRow
              label="Plan"
              value={subscription.plan_name}
            />

            <InfoRow
              label="Plan code"
              value={subscription.plan_code}
            />

            <InfoRow
              label="Subscription status"
              value={subscription.status}
            />

            <InfoRow
              label="Billing status"
              value={
                subscription.billing_status
              }
            />

            <InfoRow
              label="Billing interval"
              value={
                subscription.billing_interval
              }
            />

            <InfoRow
              label="Amount"
              value={
                subscription.amount !== null
                  ? `${subscription.currency} ${subscription.amount}`
                  : null
              }
            />

            <InfoRow
              label="Started"
              value={formatDateTime(
                subscription.started_at
              )}
            />

            <InfoRow
              label="Trial ends"
              value={formatDateTime(
                subscription.trial_ends_at
              )}
            />

            <InfoRow
              label="Current period"
              value={
                subscription.current_period_start &&
                subscription.current_period_end
                  ? `${formatDateTime(
                      subscription.current_period_start
                    )} → ${formatDateTime(
                      subscription.current_period_end
                    )}`
                  : null
              }
            />

            <InfoRow
              label="Next billing"
              value={formatDateTime(
                subscription.next_billing_at
              )}
            />

            <InfoRow
              label="Cancelled"
              value={formatDateTime(
                subscription.cancelled_at
              )}
            />

            <InfoRow
              label="Cancellation effective"
              value={formatDateTime(
                subscription.cancellation_effective_at
              )}
            />

            <InfoRow
              label="Payment provider"
              value={
                subscription.payment_provider
              }
            />
          </Card>
        </>
      )}

      {/* Billing History */}
      <Card
        title="Billing history"
        icon={Receipt}
      >
        {billing.length === 0 ? (
          <div className="
            text-sm
            text-surface-400
            py-2
          ">
            No billing records available.
          </div>
        ) : (
          <div className="space-y-3">
            {billing.map((item) => (
              <div
                key={item.billing_id}
                className="
                  bg-surface-900/50
                  border border-surface-600
                  rounded-lg
                  p-4
                  hover:border-surface-500
                  transition-colors
                "
              >
                <div className="
                  flex
                  flex-col
                  sm:flex-row
                  sm:items-start
                  sm:justify-between
                  gap-3
                ">
                  <div>
                    <div className="
                      font-medium
                      text-surface-100
                    ">
                      {valueOrDash(
                        item.invoice_reference ||
                        item.billing_reference
                      )}
                    </div>

                    <div className="
                      text-xs
                      text-surface-400
                      mt-1
                    ">
                      {formatDateTime(
                        item.created_at
                      )}
                    </div>
                  </div>

                  <StatusBadge
                    value={item.billing_status}
                  />
                </div>

                <div className="
                  grid
                  grid-cols-2
                  md:grid-cols-4
                  gap-4
                  mt-4
                ">
                  <div>
                    <div className="
                      text-xs
                      text-surface-400
                    ">
                      Amount
                    </div>

                    <div className="
                      text-sm
                      text-surface-200
                      mt-1
                    ">
                      {item.currency} {item.amount}
                    </div>
                  </div>

                  <div>
                    <div className="
                      text-xs
                      text-surface-400
                    ">
                      Due
                    </div>

                    <div className="
                      text-sm
                      text-surface-200
                      mt-1
                    ">
                      {formatDateTime(item.due_at)}
                    </div>
                  </div>

                  <div>
                    <div className="
                      text-xs
                      text-surface-400
                    ">
                      Paid
                    </div>

                    <div className="
                      text-sm
                      text-surface-200
                      mt-1
                    ">
                      {formatDateTime(item.paid_at)}
                    </div>
                  </div>

                  <div>
                    <div className="
                      text-xs
                      text-surface-400
                    ">
                      Failed
                    </div>

                    <div className="
                      text-sm
                      text-surface-200
                      mt-1
                    ">
                      {formatDateTime(
                        item.failed_at
                      )}
                    </div>
                  </div>
                </div>

                {item.failure_reason && (
                  <div className="
                    mt-3
                    rounded-lg
                    border border-error/20
                    bg-error/10
                    px-3 py-2
                    text-sm
                    text-error
                  ">
                    {item.failure_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Subscription History */}
      <Card
        title="Subscription history"
        icon={Activity}
      >
        {events.length === 0 ? (
          <div className="
            text-sm
            text-surface-400
            py-2
          ">
            No subscription events recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.event_id}
                className="
                  bg-surface-900/50
                  border border-surface-600
                  rounded-lg
                  p-4
                  hover:border-surface-500
                  transition-colors
                "
              >
                <div className="
                  flex
                  flex-col
                  sm:flex-row
                  sm:items-start
                  sm:justify-between
                  gap-3
                ">
                  <div>
                    <div className="
                      font-medium
                      text-surface-100
                    ">
                      {valueOrDash(
                        event.event_type
                      )}
                    </div>

                    {event.description && (
                      <div className="
                        text-sm
                        text-surface-400
                        mt-1
                      ">
                        {event.description}
                      </div>
                    )}
                  </div>

                  <div className="
                    text-xs
                    text-surface-400
                    shrink-0
                  ">
                    {formatDateTime(
                      event.occurred_at
                    )}
                  </div>
                </div>

                {event.event_status && (
                  <div className="mt-3">
                    <StatusBadge
                      value={event.event_status}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}