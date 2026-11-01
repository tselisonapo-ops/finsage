import { useEffect, useState } from 'react'
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from 'lucide-react'

import { api } from '../api/client'

function statusIcon(status) {
  if (status === 'healthy') {
    return <CheckCircle size={20} />
  }

  if (status === 'warning') {
    return <AlertTriangle size={20} />
  }

  if (status === 'failed') {
    return <XCircle size={20} />
  }

  return <Activity size={20} />
}

function statusLabel(status) {
  if (status === 'healthy') return 'Healthy'
  if (status === 'warning') return 'Warning'
  if (status === 'failed') return 'Failed'
  if (status === 'not_run') return 'Not Run'

  return status || 'Unknown'
}

function formatDate(value) {
  if (!value) return 'Never'

  return new Date(value).toLocaleString()
}

function statusClasses(status) {
  if (status === 'healthy') {
    return {
      icon: 'text-success',
      iconBg: 'bg-success/10',
      text: 'text-success',
      badge: 'bg-success/10 text-success border-success/20',
    }
  }

  if (status === 'warning') {
    return {
      icon: 'text-warning',
      iconBg: 'bg-warning/10',
      text: 'text-warning',
      badge: 'bg-warning/10 text-warning border-warning/20',
    }
  }

  if (status === 'failed') {
    return {
      icon: 'text-error',
      iconBg: 'bg-error/10',
      text: 'text-error',
      badge: 'bg-error/10 text-error border-error/20',
    }
  }

  return {
    icon: 'text-info',
    iconBg: 'bg-info/10',
    text: 'text-surface-300',
    badge: 'bg-surface-700 text-surface-300 border-surface-500',
  }
}

function SummaryCard({ label, value, status }) {
  const classes = status
    ? statusClasses(status)
    : {
        icon: 'text-accent',
        iconBg: 'bg-accent-muted',
        text: 'text-surface-100',
        badge: '',
      }

  return (
    <div className="
      rounded-xl
      border border-surface-600
      bg-surface-800
      p-4
      lg:p-5
    ">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wide text-surface-400">
          {label}
        </div>

        {status && (
          <div
            className={`
              w-7
              h-7
              rounded-lg
              flex
              items-center
              justify-center
              ${classes.iconBg}
              ${classes.icon}
            `}
          >
            {statusIcon(status)}
          </div>
        )}
      </div>

      <div
        className={`
          mt-3
          text-xl
          font-semibold
          ${classes.text}
        `}
      >
        {value}
      </div>
    </div>
  )
}

export default function SystemHealth() {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  async function loadHealth() {
    try {
      setError('')

      const data = await api.get('/system/health')
      setHealth(data)
    } catch (err) {
      setError(
        err?.message ||
          'Unable to load system health.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function runChecks() {
    try {
      setRunning(true)
      setError('')

      await api.post('/system/health/run', {})

      await loadHealth()
    } catch (err) {
      setError(
        err?.message ||
          'Unable to run system health checks.'
      )
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    loadHealth()

    const timer = setInterval(
      loadHealth,
      30000
    )

    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <div className="
        w-full
        min-h-full
        p-5
        lg:p-6
      ">
        <div className="
          rounded-xl
          border border-surface-600
          bg-surface-800
          p-8
          text-center
          text-sm
          text-surface-400
        ">
          Loading system health...
        </div>
      </div>
    )
  }

  const summary = health?.summary || {}
  const checks = health?.checks || []
  const overallStatus =
    health?.overall_status || 'not_run'

  const overallClasses =
    statusClasses(overallStatus)

  return (
    <div className="
      w-full
      min-h-full
      p-5
      lg:p-6
      space-y-6
    ">
      <div className="
        flex
        flex-col
        sm:flex-row
        sm:items-center
        sm:justify-between
        gap-4
      ">
        <div>
          <h1 className="
            text-2xl
            font-semibold
            text-surface-100
          ">
            System Health
          </h1>

          <p className="
            text-sm
            text-surface-300
            mt-1
          ">
            Monitor the health of the FinSage platform.
          </p>
        </div>

        <button
          type="button"
          onClick={runChecks}
          disabled={running}
          className="
            inline-flex
            items-center
            justify-center
            gap-2
            px-4
            py-2
            rounded-lg
            bg-accent
            hover:bg-accent-hover
            text-surface-900
            text-sm
            font-medium
            transition-colors
            disabled:opacity-50
            disabled:cursor-not-allowed
            shrink-0
          "
        >
          <RefreshCw
            size={16}
            className={
              running ? 'animate-spin' : ''
            }
          />

          {running
            ? 'Running...'
            : 'Run Checks'}
        </button>
      </div>

      {error && (
        <div className="
          rounded-xl
          border border-error/30
          bg-error/10
          px-4
          py-3
          text-sm
          text-error
        ">
          {error}
        </div>
      )}

      <div className="
        grid
        grid-cols-1
        sm:grid-cols-2
        lg:grid-cols-3
        xl:grid-cols-5
        gap-4
      ">
        <SummaryCard
          label="Overall"
          value={statusLabel(overallStatus)}
          status={overallStatus}
        />

        <SummaryCard
          label="Total Checks"
          value={summary.total || 0}
        />

        <SummaryCard
          label="Healthy"
          value={summary.healthy || 0}
          status="healthy"
        />

        <SummaryCard
          label="Warnings"
          value={summary.warning || 0}
          status="warning"
        />

        <SummaryCard
          label="Failed"
          value={summary.failed || 0}
          status="failed"
        />
      </div>

      <div className="
        rounded-xl
        border border-surface-600
        bg-surface-800
        overflow-hidden
      ">
        <div className="
          px-5
          py-4
          lg:px-6
          border-b border-surface-600
          flex
          flex-col
          sm:flex-row
          sm:items-center
          sm:justify-between
          gap-2
        ">
          <div>
            <h2 className="
              font-semibold
              text-surface-100
            ">
              Health Checks
            </h2>

            <p className="
              text-xs
              text-surface-400
              mt-1
            ">
              Automated checks run against core platform services.
            </p>
          </div>

          <div className="
            text-xs
            text-surface-400
            whitespace-nowrap
          ">
            Auto-refreshes every 30 seconds
          </div>
        </div>

        <div className="divide-y divide-surface-600">
          {checks.map((check) => {
            const status =
              check.status || 'not_run'

            const classes =
              statusClasses(status)

            return (
              <div
                key={check.check_id}
                className="
                  p-5
                  lg:p-6
                  flex
                  flex-col
                  md:flex-row
                  md:items-center
                  md:justify-between
                  gap-5
                  hover:bg-surface-700/40
                  transition-colors
                "
              >
                <div className="
                  flex
                  items-start
                  gap-4
                  min-w-0
                ">
                  <div
                    className={`
                      w-10
                      h-10
                      rounded-lg
                      flex
                      items-center
                      justify-center
                      shrink-0
                      ${classes.iconBg}
                      ${classes.icon}
                    `}
                  >
                    {statusIcon(status)}
                  </div>

                  <div className="min-w-0">
                    <div className="
                      font-medium
                      text-surface-100
                      break-words
                    ">
                      {check.name}
                    </div>

                    <div className="
                      text-sm
                      text-surface-300
                      mt-1
                      break-words
                    ">
                      {check.description}
                    </div>

                    <div className="
                      text-xs
                      text-surface-400
                      mt-2
                      flex
                      flex-wrap
                      gap-x-2
                      gap-y-1
                    ">
                      <span>
                        Every {check.interval_minutes} minutes
                      </span>

                      <span className="text-surface-500">
                        ·
                      </span>

                      <span>
                        Last run: {formatDate(check.started_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="
                  flex
                  items-center
                  justify-between
                  md:flex-col
                  md:items-end
                  md:justify-center
                  gap-2
                  shrink-0
                ">
                  <span
                    className={`
                      inline-flex
                      items-center
                      rounded-md
                      border
                      px-2.5
                      py-1
                      text-xs
                      font-medium
                      ${classes.badge}
                    `}
                  >
                    {statusLabel(status)}
                  </span>

                  <div className="
                    text-xs
                    text-surface-400
                  ">
                    {check.duration_ms != null
                      ? `${check.duration_ms} ms`
                      : 'Not run'}
                  </div>
                </div>
              </div>
            )
          })}

          {!checks.length && (
            <div className="
              p-8
              lg:p-10
              text-center
            ">
              <div className="
                mx-auto
                w-10
                h-10
                rounded-lg
                bg-surface-700
                text-surface-400
                flex
                items-center
                justify-center
              ">
                <Activity size={20} />
              </div>

              <div className="
                mt-3
                text-sm
                font-medium
                text-surface-200
              ">
                No active health checks
              </div>

              <div className="
                mt-1
                text-xs
                text-surface-400
              ">
                No active health checks are currently configured.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="
        rounded-xl
        border border-surface-600
        bg-surface-800
        px-5
        py-4
        lg:px-6
      ">
        <div className="
          flex
          flex-col
          sm:flex-row
          sm:items-center
          sm:justify-between
          gap-2
        ">
          <div>
            <div className="
              text-sm
              font-medium
              text-surface-200
            ">
              Platform status
            </div>

            <div className="
              text-xs
              text-surface-400
              mt-1
            ">
              Current overall health is{' '}
              <span className={overallClasses.text}>
                {statusLabel(overallStatus).toLowerCase()}
              </span>
              .
            </div>
          </div>

          <div className="
            text-xs
            text-surface-400
          ">
            Last refreshed automatically
          </div>
        </div>
      </div>
    </div>
  )
}