// Types shared between the Worker backend and the React frontend.
// Keeping these in one place keeps the API contract type-safe end to end.

export type Role = "customer" | "admin";

export type AccountStatus = "active" | "disabled";

export type BookingStatus = "active" | "cancelled";

export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  status: AccountStatus;
  mustChangePassword: boolean;
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
}

export interface Booking {
  id: number;
  reference: string;
  userId: number;
  username?: string; // populated in admin listings
  startUtc: string; // ISO-8601 UTC
  endUtc: string; // ISO-8601 UTC (always start + 1 hour)
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

export interface Slot {
  // Start of the hour in UTC (ISO-8601). End is always +1 hour.
  startUtc: string;
  endUtc: string;
  // Local display strings computed in the facility timezone.
  localDate: string; // YYYY-MM-DD
  localTime: string; // HH:mm
  available: boolean;
  // Reason a slot is not bookable, when applicable.
  reason?: "booked" | "past" | "too-soon" | "too-far" | "closed";
}

export interface BookingSettings {
  facilityTimezone: string;
  minAdvanceMinutes: number; // earliest a slot may be booked, minutes from now
  maxAdvanceDays: number; // furthest ahead a slot may be booked, days from now
  cancellationCutoffMinutes: number; // latest a booking may be cancelled, minutes before start
  closures: ClosurePeriod[];
}

export interface ClosurePeriod {
  id: string;
  startUtc: string;
  endUtc: string;
  reason: string;
}

export interface AuditEvent {
  id: number;
  actorUserId: number | null;
  actorUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

// ---- API envelope ----

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface LoginResponse {
  user: PublicUser;
  csrfToken: string;
}

export interface MeResponse {
  user: PublicUser;
  csrfToken: string;
}

export interface CreateUserResult {
  user: PublicUser;
  // Only present when the server generated a temporary password. Shown once.
  temporaryPassword?: string;
}

export interface ResetPasswordResult {
  temporaryPassword: string;
}

export const BOOKING_DURATION_MINUTES = 60;
