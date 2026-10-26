// Timezone-aware date helpers.
//
// Design: the facility operates in ONE configurable IANA timezone (default
// Europe/London). Booking slots are generated per *local* calendar day and hour,
// then converted to UTC instants for storage and comparison. We never rely on the
// server's local timezone — every conversion is explicit via Intl APIs, which
// correctly account for DST (e.g. BST/GMT) transitions.

const HOUR_MS = 60 * 60 * 1000;

/**
 * Returns the UTC offset (in minutes) that the given IANA timezone was at for a
 * specific UTC instant. Positive = ahead of UTC.
 *
 * Works by formatting the instant in the target zone and comparing the wall-clock
 * reading back to the instant.
 */
export function tzOffsetMinutes(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(utcDate);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // The wall-clock components in the target timezone, interpreted as if they were UTC.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return Math.round((asUtc - utcDate.getTime()) / 60000);
}

/**
 * Convert a local wall-clock time in a timezone to the corresponding UTC Date.
 *
 * DST handling:
 *  - "Spring forward" gap (a local time that does not exist): the two offset probes
 *    disagree; we resolve forward to the next valid instant.
 *  - "Fall back" overlap (a local time that occurs twice): we deterministically pick
 *    the EARLIER occurrence (the pre-transition offset).
 */
export function localWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  // First guess: treat the wall time as if it were UTC.
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  // Probe the offset near that instant, then correct.
  const offset1 = tzOffsetMinutes(new Date(naiveUtcMs), timeZone);
  const candidate1 = naiveUtcMs - offset1 * 60000;
  const offset2 = tzOffsetMinutes(new Date(candidate1), timeZone);
  if (offset1 === offset2) {
    return new Date(candidate1);
  }
  // Offsets disagree (DST boundary). Recompute with the second offset.
  const candidate2 = naiveUtcMs - offset2 * 60000;
  // Pick the earlier valid instant for determinism (handles both gap and overlap).
  return new Date(Math.min(candidate1, candidate2));
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

/** Break a UTC instant into its wall-clock parts in the target timezone. */
export function utcToLocalParts(utcDate: Date, timeZone: string): LocalParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(utcDate);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

/** YYYY-MM-DD for a UTC instant, in the facility timezone. */
export function localDateString(utcDate: Date, timeZone: string): string {
  const p = utcToLocalParts(utcDate, timeZone);
  return `${p.year.toString().padStart(4, "0")}-${p.month
    .toString()
    .padStart(2, "0")}-${p.day.toString().padStart(2, "0")}`;
}

/** HH:mm for a UTC instant, in the facility timezone. */
export function localTimeString(utcDate: Date, timeZone: string): string {
  const p = utcToLocalParts(utcDate, timeZone);
  return `${p.hour.toString().padStart(2, "0")}:${p.minute
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Generate the 24 hourly slot start instants (UTC) for a given LOCAL calendar day.
 *
 * Because of DST, a local day can have 23, 24 or 25 wall-clock hours. We iterate the
 * 24 nominal local hours (00:00..23:00). During a spring-forward day the skipped hour
 * resolves forward (handled by localWallTimeToUtc); during a fall-back day the repeated
 * hour resolves to the earlier instant. We then de-duplicate by UTC instant so a day
 * never yields two identical slots.
 */
export function hourlySlotStartsForLocalDay(
  localDate: string,
  timeZone: string
): Date[] {
  const [y, m, d] = localDate.split("-").map(Number);
  const seen = new Set<number>();
  const starts: Date[] = [];
  for (let h = 0; h < 24; h++) {
    const utc = localWallTimeToUtc(y, m, d, h, 0, timeZone);
    // Keep only slots whose local date still matches the requested day. A spring-forward
    // resolution could push 02:00 -> 03:00 but stays same day; fall-back stays same day.
    if (localDateString(utc, timeZone) !== localDate) continue;
    const t = utc.getTime();
    if (seen.has(t)) continue;
    seen.add(t);
    starts.push(utc);
  }
  starts.sort((a, b) => a.getTime() - b.getTime());
  return starts;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

/** Two half-open intervals [aStart,aEnd) and [bStart,bEnd) overlap? */
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export { HOUR_MS };
