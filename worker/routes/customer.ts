// Customer booking routes: availability, create, list own, view own, cancel.
import type { Env } from "../env";
import { json, readJson, Errors } from "../http";
import {
  getSettings,
  getUserById,
  toBooking,
  nowIso,
  writeAudit,
  type BookingRow,
} from "../db";
import { requireSession, assertCsrf } from "../session";
import {
  getAvailabilityForDate,
  validateBookingWindow,
  createBookingAtomic,
  cancellationAllowed,
} from "../bookings";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/availability?date=YYYY-MM-DD */
export async function handleAvailability(
  env: Env,
  request: Request
): Promise<Response> {
  await requireSession(env, request); // must be logged in to see live availability
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) {
    throw Errors.badRequest("A valid date (YYYY-MM-DD) is required.");
  }
  const settings = await getSettings(env);
  const slots = await getAvailabilityForDate(env, date, settings);
  return json({ date, timezone: settings.facilityTimezone, slots });
}

/** POST /api/bookings  { startUtc } */
export async function handleCreateBooking(
  env: Env,
  request: Request
): Promise<Response> {
  const ctx = await requireSession(env, request);
  assertCsrf(ctx, request);

  // Users on a temporary password must change it before booking.
  if (ctx.user.must_change_password === 1) {
    throw Errors.mustChangePassword();
  }

  const body = await readJson<{ startUtc?: string }>(request);
  const settings = await getSettings(env);
  const { startUtc, endUtc } = validateBookingWindow(
    String(body.startUtc ?? ""),
    settings
  );

  const booking = await createBookingAtomic(env, ctx.user.id, startUtc, endUtc);

  await writeAudit(env, {
    actorUserId: ctx.user.id,
    actorUsername: ctx.user.username_display,
    action: "booking_create",
    targetType: "booking",
    targetId: booking.reference,
    detail: `${startUtc} -> ${endUtc}`,
  });

  return json({ booking }, 201);
}

/** GET /api/bookings  -> the current user's bookings (all statuses). */
export async function handleListMyBookings(
  env: Env,
  request: Request
): Promise<Response> {
  const ctx = await requireSession(env, request);
  const rows = await env.DB.prepare(
    "SELECT * FROM bookings WHERE user_id = ? ORDER BY start_utc DESC"
  )
    .bind(ctx.user.id)
    .all<BookingRow>();
  return json({ bookings: (rows.results ?? []).map(toBooking) });
}

/** GET /api/bookings/:id -> a single booking the user owns. */
export async function handleGetMyBooking(
  env: Env,
  request: Request,
  id: number
): Promise<Response> {
  const ctx = await requireSession(env, request);
  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(id)
    .first<BookingRow>();
  if (!row) throw Errors.notFound("Booking not found.");
  // Ownership enforced on the server regardless of client claims.
  if (row.user_id !== ctx.user.id) throw Errors.notFound("Booking not found.");
  return json({ booking: toBooking(row) });
}

/** POST /api/bookings/:id/cancel */
export async function handleCancelMyBooking(
  env: Env,
  request: Request,
  id: number
): Promise<Response> {
  const ctx = await requireSession(env, request);
  assertCsrf(ctx, request);

  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(id)
    .first<BookingRow>();
  if (!row || row.user_id !== ctx.user.id) {
    throw Errors.notFound("Booking not found.");
  }
  if (row.status === "cancelled") {
    throw Errors.conflict("This booking is already cancelled.");
  }

  const settings = await getSettings(env);
  if (!cancellationAllowed(row.start_utc, settings)) {
    throw Errors.forbidden(
      "This booking can no longer be cancelled (past the cancellation cutoff)."
    );
  }

  // Conditional update: only cancel if still active (prevents double-cancel races).
  const res = await env.DB.prepare(
    `UPDATE bookings
        SET status = 'cancelled', cancelled_at = ?, updated_at = ?
      WHERE id = ? AND status = 'active'`
  )
    .bind(nowIso(), nowIso(), id)
    .run();

  if (!res.meta || res.meta.changes === 0) {
    throw Errors.conflict("This booking is already cancelled.");
  }

  await writeAudit(env, {
    actorUserId: ctx.user.id,
    actorUsername: ctx.user.username_display,
    action: "booking_cancel",
    targetType: "booking",
    targetId: row.reference,
  });

  const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(id)
    .first<BookingRow>();
  return json({ booking: toBooking(updated!) });
}

// Re-export for symmetry / potential reuse.
export { getUserById };
