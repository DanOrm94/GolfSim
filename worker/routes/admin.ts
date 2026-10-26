// Administrator routes. Every handler requires an admin session (checked server-side).
import type { Env } from "../env";
import type {
  CreateUserResult,
  ResetPasswordResult,
  Role,
} from "@shared/types";
import { json, readJson, Errors } from "../http";
import {
  toPublicUser,
  toBooking,
  toAuditEvent,
  getUserById,
  nowIso,
  getSettings,
  writeAudit,
  type UserRow,
  type BookingRow,
} from "../db";
import { requireAdmin, assertCsrf, deleteUserSessions } from "../session";
import {
  hashPassword,
  generateTemporaryPassword,
} from "../crypto";
import {
  normalizeUsername,
  validateUsername,
  validatePassword,
} from "@shared/validation";

// ---------- Users ----------

/** GET /api/admin/users?q=&status=&role= */
export async function handleListUsers(env: Env, request: Request): Promise<Response> {
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const q = normalizeUsername(url.searchParams.get("q") ?? "");

  let sql = "SELECT * FROM users";
  const binds: unknown[] = [];
  if (q) {
    sql += " WHERE username LIKE ?";
    binds.push(`%${q}%`);
  }
  sql += " ORDER BY created_at DESC LIMIT 500";

  const rows = await env.DB.prepare(sql).bind(...binds).all<UserRow>();
  return json({ users: (rows.results ?? []).map(toPublicUser) });
}

/** POST /api/admin/users  { username, role, password?, generatePassword?, mustChange? } */
export async function handleCreateUser(env: Env, request: Request): Promise<Response> {
  const ctx = await requireAdmin(env, request);
  assertCsrf(ctx, request);
  const body = await readJson<{
    username?: string;
    role?: Role;
    password?: string;
    generatePassword?: boolean;
    mustChangePassword?: boolean;
  }>(request);

  const displayUsername = String(body.username ?? "").trim();
  const username = normalizeUsername(displayUsername);
  const role: Role = body.role === "admin" ? "admin" : "customer";

  const uCheck = validateUsername(username);
  if (!uCheck.ok) throw Errors.badRequest(uCheck.message!);

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ?"
  )
    .bind(username)
    .first<{ id: number }>();
  if (existing) throw Errors.conflict("That username is already taken.");

  let tempPassword: string | undefined;
  let plain: string;
  let mustChange = body.mustChangePassword ?? false;

  if (body.generatePassword || !body.password) {
    tempPassword = generateTemporaryPassword();
    plain = tempPassword;
    mustChange = true; // temporary passwords always require a change
  } else {
    plain = String(body.password);
    const pCheck = validatePassword(plain);
    if (!pCheck.ok) throw Errors.badRequest(pCheck.message!);
  }

  const hash = await hashPassword(plain);

  const res = await env.DB.prepare(
    `INSERT INTO users (username, username_display, password_hash, role, status, must_change_password, password_changed_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`
  )
    .bind(
      username,
      displayUsername,
      hash,
      role,
      mustChange ? 1 : 0,
      nowIso()
    )
    .run();

  const newId = Number(res.meta.last_row_id);
  const created = await getUserById(env, newId);

  await writeAudit(env, {
    actorUserId: ctx.user.id,
    actorUsername: ctx.user.username_display,
    action: "user_create",
    targetType: "user",
    targetId: String(newId),
    detail: `role=${role}`,
  });

  const payload: CreateUserResult = {
    user: toPublicUser(created!),
    temporaryPassword: tempPassword, // shown ONCE, never stored in plaintext
  };
  return json(payload, 201);
}

/** POST /api/admin/users/:id/reset-password -> returns a new temp password once. */
export async function handleResetPassword(
  env: Env,
  request: Request,
  id: number
): Promise<Response> {
  const ctx = await requireAdmin(env, request);
  assertCsrf(ctx, request);

  const target = await getUserById(env, id);
  if (!target) throw Errors.notFound("User not found.");

  const tempPassword = generateTemporaryPassword();
  const hash = await hashPassword(tempPassword);

  await env.DB.prepare(
    `UPDATE users
        SET password_hash = ?, must_change_password = 1,
            failed_login_count = 0, locked_until = NULL,
            password_changed_at = ?, updated_at = ?
      WHERE id = ?`
  )
    .bind(hash, nowIso(), nowIso(), id)
    .run();

  // Force re-authentication everywhere.
  await deleteUserSessions(env, id);

  await writeAudit(env, {
    actorUserId: ctx.user.id,
    actorUsername: ctx.user.username_display,
    action: "user_password_reset",
    targetType: "user",
    targetId: String(id),
  });

  const payload: ResetPasswordResult = { temporaryPassword: tempPassword };
  return json(payload);
}

/** POST /api/admin/users/:id/force-change-password */
export async function handleForceChangePassword(
  env: Env,
  request: Request,
  id: number
): Promise<Response> {
  const ctx = await requireAdmin(env, request);
  assertCsrf(ctx, request);
  const target = await getUserById(env, id);
  if (!target) throw Errors.notFound("User not found.");

  await env.DB.prepare(
    "UPDATE users SET must_change_password = 1, updated_at = ? WHERE id = ?"
  )
    .bind(nowIso(), id)
    .run();
  await deleteUserSessions(env, id);

  await writeAudit(env, {
    actorUserId: ctx.user.id,
    actorUsername: ctx.user.username_display,
    action: "user_force_password_change",
    targetType: "user",
    targetId: String(id),
  });
  return json({ ok: true });
}

/** PATCH /api/admin/users/:id  { status?, role?, username? } */
export async function handleUpdateUser(
  env: Env,
  request: Request,
  id: number
): Promise<Response> {
  const ctx = await requireAdmin(env, request);
  assertCsrf(ctx, request);
  const body = await readJson<{
    status?: "active" | "disabled";
    role?: Role;
    username?: string;
  }>(request);

  const target = await getUserById(env, id);
  if (!target) throw Errors.notFound("User not found.");

  const updates: string[] = [];
  const binds: unknown[] = [];
  const auditDetails: string[] = [];

  if (body.username !== undefined) {
    const display = String(body.username).trim();
    const normalized = normalizeUsername(display);
    const uCheck = validateUsername(normalized);
    if (!uCheck.ok) throw Errors.badRequest(uCheck.message!);
    if (normalized !== target.username) {
      const clash = await env.DB.prepare(
        "SELECT id FROM users WHERE username = ? AND id <> ?"
      )
        .bind(normalized, id)
        .first<{ id: number }>();
      if (clash) throw Errors.conflict("That username is already taken.");
    }
    updates.push("username = ?", "username_display = ?");
    binds.push(normalized, display);
    auditDetails.push(`username=${normalized}`);
  }

  if (body.role !== undefined) {
    const role: Role = body.role === "admin" ? "admin" : "customer";
    // Safeguard: prevent removing the last active admin.
    if (target.role === "admin" && role !== "admin") {
      await assertNotLastAdmin(env, id);
    }
    // Safeguard: an admin cannot demote themselves (avoids accidental lockout).
    if (id === ctx.user.id && role !== "admin") {
      throw Errors.badRequest("You cannot change your own role.");
    }
    updates.push("role = ?");
    binds.push(role);
    auditDetails.push(`role=${role}`);
  }

  if (body.status !== undefined) {
    const status = body.status === "disabled" ? "disabled" : "active";
    if (status === "disabled") {
      if (id === ctx.user.id) {
        throw Errors.badRequest("You cannot disable your own account.");
      }
      if (target.role === "admin") {
        await assertNotLastAdmin(env, id);
      }
    }
    updates.push("status = ?");
    binds.push(status);
    auditDetails.push(`status=${status}`);
    // Disabling an account invalidates its sessions.
    if (status === "disabled") {
      await deleteUserSessions(env, id);
    }
  }

  if (updates.length === 0) {
    throw Errors.badRequest("No changes supplied.");
  }

  updates.push("updated_at = ?");
  binds.push(nowIso());
  binds.push(id);

  await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  await writeAudit(env, {
    actorUserId: ctx.user.id,
    actorUsername: ctx.user.username_display,
    action: "user_update",
    targetType: "user",
    targetId: String(id),
    detail: auditDetails.join(" "),
  });

  const updated = await getUserById(env, id);
  return json({ user: toPublicUser(updated!) });
}

async function assertNotLastAdmin(env: Env, excludingId: number): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?"
  )
    .bind(excludingId)
    .first<{ c: number }>();
  if ((row?.c ?? 0) === 0) {
    throw Errors.badRequest("Cannot remove the last active administrator.");
  }
}

/** GET /api/admin/users/:id/bookings */
export async function handleUserBookings(
  env: Env,
  request: Request,
  id: number
): Promise<Response> {
  await requireAdmin(env, request);
  const rows = await env.DB.prepare(
    "SELECT * FROM bookings WHERE user_id = ? ORDER BY start_utc DESC"
  )
    .bind(id)
    .all<BookingRow>();
  return json({ bookings: (rows.results ?? []).map(toBooking) });
}

// ---------- Bookings ----------

/** GET /api/admin/bookings?q=&status=&from=&to= */
export async function handleAdminListBookings(
  env: Env,
  request: Request
): Promise<Response> {
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where: string[] = [];
  const binds: unknown[] = [];

  if (q) {
    where.push("(b.reference LIKE ? OR u.username LIKE ?)");
    binds.push(`%${q.toUpperCase()}%`, `%${normalizeUsername(q)}%`);
  }
  if (status === "active" || status === "cancelled") {
    where.push("b.status = ?");
    binds.push(status);
  }
  if (from) {
    where.push("b.start_utc >= ?");
    binds.push(from);
  }
  if (to) {
    where.push("b.start_utc <= ?");
    binds.push(to);
  }

  const sql =
    `SELECT b.*, u.username_display AS username
       FROM bookings b JOIN users u ON u.id = b.user_id` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY b.start_utc DESC LIMIT 1000";

  const rows = await env.DB.prepare(sql).bind(...binds).all<BookingRow>();
  return json({ bookings: (rows.results ?? []).map(toBooking) });
}

/** POST /api/admin/bookings/:id/cancel */
export async function handleAdminCancelBooking(
  env: Env,
  request: Request,
  id: number
): Promise<Response> {
  const ctx = await requireAdmin(env, request);
  assertCsrf(ctx, request);

  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(id)
    .first<BookingRow>();
  if (!row) throw Errors.notFound("Booking not found.");
  if (row.status === "cancelled") {
    throw Errors.conflict("This booking is already cancelled.");
  }

  // Admins may cancel regardless of the customer cancellation cutoff.
  const res = await env.DB.prepare(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, updated_at = ?
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
    action: "admin_booking_cancel",
    targetType: "booking",
    targetId: row.reference,
  });

  const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(id)
    .first<BookingRow>();
  return json({ booking: toBooking(updated!) });
}

// ---------- Dashboard ----------

/** GET /api/admin/overview */
export async function handleAdminOverview(
  env: Env,
  request: Request
): Promise<Response> {
  await requireAdmin(env, request);
  const now = nowIso();

  const upcoming = await env.DB.prepare(
    `SELECT b.*, u.username_display AS username
       FROM bookings b JOIN users u ON u.id = b.user_id
      WHERE b.status = 'active' AND b.start_utc >= ?
      ORDER BY b.start_utc ASC LIMIT 10`
  )
    .bind(now)
    .all<BookingRow>();

  const recent = await env.DB.prepare(
    `SELECT b.*, u.username_display AS username
       FROM bookings b JOIN users u ON u.id = b.user_id
      ORDER BY b.created_at DESC LIMIT 10`
  ).all<BookingRow>();

  const activeUsers = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE status = 'active'"
  ).first<{ c: number }>();

  const totalActiveBookings = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM bookings WHERE status = 'active' AND start_utc >= ?"
  )
    .bind(now)
    .first<{ c: number }>();

  const cancellations = await env.DB.prepare(
    `SELECT b.*, u.username_display AS username
       FROM bookings b JOIN users u ON u.id = b.user_id
      WHERE b.status = 'cancelled'
      ORDER BY b.cancelled_at DESC LIMIT 10`
  ).all<BookingRow>();

  return json({
    upcoming: (upcoming.results ?? []).map(toBooking),
    recent: (recent.results ?? []).map(toBooking),
    recentCancellations: (cancellations.results ?? []).map(toBooking),
    stats: {
      activeUsers: activeUsers?.c ?? 0,
      upcomingBookings: totalActiveBookings?.c ?? 0,
    },
  });
}

// ---------- Settings ----------

/** GET /api/admin/settings */
export async function handleGetSettings(
  env: Env,
  request: Request
): Promise<Response> {
  await requireAdmin(env, request);
  const settings = await getSettings(env);
  return json({ settings });
}

/** PUT /api/admin/settings */
export async function handleUpdateSettings(
  env: Env,
  request: Request
): Promise<Response> {
  const ctx = await requireAdmin(env, request);
  assertCsrf(ctx, request);
  const body = await readJson<{
    facilityTimezone?: string;
    minAdvanceMinutes?: number;
    maxAdvanceDays?: number;
    cancellationCutoffMinutes?: number;
    closures?: { id: string; startUtc: string; endUtc: string; reason: string }[];
  }>(request);

  const current = await getSettings(env);

  const tz = body.facilityTimezone ?? current.facilityTimezone;
  // Validate timezone by attempting to use it.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw Errors.badRequest("Invalid IANA timezone.");
  }

  const minAdvance = clampInt(
    body.minAdvanceMinutes ?? current.minAdvanceMinutes,
    0,
    60 * 24 * 7
  );
  const maxDays = clampInt(body.maxAdvanceDays ?? current.maxAdvanceDays, 1, 365);
  const cutoff = clampInt(
    body.cancellationCutoffMinutes ?? current.cancellationCutoffMinutes,
    0,
    60 * 24 * 7
  );

  let closures = current.closures;
  if (Array.isArray(body.closures)) {
    closures = body.closures
      .filter(
        (c) =>
          c &&
          !Number.isNaN(new Date(c.startUtc).getTime()) &&
          !Number.isNaN(new Date(c.endUtc).getTime()) &&
          new Date(c.endUtc) > new Date(c.startUtc)
      )
      .map((c) => ({
        id: String(c.id || crypto.randomUUID()),
        startUtc: new Date(c.startUtc).toISOString(),
        endUtc: new Date(c.endUtc).toISOString(),
        reason: String(c.reason ?? "").slice(0, 200),
      }));
  }

  await env.DB.prepare(
    `UPDATE settings
        SET facility_timezone = ?, min_advance_minutes = ?, max_advance_days = ?,
            cancellation_cutoff_minutes = ?, closures_json = ?, updated_at = ?
      WHERE id = 1`
  )
    .bind(
      tz,
      minAdvance,
      maxDays,
      cutoff,
      JSON.stringify(closures),
      nowIso()
    )
    .run();

  await writeAudit(env, {
    actorUserId: ctx.user.id,
    actorUsername: ctx.user.username_display,
    action: "settings_update",
    detail: `tz=${tz} min=${minAdvance} max=${maxDays} cutoff=${cutoff}`,
  });

  const settings = await getSettings(env);
  return json({ settings });
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// ---------- Audit ----------

/** GET /api/admin/audit?limit= */
export async function handleListAudit(
  env: Env,
  request: Request
): Promise<Response> {
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const limit = clampInt(Number(url.searchParams.get("limit") ?? 100), 1, 500);
  const rows = await env.DB.prepare(
    "SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?"
  )
    .bind(limit)
    .all<Parameters<typeof toAuditEvent>[0]>();
  return json({ events: (rows.results ?? []).map(toAuditEvent) });
}
