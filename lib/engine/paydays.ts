import { addDays, addMonths, daysInMonth, isLastDayOfMonth, makeDate, yearMonth } from "./dates";
import type { ISODate, PayFrequency } from "./types";

/** Sentinel for "last day of the month" in semi-monthly schedules. */
const EOM = 31;

/**
 * The two days of the month a semi-monthly paycheck lands on, derived from one known payday.
 * Month-end or late-month paydays mean the common "15th + last day" pattern; otherwise the
 * paydays are 15 days apart (e.g. 1st & 16th, 5th & 20th).
 */
export function semimonthlyDays(nextPayday: ISODate): [number, number] {
  const { day } = yearMonth(nextPayday);
  if (isLastDayOfMonth(nextPayday) || day >= 28) return [15, EOM];
  if (day <= 15) return [day, day + 15 >= 28 ? EOM : day + 15];
  return [day - 15, day];
}

/**
 * All paydays in [from, to] (inclusive), starting from `nextPayday`.
 * Paydays before `nextPayday` are never generated: the user told us when the next one is.
 */
export function generatePaydays(
  frequency: PayFrequency,
  nextPayday: ISODate,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  const out: ISODate[] = [];
  const push = (d: ISODate) => {
    if (d >= from && d <= to && d >= nextPayday) out.push(d);
  };

  switch (frequency) {
    case "weekly":
    case "biweekly": {
      const step = frequency === "weekly" ? 7 : 14;
      for (let d = nextPayday; d <= to; d = addDays(d, step)) push(d);
      break;
    }
    case "monthly": {
      const anchor = yearMonth(nextPayday).day;
      for (let i = 0, d = nextPayday; d <= to; i++, d = addMonths(nextPayday, i, anchor)) push(d);
      break;
    }
    case "semimonthly": {
      const days = semimonthlyDays(nextPayday);
      const start = yearMonth(nextPayday);
      for (let i = 0; ; i++) {
        const monthStart = addMonths(makeDate(start.year, start.month, 1), i);
        if (monthStart > to) break;
        const { year, month } = yearMonth(monthStart);
        for (const day of days) push(makeDate(year, month, Math.min(day, daysInMonth(year, month))));
      }
      break;
    }
  }
  return out;
}
