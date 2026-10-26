// Small HTTP helpers: JSON responses, typed errors, cookie parsing/serialising.
import type { ApiError } from "@shared/types";

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  unauthorized: (msg = "Authentication required.") =>
    new HttpError(401, "unauthorized", msg),
  forbidden: (msg = "You do not have permission to do that.") =>
    new HttpError(403, "forbidden", msg),
  notFound: (msg = "Not found.") => new HttpError(404, "not_found", msg),
  badRequest: (msg = "Invalid request.") => new HttpError(400, "bad_request", msg),
  conflict: (msg = "Conflict.") => new HttpError(409, "conflict", msg),
  tooMany: (msg = "Too many requests. Please slow down.") =>
    new HttpError(429, "rate_limited", msg),
  mustChangePassword: (msg = "You must change your temporary password first.") =>
    new HttpError(403, "must_change_password", msg),
};

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { code: err.code, message: err.message } };
    return json(body, err.status);
  }
  // TEMPORARY DEBUG: surface the real error so we can diagnose the provisioning 500.
  // REVERT THIS before going live — it leaks internal details.
  const detail =
    err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error("Unhandled error:", detail, err instanceof Error ? err.stack : "");
  const body: ApiError = {
    error: { code: "internal_error", message: `DEBUG: ${detail}` },
  };
  return json(body, 500);
}

// ---- Cookies ----

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  path?: string;
}

export function serializeCookie(
  name: string,
  value: string,
  opts: CookieOptions = {}
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path ?? "/"}`);
  if (opts.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.floor(opts.maxAgeSeconds)}`);
    if (opts.maxAgeSeconds <= 0) parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  }
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

export async function readJson<T>(request: Request): Promise<T> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw Errors.badRequest("Expected JSON body.");
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw Errors.badRequest("Malformed JSON body.");
  }
}

/** Best-effort client IP from Cloudflare headers. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
