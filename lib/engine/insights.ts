import { addDays } from "./dates";
import { roundMoney, sumMoney } from "./money";
import { generatePaydays } from "./paydays";
import type { CashEvent, CashProfile, DayResult, ISODate, Plan } from "./types";

type Outflow = Exclude<CashEvent, { kind: "income" }>;
const isOutflow = (e: CashEvent): e is Outflow => e.kind !== "income";

export interface NextPaycheckInsight {
  date: ISODate;
  amount: number;
  /** Bills + BNPL due from this payday up to (not including) the following one. */
  promised: number;
  promisedBnpl: number;
  promisedBills: number;
  items: Outflow[];
}

/** "Already promised from your next paycheck". Null if the payday is outside the simulated window. */
export function nextPaycheckInsight(days: DayResult[], profile: CashProfile): NextPaycheckInsight | null {
  if (days.length === 0) return null;
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const [payday, following] = generatePaydays(profile.frequency, profile.nextPayday, first, addDays(last, 62));
  if (!payday || payday > last) return null;
  const until = following ?? addDays(last, 1);
  const items = days.filter((d) => d.date >= payday && d.date < until).flatMap((d) => d.events.filter(isOutflow));
  const bnpl = items.filter((e) => e.kind === "installment").map((e) => e.amount);
  const bills = items.filter((e) => e.kind === "bill").map((e) => e.amount);
  return {
    date: payday,
    amount: profile.paycheckAmount,
    promised: sumMoney([...bnpl, ...bills]),
    promisedBnpl: sumMoney(bnpl),
    promisedBills: sumMoney(bills),
    items,
  };
}

export interface DangerDay {
  date: ISODate;
  status: "short" | "tight";
  endBalance: number;
  /** How far below $0 (short) or below the buffer (tight). */
  gap: number;
  /** Outflows since the last paycheck that drained the account to this point. */
  contributors: Outflow[];
  /** True when no paycheck lands between the contributors and the danger day. */
  beforePayday: boolean;
}

/** First day the balance goes below zero; if none, the first day below the buffer. */
export function nextDangerDay(days: DayResult[], buffer: number): DangerDay | null {
  const target = days.find((d) => d.status === "short") ?? days.find((d) => d.status === "tight");
  if (!target) return null;

  const idx = days.indexOf(target);
  let windowStart = 0;
  for (let i = idx; i >= 0; i--) {
    if (days[i].events.some((e) => e.kind === "income")) {
      windowStart = i;
      break;
    }
  }
  const contributors = days.slice(windowStart, idx + 1).flatMap((d) => d.events.filter(isOutflow));
  const status = target.status as "short" | "tight";
  return {
    date: target.date,
    status,
    endBalance: target.endBalance,
    gap: roundMoney(status === "short" ? -target.endBalance : buffer - target.endBalance),
    contributors,
    beforePayday: windowStart === 0 && !days[0].events.some((e) => e.kind === "income"),
  };
}

export interface DebtSummary {
  /** Date of the last unpaid installment across all plans, or null when nothing is owed. */
  debtFreeDate: ISODate | null;
  totalOutstanding: number;
  activePlans: number;
}

export function debtSummary(plans: Plan[]): DebtSummary {
  const upcoming = plans.flatMap((p) => p.installments.filter((i) => i.status === "upcoming" && i.amount > 0));
  return {
    debtFreeDate: upcoming.reduce<ISODate | null>((max, i) => (max === null || i.dueDate > max ? i.dueDate : max), null),
    totalOutstanding: sumMoney(upcoming.map((i) => i.amount)),
    activePlans: plans.filter((p) => p.installments.some((i) => i.status === "upcoming" && i.amount > 0)).length,
  };
}

export function lowestDay(days: DayResult[]): DayResult | null {
  return days.reduce<DayResult | null>((min, d) => (min === null || d.endBalance < min.endBalance ? d : min), null);
}
