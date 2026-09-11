import { useEffect, useState } from "react";
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { api } from "../api/client";

function statusIcon(status) {
  if (status === "healthy") return <CheckCircle size={20} />;
  if (status === "warning") return <AlertTriangle size={20} />;
  if (status === "failed") return <XCircle size={20} />;
  return <Activity size={20} />;
}

function statusLabel(status) {
  if (status === "healthy") return "Healthy";
  if (status === "warning") return "Warning";
  if (status === "failed") return "Failed";
  if (status === "not_run") return "Not Run";
  return status || "Unknown";
}

function formatDate(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function loadHealth() {
    try {
      setError("");
      const data = await api.get("/system/health");
      setHealth(data);
    } catch (err) {
      setError(
        err?.message ||
        "Unable to load system health."
      );
    } finally {
      setLoading(false);
    }
  }

  async function runChecks() {
    try {
      setRunning(true);
      setError("");

      await api.post("/system/health/run", {});

      await loadHealth();
    } catch (err) {
      setError(
        err?.message ||
        "Unable to run system health checks."
      );
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    loadHealth();

    const timer = setInterval(
      loadHealth,
      30000
    );

    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-slate-400">
        Loading system health...
      </div>
    );
  }

  const summary = health?.summary || {};
  const checks = health?.checks || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            System Health
          </h1>

          <p className="text-sm text-slate-400 mt-1">
            Monitor the health of the FinSage platform.
          </p>
        </div>

        <button
          type="button"
          onClick={runChecks}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={running ? "animate-spin" : ""}
          />

          {running ? "Running..." : "Run Checks"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">
            Overall
          </div>

          <div className="mt-2 text-lg font-semibold">
            {statusLabel(
              health?.overall_status
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">
            Total Checks
          </div>

          <div className="mt-2 text-lg font-semibold">
            {summary.total || 0}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">
            Healthy
          </div>

          <div className="mt-2 text-lg font-semibold text-emerald-400">
            {summary.healthy || 0}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">
            Warnings
          </div>

          <div className="mt-2 text-lg font-semibold text-amber-400">
            {summary.warning || 0}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">
            Failed
          </div>

          <div className="mt-2 text-lg font-semibold text-red-400">
            {summary.failed || 0}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-white">
            Health Checks
          </h2>
        </div>

        <div className="divide-y divide-slate-800">
          {checks.map((check) => (
            <div
              key={check.check_id}
              className="p-5 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="text-slate-300">
                  {statusIcon(
                    check.status || "not_run"
                  )}
                </div>

                <div className="min-w-0">
                  <div className="font-medium text-white">
                    {check.name}
                  </div>

                  <div className="text-sm text-slate-400 mt-1">
                    {check.description}
                  </div>

                  <div className="text-xs text-slate-500 mt-2">
                    Every {check.interval_minutes} minutes
                    {" · "}
                    Last run:{" "}
                    {formatDate(check.started_at)}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-medium">
                  {statusLabel(
                    check.status || "not_run"
                  )}
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  {check.duration_ms != null
                    ? `${check.duration_ms} ms`
                    : "Not run"}
                </div>
              </div>
            </div>
          ))}

          {!checks.length && (
            <div className="p-6 text-center text-slate-400">
              No active health checks configured.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}