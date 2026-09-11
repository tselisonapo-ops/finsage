import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  RotateCcw,
  AlertTriangle,
  Clock,
  Server,
  User,
  Building2
} from 'lucide-react';

import { api } from '../api/client';
import StatusBadge from "../components/StatusBadge";
import PriorityBadge from "../components/PriorityBadge";

import {
  formatDateTime,
  timeAgo
} from '../utils/formatters';

export default function SystemErrorDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [error, setError] = useState(null);
  const [occurrences, setOccurrences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadError = async () => {
    try {
      setLoading(true);

      const [errorResponse, occurrenceResponse] = await Promise.all([
        api.get(`/system/errors/${eventId}`),
        api.get(`/system/errors/${eventId}/occurrences?limit=100`)
      ]);

      setError(errorResponse.error || null);
      setOccurrences(occurrenceResponse.occurrences || []);
    } catch (err) {
      setMessage(err.message || 'Unable to load system error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadError();
  }, [eventId]);

  const handleResolve = async () => {
    try {
      setActionLoading(true);
      setMessage('');

      const response = await api.patch(
        `/system/errors/${eventId}/resolve`
      );

      setError(response.error || null);
      setMessage('System error resolved.');
    } catch (err) {
      setMessage(err.message || 'Unable to resolve system error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async () => {
    try {
      setActionLoading(true);
      setMessage('');

      const response = await api.patch(
        `/system/errors/${eventId}/reopen`
      );

      setError(response.error || null);
      setMessage('System error reopened.');
    } catch (err) {
      setMessage(err.message || 'Unable to reopen system error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-slate-500">
          Loading system error...
        </div>
      </div>
    );
  }

  if (!error) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="text-red-600" />
            <span className="font-semibold text-red-800">
              System error not found
            </span>
          </div>

          {message && (
            <div className="mt-3 text-sm text-red-700">
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  const latest = error.latest_occurrence || {};

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <div className="flex items-center gap-2">
          {error.status === 'open' ? (
            <button
              type="button"
              onClick={handleResolve}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle size={16} />
              {actionLoading ? 'Working...' : 'Resolve'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReopen}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <RotateCcw size={16} />
              {actionLoading ? 'Working...' : 'Reopen'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <AlertTriangle
                size={22}
                className="text-red-500"
              />

              <h1 className="text-xl font-semibold text-slate-900">
                System Error #{error.id}
              </h1>
            </div>

            <div className="mt-2 text-sm text-slate-500">
              {error.event_code}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <PriorityBadge priority={error.severity} />
            <StatusBadge status={error.status} />
          </div>
        </div>

        <div className="mt-6 rounded-lg bg-slate-50 p-4">
          <div className="text-sm font-medium text-slate-700">
            Error message
          </div>

          <div className="mt-2 text-sm text-slate-900">
            {error.message || 'No message recorded.'}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Server size={18} className="text-slate-500" />
            <h2 className="font-semibold text-slate-900">
              Error Information
            </h2>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <div className="text-slate-500">Exception type</div>
              <div className="font-medium text-slate-900">
                {error.exception_type || '—'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">Source</div>
              <div className="font-medium text-slate-900">
                {error.source || '—'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">Product</div>
              <div className="font-medium text-slate-900">
                {error.product || '—'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">Module</div>
              <div className="font-medium text-slate-900">
                {error.module_code || '—'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">Occurrences</div>
              <div className="font-medium text-slate-900">
                {error.occurrence_count || 0}
              </div>
            </div>

            <div>
              <div className="text-slate-500">Last seen</div>
              <div className="font-medium text-slate-900">
                {error.last_seen_at
                  ? `${timeAgo(error.last_seen_at)} · ${formatDateTime(error.last_seen_at)}`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Clock size={18} className="text-slate-500" />
            <h2 className="font-semibold text-slate-900">
              Latest Occurrence
            </h2>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <div className="text-slate-500">Request</div>
              <div className="font-medium text-slate-900">
                {latest.http_method || '—'} {latest.request_path || '—'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">HTTP status</div>
              <div className="font-medium text-slate-900">
                {latest.http_status || '—'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">Occurred</div>
              <div className="font-medium text-slate-900">
                {latest.occurred_at
                  ? formatDateTime(latest.occurred_at)
                  : '—'}
              </div>
            </div>

            <div>
              <div className="text-slate-500">Error message</div>
              <div className="font-medium text-slate-900">
                {latest.error_message || '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {(error.company_id || error.company_name || error.user_id || error.user_email) && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">
            Context
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {(error.company_id || error.company_name) && (
              <div className="flex items-start gap-3">
                <Building2 size={18} className="mt-0.5 text-slate-400" />
                <div>
                  <div className="text-xs text-slate-500">
                    Company
                  </div>
                  <div className="text-sm font-medium text-slate-900">
                    {error.company_name || `Company #${error.company_id}`}
                  </div>
                </div>
              </div>
            )}

            {(error.user_id || error.user_email) && (
              <div className="flex items-start gap-3">
                <User size={18} className="mt-0.5 text-slate-400" />
                <div>
                  <div className="text-xs text-slate-500">
                    User
                  </div>
                  <div className="text-sm font-medium text-slate-900">
                    {error.user_email || `User #${error.user_id}`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-900">
          Occurrence History
        </h2>

        {occurrences.length === 0 ? (
          <div className="text-sm text-slate-500">
            No occurrence history available.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Time</th>
                  <th className="px-3 py-3">Request</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Message</th>
                </tr>
              </thead>

              <tbody>
                {occurrences.map((occurrence) => (
                  <tr
                    key={occurrence.id}
                    className="border-b border-slate-100"
                  >
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatDateTime(occurrence.occurred_at)}
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">
                        {occurrence.http_method || '—'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {occurrence.request_path || '—'}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      {occurrence.http_status || '—'}
                    </td>

                    <td className="px-3 py-3 text-slate-700">
                      {occurrence.error_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-900">
          Stack Trace
        </h2>

        <pre className="max-h-[500px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
          {error.stack_trace || 'No stack trace recorded.'}
        </pre>
      </div>
    </div>
  );
}