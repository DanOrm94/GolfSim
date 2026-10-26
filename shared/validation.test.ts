import { describe, it, expect } from "vitest";
import {
  normalizeUsername,
  validateUsername,
  validatePassword,
  isTopOfHourUtc,
} from "./validation";

describe("normalizeUsername", () => {
  it("lowercases and trims", () => {
    expect(normalizeUsername("  DanOrm94  ")).toBe("danorm94");
  });
});

describe("validateUsername", () => {
  it("accepts a valid username", () => {
    expect(validateUsername("dan.orm_94").ok).toBe(true);
  });
  it("rejects too-short usernames", () => {
    expect(validateUsername("ab").ok).toBe(false);
  });
  it("rejects disallowed characters", () => {
    expect(validateUsername("dan orm").ok).toBe(false);
    expect(validateUsername("dan@orm").ok).toBe(false);
  });
  it("normalises case so DAN == dan (prevents confusing duplicates)", () => {
    expect(normalizeUsername("DAN")).toBe(normalizeUsername("dan"));
  });
});

describe("validatePassword", () => {
  it("rejects short passwords", () => {
    expect(validatePassword("Ab1!").ok).toBe(false);
  });
  it("requires at least 3 character classes", () => {
    expect(validatePassword("alllowercaseonly").ok).toBe(false);
    expect(validatePassword("Abcdefghij1").ok).toBe(true);
  });
  it("accepts a strong password", () => {
    expect(validatePassword("Fairway-99x").ok).toBe(true);
  });
});

describe("isTopOfHourUtc", () => {
  it("accepts hour-aligned UTC", () => {
    expect(isTopOfHourUtc("2025-01-01T09:00:00.000Z")).toBe(true);
  });
  it("rejects non-aligned times", () => {
    expect(isTopOfHourUtc("2025-01-01T09:30:00.000Z")).toBe(false);
  });
  it("rejects invalid input", () => {
    expect(isTopOfHourUtc("not-a-date")).toBe(false);
  });
});
