import { useEffect, useState } from 'react'
import {
  Activity,
  Play,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react'
import { api } from '../api/client'

export default function Automation() {
  const [jobs, setJobs] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setError('')

      const [jobData, runData] = await Promise.all([
        api.get('/automation'),
        api.get('/automation/runs?limit=30'),
      ])

      setJobs(jobData.jobs || [])
      setRuns(runData.runs || [])
    } catch (err) {
      setError(err?.message || 'Failed to load automation status.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()

    const timer = setInterval(load, 30000)

    return () => clearInterval(timer)
  }, [])

  const runAutomation = async () => {
    try {
      setRunning(true)
      setError('')

      await api.post('/automation/run', {})

      await load()
    } catch (err) {
      setError(err?.message || 'Automation run failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-100">
            Automation
          </h1>

          <p className="text-sm text-surface-300 mt-1">
            Ticket automation, SLA monitoring and escalation.
          </p>
        </div>

        <div className="flex gap-2">
          {/* Refresh */}
          <button
            onClick={load}
            disabled={loading}
            className="
              flex items-center gap-2
              px-3 py-2
              rounded-lg
              bg-surface-700
              border border-surface-600
              text-surface-200
              text-sm
              hover:bg-surface-600
              hover:text-surface-100
              disabled:opacity-50
              transition-colors
            "
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>

          {/* Run Automation */}
          <button
            onClick={runAutomation}
            disabled={running}
            className="
              flex items-center gap-2
              px-3 py-2
              rounded-lg
              bg-accent
              text-surface-900
              text-sm
              font-medium
              hover:bg-accent-hover
              disabled:opacity-50
              transition-colors
            "
          >
            <Play className="w-4 h-4" />
            {running ? 'Running...' : 'Run Automation'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="
          rounded-lg
          border border-error/30
          bg-error/10
          px-4 py-3
          text-sm text-error
        ">
          {error}
        </div>
      )}

      {/* Automation Jobs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="
              rounded-xl
              border border-surface-600
              bg-surface-800
              p-4
              transition-colors
              hover:border-surface-500
            "
          >
            <div className="flex items-center justify-between">
              <div className="
                flex items-center justify-center
                w-9 h-9
                rounded-lg
                bg-accent-muted
              ">
                <Activity className="w-5 h-5 text-accent" />
              </div>

              {job.is_active ? (
                <div className="
                  flex items-center gap-1.5
                  text-xs
                  text-success
                ">
                  <CheckCircle className="w-4 h-4" />
                  Active
                </div>
              ) : (
                <div className="
                  flex items-center gap-1.5
                  text-xs
                  text-warning
                ">
                  <AlertTriangle className="w-4 h-4" />
                  Inactive
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-surface-100">
                {job.name}
              </div>

              <div className="text-xs text-surface-300 mt-1 leading-relaxed">
                {job.description}
              </div>
            </div>

            <div className="
              mt-4
              pt-3
              border-t border-surface-600
              space-y-1
            ">
              <div className="text-xs text-surface-400">
                Every {job.interval_minutes} minutes
              </div>

              <div className="text-xs text-surface-400">
                Last run:{' '}
                <span className="text-surface-300">
                  {job.last_run_at
                    ? new Date(job.last_run_at).toLocaleString()
                    : 'Never'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Runs */}
      <div className="finsage-card-dark overflow-hidden">
        <div className="
          px-4 py-3
          border-b border-surface-600
          flex items-center justify-between
        ">
          <div>
            <h2 className="text-sm font-semibold text-surface-100">
              Recent Automation Runs
            </h2>

            <p className="text-xs text-surface-400 mt-1">
              Latest automation activity
            </p>
          </div>

          <Activity className="w-4 h-4 text-accent" />
        </div>

        {loading ? (
          <div className="p-6 text-sm text-surface-300">
            Loading automation runs...
          </div>
        ) : runs.length === 0 ? (
          <div className="p-6 text-sm text-surface-300">
            No automation runs yet.
          </div>
        ) : (
          <div className="divide-y divide-surface-600">
            {runs.map((run) => (
              <div
                key={run.id}
                className="
                  px-4 py-3
                  flex items-center justify-between
                  gap-4
                  hover:bg-surface-700/40
                  transition-colors
                "
              >
                <div className="min-w-0">
                  <div className="text-sm text-surface-100 truncate">
                    {run.job_name || run.job_code}
                  </div>

                  <div className="text-xs text-surface-400 mt-1">
                    {run.started_at
                      ? new Date(run.started_at).toLocaleString()
                      : '—'}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="
                    inline-flex
                    px-2 py-1
                    rounded-md
                    bg-surface-700
                    text-xs
                    text-surface-200
                    capitalize
                  ">
                    {run.status}
                  </div>

                  {run.duration_ms != null && (
                    <div className="text-xs text-surface-400 mt-1">
                      {run.duration_ms} ms
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}