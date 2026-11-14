import { addDays, addMonths } from "./dates";
import { toCents, toDollars } from "./money";
import type { Installment, ISODate } from "./types";

/**
 * Splits `total` into `count` equal payments (in cents); any leftover cent goes on the first
 * payment, which is how pay-in-4 providers typically round.
 */
export function splitEvenly(total: number, count: number): number[] {
  if (count < 1) throw new Error("count must be >= 1");
  const cents = toCents(total);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) => toDollars(base + (i === 0 ? remainder : 0)));
}

export interface ScheduleRule {
  count: number;
  firstDueDate: ISODate;
  /** Known per-payment amount. If omitted, `total` is split evenly. */
  amount?: number | null;
  total?: number | null;
  intervalDays?: number | null;
  intervalMonths?: number | null;
}

/**
 * Deterministically expands "N payments of $X every K days/months starting D" into dated
 * installments. Returns null if the rule does not pin down every date and amount — we never guess.
 */
export function expandScheduleRule(rule: ScheduleRule): Installment[] | null {
  const { count, firstDueDate, amount, total, intervalDays, intervalMonths } = rule;
  if (!Number.isInteger(count) || count < 1 || count > 60) return null;
  const hasDays = intervalDays != null && intervalDays > 0;
  const hasMonths = intervalMonths != null && intervalMonths > 0;
  if (count > 1 && hasDays === hasMonths) return null;

  let amounts: number[];
  if (amount != null && amount > 0) amounts = Array(count).fill(amount);
  else if (total != null && total > 0) amounts = splitEvenly(total, count);
  else return null;

  return amounts.map((amt, i) => ({
    dueDate: hasMonths ? addMonths(firstDueDate, i * intervalMonths!) : addDays(firstDueDate, i * (intervalDays ?? 0)),
    amount: amt,
    status: "upcoming" as const,
  }));
}

/** Pay in 4: 25% today, then every 2 weeks. */
export function payIn4Schedule(total: number, start: ISODate): Installment[] {
  return expandScheduleRule({ count: 4, total, intervalDays: 14, firstDueDate: start })!;
}

/**
 * Fixed monthly payment for an amortizing loan, first payment one month after `start`.
 * The final payment absorbs rounding so the schedule pays off exactly.
 */
export function monthlySchedule(principal: number, months: number, aprPercent: number, start: ISODate): Installment[] {
  if (!Number.isInteger(months) || months < 1) throw new Error("months must be a positive integer");
  const r = aprPercent / 100 / 12;
  const principalCents = toCents(principal);
  const paymentCents =
    r === 0 ? Math.ceil(principalCents / months) : Math.round((principalCents * r) / (1 - Math.pow(1 + r, -months)));

  const out: Installment[] = [];
  let remaining = principalCents;
  for (let i = 1; i <= months; i++) {
    const interest = Math.round(remaining * r);
    const due = i === months ? remaining + interest : Math.min(paymentCents, remaining + interest);
    remaining = remaining + interest - due;
    out.push({ dueDate: addMonths(start, i), amount: toDollars(due), status: "upcoming" });
  }
  return out;
}
