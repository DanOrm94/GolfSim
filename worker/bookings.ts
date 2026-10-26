// Booking domain logic: availability computation and atomic, overlap-safe creation.
import type { Env } from "./env";
import type { BookingSettings, Slot } from "@shared/types";
import { BOOKING_DURATION_MINUTES } from "@shared/types";
import {
  addHours,
  hourlySlotStartsForLocalDay,
  localDateString,
  localTimeString,
  intervalsOverlap,
} from "@shared/timezone";
import { randomToken } from "./crypto";
import { toBooking, type BookingRow } from "./db";
import { Errors } from "./http";

const HOUR_MS = 60 * 60 * 1000;

export function bookingReference(): string {
  // GS- + 6 unambiguous chars.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = randomToken(8);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[raw.charCodeAt(i) % alphabet.length];
  }
  return `GS-${out}`;
}

/** Is a given slot start within a configured closure period? */
function inClosure(startMs: number, endMs: number, settings: BookingSettings): boolean {
  for (const c of settings.closures) {
    const cs = new Date(c.startUtc).getTime();
    const ce = new Date(c.endUtc).getTime();
    if (Number.isNaN(cs) || Number.isNaN(ce)) continue;
    if (intervalsOverlap(startMs, endMs, cs, ce)) return true;
  }
  return false;
}

/**
 * Compute the 24 hourly slots for a local calendar day, flagging availability.
 * Availability reflects: existing active bookings, past times, min/max advance
 * window and closures. This is advisory for the UI; creation re-validates on the server.
 */
export async function getAvailabilityForDate(
  env: Env,
  localDate: string,
  settings: BookingSettings,
  now = new Date()
): Promise<Slot[]> {
  const tz = settings.facilityTimezone;
  const starts = hourlySlotStartsForLocalDay(localDate, tz);
  if (starts.length === 0) return [];

  const dayStartMs = starts[0].getTime();
  const dayEndMs = addHours(starts[starts.length - 1], 1).getTime();

  // Fetch active bookings that could intersect this day in one query.
  const rows = await env.DB.prepare(
    `SELECT start_utc, end_utc FROM bookings
       WHERE status = 'active' AND start_utc < ? AND end_utc > ?`
  )
    .bind(new Date(dayEndMs).toISOString(), new Date(dayStartMs).toISOString())
    .all<{ start_utc: string; end_utc: string }>();

  const booked = (rows.results ?? []).map((r) => ({
    s: new Date(r.start_utc).getTime(),
    e: new Date(r.end_utc).getTime(),
  }));

  const minBookableMs = now.getTime() + settings.minAdvanceMinutes * 60 * 1000;
  const maxBookableMs = now.getTime() + settings.maxAdvanceDays * 24 * HOUR_MS;

  return starts.map((start) => {
    const startMs = start.getTime();
    const end = addHours(start, 1);
    const endMs = end.getTime();

    let available = true;
    let reason: Slot["reason"];

    if (startMs < minBookableMs) {
      available = false;
      reason = startMs < now.getTime() ? "past" : "too-soon";
    } else if (startMs > maxBookableMs) {
      available = false;
      reason = "too-far";
    } else if (inClosure(startMs, endMs, settings)) {
      available = false;
      reason = "closed";
    } else if (booked.some((b) => intervalsOverlap(startMs, endMs, b.s, b.e))) {
      available = false;
      reason = "booked";
    }

    return {
      startUtc: start.toISOString(),
      endUtc: end.toISOString(),
      localDate: localDateString(start, tz),
      localTime: localTimeString(start, tz),
      available,
      reason,
    };
  });
}

/**
 * Validate a requested start instant against policy (not availability). Throws on
 * invalid input. Returns the canonical start/end ISO strings.
 */
export function validateBookingWindow(
  startIso: string,
  settings: BookingSettings,
  now = new Date()
): { startUtc: string; endUtc: string } {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    throw Errors.badRequest("Invalid start time.");
  }
  // Must be exactly on the hour in UTC (all slots are hour-aligned).
  if (
    start.getUTCMinutes() !== 0 ||
    start.getUTCSeconds() !== 0 ||
    start.getUTCMilliseconds() !== 0
  ) {
    throw Errors.badRequest("Bookings must start on the hour.");
  }
  const end = new Date(start.getTime() + BOOKING_DURATION_MINUTES * 60 * 1000);

  const minBookableMs = now.getTime() + settings.minAdvanceMinutes * 60 * 1000;
  const maxBookableMs = now.getTime() + settings.maxAdvanceDays * 24 * HOUR_MS;

  if (start.getTime() < now.getTime()) {
    throw Errors.badRequest("You cannot book a time in the past.");
  }
  if (start.getTime() < minBookableMs) {
    throw Errors.badRequest("That slot is too soon to book.");
  }
  if (start.getTime() > maxBookableMs) {
    throw Errors.badRequest("That slot is too far in the future to book.");
  }
  if (inClosure(start.getTime(), end.getTime(), settings)) {
    throw Errors.conflict("The facility is closed during that period.");
  }

  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

/**
 * Atomically create a booking if and only if no active booking overlaps the
 * requested interval.
 *
 * Concurrency / overlap safety (two independent layers):
 *  1. Conditional INSERT ... SELECT ... WHERE NOT EXISTS(<overlap query>): the
 *     overlap test and the insert are a SINGLE statement, which D1 runs inside an
 *     implicit transaction. Two concurrent requests cannot both pass the NOT EXISTS
 *     guard and insert.
 *  2. Partial UNIQUE index on (start_utc) WHERE status='active': a hard DB constraint
 *     that rejects a second active booking for the same hour even in a race, surfacing
 *     as a constraint error we translate to 409.
 *
 * Returns the created booking, or throws 409 if the slot was taken.
 */
export async function createBookingAtomic(
  env: Env,
  userId: number,
  startUtc: string,
  endUtc: string
): Promise<ReturnType<typeof toBooking>> {
  const reference = bookingReference();

  let result;
  try {
    result = await env.DB.prepare(
      `INSERT INTO bookings (reference, user_id, start_utc, end_utc, status)
       SELECT ?1, ?2, ?3, ?4, 'active'
       WHERE NOT EXISTS (
         SELECT 1 FROM bookings
          WHERE status = 'active'
            AND start_utc < ?4
            AND end_utc > ?3
       )`
    )
      .bind(reference, userId, startUtc, endUtc)
      .run();
  } catch (e) {
    // Unique-index violation from a concurrent insert for the same hour.
    const msg = String((e as Error)?.message ?? "");
    if (/UNIQUE|constraint/i.test(msg)) {
      throw Errors.conflict("That slot has just been taken. Please choose another.");
    }
    throw e;
  }

  // meta.changes === 0 means the NOT EXISTS guard blocked the insert: slot taken.
  if (!result.meta || result.meta.changes === 0) {
    throw Errors.conflict("That slot has just been taken. Please choose another.");
  }

  const row = await env.DB.prepare(
    "SELECT * FROM bookings WHERE reference = ?"
  )
    .bind(reference)
    .first<BookingRow>();
  if (!row) throw Errors.conflict("Could not confirm the booking. Please try again.");
  return toBooking(row);
}

/** Can a booking be cancelled now, given the cutoff? */
export function cancellationAllowed(
  startUtc: string,
  settings: BookingSettings,
  now = new Date()
): boolean {
  const cutoffMs =
    new Date(startUtc).getTime() - settings.cancellationCutoffMinutes * 60 * 1000;
  return now.getTime() <= cutoffMs;
}
