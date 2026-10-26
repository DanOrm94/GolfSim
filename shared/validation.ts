// Validation rules shared by client and server. The SERVER is always the
// authority — the client uses these only for fast feedback.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

// Allowed username characters: lowercase letters, digits, dot, underscore, hyphen.
// Usernames are normalised to lowercase + trimmed before this check.
const USERNAME_RE = /^[a-z0-9._-]+$/;

export function normalizeUsername(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export function validateUsername(raw: string): ValidationResult {
  const u = normalizeUsername(raw);
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) {
    return {
      ok: false,
      message: `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters.`,
    };
  }
  if (!USERNAME_RE.test(u)) {
    return {
      ok: false,
      message:
        "Username may only contain lowercase letters, numbers, dot, underscore and hyphen.",
    };
  }
  return { ok: true };
}

export function validatePassword(pw: string): ValidationResult {
  if (typeof pw !== "string" || pw.length < PASSWORD_MIN) {
    return {
      ok: false,
      message: `Password must be at least ${PASSWORD_MIN} characters.`,
    };
  }
  if (pw.length > PASSWORD_MAX) {
    return {
      ok: false,
      message: `Password must be at most ${PASSWORD_MAX} characters.`,
    };
  }
  // Require a mix to avoid trivially weak passwords.
  const classes =
    Number(/[a-z]/.test(pw)) +
    Number(/[A-Z]/.test(pw)) +
    Number(/[0-9]/.test(pw)) +
    Number(/[^a-zA-Z0-9]/.test(pw));
  if (classes < 3) {
    return {
      ok: false,
      message:
        "Password must include at least three of: lowercase, uppercase, number, symbol.",
    };
  }
  return { ok: true };
}

// A slot start must be exactly on the hour (minutes/seconds/ms zero) in UTC.
export function isTopOfHourUtc(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}
