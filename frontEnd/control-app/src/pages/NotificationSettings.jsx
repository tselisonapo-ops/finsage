import { useEffect, useState } from "react";
import {
  Bell,
  Mail,
  Save,
  Volume2,
  VolumeX,
} from "lucide-react"; // NEW: Volume2, VolumeX

import { api } from "../api/client";

// NEW — sound helpers
import {
  isMuted,
  toggleMuted,
  getVolume,
  setVolume,
  playAlert,
  playTicket,
} from "../lib/sound";

export default function NotificationSettings() {
  const [preferences, setPreferences] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // NEW — local UI state for sound prefs (persisted to localStorage,
  // not the server, because sound is a per-device preference).
  const [muted, setMuted] = useState(isMuted());
  const [volume, setVol] = useState(getVolume());

  async function load() {
    try {
      const data = await api.get("/notifications/preferences");
      setPreferences(data.preferences || null);
    } catch (err) {
      setMessage(err?.message || "Unable to load notification preferences.");
    }
  }

  async function save() {
    try {
      setSaving(true);
      setMessage("");

      const data = await api.put("/notifications/preferences", preferences);
      setPreferences(data.preferences);
      setMessage("Notification preferences saved.");
    } catch (err) {
      setMessage(err?.message || "Unable to save notification preferences.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(name) {
    setPreferences((current) => ({
      ...current,
      [name]: !current[name],
    }));
  }

  useEffect(() => {
    load();
  }, []);

  // NEW — listen for mute changes from other components.
  useEffect(() => {
    function onMute(e) { setMuted(!!e.detail.muted); }
    function onVolume(e) { setVol(e.detail.volume); }

    window.addEventListener("finsage:sound-mute-changed", onMute);
    window.addEventListener("finsage:sound-volume-changed", onVolume);

    return () => {
      window.removeEventListener("finsage:sound-mute-changed", onMute);
      window.removeEventListener("finsage:sound-volume-changed", onVolume);
    };
  }, []);

  function handleToggleMute() {
    toggleMuted();
    setMuted(isMuted());
  }

  function handleVolumeChange(e) {
    const v = parseFloat(e.target.value);
    setVol(v);
    setVolume(v);
  }

  function handleTestAlert() { playAlert(); }
  function handleTestTicket() { playTicket(); }

  if (!preferences) {
    return (
      <div className="w-full min-h-full p-5 lg:p-6">
        <div className="text-sm text-surface-300">
          Loading notification preferences...
        </div>
      </div>
    );
  }

  const alertCategories = [
    ["system_health_enabled", "System health", "Database, application and platform health alerts."],
    ["ticket_enabled", "Tickets", "Ticket creation, assignment and escalation alerts."],
    ["subscription_enabled", "Subscriptions", "Subscription and billing-related alerts."],
    ["security_enabled", "Security", "Security and account-related alerts."],
  ];

  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-surface-100">
          Notifications
        </h1>
        <p className="text-sm text-surface-300 mt-1">
          Configure Control alerts and notification delivery.
        </p>
      </div>

      {/* Status Message */}
      {message && (
        <div className="rounded-xl border border-surface-600 bg-surface-800 p-4 text-sm text-surface-200">
          {message}
        </div>
      )}

      {/* Delivery Settings */}
      <div className="rounded-xl border border-surface-600 bg-surface-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-600 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-muted text-accent flex items-center justify-center shrink-0">
            <Bell size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-surface-100">Delivery</h2>
            <p className="text-xs text-surface-400 mt-1">
              Choose how Control notifications are delivered.
            </p>
          </div>
        </div>

        <div className="divide-y divide-surface-600">
          {/* In-App Notifications */}
          <label className="flex items-center justify-between gap-4 p-5 cursor-pointer hover:bg-surface-700/40 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-surface-700 text-accent flex items-center justify-center shrink-0">
                <Bell size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-surface-100 font-medium">In-app notifications</div>
                <div className="text-xs text-surface-400 mt-1">
                  Show notifications in the Control application.
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={!!preferences.in_app_enabled}
              onChange={() => toggle("in_app_enabled")}
              className="h-4 w-4 shrink-0 accent-accent cursor-pointer"
            />
          </label>

          {/* Email Notifications */}
          <label className="flex items-center justify-between gap-4 p-5 cursor-pointer hover:bg-surface-700/40 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-surface-700 text-accent flex items-center justify-center shrink-0">
                <Mail size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-surface-100 font-medium">Email notifications</div>
                <div className="text-xs text-surface-400 mt-1">
                  Send supported alerts by email.
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={!!preferences.email_enabled}
              onChange={() => toggle("email_enabled")}
              className="h-4 w-4 shrink-0 accent-accent cursor-pointer"
            />
          </label>

          {/* NEW — Sound toggle */}
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-surface-700 text-accent flex items-center justify-center shrink-0">
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </div>
              <div className="min-w-0">
                <div className="text-surface-100 font-medium">
                  Device sound
                </div>
                <div className="text-xs text-surface-400 mt-1">
                  Play a sound on the device when a ticket is logged or
                  when a new system alert arrives.
                </div>
              </div>
            </div>

            <input
              type="checkbox"
              checked={!muted}
              onChange={handleToggleMute}
              className="h-4 w-4 shrink-0 accent-accent cursor-pointer"
            />
          </div>

          {/* NEW — Volume slider */}
          {!muted && (
            <div className="px-5 py-4 flex items-center gap-4 bg-surface-900/40">
              <span className="text-xs text-surface-300 w-20 shrink-0">
                Volume
              </span>

              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={volume}
                onChange={handleVolumeChange}
                className="flex-1 accent-accent"
              />

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleTestAlert}
                  className="px-2.5 py-1 rounded-md text-xs border border-surface-600 text-surface-200 hover:bg-surface-700 transition-colors"
                >
                  Test alert
                </button>

                <button
                  type="button"
                  onClick={handleTestTicket}
                  className="px-2.5 py-1 rounded-md text-xs border border-surface-600 text-surface-200 hover:bg-surface-700 transition-colors"
                >
                  Test ticket
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Alert Categories */}
      <div className="rounded-xl border border-surface-600 bg-surface-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-600">
          <h2 className="font-semibold text-surface-100">Alert categories</h2>
          <p className="text-xs text-surface-400 mt-1">
            Select which types of alerts you want to receive.
          </p>
        </div>

        <div className="divide-y divide-surface-600">
          {alertCategories.map(([key, title, description]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-4 p-5 cursor-pointer hover:bg-surface-700/40 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-surface-100 font-medium">{title}</div>
                <div className="text-xs text-surface-400 mt-1">
                  {description}
                </div>
              </div>

              <input
                type="checkbox"
                checked={!!preferences[key]}
                onChange={() => toggle(key)}
                className="h-4 w-4 shrink-0 accent-accent cursor-pointer"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-surface-900 font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}
