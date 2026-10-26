import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Booking } from "@shared/types";
import { api, ApiRequestError } from "../../api/client";
import { Alert, EmptyState, PageHeader, Spinner, StatusBadge } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useTimezone } from "../../lib/useTimezone";
import AdminNav from "./AdminNav";

interface Overview {
  upcoming: Booking[];
  recent: Booking[];
  recentCancellations: Booking[];
  stats: { activeUsers: number; upcomingBookings: number };
}

export default function AdminOverviewPage() {
  const tz = useTimezone();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setData(await api.get<Overview>("/api/admin/overview"));
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : "Could not load overview.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <PageHeader title="Admin dashboard" subtitle={`Facility timezone: ${tz}`} />
      <AdminNav />

      {error && <Alert kind="error">{error}</Alert>}
      {loading ? (
        <Spinner />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Active accounts" value={data.stats.activeUsers} />
            <Stat label="Upcoming bookings" value={data.stats.upcomingBookings} />
          </div>

          <BookingList
            title="Next up"
            tz={tz}
            bookings={data.upcoming}
            empty="No upcoming bookings."
          />
          <BookingList
            title="Recently created"
            tz={tz}
            bookings={data.recent}
            empty="No bookings yet."
          />
          <BookingList
            title="Recent cancellations"
            tz={tz}
            bookings={data.recentCancellations}
            empty="No cancellations."
          />
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-sm text-fairway-600">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-fairway-900">{value}</p>
    </div>
  );
}

function BookingList({
  title,
  bookings,
  tz,
  empty,
}: {
  title: string;
  bookings: Booking[];
  tz: string;
  empty: string;
}) {
  return (
    <section>
      <h2 className="mb-2 font-bold text-fairway-900">{title}</h2>
      {bookings.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ul className="space-y-2">
          {bookings.map((b) => (
            <li key={b.id} className="card flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <span className="font-semibold text-fairway-900">{b.username}</span>
                <span className="ml-2 text-sm text-fairway-600">
                  {formatDateTime(b.startUtc, tz)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-fairway-500">{b.reference}</span>
                <StatusBadge status={b.status} />
                <Link to="/admin/bookings" className="text-sm text-fairway-700 hover:underline">
                  Manage
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
