// Brute-force / abuse throttling using the login_attempts table in D1.
import type { Env } from "./env";

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_USER = 8; // per username within the window
const MAX_FAILURES_PER_IP = 25; // per IP within the window

function windowStartIso(): string {
  return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
}

export async function recordLoginAttempt(
  env: Env,
  username: string,
  ip: string,
  successful: boolean
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO login_attempts (username, ip, successful) VALUES (?, ?, ?)"
  )
    .bind(username, ip, successful ? 1 : 0)
    .run();
}

/** Returns true if the (username, ip) is currently throttled. */
export async function isLoginThrottled(
  env: Env,
  username: string,
  ip: string
): Promise<boolean> {
  const since = windowStartIso();

  const byUser = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM login_attempts
      WHERE username = ? AND successful = 0 AND created_at >= ?`
  )
    .bind(username, since)
    .first<{ c: number }>();

  const byIp = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM login_attempts
      WHERE ip = ? AND successful = 0 AND created_at >= ?`
  )
    .bind(ip, since)
    .first<{ c: number }>();

  return (
    (byUser?.c ?? 0) >= MAX_FAILURES_PER_USER ||
    (byIp?.c ?? 0) >= MAX_FAILURES_PER_IP
  );
}

/** Clear failed attempts after a successful login. */
export async function clearLoginFailures(
  env: Env,
  username: string
): Promise<void> {
  await env.DB.prepare(
    "DELETE FROM login_attempts WHERE username = ? AND successful = 0"
  )
    .bind(username)
    .run()
    .catch(() => {});
}

/** Opportunistic cleanup of old rows. */
export async function purgeOldLoginAttempts(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM login_attempts WHERE created_at < ?")
    .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .run()
    .catch(() => {});
}
