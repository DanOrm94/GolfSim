import { describe, it, expect } from "vitest";
import {
  tzOffsetMinutes,
  localWallTimeToUtc,
  localDateString,
  localTimeString,
  hourlySlotStartsForLocalDay,
  addHours,
  intervalsOverlap,
} from "./timezone";

const LDN = "Europe/London";

describe("tzOffsetMinutes", () => {
  it("is 0 for London in winter (GMT)", () => {
    expect(tzOffsetMinutes(new Date("2025-01-15T12:00:00Z"), LDN)).toBe(0);
  });
  it("is +60 for London in summer (BST)", () => {
    expect(tzOffsetMinutes(new Date("2025-07-15T12:00:00Z"), LDN)).toBe(60);
  });
});

describe("localWallTimeToUtc", () => {
  it("maps winter local time with no offset", () => {
    const utc = localWallTimeToUtc(2025, 1, 15, 9, 0, LDN);
    expect(utc.toISOString()).toBe("2025-01-15T09:00:00.000Z");
  });
  it("maps summer local time back one hour to UTC", () => {
    const utc = localWallTimeToUtc(2025, 7, 15, 9, 0, LDN);
    expect(utc.toISOString()).toBe("2025-07-15T08:00:00.000Z");
  });
  it("round-trips through utcToLocal for an arbitrary instant", () => {
    const utc = localWallTimeToUtc(2025, 3, 10, 14, 0, LDN);
    expect(localTimeString(utc, LDN)).toBe("14:00");
    expect(localDateString(utc, LDN)).toBe("2025-03-10");
  });
});

describe("DST transitions (Europe/London)", () => {
  // Spring forward: 30 Mar 2025, clocks 01:00 GMT -> 02:00 BST. Local 01:00 is the
  // last valid pre-jump hour; local 02:00 does not exist.
  it("produces a full set of distinct UTC slots on the spring-forward day", () => {
    const starts = hourlySlotStartsForLocalDay("2025-03-30", LDN);
    const unique = new Set(starts.map((d) => d.getTime()));
    expect(unique.size).toBe(starts.length);
    // All slots stay within the same local day.
    for (const s of starts) {
      expect(localDateString(s, LDN)).toBe("2025-03-30");
    }
  });

  // Fall back: 26 Oct 2025, clocks 02:00 BST -> 01:00 GMT. Local 01:00 occurs twice.
  it("produces distinct UTC slots on the fall-back day and picks earlier for ambiguous hour", () => {
    const starts = hourlySlotStartsForLocalDay("2025-10-26", LDN);
    const unique = new Set(starts.map((d) => d.getTime()));
    expect(unique.size).toBe(starts.length);
    for (const s of starts) {
      expect(localDateString(s, LDN)).toBe("2025-10-26");
    }
  });

  it("a one-hour booking is always 60 minutes of elapsed time across DST", () => {
    // Slot starting at the spring-forward boundary.
    const start = localWallTimeToUtc(2025, 3, 30, 1, 0, LDN);
    const end = addHours(start, 1);
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);
  });
});

describe("intervalsOverlap", () => {
  const h = (n: number) => new Date(`2025-01-01T0${n}:00:00Z`).getTime();
  it("detects overlap", () => {
    expect(intervalsOverlap(h(1), h(2), h(1), h(2))).toBe(true); // identical
    expect(intervalsOverlap(h(1), h(3), h(2), h(4))).toBe(true); // partial
  });
  it("treats touching intervals as non-overlapping (half-open)", () => {
    expect(intervalsOverlap(h(1), h(2), h(2), h(3))).toBe(false);
  });
  it("detects no overlap for separated intervals", () => {
    expect(intervalsOverlap(h(1), h(2), h(3), h(4))).toBe(false);
  });
});
