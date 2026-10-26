-- Migration 0001: initial schema for the 24/7 single-simulator booking system.
-- SQLite / Cloudflare D1 compatible. Parameterised queries are used everywhere in
-- application code; this file only defines structure and seed settings.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  username               TEXT    NOT NULL,              -- normalised (lowercase) unique handle
  username_display       TEXT    NOT NULL,              -- as last entered, for display
  password_hash          TEXT    NOT NULL,              -- PBKDF2 encoded string; never plaintext
  role                   TEXT    NOT NULL DEFAULT 'customer'
                           CHECK (role IN ('customer', 'admin')),
  status                 TEXT    NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'disabled')),
  must_change_password   INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  failed_login_count     INTEGER NOT NULL DEFAULT 0,
  locked_until           TEXT,                          -- ISO-8601 UTC; NULL when not locked
  password_changed_at    TEXT,                          -- ISO-8601 UTC
  last_login_at          TEXT,                          -- ISO-8601 UTC
  created_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Case-insensitive uniqueness is guaranteed because `username` is stored normalised.
CREATE UNIQUE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_status ON users (status);

-- ---------------------------------------------------------------------------
-- Sessions (database-backed, server-validated)
-- ---------------------------------------------------------------------------
-- Only a HASH of the session token is stored, never the raw token. The raw token
-- lives solely in the HTTP-only cookie.
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,                       -- random session id (also stored in cookie)
  token_hash    TEXT NOT NULL,                          -- SHA-256 of the secret verifier
  user_id       INTEGER NOT NULL,
  csrf_token    TEXT NOT NULL,                          -- double-submit CSRF value
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at    TEXT NOT NULL,                          -- ISO-8601 UTC
  last_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  user_agent    TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Bookings (one physical simulator; no bay/resource column needed)
-- ---------------------------------------------------------------------------
-- Timestamps are ISO-8601 UTC strings. end_utc is always exactly one hour after
-- start_utc; enforced in application code and re-checked here via CHECK where feasible.
CREATE TABLE bookings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reference     TEXT    NOT NULL UNIQUE,                -- human-friendly reference, e.g. GS-ABC123
  user_id       INTEGER NOT NULL,
  start_utc     TEXT    NOT NULL,
  end_utc       TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'cancelled')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cancelled_at  TEXT,
  CHECK (end_utc > start_utc),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_bookings_user ON bookings (user_id);
CREATE INDEX idx_bookings_start ON bookings (start_utc);
CREATE INDEX idx_bookings_status ON bookings (status);

-- Overlap protection, layer 1 (hard integrity):
-- At most ONE active booking may start at any given instant. Cancelled rows are
-- excluded via a partial unique index, so cancelling frees the slot while keeping
-- the historical row. Because every slot is exactly one hour and aligned to the top
-- of the hour, uniqueness on the active start instant prevents identical-slot double
-- booking even under concurrent writes.
CREATE UNIQUE INDEX idx_bookings_active_start
  ON bookings (start_utc)
  WHERE status = 'active';

-- NOTE: General interval-overlap (non-identical intervals) is additionally enforced
-- in application code via a single conditional INS...SELECT WHERE NOT EXISTS guard
-- (see worker/bookings.ts). Because all bookings are fixed one-hour, hour-aligned
-- slots, identical-start uniqueness + the conditional insert together make any
-- overlap impossible.

-- ---------------------------------------------------------------------------
-- Application settings (single row, id = 1)
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  id                          INTEGER PRIMARY KEY CHECK (id = 1),
  facility_timezone           TEXT    NOT NULL DEFAULT 'Europe/London',
  min_advance_minutes         INTEGER NOT NULL DEFAULT 0,      -- 0 = can book the current hour onward
  max_advance_days            INTEGER NOT NULL DEFAULT 30,
  cancellation_cutoff_minutes INTEGER NOT NULL DEFAULT 60,     -- must cancel >= 60 min before start
  closures_json               TEXT    NOT NULL DEFAULT '[]',   -- JSON array of closure periods
  updated_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO settings (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- Login attempt log (brute-force throttling by username + IP)
-- ---------------------------------------------------------------------------
CREATE TABLE login_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL,
  ip          TEXT NOT NULL,
  successful  INTEGER NOT NULL DEFAULT 0 CHECK (successful IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_login_attempts_lookup ON login_attempts (username, ip, created_at);
CREATE INDEX idx_login_attempts_ip ON login_attempts (ip, created_at);

-- ---------------------------------------------------------------------------
-- Admin provisioning: single-use marker so the bootstrap endpoint only ever
-- creates the FIRST administrator once.
-- ---------------------------------------------------------------------------
CREATE TABLE provisioning (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  first_admin_created  INTEGER NOT NULL DEFAULT 0 CHECK (first_admin_created IN (0, 1)),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO provisioning (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- Audit log for administrative / security-relevant events.
-- Never stores passwords, hashes, tokens or temporary credentials.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id   INTEGER,
  actor_username  TEXT,
  action          TEXT NOT NULL,
  target_type     TEXT,
  target_id       TEXT,
  detail          TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_created ON audit_events (created_at);
CREATE INDEX idx_audit_action ON audit_events (action);
