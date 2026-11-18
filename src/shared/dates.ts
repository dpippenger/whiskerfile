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

/** Short age such as "6 wk", "4 mo" or "12 yr 3 mo", prefixed with "~" when the birth date is a guess. */
export function formatAge(dob: string, today: string, estimated = false): string | null {
  const age = elapsed(dob, today);
  if (!age) return null;
  const { years, months, days } = age;
  let text: string;
  if (years === 0 && months === 0) text = `${Math.floor(days / 7)} wk`;
  else if (years === 0) text = `${months} mo`;
  else if (months === 0) text = `${years} yr`;
  else text = `${years} yr ${months} mo`;
  return estimated ? `~${text}` : text;
}

/** "Mar 4, 2024", formatted without any time zone conversion. */
export function formatDate(date: string): string {
  const p = parts(date);
  if (!p) return date;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The calendar date `days` after `date` (negative for before). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}
