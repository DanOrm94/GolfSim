// Authentication routes: login, logout, current user, change password.
import type { Env } from "../env";
import type { LoginResponse, MeResponse } from "@shared/types";
import { json, readJson, Errors, clientIp } from "../http";
import {
  getUserByUsername,
  getUserById,
  toPublicUser,
  nowIso,
  writeAudit,
} from "../db";
import {
  createSession,
  clearSessionCookie,
  requireSession,
  deleteSession,
  deleteUserSessions,
  assertCsrf,
  getSession,
  SESSION_COOKIE,
} from "../session";
import { hashPassword, verifyPassword } from "../crypto";
import {
  normalizeUsername,
  validatePassword,
} from "@shared/validation";
import {
  isLoginThrottled,
  recordLoginAttempt,
  clearLoginFailures,
} from "../ratelimit";
import { parseCookies } from "../http";

const MAX_FAILED_BEFORE_LOCK = 10;
const LOCK_MINUTES = 15;

export async function handleLogin(env: Env, request: Request): Promise<Response> {
  const body = await readJson<{ username?: string; password?: string }>(request);
  const ip = clientIp(request);
  const username = normalizeUsername(String(body.username ?? ""));
  const password = String(body.password ?? "");

  // Generic error message to avoid leaking which accounts exist.
  const invalid = Errors.unauthorized("Incorrect username or password.");

  if (!username || !password) {
    throw Errors.badRequest("Username and password are required.");
  }

  if (await isLoginThrottled(env, username, ip)) {
    throw Errors.tooMany("Too many attempts. Please wait a few minutes and try again.");
  }

  const user = await getUserByUsername(env, username);

  // Always perform a hash verification to reduce username enumeration via timing.
  const storedHash =
    user?.password_hash ??
    "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const passwordOk = await verifyPassword(password, storedHash);

  if (!user || !passwordOk) {
    await recordLoginAttempt(env, username, ip, false);
    if (user) {
      const failed = user.failed_login_count + 1;
      const lockedUntil =
        failed >= MAX_FAILED_BEFORE_LOCK
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
          : user.locked_until;
      await env.DB.prepare(
        "UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?"
      )
        .bind(failed, lockedUntil, nowIso(), user.id)
        .run();
    }
    throw invalid;
  }

  if (user.status === "disabled") {
    await recordLoginAttempt(env, username, ip, false);
    throw Errors.forbidden("This account is disabled. Contact an administrator.");
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    throw Errors.tooMany("Account temporarily locked. Please try again later.");
  }

  // Success.
  await recordLoginAttempt(env, username, ip, true);
  await clearLoginFailures(env, username);
  await env.DB.prepare(
    "UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?"
  )
    .bind(nowIso(), nowIso(), user.id)
    .run();

  const { cookie, csrfToken } = await createSession(
    env,
    user.id,
    request.headers.get("user-agent")
  );
  await writeAudit(env, {
    actorUserId: user.id,
    actorUsername: user.username_display,
    action: "login",
    targetType: "user",
    targetId: String(user.id),
  });

  const payload: LoginResponse = { user: toPublicUser(user), csrfToken };
  return json(payload, 200, { "set-cookie": cookie });
}

export async function handleLogout(env: Env, request: Request): Promise<Response> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const raw = cookies[SESSION_COOKIE];
  if (raw) {
    const sessionId = raw.split(".")[0];
    // CSRF check is best-effort for logout; only act if a valid session exists.
    const ctx = await getSession(env, request);
    if (ctx) {
      await deleteSession(env, ctx.sessionId);
    } else if (sessionId) {
      await deleteSession(env, sessionId);
    }
  }
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie(env) });
}

export async function handleMe(env: Env, request: Request): Promise<Response> {
  const ctx = await requireSession(env, request);
  const payload: MeResponse = {
    user: toPublicUser(ctx.user),
    csrfToken: ctx.csrfToken,
  };
  return json(payload);
}

export async function handleChangePassword(
  env: Env,
  request: Request
): Promise<Response> {
  const ctx = await requireSession(env, request);
  assertCsrf(ctx, request);
  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(
    request
  );
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  const fresh = await getUserById(env, ctx.user.id);
  if (!fresh) throw Errors.unauthorized();

  const ok = await verifyPassword(currentPassword, fresh.password_hash);
  if (!ok) throw Errors.badRequest("Your current password is incorrect.");

  const check = validatePassword(newPassword);
  if (!check.ok) throw Errors.badRequest(check.message!);

  if (await verifyPassword(newPassword, fresh.password_hash)) {
    throw Errors.badRequest("New password must be different from the current one.");
  }

  const newHash = await hashPassword(newPassword);
  await env.DB.prepare(
    `UPDATE users
        SET password_hash = ?, must_change_password = 0,
            password_changed_at = ?, updated_at = ?
      WHERE id = ?`
  )
    .bind(newHash, nowIso(), nowIso(), fresh.id)
    .run();

  // Invalidate all other sessions, then issue a fresh one for this device.
  await deleteUserSessions(env, fresh.id);
  const { cookie, csrfToken } = await createSession(
    env,
    fresh.id,
    request.headers.get("user-agent")
  );

  await writeAudit(env, {
    actorUserId: fresh.id,
    actorUsername: fresh.username_display,
    action: "password_change",
    targetType: "user",
    targetId: String(fresh.id),
  });

  const updated = await getUserById(env, fresh.id);
  return json(
    { user: toPublicUser(updated!), csrfToken },
    200,
    { "set-cookie": cookie }
  );
}
