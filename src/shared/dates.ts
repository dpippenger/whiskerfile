// Calendar dates (birthdays, visit days) are "YYYY-MM-DD" strings, never
// timestamps: the server runs in UTC and a timestamp would shift a day for
// anyone west of Greenwich.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

type Parts = { y: number; m: number; d: number };

function parts(date: string): Parts | null {
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number) as [number, number, number];
  // Round-trip through UTC to reject dates such as 2025-02-30.
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function isIsoDate(value: string): boolean {
  return parts(value) !== null;
}

/** Today's date in the caller's local time zone. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Whole years, months and days from `from` to `to`, counted the way people
 * count birthdays. Null if either date is invalid or `to` is before `from`.
 */
export function elapsed(from: string, to: string): { years: number; months: number; days: number } | null {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b || to < from) return null;
  // `from` moved forward by n whole months, clamped to the end of a shorter
  // month (one month after Jan 31 is Feb 28 or 29).
  const addMonths = (n: number) => {
    const total = a.m - 1 + n;
    const y = a.y + Math.floor(total / 12);
    const m = (total % 12) + 1;
    return Date.UTC(y, m - 1, Math.min(a.d, daysInMonth(y, m)));
  };
  const end = Date.UTC(b.y, b.m - 1, b.d);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (addMonths(months) > end) months -= 1;
  const days = Math.round((end - addMonths(months)) / 86_400_000);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

/** Short age such as "3 d", "6 wk", "4 mo" or "12 yr 3 mo", prefixed with "~" when the birth date is a guess. */
export function formatAge(dob: string, today: string, estimated = false): string | null {
  const age = elapsed(dob, today);
  if (!age) return null;
  const { years, months, days } = age;
  let text: string;
  if (years === 0 && months === 0) text = days < 7 ? `${days} d` : `${Math.floor(days / 7)} wk`;
  else if (years === 0) text = `${months} mo`;
  else if (months === 0) text = `${years} yr`;
  else text = `${years} yr ${months} mo`;
  return estimated ? `~${text}` : text;
}

const DAY_MONTH_YEAR: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

/**
 * "Mar 4, 2024", formatted without any time zone conversion. Other `options`
 * give other shapes of the same date, such as its weekday or its month.
 */
export function formatDate(date: string, options = DAY_MONTH_YEAR): string {
  const p = parts(date);
  if (!p) return date;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString(undefined, { timeZone: "UTC", ...options });
}

/** A clock time stored as "HH:MM" in the reader's own format, such as "2:30 PM" or "14:30". */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return new Date(Date.UTC(1970, 0, 1, h, m)).toLocaleTimeString(undefined, {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The calendar date `days` after `date` (negative for before). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/**
 * Whether a date lies in the future everywhere on Earth: later than tomorrow
 * in UTC. The server doesn't know the browser's time zone, and tomorrow in
 * UTC covers every zone's "today", so this is the bound the shared validators
 * enforce; the forms refuse anything after the user's own local today first.
 */
export function isFutureDate(date: string, todayUtc = new Date().toISOString().slice(0, 10)): boolean {
  return date > addDays(todayUtc, 1);
}

// Months are "YYYY-MM" strings.

export const isIsoMonth = (value: string) => isIsoDate(`${value}-01`);

/** The month a date falls in. */
export const monthOf = (date: string) => date.slice(0, 7);

/** The month `months` after `month` (negative for before). */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return monthOf(new Date(Date.UTC(y, m - 1 + months, 1)).toISOString());
}

/**
 * The whole weeks that cover a month, each seven dates starting on
 * `weekStart` (0 is Sunday, 1 Monday), so the first and last weeks can hold
 * days of the neighbouring months.
 */
export function monthWeeks(month: string, weekStart: number): string[][] {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const weeks: string[][] = [];
  let day = addDays(first, -((weekday - weekStart + 7) % 7));
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
    day = addDays(day, 7);
  } while (monthOf(day) === month);
  return weeks;
}
