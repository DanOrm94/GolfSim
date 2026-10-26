# Fairway Indoor Golf — 24/7 Simulator Booking System

A secure, production-ready booking website for a facility with **exactly one** golf
simulator, available **24 hours a day, 7 days a week**, in **one-hour** slots.

- **Frontend:** React + TypeScript + Vite + Tailwind CSS (single-page app)
- **Backend:** Cloudflare Workers (TypeScript)
- **Database:** Cloudflare D1 (SQLite-compatible), version-controlled SQL migrations
- **Auth:** username + password (no email anywhere), server-side D1-backed sessions,
  HTTP-only Secure SameSite cookies, CSRF tokens, PBKDF2 password hashing
- **Hosting:** one Worker serves both the API (`/api/*`) and the built SPA assets

There is **no email**: no email login, no public registration, no email verification,
no email password recovery. Administrators create and manage all accounts.

---

## Architecture at a glance

```
Browser (React SPA)
   │  fetch /api/*  (cookie + x-csrf-token)
   ▼
Cloudflare Worker  (worker/index.ts)
   ├─ /api/*            → routed handlers (auth, customer, admin, provision)
   └─ everything else   → static assets (dist/client) with SPA fallback
   │
   ▼
Cloudflare D1 (golfsim_db)
```

A single Worker is configured in `wrangler.jsonc`. `run_worker_first: ["/api/*"]`
sends API traffic to the Worker; all other paths resolve to the built SPA, and
`not_found_handling: "single-page-application"` returns `index.html` for client routes.

### Key directories

| Path | Purpose |
| --- | --- |
| `worker/` | Worker backend (routing, auth, bookings, admin, crypto, sessions) |
| `worker/routes/` | Request handlers grouped by area |
| `shared/` | Types, validation and timezone logic shared by client + server |
| `src/` | React SPA (pages, components, auth context, API client) |
| `migrations/` | Version-controlled D1 SQL migrations |
| `scripts/` | `provision-admin.mjs` first-admin helper |

---

## Booking rules (as implemented)

- One physical simulator; no bay/resource selection.
- Every booking is exactly 60 minutes, aligned to the top of the hour.
- Availability, past-time checks, advance window and closures are enforced **on the
  server**; the frontend only mirrors them for UX.
- **Overlap prevention is two-layered:**
  1. A single conditional `INSERT ... SELECT ... WHERE NOT EXISTS (<overlap query>)`
     statement — the overlap test and insert happen atomically inside D1's implicit
     transaction, so two concurrent requests cannot both succeed.
  2. A **partial unique index** `idx_bookings_active_start` on `start_utc` where
     `status='active'`, a hard DB constraint that rejects a duplicate active slot even
     in a race.
- Cancelling sets `status='cancelled'` and `cancelled_at` (history preserved) and frees
  the slot because availability and the unique index only consider `active` rows.

### Timezone & DST

- One configurable IANA facility timezone (default **`Europe/London`**).
- Timestamps are stored in **UTC**; all display uses the facility timezone via `Intl`.
- Slot generation is per **local** day/hour, then converted to UTC, with explicit
  handling of DST spring-forward (nonexistent local times resolve forward) and
  fall-back (ambiguous local times resolve to the earlier instant), de-duplicated by
  UTC instant. See `shared/timezone.ts` and its tests.

---

## Default booking policy (configurable in Admin → Settings)

| Setting | Default | Meaning |
| --- | --- | --- |
| Facility timezone | `Europe/London` | Display + slot generation zone |
| Min advance | `0` minutes | Earliest bookable slot from now |
| Max advance | `30` days | Furthest bookable slot |
| Cancellation cutoff | `60` minutes | Latest a customer may self-cancel before start |
| Closures | none | Optional maintenance/closed periods |

24/7 availability is the default — there are no routine opening hours, payments, or
memberships.

---

## Username & password policy

- Usernames are normalised to lowercase + trimmed, 3–32 chars, `[a-z0-9._-]`, unique
  (case-insensitive by construction). Validated on the server.
- Passwords: min 10 chars, must include ≥3 of {lowercase, uppercase, number, symbol}.
- Passwords are hashed with **PBKDF2-HMAC-SHA-256** (210,000 iterations, per-password
  salt) via WebCrypto. Hashes are never returned by any API.
  > Note: Argon2id is generally preferred, but it has no first-class WebCrypto
  > implementation on Workers. PBKDF2 at a high iteration count is the dependency-free,
  > runtime-supported choice here. To move to Argon2id later, swap `worker/crypto.ts`
  > for a WASM Argon2 build; the encoded-hash format already carries its algorithm tag.

---

## Local development (optional — not required to deploy)

You do **not** need to run anything locally to deploy. If you want to:

```bash
npm install
npm run typecheck   # TS for app + worker
npm run lint
npm test            # unit tests (no server started)
npm run build       # production build check (no server)
```

Running the full app locally (`npm run dev` / `wrangler dev`) requires a local D1 and
secrets in `.dev.vars` (copy from `.dev.vars.example`). This is optional.

---

## Cloudflare setup & deployment

### Prerequisites

- A Cloudflare account.
- `wrangler` (installed as a dev dependency; use `npx wrangler ...` or the npm scripts).
- Authenticate once: `npx wrangler login`.

### 1. Create the D1 databases

```bash
# Production
npx wrangler d1 create golfsim_db
# Preview/staging (optional but recommended)
npx wrangler d1 create golfsim_db_preview
```

Copy each printed `database_id` into `wrangler.jsonc`:
- top-level `d1_databases[0].database_id` → production id
- `env.preview.d1_databases[0].database_id` → preview id

### 2. Apply migrations

Migrations live in `migrations/` and are version-controlled. **Keep them separate from
app startup** (the Worker never runs migrations itself).

```bash
# Local (if developing locally)
npm run db:migrate:local

# Preview database (remote)
npm run db:migrate:preview

# Production database (remote) — ask the owner before running against prod
npm run db:migrate:prod
```

(Equivalent raw commands:
`npx wrangler d1 migrations apply golfsim_db --remote` for production.)

### 3. Set secrets

Never commit secrets. Set them per environment:

```bash
# Production
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_PROVISION_TOKEN

# Preview
npx wrangler secret put SESSION_SECRET --env preview
npx wrangler secret put ADMIN_PROVISION_TOKEN --env preview
```

Generate strong values:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # ADMIN_PROVISION_TOKEN
```

| Name | Type | Where | Purpose |
| --- | --- | --- | --- |
| `SESSION_SECRET` | secret | `wrangler secret put` | Signs/verifies session + CSRF material |
| `ADMIN_PROVISION_TOKEN` | secret | `wrangler secret put` | One-time first-admin bootstrap; remove after use |
| `FACILITY_TIMEZONE` | var | `wrangler.jsonc` | Initial facility timezone (also editable in Settings) |
| `ENVIRONMENT` | var | `wrangler.jsonc` | `production` / `preview`; controls Secure cookies + HSTS |

Bindings: `DB` (D1) and `ASSETS` (static assets) are declared in `wrangler.jsonc`.

### 4a. Deploy directly with Wrangler

```bash
npm run build
npx wrangler deploy                 # production
npx wrangler deploy --env preview   # preview
```

### 4b. Or connect GitHub → Cloudflare (recommended)

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Workers → Connect to Git**,
   and select the repository.
3. Build command: `npm run build`. Deploy command: `npx wrangler deploy` (Cloudflare's
   Workers Builds uses your `wrangler.jsonc`).
4. Add the D1 binding and secrets in the dashboard (or ensure they're set via Wrangler).
   Set `SESSION_SECRET` and `ADMIN_PROVISION_TOKEN` as encrypted variables.
5. Each push to the production branch builds and deploys automatically.

> A successful local build does not guarantee Cloudflare compatibility. Verify the
> deployed Worker health at `GET /api/health` after the first deploy.

### 5. Provision the first administrator (one time)

After deploying and applying migrations, create the first admin via the bootstrap
endpoint. It requires the `ADMIN_PROVISION_TOKEN` and only ever succeeds **once**.

```bash
node scripts/provision-admin.mjs \
  --url https://<your-worker-subdomain>.workers.dev \
  --token "<ADMIN_PROVISION_TOKEN>" \
  --username firstadmin
# omit --password to have a temporary one generated and shown once
```

Then **remove the bootstrap token**:

```bash
npx wrangler secret delete ADMIN_PROVISION_TOKEN
```

Log in as the new admin; you'll be forced to set a new password immediately.

---

## Creating users & resetting passwords (admin)

In **Admin → Users**:

- **Create user:** set a username and role; either generate a strong temporary password
  (shown once) or set one manually. Temporary passwords force a change at first login.
- **Reset password:** generates a new temporary password (shown once), forces a change,
  and logs the user out everywhere. Existing passwords are never shown or retrievable.
- **Force change / enable / disable / change role / rename:** all available, with
  safeguards (can't remove or disable the last active admin; can't demote/disable
  yourself).
- **Booking history:** view any user's bookings; cancel any booking from Admin → Bookings.

Temporary passwords are shown **once** in the UI and are never stored in plaintext,
logs or audit records.

---

## Security summary

- PBKDF2 password hashing; hashes never leave the server.
- D1-backed sessions; only a **hash** of the session verifier is stored. Cookies are
  `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Sessions expire (8h sliding)
  and are invalidated on logout, disable, password reset and role change.
- CSRF: per-session token (`x-csrf-token` double-submit) + `Origin` check on writes +
  SameSite cookies.
- Brute-force protection: per-username and per-IP throttling with temporary lockout.
- All inputs validated server-side; all SQL parameterised; booking ownership and roles
  enforced server-side on every protected endpoint.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, and HSTS in production.
- No secrets in frontend code; generic auth error messages to limit enumeration.

See `SECURITY.md` for the full review checklist and `DEPLOYMENT.md` for a condensed
runbook.

---

## API reference (brief)

All responses are JSON. State-changing requests require the session cookie and
`x-csrf-token` header.

Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`,
`POST /api/auth/change-password`.

Customer: `GET /api/availability?date=YYYY-MM-DD`, `POST /api/bookings`,
`GET /api/bookings`, `GET /api/bookings/:id`, `POST /api/bookings/:id/cancel`.

Admin: `GET /api/admin/overview`, `GET/POST /api/admin/users`,
`PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/reset-password`,
`POST /api/admin/users/:id/force-change-password`, `GET /api/admin/users/:id/bookings`,
`GET /api/admin/bookings`, `POST /api/admin/bookings/:id/cancel`,
`GET/PUT /api/admin/settings`, `GET /api/admin/audit`.

Provisioning: `POST /api/provision/first-admin` (Bearer `ADMIN_PROVISION_TOKEN`, once).
