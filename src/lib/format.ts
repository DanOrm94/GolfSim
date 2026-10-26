// Client-side formatting helpers. All display uses the facility timezone supplied
// by the server, never the browser's local zone, so customers always see the
// facility's local times.

export function formatInTz(
  iso: string,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...opts }).format(
    new Date(iso)
  );
}

export function formatDateLong(iso: string, timeZone: string): string {
  return formatInTz(iso, timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTimeRange(
  startIso: string,
  endIso: string,
  timeZone: string
): string {
  const t = (iso: string) =>
    formatInTz(iso, timeZone, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${t(startIso)}–${t(endIso)}`;
}

export function formatDateTime(iso: string, timeZone: string): string {
  return formatInTz(iso, timeZone, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Today's date in the facility timezone as YYYY-MM-DD. */
export function todayInTz(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA yields YYYY-MM-DD
}

/** Add N days to a YYYY-MM-DD string (date-only math, no tz needed). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
