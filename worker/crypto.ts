// Cryptographic helpers built on the WebCrypto API, which is natively available in
// the Cloudflare Workers runtime (no native Node modules needed).
//
// Password hashing uses PBKDF2-HMAC-SHA-256. PBKDF2 is a maintained, standards-based
// KDF fully supported by crypto.subtle on Workers. (Argon2id is preferred in general
// but has no first-class WebCrypto implementation; PBKDF2 with a high iteration count
// is the pragmatic, dependency-free, Workers-compatible choice and is documented as
// such in the README.)

const PBKDF2_ITERATIONS = 210_000; // OWASP-recommended floor for PBKDF2-HMAC-SHA256
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Cryptographically secure random bytes. */
export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** URL-safe random token string. */
export function randomToken(bytes = 32): string {
  return toBase64(randomBytes(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** SHA-256 of a string, returned base64. Used to store only token hashes. */
export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toBase64(new Uint8Array(digest));
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_BYTES * 8
  );
  return new Uint8Array(bits);
}

/**
 * Produce an encoded password hash of the form:
 *   pbkdf2$<iterations>$<saltB64>$<hashB64>
 * Safe to store; cannot be reversed to the original password.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** Constant-time comparison of two equal-length byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Verify a password against a stored encoded hash. */
export async function verifyPassword(
  password: string,
  encoded: string
): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/** HMAC-SHA-256 signature, base64url. Used to sign the session cookie verifier. */
export async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toBase64(new Uint8Array(sig))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate a readable but strong temporary password.
 * ~72 bits of entropy from an unambiguous alphabet, plus guaranteed character
 * classes so it always satisfies the password policy.
 */
export function generateTemporaryPassword(): string {
  const lower = "abcdefghjkmnpqrstuvwxyz"; // no i,l,o
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I,O
  const digits = "23456789"; // no 0,1
  const symbols = "!@#$%*?";
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => set[randomBytes(1)[0] % set.length];

  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  for (let i = chars.length; i < 16; i++) chars.push(pick(all));

  // Fisher-Yates shuffle with secure randomness.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export { toBase64, fromBase64 };
