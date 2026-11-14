import { addDays, addMonths, daysInMonth, makeDate, yearMonth } from "./dates";
import { toCents, toDollars } from "./money";
import { generatePaydays } from "./paydays";
import { providerName } from "./providers";
import type { Bill, CashEvent, CashProfile, DayResult, DayStatus, ISODate, Plan } from "./types";

export const DEFAULT_HORIZON_DAYS = 90;

export interface SimulationOptions {
  horizonDays?: number;
  /** Replace the paycheck amount (used by rescue mode). */
  paycheckAmount?: number;
}

/** Every date a monthly bill falls on within [from, to]. */
export function billDates(bill: Bill, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const { year, month } = yearMonth(from);
  for (let i = 0; ; i++) {
    const monthStart = addMonths(makeDate(year, month, 1), i);
    if (monthStart > to) break;
    const ym = yearMonth(monthStart);
    const d = makeDate(ym.year, ym.month, Math.min(bill.dayOfMonth, daysInMonth(ym.year, ym.month)));
    if (d >= from && d <= to) out.push(d);
  }
  return out;
}

/** Event order within a day: money in first (direct deposit lands overnight), then bills, then BNPL. */
const KIND_ORDER: Record<CashEvent["kind"], number> = { income: 0, bill: 1, installment: 2 };

/** All cash events in [today, end], including unpaid installments that are already overdue (counted today). */
export function collectEvents(profile: CashProfile, plans: Plan[], today: ISODate, end: ISODate, opts: SimulationOptions = {}): CashEvent[] {
  const events: CashEvent[] = [];
  const paycheck = opts.paycheckAmount ?? profile.paycheckAmount;

  if (paycheck > 0) {
    for (const date of generatePaydays(profile.frequency, profile.nextPayday, today, end)) {
      events.push({ kind: "income", date, amount: paycheck, label: "Paycheck" });
    }
  }
  for (const bill of profile.bills) {
    if (bill.amount <= 0) continue;
    for (const date of billDates(bill, today, end)) {
      events.push({ kind: "bill", date, amount: bill.amount, label: bill.name, billId: bill.id, essential: bill.essential });
    }
  }
  for (const plan of plans) {
    for (const inst of plan.installments) {
      if (inst.status !== "upcoming" || inst.amount <= 0) continue;
      const overdue = inst.dueDate < today;
      const date = overdue ? today : inst.dueDate;
      if (date > end) continue;
      events.push({
        kind: "installment",
        date,
        amount: inst.amount,
        label: `${providerName(plan.provider)} · ${plan.merchant || "Purchase"}`,
        planId: plan.id,
        provider: plan.provider,
        overdue,
      });
    }
  }
  return events.sort((a, b) => (a.date === b.date ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] : a.date < b.date ? -1 : 1));
}

export function classify(balance: number, buffer: number): DayStatus {
  if (balance < 0) return "short";
  if (balance < buffer) return "tight";
  return "ok";
}

/**
 * Day-by-day projected checking balance from `today` for `horizonDays` days.
 * `profile.balance` is the balance at the start of today. A day's status is judged on its
 * end-of-day balance (income posts first, so that is also the day's low point).
 */
export function simulate(profile: CashProfile, plans: Plan[], today: ISODate, opts: SimulationOptions = {}): DayResult[] {
  const horizon = opts.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const end = addDays(today, horizon - 1);
  const events = collectEvents(profile, plans, today, end, opts);

  const days: DayResult[] = [];
  let balance = toCents(profile.balance);
  let idx = 0;
  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    const start = balance;
    const dayEvents: CashEvent[] = [];
    while (idx < events.length && events[idx].date === date) {
      const e = events[idx++];
      balance += e.kind === "income" ? toCents(e.amount) : -toCents(e.amount);
      dayEvents.push(e);
    }
    days.push({
      date,
      startBalance: toDollars(start),
      endBalance: toDollars(balance),
      events: dayEvents,
      status: classify(toDollars(balance), profile.buffer),
    });
  }
  return days;
}
