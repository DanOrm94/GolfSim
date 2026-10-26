import { useCallback, useEffect, useState } from "react";
import type { Booking } from "@shared/types";
import { api, ApiRequestError } from "../../api/client";
import { Alert, EmptyState, PageHeader, Spinner, StatusBadge } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useTimezone } from "../../lib/useTimezone";
import AdminNav from "./AdminNav";

export default function AdminBookingsPage() {
  const tz = useTimezone();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to).toISOString());
      const res = await api.get<{ bookings: Booking[] }>(
        `/api/admin/bookings${params.toString() ? `?${params}` : ""}`
      );
      setBookings(res.bookings);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, [q, status, from, to]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = async (b: Booking) => {
    if (!window.confirm(`Cancel booking ${b.reference} for ${b.username}?`)) return;
    setBusyId(b.id);
    setError(null);
    try {
      const res = await api.post<{ booking: Booking }>(
        `/api/admin/bookings/${b.id}/cancel`
      );
      setBookings((prev) => prev.map((x) => (x.id === b.id ? res.booking : x)));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Could not cancel.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Bookings" subtitle={`Times shown in ${tz}.`} />
      <AdminNav />

      <form
        className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input
          className="input"
          placeholder="Username or reference"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search"
        />
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status filter"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          className="input"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From date"
        />
        <input
          className="input"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="To date"
        />
        <button className="btn-secondary">Apply filters</button>
      </form>

      {error && <Alert kind="error">{error}</Alert>}
      {loading ? (
        <Spinner />
      ) : bookings.length === 0 ? (
        <EmptyState title="No bookings match your filters" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-fairway-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-fairway-50 text-fairway-700">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-fairway-100">
                  <td className="px-4 py-3 text-fairway-900">
                    {formatDateTime(b.startUtc, tz)}
                  </td>
                  <td className="px-4 py-3">{b.username}</td>
                  <td className="px-4 py-3 text-xs text-fairway-600">{b.reference}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.status === "active" && (
                      <button
                        className="text-red-600 hover:underline disabled:opacity-50"
                        disabled={busyId === b.id}
                        onClick={() => cancel(b)}
                      >
                        {busyId === b.id ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
