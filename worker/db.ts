// Typed row shapes and small data-access helpers over D1. All queries are
// parameterised; untrusted input is never concatenated into SQL.
import type { Env } from "./env";
import type {
  PublicUser,
  Role,
  AccountStatus,
  Booking,
  BookingStatus,
  BookingSettings,
  AuditEvent,
} from "@shared/types";

export interface UserRow {
  id: number;
  username: string;
  username_display: string;
  password_hash: string;
  role: Role;
  status: AccountStatus;
  must_change_password: number;
  failed_login_count: number;
  locked_until: string | null;
  password_changed_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingRow {
  id: number;
  reference: string;
  user_id: number;
  start_utc: string;
  end_utc: string;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  username?: string;
}

export interface SettingsRow {
  id: number;
  facility_timezone: string;
  min_advance_minutes: number;
  max_advance_days: number;
  cancellation_cutoff_minutes: number;
  closures_json: string;
  updated_at: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username_display,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    username: row.username,
    startUtc: row.start_utc,
    endUtc: row.end_utc,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at,
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function getUserById(
  env: Env,
  id: number
): Promise<UserRow | null> {
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
}

export async function getUserByUsername(
  env: Env,
  normalizedUsername: string
): Promise<UserRow | null> {
  return env.DB.prepare("SELECT * FROM users WHERE username = ?")
    .bind(normalizedUsername)
    .first<UserRow>();
}

export async function getSettings(env: Env): Promise<BookingSettings> {
  const row = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first<SettingsRow>();
  if (!row) {
    // Should never happen (seeded by migration) but fail safe with defaults.
    return {
      facilityTimezone: env.FACILITY_TIMEZONE || "Europe/London",
      minAdvanceMinutes: 0,
      maxAdvanceDays: 30,
      cancellationCutoffMinutes: 60,
      closures: [],
    };
  }
  let closures = [];
  try {
    closures = JSON.parse(row.closures_json);
  } catch {
    closures = [];
  }
  return {
    facilityTimezone: row.facility_timezone,
    minAdvanceMinutes: row.min_advance_minutes,
    maxAdvanceDays: row.max_advance_days,
    cancellationCutoffMinutes: row.cancellation_cutoff_minutes,
    closures,
  };
}

export async function writeAudit(
  env: Env,
  event: {
    actorUserId: number | null;
    actorUsername: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    detail?: string | null;
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_events
       (actor_user_id, actor_username, action, target_type, target_id, detail)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      event.actorUserId,
      event.actorUsername,
      event.action,
      event.targetType ?? null,
      event.targetId ?? null,
      event.detail ?? null
    )
    .run();
}

export function toAuditEvent(row: {
  id: number;
  actor_user_id: number | null;
  actor_username: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  created_at: string;
}): AuditEvent {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: row.detail,
    createdAt: row.created_at,
  };
}
