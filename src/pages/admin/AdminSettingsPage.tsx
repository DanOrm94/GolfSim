import { useEffect, useState } from "react";
import type { BookingSettings, ClosurePeriod } from "@shared/types";
import { api, ApiRequestError } from "../../api/client";
import { Alert, PageHeader, Spinner } from "../../components/ui";
import { cacheTimezone } from "../../lib/useTimezone";
import AdminNav from "./AdminNav";

// A small, practical set of common IANA zones plus whatever the server returns.
const COMMON_ZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ settings: BookingSettings }>("/api/admin/settings");
        setSettings(res.settings);
        cacheTimezone(res.settings.facilityTimezone);
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : "Could not load settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.put<{ settings: BookingSettings }>("/api/admin/settings", {
        facilityTimezone: settings.facilityTimezone,
        minAdvanceMinutes: settings.minAdvanceMinutes,
        maxAdvanceDays: settings.maxAdvanceDays,
        cancellationCutoffMinutes: settings.cancellationCutoffMinutes,
        closures: settings.closures,
      });
      setSettings(res.settings);
      cacheTimezone(res.settings.facilityTimezone);
      setNotice("Settings saved.");
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  const addClosure = () => {
    if (!settings) return;
    const start = new Date();
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const closure: ClosurePeriod = {
      id: crypto.randomUUID(),
      startUtc: start.toISOString(),
      endUtc: end.toISOString(),
      reason: "Maintenance",
    };
    update("closures", [...settings.closures, closure]);
  };

  const removeClosure = (id: string) =>
    settings && update("closures", settings.closures.filter((c) => c.id !== id));

  const updateClosure = (id: string, patch: Partial<ClosurePeriod>) =>
    settings &&
    update(
      "closures",
      settings.closures.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );

  if (loading) return <Spinner />;
  if (!settings) return <Alert kind="error">{error ?? "No settings."}</Alert>;

  const zones = Array.from(new Set([settings.facilityTimezone, ...COMMON_ZONES]));

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="The simulator is available 24/7 by default. These policies govern booking windows and closures."
      />
      <AdminNav />

      <form className="max-w-2xl space-y-4" onSubmit={save}>
        {error && <Alert kind="error">{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}

        <div className="card space-y-4">
          <div>
            <label className="label" htmlFor="tz">
              Facility timezone
            </label>
            <select
              id="tz"
              className="input"
              value={settings.facilityTimezone}
              onChange={(e) => update("facilityTimezone", e.target.value)}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-fairway-500">
              All booking times are displayed in this timezone. DST is handled
              automatically.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="min">
                Min advance (minutes)
              </label>
              <input
                id="min"
                type="number"
                min={0}
                className="input"
                value={settings.minAdvanceMinutes}
                onChange={(e) => update("minAdvanceMinutes", Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label" htmlFor="max">
                Max advance (days)
              </label>
              <input
                id="max"
                type="number"
                min={1}
                max={365}
                className="input"
                value={settings.maxAdvanceDays}
                onChange={(e) => update("maxAdvanceDays", Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label" htmlFor="cutoff">
                Cancel cutoff (minutes)
              </label>
              <input
                id="cutoff"
                type="number"
                min={0}
                className="input"
                value={settings.cancellationCutoffMinutes}
                onChange={(e) =>
                  update("cancellationCutoffMinutes", Number(e.target.value))
                }
              />
            </div>
          </div>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-fairway-900">Closures / maintenance</h2>
            <button type="button" className="btn-secondary" onClick={addClosure}>
              Add closure
            </button>
          </div>
          <p className="text-xs text-fairway-500">
            Times are entered in your browser&apos;s local time and stored as UTC. Slots
            overlapping a closure cannot be booked.
          </p>
          {settings.closures.length === 0 ? (
            <p className="text-sm text-fairway-600">No closures configured.</p>
          ) : (
            <ul className="space-y-3">
              {settings.closures.map((c) => (
                <li key={c.id} className="grid gap-2 rounded-lg bg-fairway-50 p-3 sm:grid-cols-4">
                  <label className="text-xs">
                    Start
                    <input
                      type="datetime-local"
                      className="input mt-1"
                      value={toLocalInput(c.startUtc)}
                      onChange={(e) =>
                        updateClosure(c.id, {
                          startUtc: new Date(e.target.value).toISOString(),
                        })
                      }
                    />
                  </label>
                  <label className="text-xs">
                    End
                    <input
                      type="datetime-local"
                      className="input mt-1"
                      value={toLocalInput(c.endUtc)}
                      onChange={(e) =>
                        updateClosure(c.id, {
                          endUtc: new Date(e.target.value).toISOString(),
                        })
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Reason
                    <input
                      className="input mt-1"
                      value={c.reason}
                      onChange={(e) => updateClosure(c.id, { reason: e.target.value })}
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => removeClosure(c.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="font-bold text-fairway-900">Registration policy</h2>
          <p className="mt-1 text-sm text-fairway-600">
            Accounts are administrator-managed. There is no public self-registration,
            and this cannot be enabled from here by design.
          </p>
        </div>

        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}

// Convert a stored UTC ISO string to the value a datetime-local input expects,
// expressed in the browser's local time.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
