/// <reference types="@cloudflare/workers-types" />

// Runtime bindings available to the Worker. Mirrors wrangler.jsonc.
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  // vars
  FACILITY_TIMEZONE: string;
  ENVIRONMENT: string; // "production" | "preview" | "development"

  // secrets (set via `wrangler secret put` / .dev.vars)
  SESSION_SECRET: string;
  ADMIN_PROVISION_TOKEN?: string;
}

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === "production";
}
