import type { ISODate } from "./types";

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parts(date: ISODate): [number, number, number] {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isValidISODate(date: unknown): date is ISODate {
  if (typeof date !== "string" || !ISO_RE.test(date)) return false;
  const [y, mo, d] = parts(date);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function toUTC(date: ISODate): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function makeDate(year: number, month: number, day: number): ISODate {
  return fromUTC(Date.UTC(year, month - 1, day));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromUTC(toUTC(date) + n * DAY_MS);
}

/** Days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/**
 * Adds calendar months, keeping `anchorDay` (defaults to the date's own day) and
 * clamping to month end — so Jan 31 + 1 month = Feb 28, + 2 months = Mar 31.
 */
export function addMonths(date: ISODate, n: number, anchorDay?: number): ISODate {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeDate(ny, nm, Math.min(anchorDay ?? d, daysInMonth(ny, nm)));
}

export function yearMonth(date: ISODate): { year: number; month: number; day: number } {
  const [year, month, day] = parts(date);
  return { year, month, day };
}

export function isLastDayOfMonth(date: ISODate): boolean {
  const { year, month, day } = yearMonth(date);
  return day === daysInMonth(year, month);
}

export const minDate = (a: ISODate, b: ISODate): ISODate => (a < b ? a : b);
export const maxDate = (a: ISODate, b: ISODate): ISODate => (a > b ? a : b);

/** Inclusive list of dates from `start` to `end`. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
