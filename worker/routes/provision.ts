// First-administrator provisioning.
//
// Security design:
//  - Requires the ADMIN_PROVISION_TOKEN secret, supplied in the Authorization header
//    as `Bearer <token>`. The token is NEVER in source; it is a Worker secret.
//  - Works only ONCE: a flag in the `provisioning` table is flipped on success. After
//    that the endpoint returns 403 forever, even if the token is still set.
//  - Also refuses if any admin already exists.
//  - The created admin is forced to change the (temporary) password at first login.
//  - There is no unauthenticated path to admin access.
import type { Env } from "../env";
import { json, readJson, Errors } from "../http";
import { getUserByUsername, nowIso, writeAudit } from "../db";
import { hashPassword, generateTemporaryPassword } from "../crypto";
import { normalizeUsername, validateUsername, validatePassword } from "@shared/validation";

export async function handleProvisionAdmin(
  env: Env,
  request: Request
): Promise<Response> {
  const token = env.ADMIN_PROVISION_TOKEN;
  if (!token) {
    throw Errors.forbidden("Provisioning is not enabled.");
  }

  const auth = request.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // Constant-time-ish comparison.
  if (!presented || presented.length !== token.length || !safeEqual(presented, token)) {
    throw Errors.unauthorized("Invalid provisioning token.");
  }

  // Already provisioned?
  const prov = await env.DB.prepare(
    "SELECT first_admin_created FROM provisioning WHERE id = 1"
  ).first<{ first_admin_created: number }>();
  if (prov?.first_admin_created === 1) {
    throw Errors.forbidden("The first administrator has already been provisioned.");
  }

  const existingAdmin = await env.DB.prepare(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
  ).first<{ id: number }>();
  if (existingAdmin) {
    // Backfill the flag and refuse.
    await env.DB.prepare(
      "UPDATE provisioning SET first_admin_created = 1 WHERE id = 1"
    ).run();
    throw Errors.forbidden("An administrator already exists.");
  }

  const body = await readJson<{ username?: string; password?: string }>(request);
  const display = String(body.username ?? "").trim();
  const username = normalizeUsername(display);
  const uCheck = validateUsername(username);
  if (!uCheck.ok) throw Errors.badRequest(uCheck.message!);

  if (await getUserByUsername(env, username)) {
    throw Errors.conflict("That username already exists.");
  }

  // Password is optional: if omitted, generate a temporary one and return it once.
  let plain: string;
  let temporaryPassword: string | undefined;
  if (body.password) {
    plain = String(body.password);
    const pCheck = validatePassword(plain);
    if (!pCheck.ok) throw Errors.badRequest(pCheck.message!);
  } else {
    temporaryPassword = generateTemporaryPassword();
    plain = temporaryPassword;
  }

  const hash = await hashPassword(plain);

  // Create the admin and flip the provisioning flag atomically in a batch.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (username, username_display, password_hash, role, status, must_change_password, password_changed_at)
       VALUES (?, ?, ?, 'admin', 'active', 1, ?)`
    ).bind(username, display, hash, nowIso()),
    env.DB.prepare("UPDATE provisioning SET first_admin_created = 1 WHERE id = 1"),
  ]);

  await writeAudit(env, {
    actorUserId: null,
    actorUsername: display,
    action: "first_admin_provisioned",
    targetType: "user",
    targetId: username,
  });

  return json(
    {
      ok: true,
      username: display,
      temporaryPassword, // present only if generated; shown once
      mustChangePassword: true,
    },
    201
  );
}

function safeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
