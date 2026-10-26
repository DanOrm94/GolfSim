// Typed fetch client for the Worker API.
//
// - Credentials are included so the HTTP-only session cookie is sent.
// - The per-session CSRF token is attached to state-changing requests via the
//   x-csrf-token header (double-submit). It is held in memory only.
import type { ApiError } from "@shared/types";

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export class ApiRequestError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {};
  const isWrite = method !== "GET" && method !== "HEAD";
  if (body !== undefined) headers["content-type"] = "application/json";
  if (isWrite && csrfToken) headers["x-csrf-token"] = csrfToken;

  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = (data as ApiError)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? "error",
      err?.message ?? "Request failed."
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};
