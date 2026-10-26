import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Booking } from "@shared/types";
import { api, ApiRequestError } from "../api/client";
import { Alert, Spinner } from "../components/ui";
import { formatDateLong, formatTimeRange } from "../lib/format";
import { useTimezone } from "../lib/useTimezone";

export default function ConfirmationPage() {
  const { id } = useParams();
  const tz = useTimezone();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ booking: Booking }>(`/api/bookings/${id}`);
        setBooking(res.booking);
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : "Could not load booking.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <Spinner />;
  if (error || !booking) return <Alert kind="error">{error ?? "Not found."}</Alert>;

  return (
    <div className="mx-auto max-w-lg">
      <div className="card text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fairway-100 text-2xl">
          ✓
        </div>
        <h1 className="text-2xl font-extrabold text-fairway-900">Booking confirmed</h1>
        <p className="mt-2 text-fairway-600">Your slot on the simulator is reserved.</p>

        <dl className="mt-6 space-y-3 text-left">
          <Row label="Reference" value={booking.reference} />
          <Row label="Date" value={formatDateLong(booking.startUtc, tz)} />
          <Row
            label="Time"
            value={`${formatTimeRange(booking.startUtc, booking.endUtc, tz)} (${tz})`}
          />
        </dl>

        <div className="mt-8 flex justify-center gap-2">
          <Link to="/bookings" className="btn-primary">
            View my bookings
          </Link>
          <Link to="/book" className="btn-secondary">
            Book another
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-fairway-100 pb-2">
      <dt className="text-sm text-fairway-600">{label}</dt>
      <dd className="font-semibold text-fairway-900">{value}</dd>
    </div>
  );
}
