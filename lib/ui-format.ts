import { yearMonth } from "@/lib/engine";
import type { ISODate } from "@/lib/engine";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const formatMoney = (n: number): string => usd.format(n);
/** Whole dollars when the amount is whole ("$1,450"), cents otherwise ("$156.63"). */
export const formatMoneyShort = (n: number): string => (Number.isInteger(n) ? usdWhole.format(n) : usd.format(n));

/** "Dec 12" (adds the year when it differs from `relativeTo`'s year). */
export function formatDate(date: ISODate, relativeTo?: ISODate): string {
  const { year, month, day } = yearMonth(date);
  const base = `${SHORT_MONTHS[month - 1]} ${day}`;
  return relativeTo && yearMonth(relativeTo).year !== year ? `${base}, ${year}` : base;
}

export function weekday(date: ISODate): string {
  const { year, month, day } = yearMonth(date);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** Today's calendar date in the user's own timezone. */
export function localToday(): ISODate {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;
