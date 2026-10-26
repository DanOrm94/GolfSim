import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import type { Booking } from "@shared/types";
import { api, ApiRequestError } from "../api/client";
import { Alert, Spinner, StatusBadge } from "../components/ui";
import { formatDateLong, formatTimeRange, formatDateTime } from "../lib/format";
import { useTimezone } from "../lib/useTimezone";

export default function BookingDetailsPage() {
  const { id } = useParams();
  const tz = useTimezone();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ booking: Booking }>(`/api/bookings/${id}`);
      setBooking(res.booking);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Could not load booking.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async () => {
    if (!booking) return;
    if (!window.confirm("Cancel this booking? This frees the slot for others.")) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await api.post<{ booking: Booking }>(
        `/api/bookings/${booking.id}/cancel`
      );
      setBooking(res.booking);
      setNotice("Booking cancelled. The slot has been released.");
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Could not cancel booking.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <Spinner />;
  if (error && !booking) return <Alert kind="error">{error}</Alert>;
  if (!booking) return <Alert kind="error">Not found.</Alert>;

  const isUpcomingActive =
    booking.status === "active" && new Date(booking.startUtc).getTime() > Date.now();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <button className="text-sm text-fairway-600 hover:underline" onClick={() => navigate(-1)}>
        ← Back
      </button>

      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="card">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-fairway-900">
            Booking {booking.reference}
          </h1>
          <StatusBadge status={booking.status} />
        </div>

        <dl className="mt-6 space-y-3">
          <Row label="Date" value={formatDateLong(booking.startUtc, tz)} />
          <Row
            label="Time"
            value={`${formatTimeRange(booking.startUtc, booking.endUtc, tz)} (${tz})`}
          />
          <Row label="Booked" value={formatDateTime(booking.createdAt, tz)} />
          {booking.cancelledAt && (
            <Row label="Cancelled" value={formatDateTime(booking.cancelledAt, tz)} />
          )}
        </dl>

        {isUpcomingActive && (
          <div className="mt-6 flex justify-end">
            <button className="btn-danger" onClick={cancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel booking"}
            </button>
          </div>
        )}
      </div>

      <Link to="/bookings" className="text-sm text-fairway-600 hover:underline">
        All my bookings
      </Link>
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
