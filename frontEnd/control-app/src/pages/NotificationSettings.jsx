import { useEffect, useState } from "react";
import { Bell, Mail, Save } from "lucide-react";
import { api } from "../api/client";

export default function NotificationSettings() {
  const [preferences, setPreferences] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const data = await api.get(
        "/notifications/preferences"
      );

      setPreferences(
        data.preferences || null
      );
    } catch (err) {
      setMessage(
        err?.message ||
        "Unable to load notification preferences."
      );
    }
  }

  async function save() {
    try {
      setSaving(true);
      setMessage("");

      const data = await api.put(
        "/notifications/preferences",
        preferences
      );

      setPreferences(
        data.preferences
      );

      setMessage(
        "Notification preferences saved."
      );
    } catch (err) {
      setMessage(
        err?.message ||
        "Unable to save notification preferences."
      );
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

  if (!preferences) {
    return (
      <div className="p-6 text-slate-400">
        Loading notification preferences...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">
          Notifications
        </h1>

        <p className="text-sm text-slate-400 mt-1">
          Configure Control alerts and notification delivery.
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
          {message}
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-3">
          <Bell size={18} />

          <div>
            <h2 className="font-semibold text-white">
              Delivery
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              Choose how Control notifications are delivered.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-800">
          <label className="flex items-center justify-between p-5 cursor-pointer">
            <div className="flex items-center gap-3">
              <Bell size={18} />

              <div>
                <div className="text-white">
                  In-app notifications
                </div>

                <div className="text-xs text-slate-500">
                  Show notifications in the Control application.
                </div>
              </div>
            </div>

            <input
              type="checkbox"
              checked={!!preferences.in_app_enabled}
              onChange={() =>
                toggle("in_app_enabled")
              }
            />
          </label>

          <label className="flex items-center justify-between p-5 cursor-pointer">
            <div className="flex items-center gap-3">
              <Mail size={18} />

              <div>
                <div className="text-white">
                  Email notifications
                </div>

                <div className="text-xs text-slate-500">
                  Send supported alerts by email.
                </div>
              </div>
            </div>

            <input
              type="checkbox"
              checked={!!preferences.email_enabled}
              onChange={() =>
                toggle("email_enabled")
              }
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-white">
            Alert categories
          </h2>
        </div>

        <div className="divide-y divide-slate-800">
          {[
            [
              "system_health_enabled",
              "System health",
              "Database, application and platform health alerts.",
            ],
            [
              "ticket_enabled",
              "Tickets",
              "Ticket creation, assignment and escalation alerts.",
            ],
            [
              "subscription_enabled",
              "Subscriptions",
              "Subscription and billing-related alerts.",
            ],
            [
              "security_enabled",
              "Security",
              "Security and account-related alerts.",
            ],
          ].map(
            ([key, title, description]) => (
              <label
                key={key}
                className="flex items-center justify-between p-5 cursor-pointer"
              >
                <div>
                  <div className="text-white">
                    {title}
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    {description}
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={!!preferences[key]}
                  onChange={() => toggle(key)}
                />
              </label>
            )
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
      >
        <Save size={16} />

        {saving
          ? "Saving..."
          : "Save Preferences"}
      </button>
    </div>
  );
}