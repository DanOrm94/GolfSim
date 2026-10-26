// Server-side session management, backed by D1.
//
// Security model:
//  - The cookie contains `<sessionId>.<verifier>`. Only a SHA-256 hash of the
//    verifier is stored in the DB, so a DB leak cannot be used to forge cookies.
//  - Sessions are validated on every request against the DB (status, expiry).
//  - Logout, account disable and password reset all delete the relevant sessions.
//  - A CSRF token is bound to the session and required for state-changing requests.
import type { Env } from "./env";
import { isProduction } from "./env";
import { randomToken, sha256 } from "./crypto";
import { getUserById, type UserRow } from "./db";
import { parseCookies, serializeCookie, Errors } from "./http";

export const SESSION_COOKIE = "gs_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
const SLIDING_REFRESH_SECONDS = 60 * 30; // extend if < 30 min used recently

export interface SessionContext {
  user: UserRow;
  sessionId: string;
  csrfToken: string;
}

function cookieValue(sessionId: string, verifier: string): string {
  return `${sessionId}.${verifier}`;
}

export async function createSession(
  env: Env,
  userId: number,
  userAgent: string | null
): Promise<{ cookie: string; csrfToken: string }> {
  const sessionId = randomToken(18);
  const verifier = randomToken(32);
  const csrfToken = randomToken(24);
  const tokenHash = await sha256(verifier);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, csrf_token, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(sessionId, tokenHash, userId, csrfToken, expiresAt, userAgent)
    .run();

  const cookie = serializeCookie(SESSION_COOKIE, cookieValue(sessionId, verifier), {
    httpOnly: true,
    secure: isProduction(env),
    sameSite: "Lax",
    path: "/",
    maxAgeSeconds: SESSION_TTL_SECONDS,
  });
  return { cookie, csrfToken };
}

export function clearSessionCookie(env: Env): string {
  return serializeCookie(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProduction(env),
    sameSite: "Lax",
    path: "/",
    maxAgeSeconds: 0,
  });
}

interface SessionRow {
  id: string;
  token_hash: string;
  user_id: number;
  csrf_token: string;
  expires_at: string;
}

/** Resolve the current session from the request cookie, or null. */
export async function getSession(
  env: Env,
  request: Request
): Promise<SessionContext | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot === -1) return null;
  const sessionId = raw.slice(0, dot);
  const verifier = raw.slice(dot + 1);
  if (!sessionId || !verifier) return null;

  const row = await env.DB.prepare(
    "SELECT id, token_hash, user_id, csrf_token, expires_at FROM sessions WHERE id = ?"
  )
    .bind(sessionId)
    .first<SessionRow>();
  if (!row) return null;

  // Verify the verifier hash in constant-ish time via SHA-256 compare.
  const presentedHash = await sha256(verifier);
  if (presentedHash !== row.token_hash) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await deleteSession(env, sessionId);
    return null;
  }

  const user = await getUserById(env, row.user_id);
  if (!user || user.status !== "active") {
    // Account removed or disabled: invalidate.
    await deleteSession(env, sessionId);
    return null;
  }

  // Sliding expiry: occasionally extend active sessions.
  await env.DB.prepare(
    "UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?"
  )
    .bind(
      new Date().toISOString(),
      new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
      sessionId
    )
    .run()
    .catch(() => {});

  void SLIDING_REFRESH_SECONDS;
  return { user, sessionId, csrfToken: row.csrf_token };
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

/** Invalidate ALL sessions for a user (on disable / password reset / role change). */
export async function deleteUserSessions(env: Env, userId: number): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

/** Require an authenticated, active session or throw 401. */
export async function requireSession(
  env: Env,
  request: Request
): Promise<SessionContext> {
  const ctx = await getSession(env, request);
  if (!ctx) throw Errors.unauthorized();
  return ctx;
}

/** Require an admin session or throw. */
export async function requireAdmin(
  env: Env,
  request: Request
): Promise<SessionContext> {
  const ctx = await requireSession(env, request);
  if (ctx.user.role !== "admin") throw Errors.forbidden();
  return ctx;
}

/**
 * CSRF guard for state-changing requests. The client echoes the session CSRF token
 * in the `x-csrf-token` header (double-submit). SameSite=Lax cookies provide the
 * primary defence; this is defence in depth.
 */
export function assertCsrf(ctx: SessionContext, request: Request): void {
  const header = request.headers.get("x-csrf-token");
  if (!header || header !== ctx.csrfToken) {
    throw Errors.forbidden("Invalid or missing CSRF token.");
  }
}

/** Opportunistic cleanup of expired sessions. */
export async function purgeExpiredSessions(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .bind(new Date().toISOString())
    .run()
    .catch(() => {});
}
