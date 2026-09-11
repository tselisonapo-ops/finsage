import { useEffect, useState } from 'react'
import { Activity, Play, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-100">
            Automation
          </h1>

          <p className="text-sm text-surface-300 mt-1">
            Ticket automation, SLA monitoring and escalation.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-700 text-surface-100 text-sm hover:bg-surface-600"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>

          <button
            onClick={runAutomation}
            disabled={running}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-white text-sm hover:opacity-90 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {running ? 'Running...' : 'Run Automation'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {jobs.map(job => (
          <div
            key={job.id}
            className="rounded-xl border border-surface-600 bg-surface-800 p-4"
          >
            <div className="flex items-center justify-between">
              <Activity className="w-5 h-5 text-accent" />

              {job.is_active ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
              )}
            </div>

            <div className="mt-3">
              <div className="text-sm font-medium text-surface-100">
                {job.name}
              </div>

              <div className="text-xs text-surface-300 mt-1">
                {job.description}
              </div>
            </div>

            <div className="text-xs text-surface-400 mt-4">
              Every {job.interval_minutes} minutes
            </div>

            <div className="text-xs text-surface-400 mt-1">
              Last run:{' '}
              {job.last_run_at
                ? new Date(job.last_run_at).toLocaleString()
                : 'Never'}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-surface-600 bg-surface-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-600">
          <h2 className="text-sm font-semibold text-surface-100">
            Recent Automation Runs
          </h2>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-surface-300">
            Loading...
          </div>
        ) : runs.length === 0 ? (
          <div className="p-6 text-sm text-surface-300">
            No automation runs yet.
          </div>
        ) : (
          <div className="divide-y divide-surface-600">
            {runs.map(run => (
              <div
                key={run.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm text-surface-100">
                    {run.job_name || run.job_code}
                  </div>

                  <div className="text-xs text-surface-400 mt-1">
                    {run.started_at
                      ? new Date(run.started_at).toLocaleString()
                      : '—'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-surface-200 capitalize">
                    {run.status}
                  </div>

                  {run.duration_ms != null && (
                    <div className="text-xs text-surface-400">
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