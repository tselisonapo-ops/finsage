import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CreditCard,
  CalendarDays,
  Receipt,
  Activity,
} from 'lucide-react';

import { api } from '../api/client';
import { formatDateTime } from '../utils/formatters';

function valueOrDash(value) {
  return value === null || value === undefined || value === ''
    ? '—'
    : value;
}

function StatusBadge({ value }) {
  if (!value) {
    return <span className="text-slate-500">—</span>;
  }

  const positive = [
    'active',
    'paid',
    'trialing',
  ].includes(String(value).toLowerCase());

  const negative = [
    'failed',
    'overdue',
    'suspended',
    'cancelled',
    'expired',
  ].includes(String(value).toLowerCase());

  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-full text-xs ${
        positive
          ? 'bg-emerald-500/10 text-emerald-400'
          : negative
            ? 'bg-red-500/10 text-red-400'
            : 'bg-slate-800 text-slate-400'
      }`}
    >
      {value}
    </span>
  );
}

function Card({ title, icon: Icon, children }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} />
        <h2 className="font-semibold">{title}</h2>
      </div>

      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-800 last:border-b-0">
      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span className="text-sm text-slate-200 text-right">
        {valueOrDash(value)}
      </span>
    </div>
  );
}

export default function CustomerSubscription() {
  const { companyId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const result = await api.get(
          `/customers/${companyId}/subscription`
        );

        if (mounted) {
          setData(result);
        }
      } catch (err) {
        console.error(
          'Failed to load subscription:',
          err
        );

        if (mounted) {
          setError(
            err?.response?.data?.error ||
            err?.message ||
            'Unable to load subscription'
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [companyId]);

  if (loading) {
    return (
      <div className="p-6 text-slate-400">
        Loading subscription...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() =>
            navigate(`/customers/${companyId}`)
          }
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-6"
        >
          <ArrowLeft size={16} />
          Back to company
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <h1 className="font-semibold mb-2">
            Subscription unavailable
          </h1>

          <p className="text-sm text-slate-400">
            {error}
          </p>
        </div>
      </div>
    );
  }

  const company = data?.company;
  const subscription = data?.subscription;
  const billing = data?.billing || [];
  const events = data?.events || [];

  return (
    <div className="p-6 space-y-6">
      <button
        type="button"
        onClick={() =>
          navigate(`/customers/${companyId}`)
        }
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft size={16} />
        Back to company
      </button>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="text-sm text-slate-500">
          Subscription
        </div>

        <h1 className="text-xl font-semibold mt-1">
          {company?.company_name}
        </h1>

        <div className="text-sm text-slate-500 mt-1">
          Company #{company?.company_id}
        </div>
      </div>

      {!subscription ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <h2 className="font-semibold">
            No subscription recorded
          </h2>

          <p className="text-sm text-slate-500 mt-2">
            This company does not currently have a
            subscription record.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card title="Plan" icon={CreditCard}>
              <div className="text-xl font-semibold">
                {subscription.plan_name}
              </div>

              <div className="text-xs text-slate-500 mt-1">
                {subscription.plan_code}
              </div>
            </Card>

            <Card title="Status" icon={Activity}>
              <StatusBadge
                value={subscription.status}
              />
            </Card>

            <Card title="Billing" icon={Receipt}>
              <StatusBadge
                value={subscription.billing_status}
              />
            </Card>

            <Card title="Next billing" icon={CalendarDays}>
              <div className="text-sm">
                {formatDateTime(
                  subscription.next_billing_at
                )}
              </div>
            </Card>
          </div>

          <Card title="Subscription details" icon={CreditCard}>
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
              value={subscription.billing_status}
            />

            <InfoRow
              label="Billing interval"
              value={subscription.billing_interval}
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
                  ? `${formatDateTime(subscription.current_period_start)} → ${formatDateTime(subscription.current_period_end)}`
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
              value={subscription.payment_provider}
            />
          </Card>
        </>
      )}

      <Card title="Billing history" icon={Receipt}>
        {billing.length === 0 ? (
          <div className="text-sm text-slate-500">
            No billing records available.
          </div>
        ) : (
          <div className="space-y-3">
            {billing.map((item) => (
              <div
                key={item.billing_id}
                className="border border-slate-800 rounded-lg p-4"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {valueOrDash(
                        item.invoice_reference ||
                        item.billing_reference
                      )}
                    </div>

                    <div className="text-xs text-slate-500 mt-1">
                      {formatDateTime(
                        item.created_at
                      )}
                    </div>
                  </div>

                  <StatusBadge
                    value={item.billing_status}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">
                      Amount
                    </div>
                    <div>
                      {item.currency} {item.amount}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Due
                    </div>
                    <div>
                      {formatDateTime(item.due_at)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Paid
                    </div>
                    <div>
                      {formatDateTime(item.paid_at)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Failed
                    </div>
                    <div>
                      {formatDateTime(item.failed_at)}
                    </div>
                  </div>
                </div>

                {item.failure_reason && (
                  <div className="text-sm text-red-400 mt-3">
                    {item.failure_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Subscription history" icon={Activity}>
        {events.length === 0 ? (
          <div className="text-sm text-slate-500">
            No subscription events recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.event_id}
                className="border border-slate-800 rounded-lg p-4"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {event.event_type}
                    </div>

                    {event.description && (
                      <div className="text-sm text-slate-400 mt-1">
                        {event.description}
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-slate-500">
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
  );
}