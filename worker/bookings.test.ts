import { describe, it, expect } from "vitest";
import {
  validateBookingWindow,
  cancellationAllowed,
  bookingReference,
} from "./bookings";
import type { BookingSettings } from "@shared/types";

const settings: BookingSettings = {
  facilityTimezone: "Europe/London",
  minAdvanceMinutes: 0,
  maxAdvanceDays: 30,
  cancellationCutoffMinutes: 60,
  closures: [],
};

const now = new Date("2025-06-01T10:00:00.000Z");

describe("validateBookingWindow", () => {
  it("accepts a valid future hour-aligned slot and returns start+1h end", () => {
    const { startUtc, endUtc } = validateBookingWindow(
      "2025-06-01T12:00:00.000Z",
      settings,
      now
    );
    expect(startUtc).toBe("2025-06-01T12:00:00.000Z");
    expect(endUtc).toBe("2025-06-01T13:00:00.000Z");
  });

  it("rejects a past slot", () => {
    expect(() =>
      validateBookingWindow("2025-06-01T08:00:00.000Z", settings, now)
    ).toThrow();
  });

  it("rejects a non-hour-aligned slot", () => {
    expect(() =>
      validateBookingWindow("2025-06-01T12:30:00.000Z", settings, now)
    ).toThrow();
  });

  it("rejects a slot beyond the max advance window", () => {
    expect(() =>
      validateBookingWindow("2025-08-01T12:00:00.000Z", settings, now)
    ).toThrow();
  });

  it("respects a closure period", () => {
    const withClosure: BookingSettings = {
      ...settings,
      closures: [
        {
          id: "c1",
          startUtc: "2025-06-01T11:30:00.000Z",
          endUtc: "2025-06-01T14:00:00.000Z",
          reason: "Maintenance",
        },
      ],
    };
    expect(() =>
      validateBookingWindow("2025-06-01T12:00:00.000Z", withClosure, now)
    ).toThrow();
  });

  it("honours minAdvanceMinutes", () => {
    const strict: BookingSettings = { ...settings, minAdvanceMinutes: 180 };
    // 11:00 is only 1h ahead; min advance is 3h -> too soon.
    expect(() =>
      validateBookingWindow("2025-06-01T11:00:00.000Z", strict, now)
    ).toThrow();
    // 14:00 is 4h ahead -> allowed.
    expect(
      validateBookingWindow("2025-06-01T14:00:00.000Z", strict, now).startUtc
    ).toBe("2025-06-01T14:00:00.000Z");
  });
});

describe("cancellationAllowed", () => {
  it("allows cancelling well before the cutoff", () => {
    expect(cancellationAllowed("2025-06-01T13:00:00.000Z", settings, now)).toBe(true);
  });
  it("blocks cancelling inside the cutoff window", () => {
    // Cutoff 60 min; start 10:30 is only 30 min away.
    expect(cancellationAllowed("2025-06-01T10:30:00.000Z", settings, now)).toBe(false);
  });
});

describe("bookingReference", () => {
  it("has the expected shape", () => {
    expect(bookingReference()).toMatch(/^GS-[A-Z2-9]{6}$/);
  });
  it("is reasonably unique across many draws", () => {
    const set = new Set<string>();
    for (let i = 0; i < 500; i++) set.add(bookingReference());
    expect(set.size).toBeGreaterThan(490);
  });
});
