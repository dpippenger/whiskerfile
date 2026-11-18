import { expect, test } from "bun:test";
import { elapsed, formatAge, formatDate, isIsoDate, localToday } from "./dates";

test("only real calendar dates are accepted", () => {
  expect(isIsoDate("2024-02-29")).toBe(true);
  expect(isIsoDate("2023-02-29")).toBe(false);
  expect(isIsoDate("2024-13-01")).toBe(false);
  expect(isIsoDate("2024-1-01")).toBe(false);
  expect(isIsoDate("")).toBe(false);
});

test("elapsed time counts whole months the way birthdays do", () => {
  expect(elapsed("2014-03-15", "2026-11-18")).toEqual({ years: 12, months: 8, days: 3 });
  expect(elapsed("2026-01-31", "2026-03-01")).toEqual({ years: 0, months: 1, days: 1 });
  // A leap-day birthday comes round on Feb 28 in other years.
  expect(elapsed("2024-02-29", "2025-02-28")).toEqual({ years: 1, months: 0, days: 0 });
  expect(elapsed("2024-02-29", "2025-02-27")).toEqual({ years: 0, months: 11, days: 29 });
  expect(elapsed("2026-11-18", "2026-11-18")).toEqual({ years: 0, months: 0, days: 0 });
  expect(elapsed("2026-11-19", "2026-11-18")).toBeNull();
  expect(elapsed("bad", "2026-11-18")).toBeNull();
});

test("ages are shown in the largest sensible units", () => {
  const today = "2026-11-18";
  expect(formatAge("2026-10-28", today)).toBe("3 wk");
  expect(formatAge("2026-05-01", today)).toBe("6 mo");
  expect(formatAge("2024-11-18", today)).toBe("2 yr");
  expect(formatAge("2014-03-15", today)).toBe("12 yr 8 mo");
  expect(formatAge("2014-03-15", today, true)).toBe("~12 yr 8 mo");
  expect(formatAge("2027-01-01", today)).toBeNull();
});

test("today is the local calendar date, and dates format without shifting a day", () => {
  expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  expect(formatDate("2026-01-05")).toContain("2026");
  expect(formatDate("2026-01-05")).toMatch(/\b5\b/);
});
