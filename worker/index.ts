/// <reference types="@cloudflare/workers-types" />
// Worker entry point. Handles the /api/* backend; all other paths fall through to
// static assets (the built React SPA), configured in wrangler.jsonc.
import type { Env } from "./env";
import { isProduction } from "./env";
import { json, errorResponse, Errors } from "./http";
import { purgeExpiredSessions } from "./session";
import { purgeOldLoginAttempts } from "./ratelimit";

import {
  handleLogin,
  handleLogout,
  handleMe,
  handleChangePassword,
} from "./routes/auth";
import {
  handleAvailability,
  handleCreateBooking,
  handleListMyBookings,
  handleGetMyBooking,
  handleCancelMyBooking,
} from "./routes/customer";
import {
  handleListUsers,
  handleCreateUser,
  handleResetPassword,
  handleForceChangePassword,
  handleUpdateUser,
  handleUserBookings,
  handleAdminListBookings,
  handleAdminCancelBooking,
  handleAdminOverview,
  handleGetSettings,
  handleUpdateSettings,
  handleListAudit,
} from "./routes/admin";
import { handleProvisionAdmin } from "./routes/provision";

type Handler = (env: Env, request: Request) => Promise<Response>;
type ParamHandler = (env: Env, request: Request, id: number) => Promise<Response>;

function securityHeaders(env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=(), microphone=(), camera=()",
  };
  if (isProduction(env)) {
    headers["strict-transport-security"] =
      "max-age=31536000; includeSubDomains";
  }
  return headers;
}

/**
 * Verify the Origin header for state-changing API requests to mitigate CSRF.
 * Combined with SameSite=Lax cookies and the per-session CSRF token, this is
 * defence in depth.
 */
function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = request.headers.get("origin");
  if (!origin) return; // same-origin fetches may omit Origin; cookie SameSite covers these
  const target = new URL(request.url).origin;
  if (origin !== target) {
    throw Errors.forbidden("Cross-origin request blocked.");
  }
}

async function routeApi(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const method = request.method.toUpperCase();

  // Exact-match table: "METHOD /api/..."
  const exact: Record<string, Handler> = {
    "POST /api/auth/login": handleLogin,
    "POST /api/auth/logout": handleLogout,
    "GET /api/auth/me": handleMe,
    "POST /api/auth/change-password": handleChangePassword,

    "GET /api/availability": handleAvailability,
    "POST /api/bookings": handleCreateBooking,
    "GET /api/bookings": handleListMyBookings,

    "GET /api/admin/users": handleListUsers,
    "POST /api/admin/users": handleCreateUser,
    "GET /api/admin/bookings": handleAdminListBookings,
    "GET /api/admin/overview": handleAdminOverview,
    "GET /api/admin/settings": handleGetSettings,
    "PUT /api/admin/settings": handleUpdateSettings,
    "GET /api/admin/audit": handleListAudit,

    "POST /api/provision/first-admin": handleProvisionAdmin,
  };

  const exactKey = `${method} ${path}`;
  if (exact[exactKey]) {
    return exact[exactKey](env, request);
  }

  // Parameterised routes.
  const param: { pattern: RegExp; method: string; handler: ParamHandler }[] = [
    { pattern: /^\/api\/bookings\/(\d+)$/, method: "GET", handler: handleGetMyBooking },
    {
      pattern: /^\/api\/bookings\/(\d+)\/cancel$/,
      method: "POST",
      handler: handleCancelMyBooking,
    },
    {
      pattern: /^\/api\/admin\/users\/(\d+)$/,
      method: "PATCH",
      handler: handleUpdateUser,
    },
    {
      pattern: /^\/api\/admin\/users\/(\d+)\/reset-password$/,
      method: "POST",
      handler: handleResetPassword,
    },
    {
      pattern: /^\/api\/admin\/users\/(\d+)\/force-change-password$/,
      method: "POST",
      handler: handleForceChangePassword,
    },
    {
      pattern: /^\/api\/admin\/users\/(\d+)\/bookings$/,
      method: "GET",
      handler: handleUserBookings,
    },
    {
      pattern: /^\/api\/admin\/bookings\/(\d+)\/cancel$/,
      method: "POST",
      handler: handleAdminCancelBooking,
    },
  ];

  for (const route of param) {
    if (route.method !== method) continue;
    const m = path.match(route.pattern);
    if (m) {
      const id = Number(m[1]);
      if (!Number.isInteger(id) || id <= 0) throw Errors.badRequest("Invalid id.");
      return route.handler(env, request, id);
    }
  }

  throw Errors.notFound("No such endpoint.");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      try {
        assertSameOrigin(request);
        // Opportunistic maintenance (non-blocking).
        ctx.waitUntil(
          Promise.allSettled([
            purgeExpiredSessions(env),
            purgeOldLoginAttempts(env),
          ]).then(() => undefined)
        );

        if (path === "/api/health") {
          return json({ ok: true, environment: env.ENVIRONMENT });
        }

        const res = await routeApi(request, env, path);
        const merged = new Headers(res.headers);
        for (const [k, v] of Object.entries(securityHeaders(env))) {
          merged.set(k, v);
        }
        return new Response(res.body, { status: res.status, headers: merged });
      } catch (err) {
        const res = errorResponse(err);
        const merged = new Headers(res.headers);
        for (const [k, v] of Object.entries(securityHeaders(env))) {
          merged.set(k, v);
        }
        return new Response(res.body, { status: res.status, headers: merged });
      }
    }

    // Non-API paths: serve the SPA static assets. The assets binding handles
    // not_found_handling=single-page-application, returning index.html for routes.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
