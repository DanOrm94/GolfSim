import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Booking } from "@shared/types";
import { api, ApiRequestError } from "../api/client";
import { Alert, EmptyState, PageHeader, Spinner, StatusBadge } from "../components/ui";
import { formatDateLong, formatTimeRange } from "../lib/format";
import { useTimezone } from "../lib/useTimezone";

type Tab = "upcoming" | "past" | "cancelled";

export default function MyBookingsPage() {
  const tz = useTimezone();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("upcoming");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ bookings: Booking[] }>("/api/bookings");
      setBookings(res.bookings);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      const start = new Date(b.startUtc).getTime();
      if (tab === "cancelled") return b.status === "cancelled";
      if (tab === "upcoming") return b.status === "active" && start >= now;
      return b.status === "active" && start < now; // past (completed)
    });
  }, [bookings, tab, now]);

  return (
    <div>
      <PageHeader
        title="My bookings"
        subtitle={`Times shown in ${tz}.`}
        actions={
          <Link to="/book" className="btn-primary">
            New booking
          </Link>
        }
      />

      <div className="mb-6 flex gap-1 rounded-xl bg-fairway-100 p-1">
        {(["upcoming", "past", "cancelled"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition",
              tab === t ? "bg-white text-fairway-900 shadow-sm" : "text-fairway-600",
            ].join(" ")}
            aria-pressed={tab === t}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={`No ${tab} bookings`}
          description={tab === "upcoming" ? "Book a slot to get started." : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((b) => (
            <li key={b.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-fairway-900">
                    {formatDateLong(b.startUtc, tz)}
                  </span>
                  <StatusBadge status={b.status} />
                </div>
                <p className="text-sm text-fairway-600">
                  {formatTimeRange(b.startUtc, b.endUtc, tz)} · Ref {b.reference}
                </p>
              </div>
              <Link to={`/bookings/${b.id}`} className="btn-secondary">
                Details
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
