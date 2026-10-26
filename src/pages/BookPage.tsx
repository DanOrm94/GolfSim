import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Booking, Slot } from "@shared/types";
import { api, ApiRequestError } from "../api/client";
import { Alert, PageHeader, Spinner } from "../components/ui";
import { formatDateLong, todayInTz, addDays } from "../lib/format";
import { cacheTimezone } from "../lib/useTimezone";

interface AvailabilityResponse {
  date: string;
  timezone: string;
  slots: Slot[];
}

const reasonLabel: Record<NonNullable<Slot["reason"]>, string> = {
  booked: "Booked",
  past: "Passed",
  "too-soon": "Too soon",
  "too-far": "Not open yet",
  closed: "Closed",
};

export default function BookPage() {
  // Default timezone until availability returns the real facility tz.
  const [timezone, setTimezone] = useState("Europe/London");
  const [date, setDate] = useState<string>(() => todayInTz("Europe/London"));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const res = await api.get<AvailabilityResponse>(
        `/api/availability?date=${encodeURIComponent(d)}`
      );
      setSlots(res.slots);
      setTimezone(res.timezone);
      cacheTimezone(res.timezone);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Could not load availability.");
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const confirm = async () => {
    if (!selected) return;
    setBooking(true);
    setError(null);
    try {
      const res = await api.post<{ booking: Booking }>("/api/bookings", {
        startUtc: selected.startUtc,
      });
      navigate(`/book/confirmation/${res.booking.id}`);
    } catch (e) {
      // If the slot was taken while choosing, refresh and tell the user.
      if (e instanceof ApiRequestError && e.status === 409) {
        setError(e.message);
        await load(date);
      } else {
        setError(e instanceof ApiRequestError ? e.message : "Could not create booking.");
      }
    } finally {
      setBooking(false);
    }
  };

  const today = todayInTz(timezone);

  return (
    <div>
      <PageHeader
        title="Book the simulator"
        subtitle={`All times shown in the facility timezone (${timezone}).`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          className="btn-secondary"
          onClick={() => setDate((d) => addDays(d, -1))}
          disabled={date <= today}
          aria-label="Previous day"
        >
          ← Prev
        </button>
        <label className="sr-only" htmlFor="date">
          Date
        </label>
        <input
          id="date"
          type="date"
          className="input max-w-[12rem]"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value || today)}
        />
        <button
          className="btn-secondary"
          onClick={() => setDate((d) => addDays(d, 1))}
          aria-label="Next day"
        >
          Next →
        </button>
        <button className="btn-secondary" onClick={() => setDate(today)}>
          Today
        </button>
        <button className="btn-secondary" onClick={() => void load(date)}>
          Refresh
        </button>
      </div>

      <p className="mb-4 text-lg font-semibold text-fairway-900">
        {date ? formatDateLong(`${date}T12:00:00Z`, timezone) : ""}
      </p>

      {error && (
        <div className="mb-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="py-10">
          <Spinner label="Loading availability…" />
        </div>
      ) : (
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
          role="group"
          aria-label="Hourly slots"
        >
          {slots.map((slot) => {
            const isSelected = selected?.startUtc === slot.startUtc;
            return (
              <button
                key={slot.startUtc}
                type="button"
                disabled={!slot.available}
                aria-pressed={isSelected}
                onClick={() => setSelected(slot)}
                className={[
                  "flex flex-col items-center rounded-xl border px-3 py-3 text-sm font-semibold transition",
                  !slot.available
                    ? "cursor-not-allowed border-fairway-100 bg-fairway-50 text-fairway-300"
                    : isSelected
                      ? "border-fairway-600 bg-fairway-600 text-white"
                      : "border-fairway-200 bg-white text-fairway-800 hover:border-fairway-400 hover:bg-fairway-50",
                ].join(" ")}
              >
                <span className="text-base">{slot.localTime}</span>
                <span className="mt-0.5 text-[11px] font-medium opacity-80">
                  {slot.available
                    ? "Available"
                    : reasonLabel[slot.reason ?? "booked"]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Confirmation bar */}
      {selected && (
        <div className="mt-8 card flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-fairway-600">Selected slot</p>
            <p className="text-lg font-bold text-fairway-900">
              {formatDateLong(selected.startUtc, timezone)} · {selected.localTime}
              –{addOneHourLabel(selected.localTime)}
            </p>
            <p className="text-sm text-fairway-600">One hour · single simulator</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setSelected(null)}>
              Clear
            </button>
            <button className="btn-primary" onClick={confirm} disabled={booking}>
              {booking ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function addOneHourLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const nh = (h + 1) % 24;
  return `${nh.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
