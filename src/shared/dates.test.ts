import { expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  elapsed,
  formatAge,
  formatDate,
  formatTime,
  isFutureDate,
  isIsoDate,
  isIsoMonth,
  localToday,
  monthOf,
  monthWeeks,
} from "./dates";

test("only real calendar dates are accepted", () => {
  expect(isIsoDate("2024-02-29")).toBe(true);
  expect(isIsoDate("2023-02-29")).toBe(false);
  expect(isIsoDate("2024-13-01")).toBe(false);
  expect(isIsoDate("2024-1-01")).toBe(false);
  expect(isIsoDate("")).toBe(false);
});

test("a date is future only when no time zone can call it today", () => {
  const todayUtc = "2026-11-18";
  expect(isFutureDate("2026-11-18", todayUtc)).toBe(false);
  // Tomorrow in UTC is already today somewhere east of Greenwich.
  expect(isFutureDate("2026-11-19", todayUtc)).toBe(false);
  expect(isFutureDate("2026-11-20", todayUtc)).toBe(true);
  expect(isFutureDate("2020-02-29", todayUtc)).toBe(false);
  // Without an injected today, the clock's own UTC date bounds it.
  expect(isFutureDate("2999-01-01")).toBe(true);
  expect(isFutureDate("2000-01-01")).toBe(false);
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
  // Under a week, the age is in days, never "0 wk".
  expect(formatAge("2026-11-18", today)).toBe("0 d");
  expect(formatAge("2026-11-15", today)).toBe("3 d");
  expect(formatAge("2026-11-11", today)).toBe("1 wk");
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

test("a date can be formatted as its weekday or its month, and a time keeps its minutes", () => {
  expect(formatDate("2026-12-08", { weekday: "long" })).toBe(
    new Date(Date.UTC(2026, 11, 8)).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long" }),
  );
  expect(formatDate("2026-12-01", { month: "long", year: "numeric" })).toContain("2026");
  expect(formatDate("2026-12-01", { month: "long", year: "numeric" })).not.toMatch(/\b1\b/);
  expect(formatTime("14:05")).toMatch(/\b(2|14)\D05\b/);
  expect(formatTime("00:30")).toMatch(/\b(12|0|00)\D30\b/);
});

test("months step across years and only real months are accepted", () => {
  expect(monthOf("2026-11-26")).toBe("2026-11");
  expect(addMonths("2026-11", 1)).toBe("2026-12");
  expect(addMonths("2026-12", 1)).toBe("2027-01");
  expect(addMonths("2026-01", -1)).toBe("2025-12");
  expect(addMonths("2026-11", -23)).toBe("2024-12");
  expect(isIsoMonth("2026-11")).toBe(true);
  expect(isIsoMonth("2026-13")).toBe(false);
  expect(isIsoMonth("2026-1")).toBe(false);
  expect(isIsoMonth("")).toBe(false);
});

test("a month's weeks start on the given weekday and spill into its neighbours", () => {
  // November 2026 starts on a Sunday and ends on a Monday.
  const sunday = monthWeeks("2026-11", 0);
  expect(sunday).toHaveLength(5);
  expect(sunday[0]).toEqual([
    "2026-11-01",
    "2026-11-02",
    "2026-11-03",
    "2026-11-04",
    "2026-11-05",
    "2026-11-06",
    "2026-11-07",
  ]);
  expect(sunday.at(-1)![0]).toBe("2026-11-29");
  expect(sunday.at(-1)![6]).toBe("2026-12-05");

  const monday = monthWeeks("2026-11", 1);
  expect(monday).toHaveLength(6);
  expect(monday[0]![0]).toBe("2026-10-26");
  expect(monday[0]![6]).toBe("2026-11-01");
  expect(monday.at(-1)![0]).toBe("2026-11-30");

  // February 2027 starts on a Monday and fills exactly four weeks.
  expect(monthWeeks("2027-02", 1)).toHaveLength(4);
});

test("a month's weeks hold each of its days once, with no gap, whatever the first weekday", () => {
  for (const month of ["2024-02", "2026-11", "2026-12", "2027-02", "2027-08"]) {
    for (let weekStart = 0; weekStart < 7; weekStart++) {
      const weeks = monthWeeks(month, weekStart);
      const days = weeks.flat();
      expect(days.every((day, i) => i === 0 || day === addDays(days[i - 1]!, 1))).toBe(true);
      const [y, m] = month.split("-").map(Number) as [number, number];
      expect(days.filter((day) => monthOf(day) === month)).toHaveLength(new Date(Date.UTC(y, m, 0)).getUTCDate());
      expect(monthOf(weeks[0]![6]!)).toBe(month);
      expect(monthOf(weeks.at(-1)![0]!)).toBe(month);
    }
  }
});
